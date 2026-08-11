#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace jianying_probe {

struct TextFrameProbeRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  std::filesystem::path outputPath;
  std::filesystem::path payloadOutputPath;
  std::filesystem::path fontPath;
  std::filesystem::path resourceManifestPath;
  std::string segmentPayload;
  std::string scriptParameters;
  std::string text;
  std::vector<std::string> stickerParams;
  double fontSize = 12.0;
  int width = 512;
  int height = 512;
  int segmentType = 3;
  int resolutionType = -1;
  std::int64_t timestamp = 500'000;
};

struct TextFrameProbeResult {
  bool rendered = false;
  bool visibleAndTransparent = false;
  std::size_t changedPixelCount = 0;
  std::size_t nonTransparentPixelCount = 0;
  std::size_t transparentPixelCount = 0;
  std::size_t coloredPixelCount = 0;
};

struct TextSequenceProbeRequest {
  TextFrameProbeRequest frame;
  int frameCount = 1;
  double timestampStep = 0.0;
};

struct TextSequenceProbeResult {
  int requestedFrames = 0;
  int renderedFrames = 0;
  int visibleFrames = 0;
};

[[nodiscard]] TextFrameProbeResult renderTextFrame(
    const TextFrameProbeRequest& request);

[[nodiscard]] TextSequenceProbeResult renderTextSequence(
    const TextSequenceProbeRequest& request);

}  // namespace jianying_probe
