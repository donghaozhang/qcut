#include "video-transition-probe.h"

#include "transition-probe.h"

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
  const std::uintmax_t frameCount = byteCount / frameBytes;
  if (frameCount > std::numeric_limits<std::size_t>::max()) {
    throw std::runtime_error("raw video has too many frames: " + path.string());
  }
  return static_cast<std::size_t>(frameCount);
}

[[nodiscard]] std::size_t transitionFrameCount(
    const RawVideoTransitionRequest& request) {
  if (!std::isfinite(request.frameRate) || request.frameRate <= 0.0 ||
      request.frameRate > 240.0) {
    throw std::runtime_error(
        "frame rate must be greater than 0 and at most 240");
  }
  if (!std::isfinite(request.transitionDurationSeconds) ||
      request.transitionDurationSeconds <= 0.0) {
    throw std::runtime_error("transition duration must be positive");
  }

  const double frameCount =
      request.frameRate * request.transitionDurationSeconds;
  if (!std::isfinite(frameCount) ||
      frameCount > static_cast<double>(std::numeric_limits<long long>::max())) {
    throw std::runtime_error("transition frame count is too large");
  }

  const auto roundedFrameCount =
      static_cast<std::size_t>(std::llround(frameCount));
  if (roundedFrameCount < 2) {
    throw std::runtime_error("transition must contain at least two frames");
  }
  return roundedFrameCount;
}

void readFrame(std::ifstream& stream, std::span<std::uint8_t> frame,
               const std::string& label) {
  if (frame.size() >
      static_cast<std::size_t>(std::numeric_limits<std::streamsize>::max())) {
    throw std::runtime_error("frame is too large for stream I/O");
  }

  const auto byteCount = static_cast<std::streamsize>(frame.size());
  stream.read(reinterpret_cast<char*>(frame.data()), byteCount);
  if (stream.gcount() != byteCount) {
    throw std::runtime_error("unexpected end of " + label);
  }
}

void writeFrame(std::ofstream& stream, std::span<const std::uint8_t> frame) {
  if (frame.size() >
      static_cast<std::size_t>(std::numeric_limits<std::streamsize>::max())) {
    throw std::runtime_error("frame is too large for stream I/O");
  }

  stream.write(reinterpret_cast<const char*>(frame.data()),
               static_cast<std::streamsize>(frame.size()));
  if (!stream) {
    throw std::runtime_error("failed to write raw transition output");
  }
}

void copyFrames(std::ifstream& input, std::ofstream& output,
                std::vector<std::uint8_t>& frame, std::size_t frameCount,
                const std::string& label) {
  for (std::size_t index = 0; index < frameCount; ++index) {
    readFrame(input, frame, label);
    writeFrame(output, frame);
  }
}

[[nodiscard]] bool pathsMatch(const fs::path& left, const fs::path& right) {
  return fs::absolute(left).lexically_normal() ==
         fs::absolute(right).lexically_normal();
}

}  // namespace

RawVideoTransitionResult renderRawVideoTransition(
    const RawVideoTransitionRequest& request) {
  if (!fs::is_directory(request.packagePath)) {
    throw std::runtime_error("missing transition package: " +
                             request.packagePath.string());
  }
  if (pathsMatch(request.inputAPath, request.outputPath) ||
      pathsMatch(request.inputBPath, request.outputPath)) {
    throw std::runtime_error("raw output must not overwrite an input");
  }

  const std::size_t frameBytes = frameByteCount(request.width, request.height);
  const std::size_t inputAFrames =
      rawFrameCount(request.inputAPath, frameBytes);
  const std::size_t inputBFrames =
      rawFrameCount(request.inputBPath, frameBytes);
  const std::size_t transitionFrames = transitionFrameCount(request);
  const std::size_t framesBeforeCut = transitionFrames / 2;
  const std::size_t framesAtOrAfterCut = transitionFrames - framesBeforeCut;
  if (framesBeforeCut > inputAFrames || framesAtOrAfterCut > inputBFrames) {
    throw std::runtime_error(
        "centered transition extends beyond a normalized input video");
  }
  if (inputBFrames > std::numeric_limits<std::size_t>::max() - inputAFrames) {
    throw std::runtime_error("combined output frame count overflows size_t");
  }

  std::ifstream inputA(request.inputAPath, std::ios::binary);
  std::ifstream inputB(request.inputBPath, std::ios::binary);
  std::ofstream output(request.outputPath, std::ios::binary | std::ios::trunc);
  if (!inputA || !inputB || !output) {
    throw std::runtime_error("failed to open raw video streams");
  }

  std::vector<std::uint8_t> frameA(frameBytes);
  std::vector<std::uint8_t> frameB(frameBytes);
  const std::size_t prefixFrames = inputAFrames - framesBeforeCut;
  copyFrames(inputA, output, frameA, prefixFrames, "raw input A");
  readFrame(inputB, frameB, "raw input B transition head");

  for (std::size_t index = 0; index < transitionFrames; ++index) {
    if (index < framesBeforeCut) {
      readFrame(inputA, frameA, "raw input A transition tail");
    }
    if (index > framesBeforeCut) {
      readFrame(inputB, frameB, "raw input B transition head");
    }
    const double progress =
        static_cast<double>(index) /
        static_cast<double>(transitionFrames - 1);
    std::cout << "[video] transition frame " << index + 1 << '/'
              << transitionFrames << ", progress = " << progress << '\n';

    const TransitionPixelFrameResult rendered = renderTransitionPixelFrame({
        .runtimeRoot = request.runtimeRoot,
        .packagePath = request.packagePath,
        .width = request.width,
        .height = request.height,
        .inputAPixels = frameA,
        .inputBPixels = frameB,
        .progress = progress,
    });
    if (!rendered.rendered || rendered.outputPixels.size() != frameBytes) {
      throw std::runtime_error(
          "transition engine failed to render video frame " +
          std::to_string(index));
    }
    writeFrame(output, rendered.outputPixels);
  }

  const std::size_t suffixFrames = inputBFrames - framesAtOrAfterCut;
  copyFrames(inputB, output, frameB, suffixFrames, "raw input B");
  output.close();
  if (!output) {
    throw std::runtime_error("failed to finalize raw transition output");
  }

  const std::size_t outputFrames = inputAFrames + inputBFrames;
  if (outputFrames > std::numeric_limits<std::uintmax_t>::max() / frameBytes ||
      fs::file_size(request.outputPath) != outputFrames * frameBytes) {
    throw std::runtime_error("raw transition output has an unexpected size");
  }
  std::cout << "[video] frames: A=" << inputAFrames << ", B=" << inputBFrames
            << ", transition=" << transitionFrames
            << ", before-cut=" << framesBeforeCut
            << ", at-or-after-cut=" << framesAtOrAfterCut
            << ", output=" << outputFrames << '\n';
  return {
      .inputAFrames = inputAFrames,
      .inputBFrames = inputBFrames,
      .transitionFrames = transitionFrames,
      .outputFrames = outputFrames,
  };
}

}  // namespace jianying_probe
