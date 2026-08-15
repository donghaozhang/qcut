#include "effect-video-probe.h"

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

namespace jianying_probe {
namespace {

namespace fs = std::filesystem;

[[nodiscard]] std::size_t frameByteCount(int width, int height) {
  constexpr int kMaximumDimension = 16'384;
  if (width <= 0 || height <= 0 || width > kMaximumDimension ||
      height > kMaximumDimension) {
    throw std::runtime_error("video dimensions must be between 1 and 16384");
  }

  const auto widthValue = static_cast<std::size_t>(width);
  const auto heightValue = static_cast<std::size_t>(height);
  if (heightValue > std::numeric_limits<std::size_t>::max() / widthValue / 4) {
    throw std::runtime_error("video dimensions overflow RGBA byte count");
  }
  return widthValue * heightValue * 4;
}

[[nodiscard]] std::size_t rawFrameCount(const fs::path& path,
                                        std::size_t frameBytes) {
  if (!fs::is_regular_file(path)) {
    throw std::runtime_error("missing raw video input: " + path.string());
  }

  const std::uintmax_t byteCount = fs::file_size(path);
  if (byteCount == 0 || byteCount % frameBytes != 0) {
    throw std::runtime_error(
        "raw video byte count is not a whole RGBA frame: " + path.string());
  }
  return static_cast<std::size_t>(byteCount / frameBytes);
}

void readFrame(std::ifstream& stream, std::span<std::uint8_t> frame) {
  const auto byteCount = static_cast<std::streamsize>(frame.size());
  stream.read(reinterpret_cast<char*>(frame.data()), byteCount);
  if (stream.gcount() != byteCount) {
    throw std::runtime_error("unexpected end of raw effect input");
  }
}

void writeFrame(std::ofstream& stream, std::span<const std::uint8_t> frame) {
  stream.write(reinterpret_cast<const char*>(frame.data()),
               static_cast<std::streamsize>(frame.size()));
  if (!stream) {
    throw std::runtime_error("failed to write raw effect output");
  }
}

[[nodiscard]] bool pathsMatch(const fs::path& left, const fs::path& right) {
  return fs::absolute(left).lexically_normal() ==
         fs::absolute(right).lexically_normal();
}

void validateTiming(const RawVideoEffectRequest& request) {
  if (!std::isfinite(request.frameRate) || request.frameRate <= 0.0 ||
      request.frameRate > 240.0) {
    throw std::runtime_error(
        "frame rate must be greater than 0 and at most 240");
  }
  if (!std::isfinite(request.durationSeconds) ||
      request.durationSeconds <= 0.0) {
    throw std::runtime_error("effect duration must be positive");
  }
  if (!std::isfinite(request.startSeconds) || request.startSeconds < 0.0) {
    throw std::runtime_error("effect start must not be negative");
  }
}

}  // namespace

RawVideoEffectResult renderRawVideoEffect(
    const RawVideoEffectRequest& request) {
  if (!fs::is_directory(request.packagePath)) {
    throw std::runtime_error("missing effect package: " +
                             request.packagePath.string());
  }
  if (pathsMatch(request.inputPath, request.outputPath)) {
    throw std::runtime_error("raw output must not overwrite the input");
  }
  validateTiming(request);

  const std::size_t frameBytes = frameByteCount(request.width, request.height);
  const std::size_t inputFrames = rawFrameCount(request.inputPath, frameBytes);

  const auto firstEffectFrame = static_cast<std::size_t>(
      std::llround(request.startSeconds * request.frameRate));
  const auto requestedEffectFrames = static_cast<std::size_t>(
      std::llround(request.durationSeconds * request.frameRate));
  if (firstEffectFrame >= inputFrames) {
    throw std::runtime_error("effect starts after the last input frame");
  }
  const std::size_t effectFrames =
      std::min(requestedEffectFrames, inputFrames - firstEffectFrame);

  std::ifstream input(request.inputPath, std::ios::binary);
  std::ofstream output(request.outputPath, std::ios::binary | std::ios::trunc);
  if (!input || !output) {
    throw std::runtime_error("failed to open raw effect streams");
  }

  std::vector<std::uint8_t> frame(frameBytes);
  EffectPixelSession session(request.runtimeRoot, request.packagePath,
                             request.width, request.height,
                             request.adjustParameters);

  for (std::size_t index = 0; index < inputFrames; index += 1) {
    readFrame(input, frame);
    const bool inWindow = index >= firstEffectFrame &&
                          index < firstEffectFrame + effectFrames;
    if (!inWindow) {
      writeFrame(output, frame);
      continue;
    }

    const double seconds = static_cast<double>(index - firstEffectFrame) /
                           request.frameRate;
    const EffectPixelFrameResult rendered = session.renderFrame({
        .inputPixels = frame,
        .seconds = seconds,
    });
    if (!rendered.rendered || rendered.outputPixels.size() != frameBytes) {
      throw std::runtime_error("effect engine failed to render video frame " +
                               std::to_string(index));
    }
    writeFrame(output, rendered.outputPixels);
  }

  output.close();
  if (!output) {
    throw std::runtime_error("failed to finalize raw effect output");
  }
  if (fs::file_size(request.outputPath) != inputFrames * frameBytes) {
    throw std::runtime_error("raw effect output has an unexpected size");
  }

  std::cout << "[effect] frames: input=" << inputFrames
            << ", effect=" << effectFrames << ", output=" << inputFrames
            << '\n';
  return {
      .inputFrames = inputFrames,
      .effectFrames = effectFrames,
      .outputFrames = inputFrames,
  };
}

}  // namespace jianying_probe
