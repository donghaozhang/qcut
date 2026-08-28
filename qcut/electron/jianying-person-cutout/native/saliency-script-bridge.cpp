// QCut-owned interoperability bridge; proprietary libraries and assets are supplied at runtime.
#include "alpha-refinement.hpp"
#include "alpha-resize.hpp"
#include "effect-input-probe.hpp"
#include "effect-texture-context.hpp"
#include "video-object-alpha-quality.hpp"

#include <mach/mach.h>

#include <dlfcn.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {

using EffectHandle = std::uint64_t;
using Result = std::int32_t;
using EffectCreate = Result (*)(EffectHandle *);
using EffectDestroy = void (*)(EffectHandle);
using EffectSetRenderApi = Result (*)(EffectHandle, std::int32_t);
using EffectUsePipeline = Result (*)(EffectHandle, bool);
using EffectInit =
    Result (*)(EffectHandle, std::int32_t, std::int32_t, const char *,
               const char *);
using EffectSetWidthHeight =
    Result (*)(EffectHandle, std::int32_t, std::int32_t);
using EffectSetOrientation = Result (*)(EffectHandle, std::int32_t);
using EffectSet = Result (*)(EffectHandle, const char *);
using EffectAlgorithmTexture =
    Result (*)(EffectHandle, std::uint32_t, double);
using EffectAlgorithmBuffer = Result (*)(EffectHandle, std::int32_t,
                                         std::int32_t, const std::uint8_t *,
                                         std::int32_t, double);
struct EffectRequirement {
  std::uint64_t low;
  std::uint64_t high;
};
using EffectGetNewRequirement = EffectRequirement (*)(EffectHandle);
using EffectRefreshNewAlgorithm = Result (*)(EffectHandle, std::uint64_t,
                                             std::uint64_t, std::int32_t);
using EffectProcessTexture =
    Result (*)(EffectHandle, std::uint32_t, std::uint32_t, double);
using EffectGetBachResult = Result (*)(EffectHandle, void **, std::int32_t);

struct Vector4f {
  float x;
  float y;
  float z;
  float w;
};

using BachObjectToVector4f = Vector4f (*)(const void *);
using BachObjectToMap = void *(*)(const void *);
using FindScriptValue = void *(*)(void *, const std::string *, const void *,
                                  const std::string **, bool *);
using BachTextureDimension = std::int32_t (*)(void *);

struct ReturnedPrimitiveVector {
  void *value = nullptr;
  // The vendor method returns this wrapper through arm64's indirect-result ABI.
  ~ReturnedPrimitiveVector() {}
};

using BachTextureData = ReturnedPrimitiveVector (*)(void *);
using ReleaseReference = void (*)(const void *);

enum class SegmentationRoute { SaliencyScript, VideoObject };

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  dlerror();
  void *symbol = dlsym(library, name);
  if (const char *error = dlerror(); error != nullptr) {
    throw std::runtime_error(std::string("missing symbol ") + name + ": " +
                             error);
  }
  return reinterpret_cast<Function>(symbol);
}

int parsePositiveInteger(const char *text, const char *label) {
  const int value = std::stoi(text);
  if (value <= 0 || value > 8192) {
    throw std::runtime_error(std::string(label) + " is out of range");
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
      throw std::runtime_error("cannot write saliency alpha frame");
    }
    written += static_cast<std::size_t>(result);
  }
}

std::size_t readAll(int fileDescriptor, std::uint8_t *data, std::size_t size) {
  std::size_t bytesRead = 0;
  while (bytesRead < size) {
    const auto result = ::read(fileDescriptor, data + bytesRead, size - bytesRead);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result < 0) {
      throw std::runtime_error("cannot read saliency RGBA input");
    }
    if (result == 0) {
      break;
    }
    bytesRead += static_cast<std::size_t>(result);
  }
  return bytesRead;
}

bool readProcessMemory(const void *address, void *output, std::size_t size) {
  vm_size_t bytesRead = 0;
  const kern_return_t result = vm_read_overwrite(
      mach_task_self(), reinterpret_cast<vm_address_t>(address),
      static_cast<vm_size_t>(size), reinterpret_cast<vm_address_t>(output),
      &bytesRead);
  return result == KERN_SUCCESS && bytesRead == size;
}

void flipRows(const std::vector<std::uint8_t> &source,
              std::vector<std::uint8_t> &target, int width, int height) {
  const std::size_t rowBytes = static_cast<std::size_t>(width) * 4;
  for (int y = 0; y < height; ++y) {
    const auto sourceOffset = static_cast<std::size_t>(y) * rowBytes;
    const auto targetOffset = static_cast<std::size_t>(height - y - 1) * rowBytes;
    std::copy_n(source.data() + sourceOffset, rowBytes,
                target.data() + targetOffset);
  }
}

void *findScriptValue(const void *scriptInfo, const char *key,
                      const void *libraryBase) {
  // VideoFusion 11.3.0 offsets recovered from
  // TEBachMattingAlgorithm::getMaskAndBoundingBox.
  constexpr std::uintptr_t findValueOffset = 0x0b86aa4;
  constexpr std::uintptr_t comparatorOffset = 0x2d03ee0;
  const auto base = reinterpret_cast<std::uintptr_t>(libraryBase);
  const auto findValue =
      reinterpret_cast<FindScriptValue>(base + findValueOffset);
  const auto *comparator = reinterpret_cast<const void *>(base + comparatorOffset);
  const std::string requestedKey(key);
  const std::string *matchedKey = &requestedKey;
  bool didInsert = false;
  auto *map = const_cast<std::uint8_t *>(
                  static_cast<const std::uint8_t *>(scriptInfo)) +
              0x10;
  return findValue(map, &requestedKey, comparator, &matchedKey, &didInsert);
}

std::vector<std::uint8_t>
extractScriptMask(EffectHandle handle, EffectGetBachResult getResult,
                  BachObjectToVector4f toVector4f,
                  const void *libraryBase, int width, int height) {
  constexpr std::int32_t scriptAlgorithmType = 141;
  void *resultObject = nullptr;
  if (getResult(handle, &resultObject, scriptAlgorithmType) != 0 ||
      resultObject == nullptr) {
    throw std::runtime_error("saliency graph did not expose ScriptInfo");
  }

  void *infoVector = nullptr;
  void *scriptInfo = nullptr;
  const auto *resultBytes = static_cast<const std::uint8_t *>(resultObject);
  if (!readProcessMemory(resultBytes + 0x18, &infoVector, sizeof(infoVector)) ||
      infoVector == nullptr ||
      !readProcessMemory(infoVector, &scriptInfo, sizeof(scriptInfo)) ||
      scriptInfo == nullptr) {
    throw std::runtime_error("saliency ScriptInfo layout is incompatible");
  }

  const void *maskEntry = findScriptValue(scriptInfo, "mask", libraryBase);
  const void *boundsEntry = findScriptValue(scriptInfo, "ltwh", libraryBase);
  if (maskEntry == nullptr || boundsEntry == nullptr) {
    throw std::runtime_error("saliency ScriptInfo has no mask or ltwh entry");
  }

  const Vector4f bounds = toVector4f(
      static_cast<const std::uint8_t *>(boundsEntry) + 0x28);
  const int maskLeft = static_cast<int>(std::lround(bounds.x));
  const int maskTop = static_cast<int>(std::lround(bounds.y));
  const int maskWidth = static_cast<int>(std::lround(bounds.z));
  const int maskHeight = static_cast<int>(std::lround(bounds.w));
  if (maskWidth <= 0 || maskHeight <= 0 || maskLeft < 0 || maskTop < 0 ||
      maskLeft + maskWidth > width || maskTop + maskHeight > height) {
    throw std::runtime_error("saliency mask bounds are outside the source frame");
  }

  const void *textureInfo = nullptr;
  if (!readProcessMemory(
          static_cast<const std::uint8_t *>(maskEntry) + 0x88, &textureInfo,
          sizeof(textureInfo)) ||
      textureInfo == nullptr) {
    throw std::runtime_error("saliency mask has no CPU image payload");
  }
  const std::uint8_t *begin = nullptr;
  const std::uint8_t *end = nullptr;
  const auto *textureBytes = static_cast<const std::uint8_t *>(textureInfo);
  if (!readProcessMemory(textureBytes + 0x10, &begin, sizeof(begin)) ||
      !readProcessMemory(textureBytes + 0x18, &end, sizeof(end)) ||
      begin == nullptr || end < begin ||
      static_cast<std::size_t>(end - begin) !=
          static_cast<std::size_t>(maskWidth) * maskHeight) {
    throw std::runtime_error("saliency mask payload is incomplete");
  }

  std::vector<std::uint8_t> alpha(static_cast<std::size_t>(width) * height);
  for (int y = 0; y < maskHeight; ++y) {
    const auto sourceOffset = static_cast<std::size_t>(y) * maskWidth;
    const auto targetOffset =
        static_cast<std::size_t>(maskTop + y) * width + maskLeft;
    std::copy_n(begin + sourceOffset, maskWidth, alpha.data() + targetOffset);
  }
  return alpha;
}

class RetainedReference {
public:
  RetainedReference(void *value, ReleaseReference release)
      : value_(value), release_(release) {}

  RetainedReference(const RetainedReference &) = delete;
  RetainedReference &operator=(const RetainedReference &) = delete;

  ~RetainedReference() {
    if (value_ != nullptr) {
      release_(value_);
    }
  }

private:
  void *value_;
  ReleaseReference release_;
};

std::vector<std::uint8_t> extractVideoObjectMask(
    EffectHandle handle, EffectGetBachResult getResult,
    BachObjectToMap toMap, BachTextureData getTextureData,
    BachTextureDimension getWidth, BachTextureDimension getHeight,
    ReleaseReference releaseReference, int width, int height) {
  constexpr std::int32_t generalSegAlgorithmType = 198;
  constexpr std::size_t bachMapFirstNodeOffset = 0x20;
  constexpr std::size_t unorderedMapValueOffset = 0x28;
  constexpr std::size_t bachObjectTypeOffset = 0x80;
  constexpr std::uint32_t bachMapType = 0x1d;
  constexpr std::size_t primitiveVectorBeginOffset = 0x10;
  constexpr std::size_t primitiveVectorEndOffset = 0x18;
  constexpr char resultKey[] = "saliency_mask";

  void *resultObject = nullptr;
  if (getResult(handle, &resultObject, generalSegAlgorithmType) != 0 ||
      resultObject == nullptr) {
    throw std::runtime_error("video-object graph did not expose BachBuffer");
  }
  void *resultVector = nullptr;
  void *outerMap = nullptr;
  const auto *resultBytes = static_cast<const std::uint8_t *>(resultObject);
  if (!readProcessMemory(resultBytes + 0x18, &resultVector,
                         sizeof(resultVector)) ||
      resultVector == nullptr ||
      !readProcessMemory(resultVector, &outerMap, sizeof(outerMap)) ||
      outerMap == nullptr) {
    throw std::runtime_error("video-object BachBuffer layout is incompatible");
  }
  void *firstNode = nullptr;
  if (!readProcessMemory(
          static_cast<const std::uint8_t *>(outerMap) +
              bachMapFirstNodeOffset,
          &firstNode, sizeof(firstNode)) ||
      firstNode == nullptr) {
    throw std::runtime_error("video-object result map is empty");
  }
  char key[sizeof(resultKey) - 1]{};
  if (!readProcessMemory(static_cast<const std::uint8_t *>(firstNode) + 0x10,
                         key, sizeof(key)) ||
      !std::equal(std::begin(key), std::end(key), std::begin(resultKey))) {
    throw std::runtime_error("video-object result has no saliency_mask");
  }
  const auto *value = static_cast<const std::uint8_t *>(firstNode) +
                      unorderedMapValueOffset;
  std::uint32_t valueType = 0;
  if (!readProcessMemory(value + bachObjectTypeOffset, &valueType,
                         sizeof(valueType)) ||
      valueType != bachMapType) {
    throw std::runtime_error("video-object saliency_mask type is incompatible");
  }
  void *textureInfo = toMap(value);
  if (textureInfo == nullptr) {
    throw std::runtime_error("video-object saliency_mask texture is missing");
  }
  const int maskWidth = getWidth(textureInfo);
  const int maskHeight = getHeight(textureInfo);
  if (maskWidth <= 0 || maskHeight <= 0 || maskWidth > 4096 ||
      maskHeight > 4096) {
    throw std::runtime_error("video-object saliency_mask dimensions are invalid");
  }
  ReturnedPrimitiveVector returnedData = getTextureData(textureInfo);
  if (returnedData.value == nullptr) {
    throw std::runtime_error("video-object saliency_mask data is missing");
  }
  RetainedReference retainedData(returnedData.value, releaseReference);
  const std::uint8_t *begin = nullptr;
  const std::uint8_t *end = nullptr;
  const auto *dataBytes =
      static_cast<const std::uint8_t *>(returnedData.value);
  if (!readProcessMemory(dataBytes + primitiveVectorBeginOffset, &begin,
                         sizeof(begin)) ||
      !readProcessMemory(dataBytes + primitiveVectorEndOffset, &end,
                         sizeof(end)) ||
      begin == nullptr || end < begin ||
      static_cast<std::size_t>(end - begin) !=
          static_cast<std::size_t>(maskWidth) * maskHeight) {
    throw std::runtime_error("video-object saliency_mask payload is incomplete");
  }
  const std::vector<std::uint8_t> alpha(begin, end);
  return qcut::matting::resizeAlphaBilinear(alpha, maskWidth, maskHeight,
                                             width, height);
}

} // namespace

int main(int argc, char **argv) {
  const bool hasRoute = argc == 14 && std::string(argv[12]) == "--route";
  if (argc != 12 && !hasRoute) {
    std::cerr << "usage: segmentation-bridge <libcccreator> <models-dir> "
                 "<effect-dir> <input.rgba|-> <width> <height> "
                 "<output.gray|-> <threshold> <temporal-smoothing> "
                 "<edge-shift> <feather> [--route video-object]\n";
    return 2;
  }

  try {
    const SegmentationRoute route =
        hasRoute && std::string(argv[13]) == "video-object"
            ? SegmentationRoute::VideoObject
            : SegmentationRoute::SaliencyScript;
    if (hasRoute && route != SegmentationRoute::VideoObject) {
      throw std::runtime_error("unsupported segmentation route");
    }
    const int width = parsePositiveInteger(argv[5], "width");
    const int height = parsePositiveInteger(argv[6], "height");
    const float threshold = std::clamp(std::stof(argv[8]), 0.0F, 1.0F);
    const float temporalSmoothing =
        std::clamp(std::stof(argv[9]), 0.0F, 0.95F);
    const float edgeShift = std::clamp(std::stof(argv[10]), -12.0F, 12.0F);
    const float feather = std::clamp(std::stof(argv[11]), 0.0F, 16.0F);
    const std::size_t frameBytes =
        static_cast<std::size_t>(width) * height * 4;
    const bool streamInput = std::string(argv[4]) == "-";
    const bool streamOutput = std::string(argv[7]) == "-";

    std::unique_ptr<std::ifstream> inputFile;
    std::istream *rgbaInput = &std::cin;
    std::size_t expectedFrameCount = 0;
    if (!streamInput) {
      inputFile = std::make_unique<std::ifstream>(
          argv[4], std::ios::binary | std::ios::ate);
      if (!*inputFile) {
        throw std::runtime_error("cannot open saliency RGBA input");
      }
      const auto inputBytes = inputFile->tellg();
      if (inputBytes <= 0 ||
          static_cast<std::size_t>(inputBytes) % frameBytes != 0) {
        throw std::runtime_error("input does not contain complete RGBA frames");
      }
      expectedFrameCount = static_cast<std::size_t>(inputBytes) / frameBytes;
      inputFile->seekg(0);
      rgbaInput = inputFile.get();
    }

    std::unique_ptr<std::ofstream> outputFile;
    int alphaOutputDescriptor = -1;
    if (streamOutput) {
      alphaOutputDescriptor = ::dup(STDOUT_FILENO);
      if (alphaOutputDescriptor < 0 ||
          ::dup2(STDERR_FILENO, STDOUT_FILENO) < 0) {
        throw std::runtime_error("cannot isolate saliency alpha output stream");
      }
    } else {
      outputFile = std::make_unique<std::ofstream>(argv[7], std::ios::binary);
      if (!*outputFile) {
        throw std::runtime_error("cannot open saliency alpha output");
      }
    }

    std::vector<std::uint8_t> source(frameBytes);
    std::vector<std::uint8_t> flipped(frameBytes);

    void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (library == nullptr) {
      throw std::runtime_error(std::string("cannot load saliency runtime: ") +
                               dlerror());
    }
    Dl_info libraryInfo{};
    if (dladdr(dlsym(library, "bef_effect_create_handle"), &libraryInfo) == 0 ||
        libraryInfo.dli_fbase == nullptr) {
      throw std::runtime_error("cannot resolve saliency runtime base address");
    }
    const bool usesEngineContext =
        route == SegmentationRoute::VideoObject &&
        qcut::matting::engineImageProcessingContextProbeEnabled() &&
        qcut::matting::bindEngineImageProcessingContext();
    const bool usesBufferInput =
        route == SegmentationRoute::VideoObject &&
        qcut::matting::bufferInputProbeEnabled();
    const auto contextMode =
        usesEngineContext
            ? qcut::matting::EffectTextureContextMode::AdoptCurrent
            : qcut::matting::EffectTextureContextMode::CreateStandalone;
    auto textureContext =
        std::make_unique<qcut::matting::EffectTextureContext>(contextMode);
    std::cerr << "texture_context="
              << (usesEngineContext ? "engine-shared" : "standalone")
              << " input_transport="
              << (usesBufferInput ? "cpu-buffer-canary" : "gl-texture")
              << '\n';
    textureContext->setUnpackAlignment(1);
    std::vector<std::uint8_t> outputSeed(frameBytes);
    for (std::size_t offset = 0; offset < outputSeed.size(); offset += 4) {
      outputSeed[offset] = 255;
      outputSeed[offset + 2] = 255;
      outputSeed[offset + 3] = 255;
    }
    const std::uint32_t inputTexture =
        textureContext->createTexture(width, height, outputSeed);
    const std::uint32_t outputTexture =
        textureContext->createTexture(width, height, outputSeed);

    const auto effectCreate =
        requireSymbol<EffectCreate>(library, "bef_effect_create_handle");
    const auto effectDestroy =
        requireSymbol<EffectDestroy>(library, "bef_effect_destroy");
    const auto effectSetRenderApi = requireSymbol<EffectSetRenderApi>(
        library, "bef_effect_set_render_api");
    const auto effectUsePipeline = requireSymbol<EffectUsePipeline>(
        library, "bef_effect_use_pipeline_processor");
    const auto effectInit =
        requireSymbol<EffectInit>(library, "bef_effect_init");
    const auto effectSetWidthHeight = requireSymbol<EffectSetWidthHeight>(
        library, "bef_effect_set_width_height");
    const auto effectSetOrientation = requireSymbol<EffectSetOrientation>(
        library, "bef_effect_set_orientation");
    const auto effectSet =
        requireSymbol<EffectSet>(library, "bef_effect_set_effect");
    const auto effectAlgorithmTexture = requireSymbol<EffectAlgorithmTexture>(
        library, "bef_effect_algorithm_texture");
    const auto effectAlgorithmBuffer =
        usesBufferInput
            ? requireSymbol<EffectAlgorithmBuffer>(
                  library, "bef_effect_algorithm_buffer")
            : nullptr;
    const auto effectGetNewRequirement =
        usesBufferInput
            ? requireSymbol<EffectGetNewRequirement>(
                  library, "bef_effect_get_new_requirment")
            : nullptr;
    const auto effectRefreshNewAlgorithm =
        usesBufferInput
            ? requireSymbol<EffectRefreshNewAlgorithm>(
                  library, "bef_effect_refresh_new_algorithm")
            : nullptr;
    const auto effectProcessTexture = requireSymbol<EffectProcessTexture>(
        library, "bef_effect_process_texture");
    const auto effectGetBachResult = requireSymbol<EffectGetBachResult>(
        library, "bef_effect_get_bach_result");
    const auto bachObjectToVector4f = requireSymbol<BachObjectToVector4f>(
        library, "_ZNK4Bach10BachObjectcvN13AmazingEngine8Vector4fEEv");
    const auto bachObjectToMap = requireSymbol<BachObjectToMap>(
        library, "_ZNK4Bach10BachObjectcvPNS_7BachMapEEv");
    const auto bachTextureData = requireSymbol<BachTextureData>(
        library, "_ZN4Bach15BachTextureInfo4dataEv");
    const auto bachTextureWidth = requireSymbol<BachTextureDimension>(
        library, "_ZN4Bach15BachTextureInfo5widthEv");
    const auto bachTextureHeight = requireSymbol<BachTextureDimension>(
        library, "_ZN4Bach15BachTextureInfo6heightEv");
    const auto releaseReference = requireSymbol<ReleaseReference>(
        library, "_ZNK13AmazingEngine7RefBase7releaseEv");

    EffectHandle standaloneHandle = 0;
    const auto destroyStandaloneHandle = [&]() {
      if (standaloneHandle != 0) {
        effectDestroy(standaloneHandle);
        standaloneHandle = 0;
      }
    };
    Result status = effectCreate(&standaloneHandle);
    if (status != 0 || standaloneHandle == 0) {
      throw std::runtime_error("cannot create saliency effect handle: " +
                               std::to_string(status));
    }
    const Result renderApiStatus = effectSetRenderApi(standaloneHandle, 1);
    const Result pipelineStatus = effectUsePipeline(
        standaloneHandle, route == SegmentationRoute::VideoObject);
    const Result initStatus =
        effectInit(standaloneHandle, width, height, argv[2], "");
    if (renderApiStatus != 0 || pipelineStatus != 0 || initStatus != 0 ||
        effectSetWidthHeight(standaloneHandle, width, height) != 0 ||
        effectSetOrientation(standaloneHandle, 0) != 0 ||
        effectSet(standaloneHandle, argv[3]) != 0) {
      destroyStandaloneHandle();
      throw std::runtime_error("cannot initialize the saliency effect graph");
    }
    if (usesBufferInput) {
      if (effectAlgorithmTexture(standaloneHandle, inputTexture, 0.0) != 0) {
        destroyStandaloneHandle();
        throw std::runtime_error("cannot activate the buffer-input effect graph");
      }
      EffectRequirement requirement{};
      for (int attempt = 0; attempt < 60 && requirement.low == 0; ++attempt) {
        requirement = effectGetNewRequirement(standaloneHandle);
        if (requirement.low == 0) {
          std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
      }
      std::cerr << "buffer_requirement_low=" << requirement.low
                << " high=" << requirement.high << '\n';
      if (requirement.low == 0 ||
          effectRefreshNewAlgorithm(standaloneHandle, requirement.low,
                                    requirement.high, 1) != 0) {
        destroyStandaloneHandle();
        throw std::runtime_error("cannot refresh the buffer-input requirement");
      }
      if (effectUsePipeline(standaloneHandle, false) != 0) {
        destroyStandaloneHandle();
        throw std::runtime_error("cannot select synchronous buffer input");
      }
    } else {
      std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }

    std::size_t frameCount = 0;
    std::vector<float> temporalState;
    qcut::matting::VideoObjectAlphaQualityGate videoObjectAlphaQuality;
    auto lastProgressReportAt = std::chrono::steady_clock::now();
    const auto reportProgress = [&](bool force) {
      const auto now = std::chrono::steady_clock::now();
      const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
          now - lastProgressReportAt);
      if (!force && elapsed.count() < 250) {
        return;
      }
      std::cerr << "progress frame=" << frameCount
                << " total=" << expectedFrameCount << '\n';
      lastProgressReportAt = now;
    };
    while (true) {
      std::size_t bytesRead = 0;
      if (streamInput) {
        bytesRead = readAll(STDIN_FILENO, source.data(), source.size());
      } else {
        rgbaInput->read(reinterpret_cast<char *>(source.data()),
                        static_cast<std::streamsize>(source.size()));
        bytesRead = static_cast<std::size_t>(rgbaInput->gcount());
      }
      if (bytesRead == 0) {
        break;
      }
      if (bytesRead != source.size()) {
        destroyStandaloneHandle();
        throw std::runtime_error("input ended with an incomplete RGBA frame");
      }
      flipRows(source, flipped, width, height);
      textureContext->updateTexture(inputTexture, width, height, flipped);

      Result algorithmStatus = -1;
      Result processStatus = -1;
      std::optional<std::vector<std::uint8_t>> rawAlpha;
      std::string extractionError;
      const int maximumAttempts =
          frameCount == 0
              ? (route == SegmentationRoute::VideoObject ? 60 : 20)
              : (route == SegmentationRoute::VideoObject ? 2 : 1);
      for (int attempt = 0; attempt < maximumAttempts; ++attempt) {
        const double timestamp = static_cast<double>(frameCount) / 30.0;
        if (effectAlgorithmBuffer != nullptr) {
          constexpr std::int32_t rgbaBufferFormat = 0;
          algorithmStatus = effectAlgorithmBuffer(
              standaloneHandle, width, height, source.data(), rgbaBufferFormat,
              timestamp);
          processStatus = 0;
        } else {
          algorithmStatus = effectAlgorithmTexture(standaloneHandle,
                                                   inputTexture, timestamp);
          processStatus = effectProcessTexture(
              standaloneHandle, inputTexture, outputTexture, timestamp);
        }
        if (algorithmStatus == 0 && processStatus == 0) {
          try {
            rawAlpha = route == SegmentationRoute::VideoObject
                           ? extractVideoObjectMask(
                                 standaloneHandle, effectGetBachResult,
                                 bachObjectToMap, bachTextureData,
                                 bachTextureWidth, bachTextureHeight,
                                 releaseReference, width, height)
                           : extractScriptMask(
                                 standaloneHandle, effectGetBachResult,
                                 bachObjectToVector4f, libraryInfo.dli_fbase,
                                 width, height);
            if (attempt + 1 >= maximumAttempts || frameCount == 0) {
              break;
            }
          } catch (const std::exception &error) {
            rawAlpha.reset();
            extractionError = error.what();
          }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
      }
      if (algorithmStatus != 0 || processStatus != 0 || !rawAlpha) {
        destroyStandaloneHandle();
        throw std::runtime_error(
            "segmentation graph processing failed: algorithm=" +
            std::to_string(algorithmStatus) +
            " process=" + std::to_string(processStatus) +
            (extractionError.empty() ? "" : " result=" + extractionError));
      }
      if (route == SegmentationRoute::VideoObject) {
        videoObjectAlphaQuality.observe(*rawAlpha);
      }
      const auto alpha = qcut::matting::refineAlpha(
          *rawAlpha, temporalState, width, height, threshold,
          temporalSmoothing, edgeShift, feather);
      if (streamOutput) {
        writeAll(alphaOutputDescriptor, alpha.data(), alpha.size());
      } else {
        outputFile->write(reinterpret_cast<const char *>(alpha.data()),
                          static_cast<std::streamsize>(alpha.size()));
        if (!*outputFile) {
          destroyStandaloneHandle();
          throw std::runtime_error("cannot write saliency alpha frame");
        }
      }
      frameCount += 1;
      reportProgress(false);
    }

    if (frameCount == 0 ||
        (expectedFrameCount > 0 && expectedFrameCount != frameCount)) {
      throw std::runtime_error("segmentation input did not contain complete frames");
    }
    reportProgress(true);
    if (route == SegmentationRoute::VideoObject) {
      videoObjectAlphaQuality.finalize();
      if (outputFile) {
        outputFile->flush();
        if (!*outputFile) {
          throw std::runtime_error("cannot flush video-object alpha output");
        }
      }
      if (alphaOutputDescriptor >= 0) {
        ::close(alphaOutputDescriptor);
      }
      std::cerr << "ok width=" << width << " height=" << height
                << " frames=" << frameCount
                << " route=video-object-general-seg-v1"
                << " alpha_quality="
                << qcut::matting::videoObjectAlphaQualityCapability() << '\n'
                << std::flush;
      // The verified type-198 pipeline crashes in vendor teardown outside its
      // host. This helper owns no persistent state, so process isolation is the
      // reliable release boundary after the complete mask has been flushed.
      ::_exit(0);
    }

    destroyStandaloneHandle();
    textureContext->deleteTextures({inputTexture, outputTexture});
    if (alphaOutputDescriptor >= 0) {
      ::close(alphaOutputDescriptor);
    }
    dlclose(library);
    std::cerr << "ok width=" << width << " height=" << height
              << " frames=" << frameCount
              << " route=saliency-script-v1.2\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
