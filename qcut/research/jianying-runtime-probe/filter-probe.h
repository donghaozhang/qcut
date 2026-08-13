#pragma once

#include <array>
#include <cstddef>
#include <filesystem>
#include <optional>
#include <string>

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
  int algorithmCacheFlag = 0;
  std::string featureParameters;
  bool preferExactModelFilename = false;
  bool exportMode = false;
  bool enableSwingSimplify = true;
  bool enableAdjustColorWithFloat = false;
  bool enableImageQuality = false;
  bool managerCreateOption = false;
  bool enableParallelAsyncSwing = false;
  bool useBefContextScope = true;
  std::optional<bool> skinSegUseSimdOptim;
  int stageDelayMilliseconds = 0;
  int postSeekDelayMilliseconds = 0;
  bool reseekAfterReady = false;
};

struct FilterSequenceResult {
  std::size_t requestedFrames = 0;
  std::size_t renderedFrames = 0;
};

[[nodiscard]] FilterSequenceResult renderFilterSequence(
    const FilterSequenceRequest& request);

}  // namespace jianying_probe
