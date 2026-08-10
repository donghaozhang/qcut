#pragma once

#include <array>
#include <cstddef>
#include <filesystem>

namespace jianying_probe {

struct FilterSequenceRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  std::filesystem::path modelDirectory;
  std::filesystem::path manifestPath;
  std::filesystem::path outputDirectory;
  int width;
  int height;
  double frameRate;
  std::array<bool, 3> nativeTextureFlags{};
  int inputTextureDataCode = 0;
  int outputTextureDataCode = 0;
  bool enableSwingSimplify = true;
  bool managerCreateOption = false;
};

struct FilterSequenceResult {
  std::size_t requestedFrames = 0;
  std::size_t renderedFrames = 0;
};

[[nodiscard]] FilterSequenceResult renderFilterSequence(
    const FilterSequenceRequest& request);

}  // namespace jianying_probe
