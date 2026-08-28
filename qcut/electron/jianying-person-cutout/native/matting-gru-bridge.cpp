#include "alpha-mask-fusion.hpp"
#include "alpha-refinement.hpp"
#include "alpha-resize.hpp"
#include "alpha-temporal-stabilizer.hpp"
#include "metal-matting-blend.hpp"
#include "vision-person-segmentation.hpp"

#include <dlfcn.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstddef>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

struct MattingInput {
  const std::uint8_t *data;
  std::int32_t pixelFormat;
  std::int32_t width;
  std::int32_t height;
  std::int32_t stride;
  std::int32_t orientation;
  std::int32_t reserved;
  bool invertAlpha;
};

static_assert(offsetof(MattingInput, invertAlpha) == 0x20);

struct MattingOutput {
  std::uint8_t *alpha;
  std::int32_t width;
  std::int32_t height;
};

using CreateHandle = int (*)(void **);
using InitModel = int (*)(void *, int, const char *);
using GetParam = int (*)(void *, int, int *);
using GetAlphaSize = int (*)(void *, int, int, int *, int *);
using SetParam = int (*)(void *, int, int);
using ProcessFrame = int (*)(void *, const MattingInput *, MattingOutput *);
using ReleaseHandle = int (*)(void *);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  auto *symbol = dlsym(library, name);
  if (!symbol) {
    throw std::runtime_error(std::string("missing symbol: ") + name);
  }
  return reinterpret_cast<Function>(symbol);
}

int parsePositiveInteger(const char *text, const char *label) {
  const int value = std::stoi(text);
  if (value <= 0) {
    throw std::runtime_error(std::string(label) + " must be positive");
  }
  return value;
}

void writeAll(int fileDescriptor, const std::uint8_t *data, std::size_t size) {
  std::size_t written = 0;
  while (written < size) {
    const auto result = ::write(fileDescriptor, data + written, size - written);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result <= 0) {
      throw std::runtime_error("cannot write alpha frame");
    }
    written += static_cast<std::size_t>(result);
  }
}

std::size_t readAll(int fileDescriptor, std::uint8_t *data, std::size_t size) {
  std::size_t bytesRead = 0;
  while (bytesRead < size) {
    const auto result =
        ::read(fileDescriptor, data + bytesRead, size - bytesRead);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result < 0) {
      throw std::runtime_error("cannot read RGBA input");
    }
    if (result == 0) {
      break;
    }
    bytesRead += static_cast<std::size_t>(result);
  }
  return bytesRead;
}

} // namespace

int main(int argc, char **argv) {
  bool useNativeMetal = false;
  bool useVisionPersonFusion = false;
  bool validOptions = argc >= 12;
  for (int optionIndex = 12; validOptions && optionIndex < argc;
       ++optionIndex) {
    const std::string option = argv[optionIndex];
    if (option == "--vision-person-fusion") {
      useVisionPersonFusion = true;
      continue;
    }
    if (option == "--blend" && optionIndex + 1 < argc &&
        std::string(argv[optionIndex + 1]) == "native-metal") {
      useNativeMetal = true;
      optionIndex += 1;
      continue;
    }
    validOptions = false;
  }
  if (!validOptions) {
    std::cerr << "usage: portrait-matting-gru-bridge <libcccreator> <model> "
                 "<model-type> <input.rgba> <width> <height> <output.gray> "
                 "<threshold> <temporal-smoothing> <edge-shift> <feather> "
                 "[--vision-person-fusion] [--blend native-metal]\n";
    return 2;
  }

  try {
    const int modelType = std::stoi(argv[3]);
    const int width = parsePositiveInteger(argv[5], "width");
    const int height = parsePositiveInteger(argv[6], "height");
    const float threshold = std::clamp(std::stof(argv[8]), 0.0F, 1.0F);
    const float temporalSmoothing = std::clamp(std::stof(argv[9]), 0.0F, 0.95F);
    const float edgeShift = std::clamp(std::stof(argv[10]), -12.0F, 12.0F);
    const float feather = std::clamp(std::stof(argv[11]), 0.0F, 16.0F);
    const auto frameBytes = static_cast<std::size_t>(width) * height * 4;
    const bool streamInput = std::string(argv[4]) == "-";
    const bool streamOutput = std::string(argv[7]) == "-";
    std::unique_ptr<std::ifstream> inputFile;
    std::istream *rgbaInput = &std::cin;
    std::size_t expectedFrameCount = 0;
    if (!streamInput) {
      inputFile = std::make_unique<std::ifstream>(
          argv[4], std::ios::binary | std::ios::ate);
      if (!*inputFile) {
        throw std::runtime_error("cannot open input file");
      }
      const auto inputBytes = inputFile->tellg();
      if (inputBytes <= 0 ||
          static_cast<std::size_t>(inputBytes) % frameBytes != 0) {
        throw std::runtime_error("input does not contain complete RGBA frames");
      }
      expectedFrameCount =
          static_cast<std::size_t>(inputBytes) / frameBytes;
      inputFile->seekg(0);
      rgbaInput = inputFile.get();
    }
    std::unique_ptr<std::ofstream> outputFile;
    std::unique_ptr<std::ofstream> rawAlphaFile;
    std::unique_ptr<std::ofstream> preTemporalAlphaFile;
    std::unique_ptr<std::ofstream> preBorderTemporalAlphaFile;
    int alphaOutputDescriptor = -1;
    if (streamOutput) {
      alphaOutputDescriptor = ::dup(STDOUT_FILENO);
      if (alphaOutputDescriptor < 0 ||
          ::dup2(STDERR_FILENO, STDOUT_FILENO) < 0) {
        throw std::runtime_error("cannot isolate alpha output stream");
      }
    } else {
      outputFile =
          std::make_unique<std::ofstream>(argv[7], std::ios::binary);
      if (!*outputFile) {
        throw std::runtime_error("cannot open output file");
      }
    }
    if (const char *rawAlphaPath =
            std::getenv("QCUT_PERSON_CUTOUT_RAW_ALPHA_PATH")) {
      rawAlphaFile =
          std::make_unique<std::ofstream>(rawAlphaPath, std::ios::binary);
      if (!*rawAlphaFile) {
        throw std::runtime_error("cannot open raw alpha diagnostic file");
      }
    }
    if (const char *preBorderTemporalAlphaPath =
            std::getenv("QCUT_PERSON_CUTOUT_PRE_BORDER_ALPHA_PATH")) {
      preBorderTemporalAlphaFile = std::make_unique<std::ofstream>(
          preBorderTemporalAlphaPath, std::ios::binary);
      if (!*preBorderTemporalAlphaFile) {
        throw std::runtime_error(
            "cannot open pre-border temporal alpha diagnostic file");
      }
    }
    if (const char *preTemporalAlphaPath =
            std::getenv("QCUT_PERSON_CUTOUT_PRE_TEMPORAL_ALPHA_PATH")) {
      preTemporalAlphaFile = std::make_unique<std::ofstream>(
          preTemporalAlphaPath, std::ios::binary);
      if (!*preTemporalAlphaFile) {
        throw std::runtime_error(
            "cannot open pre-temporal alpha diagnostic file");
      }
    }

    std::vector<std::uint8_t> rgba(frameBytes);
    std::vector<std::uint8_t> bgr(frameBytes / 4 * 3);
    void *library = dlopen(
        argv[1], RTLD_NOW | (useNativeMetal ? RTLD_GLOBAL : RTLD_LOCAL));
    if (!library) {
      throw std::runtime_error(std::string("cannot load runtime: ") +
                               dlerror());
    }
    const auto createHandle = requireSymbol<CreateHandle>(
        library, "bef_Portrait_Matting_CreateHandle");
    const auto initModel =
        requireSymbol<InitModel>(library, "bef_Portrait_Matting_InitModel");
    const auto getParam = requireSymbol<GetParam>(
        library, "bef_Portrait_Matting_GetParam");
    const auto getAlphaSize =
        requireSymbol<GetAlphaSize>(library, "bef_MP_GetAlphaSize");
    const auto setParam = requireSymbol<SetParam>(library, "bef_MP_SetParam");
    const auto processFrame = requireSymbol<ProcessFrame>(
        library, "bef_Portrait_Matting_DoPortraitMatting");
    const auto releaseHandle = requireSymbol<ReleaseHandle>(
        library, "bef_Portrait_Matting_ReleaseHandle");

    constexpr std::pair<int, int> graphParameters[] = {
        {5, 1}, {6, -1}, {7, 1}, {8, 1}, {1, 15}, {0, 1}, {5, 1},
    };
    struct InitializedMattingHandle {
      void *handle;
      int alphaWidth;
      int alphaHeight;
      int internalModelType;
    };
    const auto initializeHandle = [&]() {
      void *newHandle = nullptr;
      const int createStatus = createHandle(&newHandle);
      if (createStatus != 0 || !newHandle) {
        throw std::runtime_error("cannot create matting handle: " +
                                 std::to_string(createStatus));
      }
      const int initStatus = initModel(newHandle, modelType, argv[2]);
      if (initStatus != 0) {
        releaseHandle(newHandle);
        throw std::runtime_error("cannot initialize matting model: " +
                                 std::to_string(initStatus));
      }
      int resolvedModelType = -1;
      const int modelTypeStatus =
          getParam(newHandle, 6, &resolvedModelType);
      if (modelTypeStatus != 0 || resolvedModelType != 6) {
        releaseHandle(newHandle);
        throw std::runtime_error("unexpected internal matting model type: " +
                                 std::to_string(resolvedModelType));
      }
      for (const auto &[parameter, value] : graphParameters) {
        const int parameterStatus = setParam(newHandle, parameter, value);
        if (parameterStatus != 0) {
          releaseHandle(newHandle);
          throw std::runtime_error(
              "cannot configure matting graph parameter " +
              std::to_string(parameter) + ": " +
              std::to_string(parameterStatus));
        }
      }
      int resolvedAlphaWidth = 0;
      int resolvedAlphaHeight = 0;
      const int sizeStatus = getAlphaSize(newHandle, width, height,
                                          &resolvedAlphaWidth,
                                          &resolvedAlphaHeight);
      if (sizeStatus != 0 || resolvedAlphaWidth <= 0 ||
          resolvedAlphaHeight <= 0 || resolvedAlphaWidth > width ||
          resolvedAlphaHeight > height) {
        releaseHandle(newHandle);
        throw std::runtime_error("cannot resolve alpha size: " +
                                 std::to_string(sizeStatus));
      }
      return InitializedMattingHandle{
          .handle = newHandle,
          .alphaWidth = resolvedAlphaWidth,
          .alphaHeight = resolvedAlphaHeight,
          .internalModelType = resolvedModelType,
      };
    };
    const auto initializedHandle = initializeHandle();
    void *handle = initializedHandle.handle;
    const int alphaWidth = initializedHandle.alphaWidth;
    const int alphaHeight = initializedHandle.alphaHeight;
    const int internalModelType = initializedHandle.internalModelType;
    std::vector<std::uint8_t> alpha(static_cast<std::size_t>(alphaWidth) *
                                    alphaHeight);
    std::unique_ptr<qcut::matting::MetalMattingBlend> metalBlend;
    if (useNativeMetal) {
      metalBlend = std::make_unique<qcut::matting::MetalMattingBlend>(
          qcut::matting::MetalMattingBlendConfig{
              .library = library,
              .width = width,
              .height = height,
          });
    }
    std::unique_ptr<qcut::matting::VisionPersonSegmentation>
        visionSegmentation;
    const bool visionFusionEnabled =
        useVisionPersonFusion &&
        std::getenv("QCUT_DISABLE_VISION_PERSON_FUSION") == nullptr;
    if (visionFusionEnabled) {
      try {
        visionSegmentation =
            std::make_unique<qcut::matting::VisionPersonSegmentation>(width,
                                                                     height);
      } catch (const std::exception &error) {
        std::cerr << "Vision-person-fusion-v1 unavailable: " << error.what()
                  << '\n';
      }
    }

    MattingInput input{
        .data = bgr.data(),
        // Pixel format 2 is the runtime's BGR888 fast path.
        .pixelFormat = 2,
        .width = width,
        .height = height,
        .stride = width * 3,
        .orientation = 0,
        .reserved = 0,
        .invertAlpha = false,
    };
    MattingOutput output{
        .alpha = alpha.data(),
        .width = alphaWidth,
        .height = alphaHeight,
    };
    struct BufferedAlphaFrame {
      std::size_t index;
      std::vector<std::uint8_t> rgba;
      std::vector<std::uint8_t> alpha;
      std::vector<std::uint8_t> visionAlpha;
    };
    constexpr std::size_t temporalRadius = 5;
    std::deque<BufferedAlphaFrame> temporalWindow;
    std::vector<float> temporalState;
    std::size_t frameCount = 0;
    std::size_t nextOutputFrame = 0;
    const auto writeAlpha = [&](const std::vector<std::uint8_t> &finalAlpha) {
      if (streamOutput) {
        writeAll(alphaOutputDescriptor, finalAlpha.data(), finalAlpha.size());
        return;
      }
      outputFile->write(reinterpret_cast<const char *>(finalAlpha.data()),
                        static_cast<std::streamsize>(finalAlpha.size()));
      if (!*outputFile) {
        throw std::runtime_error("cannot write alpha frame");
      }
    };
    const auto flushTemporalWindow = [&](bool flushAll) {
      while (!temporalWindow.empty() && nextOutputFrame < frameCount) {
        const auto newestFrame = temporalWindow.back().index;
        if (!flushAll && newestFrame < nextOutputFrame + temporalRadius) {
          break;
        }
        const auto target = std::find_if(
            temporalWindow.begin(), temporalWindow.end(),
            [&](const auto &frame) { return frame.index == nextOutputFrame; });
        if (target == temporalWindow.end()) {
          throw std::runtime_error("temporal window lost an output frame");
        }
        std::vector<qcut::matting::TemporalForegroundFrameView> frameViews;
        for (const auto &frame : temporalWindow) {
          const auto distance = static_cast<long long>(frame.index) -
                                static_cast<long long>(nextOutputFrame);
          if (std::abs(distance) > static_cast<long long>(temporalRadius)) {
            continue;
          }
          frameViews.push_back(qcut::matting::TemporalForegroundFrameView{
              .rgba = &frame.rgba,
              .alpha = &frame.alpha,
              .frameOffset = static_cast<int>(distance),
          });
        }
        const auto temporallyStabilizedAlpha =
            temporalSmoothing <= 0.05F
                ? qcut::matting::stabilizeTemporalForeground(frameViews, width,
                                                               height)
                : target->alpha;
        const auto fusedAlpha =
            target->visionAlpha.empty()
                ? temporallyStabilizedAlpha
                : qcut::matting::fusePersonAlpha(temporallyStabilizedAlpha,
                                                 target->visionAlpha);
        if (preBorderTemporalAlphaFile) {
          preBorderTemporalAlphaFile->write(
              reinterpret_cast<const char *>(fusedAlpha.data()),
              static_cast<std::streamsize>(fusedAlpha.size()));
          if (!*preBorderTemporalAlphaFile) {
            throw std::runtime_error(
                "cannot write pre-border temporal alpha diagnostic frame");
          }
        }
        const auto borderProcessedAlpha =
            qcut::matting::applyJianyingPortraitBorderLut(
                fusedAlpha);
        const auto refinedAlpha = qcut::matting::refineAlpha(
            borderProcessedAlpha, temporalState, width, height, threshold,
            temporalSmoothing, edgeShift, feather);
        const auto finalAlpha =
            metalBlend
                ? metalBlend->blendAlpha(
                      qcut::matting::MetalMattingBlendFrame{
                          .rgba = target->rgba,
                          .alpha = refinedAlpha,
                          .alphaWidth = width,
                          .alphaHeight = height,
                      })
                : refinedAlpha;
        writeAlpha(finalAlpha);
        nextOutputFrame += 1;
        while (!temporalWindow.empty() &&
               temporalWindow.front().index + temporalRadius <
                   nextOutputFrame) {
          temporalWindow.pop_front();
        }
      }
    };
    while (true) {
      std::size_t bytesRead = 0;
      if (streamInput) {
        bytesRead = readAll(STDIN_FILENO, rgba.data(), rgba.size());
      } else {
        rgbaInput->read(reinterpret_cast<char *>(rgba.data()),
                        static_cast<std::streamsize>(rgba.size()));
        bytesRead = static_cast<std::size_t>(rgbaInput->gcount());
      }
      if (bytesRead == 0) {
        break;
      }
      if (bytesRead != rgba.size()) {
        releaseHandle(handle);
        throw std::runtime_error("input ended with an incomplete RGBA frame");
      }
      for (std::size_t source = 0, target = 0; source < rgba.size();
           source += 4, target += 3) {
        bgr[target] = rgba[source + 2];
        bgr[target + 1] = rgba[source + 1];
        bgr[target + 2] = rgba[source];
      }
      const int processStatus = processFrame(handle, &input, &output);
      if (processStatus != 0) {
        releaseHandle(handle);
        throw std::runtime_error("cannot process matting frame: " +
                                 std::to_string(processStatus));
      }
      if (output.width != alphaWidth || output.height != alphaHeight) {
        releaseHandle(handle);
        throw std::runtime_error(
            "matting output dimensions changed unexpectedly");
      }
      if (rawAlphaFile) {
        rawAlphaFile->write(reinterpret_cast<const char *>(alpha.data()),
                            static_cast<std::streamsize>(alpha.size()));
        if (!*rawAlphaFile) {
          releaseHandle(handle);
          throw std::runtime_error("cannot write raw alpha diagnostic frame");
        }
      }
      const auto fullSizeAlpha = qcut::matting::resizeAlphaBilinear(
          alpha, alphaWidth, alphaHeight, width, height);
      const auto visionAlpha = visionSegmentation
                                   ? visionSegmentation->segment(rgba)
                                   : std::vector<std::uint8_t>{};
      if (preTemporalAlphaFile) {
        preTemporalAlphaFile->write(
            reinterpret_cast<const char *>(fullSizeAlpha.data()),
            static_cast<std::streamsize>(fullSizeAlpha.size()));
        if (!*preTemporalAlphaFile) {
          releaseHandle(handle);
          throw std::runtime_error(
              "cannot write pre-temporal alpha diagnostic frame");
        }
      }
      temporalWindow.push_back(BufferedAlphaFrame{
          .index = frameCount,
          .rgba = rgba,
          .alpha = fullSizeAlpha,
          .visionAlpha = visionAlpha,
      });
      frameCount += 1;
      flushTemporalWindow(false);
      std::cerr << "progress frame=" << frameCount
                << " total=" << expectedFrameCount << '\n';
    }
    if (frameCount == 0 ||
        (expectedFrameCount > 0 && frameCount != expectedFrameCount)) {
      releaseHandle(handle);
      throw std::runtime_error("input does not contain complete RGBA frames");
    }
    flushTemporalWindow(true);
    if (nextOutputFrame != frameCount) {
      releaseHandle(handle);
      throw std::runtime_error("temporal window did not emit every frame");
    }
    releaseHandle(handle);
    if (alphaOutputDescriptor >= 0) {
      ::close(alphaOutputDescriptor);
    }
    std::cerr << "ok width=" << width << " height=" << height
              << " alphaWidth=" << alphaWidth << " alphaHeight=" << alphaHeight
              << " frames=" << frameCount << " modelType=" << modelType
              << " internalModelType=" << internalModelType
              << " blend="
              << (useNativeMetal ? "TEMattingBlendEffectV2-native-metal"
                                 : "TEMattingBlendEffectV2-compatible")
              << " visionFusion="
              << (visionSegmentation ? "Vision-person-fusion-v1" : "disabled")
              << '\n';
    dlclose(library);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
