#import <AppKit/AppKit.h>
#import <IOSurface/IOSurface.h>

#include "graphics-probe.h"
#include "filter-probe.h"
#include "probe-utils.h"
#include "effect-probe.h"
#include "text-probe.h"
#include "transition-probe.h"
#include "video-transition-probe.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

namespace fs = std::filesystem;

constexpr std::size_t kConfigStorageSize = 0x100;
constexpr std::size_t kBridgeStorageSize = 0x200;
constexpr std::size_t kSandboxRootOffset = 0x18;
constexpr std::array<std::size_t, 4> kConfigStringOffsets = {
    0x18,
    0x30,
    0x48,
    0x60,
};

constexpr std::string_view kConfigConstructor =
    "_ZN8lumigene27LumiGeneRuntimeBridgeConfigC1Ev";
constexpr std::string_view kConfigDestructor =
    "_ZN8lumigene27LumiGeneRuntimeBridgeConfigD1Ev";
constexpr std::string_view kConfigIsValid =
    "_ZNK8lumigene27LumiGeneRuntimeBridgeConfig7IsValidEv";
constexpr std::string_view kBridgeConstructor =
    "_ZN8lumigene21LumiGeneRuntimeBridgeC1Ev";
constexpr std::string_view kBridgeDestructor =
    "_ZN8lumigene21LumiGeneRuntimeBridgeD1Ev";
constexpr std::string_view kRegisterConfig =
    "_ZN8lumigene21LumiGeneRuntimeBridge14RegisterConfigERKNS_27LumiGeneRuntimeBridgeConfigE";
constexpr std::string_view kLaunch =
    "_ZN8lumigene21LumiGeneRuntimeBridge6LaunchEv";
constexpr std::string_view kExit =
    "_ZN8lumigene21LumiGeneRuntimeBridge4ExitEv";
constexpr std::string_view kUpdateFrame =
    "_ZN8lumigene21LumiGeneRuntimeBridge11UpdateFrameEd";
constexpr std::string_view kSyncRender =
    "_ZN8lumigene21LumiGeneRuntimeBridge10SyncRenderEv";
constexpr std::string_view kGetIOSurface =
    "_ZNK8lumigene21LumiGeneRuntimeBridge12GetIOSurfaceEv";
constexpr std::string_view kDefaultLaunchJSFileName =
    "_ZN8lumigene27LumiGeneRuntimeBridgeConfig24defaultLaunchJSFileName_E";

using ObjectMethod = void (*)(void*);
using ConstObjectPredicate = bool (*)(const void*);
using RegisterConfigMethod = void (*)(void*, const void*);
using LaunchMethod = bool (*)(void*);
using UpdateFrameMethod = void (*)(void*, double);
using GetIOSurfaceMethod = IOSurfaceRef (*)(const void*);

struct RuntimeSymbols {
  ObjectMethod configConstructor;
  ObjectMethod configDestructor;
  ConstObjectPredicate configIsValid;
  ObjectMethod bridgeConstructor;
  ObjectMethod bridgeDestructor;
  RegisterConfigMethod registerConfig;
  LaunchMethod launch;
  ObjectMethod exit;
  UpdateFrameMethod updateFrame;
  ObjectMethod syncRender;
  GetIOSurfaceMethod getIOSurface;
  const std::string* defaultLaunchJSFileName;
};

template <std::size_t Size>
struct alignas(16) ObjectStorage {
  std::array<std::byte, Size> bytes{};

  void* data() { return bytes.data(); }
  const void* data() const { return bytes.data(); }
};

using jianying_probe::openLibrary;
using jianying_probe::resolveSymbol;

[[nodiscard]] std::string requireEnvironment(const char* name) {
  const char* value = std::getenv(name);
  if (value == nullptr || *value == '\0') {
    throw std::runtime_error(std::string("missing environment variable: ") +
                             name);
  }
  return value;
}

[[nodiscard]] int requirePositiveIntegerEnvironment(const char* name) {
  const std::string text = requireEnvironment(name);
  std::size_t parsedLength = 0;
  const long long value = std::stoll(text, &parsedLength);
  if (parsedLength != text.size() || value <= 0 ||
      value > std::numeric_limits<int>::max()) {
    throw std::runtime_error(std::string(name) +
                             " must be a positive integer");
  }
  return static_cast<int>(value);
}

[[nodiscard]] double requirePositiveNumberEnvironment(const char* name) {
  const std::string text = requireEnvironment(name);
  std::size_t parsedLength = 0;
  const double value = std::stod(text, &parsedLength);
  if (parsedLength != text.size() || value <= 0.0) {
    throw std::runtime_error(std::string(name) +
                             " must be a positive number");
  }
  return value;
}

[[nodiscard]] int optionalNonNegativeIntegerEnvironment(const char* name) {
  const char* rawValue = std::getenv(name);
  if (rawValue == nullptr) {
    return 0;
  }
  const std::string value(rawValue);
  std::size_t parsedLength = 0;
  long long parsed = 0;
  try {
    if (value.empty()) {
      throw std::invalid_argument("empty");
    }
    parsed = std::stoll(value, &parsedLength);
  } catch (const std::exception&) {
    throw std::runtime_error(std::string(name) +
                             " must be a non-negative integer");
  }
  if (parsedLength != value.size() || parsed < 0 ||
      parsed > std::numeric_limits<int>::max()) {
    throw std::runtime_error(std::string(name) +
                             " must be a non-negative integer");
  }
  return static_cast<int>(parsed);
}

[[nodiscard]] std::optional<bool> optionalBooleanOverrideEnvironment(
    const char* name) {
  const char* value = std::getenv(name);
  if (value == nullptr) {
    return std::nullopt;
  }
  if (std::string_view(value) == "0") {
    return false;
  }
  if (std::string_view(value) == "1") {
    return true;
  }
  throw std::runtime_error(std::string(name) + " must be 0 or 1");
}

[[nodiscard]] bool optionalBooleanEnvironment(const char* name) {
  return optionalBooleanOverrideEnvironment(name).value_or(false);
}

[[nodiscard]] std::string optionalStringEnvironment(const char* name) {
  const char* value = std::getenv(name);
  return value == nullptr ? std::string{} : std::string(value);
}

[[nodiscard]] std::optional<double> optionalNumberEnvironment(
    const char* name) {
  const char* rawValue = std::getenv(name);
  if (rawValue == nullptr) return std::nullopt;
  const std::string value(rawValue);
  std::size_t parsedLength = 0;
  double parsed = 0.0;
  try {
    parsed = std::stod(value, &parsedLength);
  } catch (const std::exception&) {
    throw std::runtime_error(std::string(name) + " must be a finite number");
  }
  if (parsedLength != value.size() || !std::isfinite(parsed)) {
    throw std::runtime_error(std::string(name) + " must be a finite number");
  }
  return parsed;
}

[[nodiscard]] int optionalByteEnvironment(const char* name) {
  const char* rawValue = std::getenv(name);
  if (rawValue == nullptr) {
    return 0;
  }
  const std::string value(rawValue);
  // std::stol throws on empty or non-numeric input before the range check,
  // which would replace this named message with a generic one.
  long code = 0;
  std::size_t parsedLength = 0;
  try {
    if (value.empty()) {
      throw std::invalid_argument("empty");
    }
    code = std::stol(value, &parsedLength);
  } catch (const std::exception&) {
    throw std::runtime_error(std::string(name) +
                             " must be an integer from 0 to 255");
  }
  if (parsedLength != value.size() || code < 0 || code > 255) {
    throw std::runtime_error(std::string(name) +
                             " must be an integer from 0 to 255");
  }
  return static_cast<int>(code);
}

[[nodiscard]] std::array<bool, 3> optionalNativeTextureFlags() {
  const char* value = std::getenv("JY_NATIVE_TEXTURE_FLAGS");
  if (value == nullptr) {
    // The third flag makes the effect sample the native buffer with the same
    // vertical convention the algorithm uses. Without it the delivered skin
    // mask is bound upside down, so the skin LUT lands on the mirrored region
    // and the render collapses to the background LUT.
    return {false, false, true};
  }
  const std::string_view flags(value);
  if (flags.size() != 3 ||
      !std::all_of(flags.begin(), flags.end(),
                   [](char flag) { return flag == '0' || flag == '1'; })) {
    throw std::runtime_error(
        "JY_NATIVE_TEXTURE_FLAGS must contain exactly three 0/1 values");
  }
  return {flags[0] == '1', flags[1] == '1', flags[2] == '1'};
}

[[nodiscard]] RuntimeSymbols loadRuntime(const fs::path& runtimeRoot) {
  const fs::path frameworks = runtimeRoot / "Frameworks";
  openLibrary(frameworks / "libAGFX.dylib");
  openLibrary(frameworks / "libEGL.dylib");
  openLibrary(frameworks / "libGLESv2.dylib");
  void* runtime = openLibrary(frameworks / "libLumiGeneRuntime.dylib");

  return {
      .configConstructor = resolveSymbol<ObjectMethod>(runtime, kConfigConstructor),
      .configDestructor = resolveSymbol<ObjectMethod>(runtime, kConfigDestructor),
      .configIsValid = resolveSymbol<ConstObjectPredicate>(runtime, kConfigIsValid),
      .bridgeConstructor = resolveSymbol<ObjectMethod>(runtime, kBridgeConstructor),
      .bridgeDestructor = resolveSymbol<ObjectMethod>(runtime, kBridgeDestructor),
      .registerConfig = resolveSymbol<RegisterConfigMethod>(runtime, kRegisterConfig),
      .launch = resolveSymbol<LaunchMethod>(runtime, kLaunch),
      .exit = resolveSymbol<ObjectMethod>(runtime, kExit),
      .updateFrame = resolveSymbol<UpdateFrameMethod>(runtime, kUpdateFrame),
      .syncRender = resolveSymbol<ObjectMethod>(runtime, kSyncRender),
      .getIOSurface = resolveSymbol<GetIOSurfaceMethod>(runtime, kGetIOSurface),
      .defaultLaunchJSFileName =
          resolveSymbol<const std::string*>(runtime, kDefaultLaunchJSFileName),
  };
}

void printConfigStrings(const void* config) {
  const auto* bytes = static_cast<const std::byte*>(config);
  for (std::size_t index = 0; index < kConfigStringOffsets.size(); ++index) {
    const auto* value = reinterpret_cast<const std::string*>(
        bytes + kConfigStringOffsets[index]);
    std::cout << "[config] string[" << index << "] = \"" << *value << "\"\n";
  }
}

void configure(ObjectStorage<kConfigStorageSize>& config,
               const fs::path& sandboxRoot) {
  auto* bytes = static_cast<std::byte*>(config.data());
  *reinterpret_cast<std::int32_t*>(bytes) = 1280;
  *reinterpret_cast<std::int32_t*>(bytes + 0x4) = 720;
  *reinterpret_cast<std::string*>(bytes + kSandboxRootOffset) =
      sandboxRoot.string();
}

[[nodiscard]] bool inspectConfig(const RuntimeSymbols& symbols,
                                 const fs::path& sandboxRoot) {
  ObjectStorage<kConfigStorageSize> config;
  symbols.configConstructor(config.data());

  const bool defaultIsValid = symbols.configIsValid(config.data());
  std::cout << "[config] default valid = " << std::boolalpha << defaultIsValid
            << '\n';
  printConfigStrings(config.data());

  configure(config, sandboxRoot);
  const bool configuredIsValid = symbols.configIsValid(config.data());
  std::cout << "[config] configured valid = " << configuredIsValid << '\n';
  printConfigStrings(config.data());

  symbols.configDestructor(config.data());
  return !defaultIsValid && configuredIsValid;
}

[[nodiscard]] bool launchRuntime(const RuntimeSymbols& symbols,
                                 const fs::path& sandboxRoot) {
  [NSApplication sharedApplication];

  ObjectStorage<kConfigStorageSize> config;
  ObjectStorage<kBridgeStorageSize> bridge;
  symbols.configConstructor(config.data());
  symbols.bridgeConstructor(bridge.data());

  configure(config, sandboxRoot);
  symbols.registerConfig(bridge.data(), config.data());

  std::cout << "[launch] calling LumiGeneRuntimeBridge::Launch()\n";
  const bool launched = symbols.launch(bridge.data());
  std::cout << "[launch] returned " << std::boolalpha << launched << '\n';

  if (launched) {
    symbols.updateFrame(bridge.data(), 0.0);
    symbols.syncRender(bridge.data());
    IOSurfaceRef surface = symbols.getIOSurface(bridge.data());
    std::cout << "[launch] IOSurface = " << surface << '\n';
    symbols.exit(bridge.data());
  }

  symbols.bridgeDestructor(bridge.data());
  symbols.configDestructor(config.data());
  return launched;
}

[[nodiscard]] int run(const fs::path& runtimeRoot, std::string_view mode) {
  static_assert(sizeof(std::string) == 0x18,
                "The inferred Jianying config layout requires libc++ std::string");

  const fs::path sandboxRoot =
      runtimeRoot / "Resources" / "lumi_js_resources";
  if (!fs::is_directory(sandboxRoot)) {
    throw std::runtime_error("missing sandbox root: " + sandboxRoot.string());
  }

  const RuntimeSymbols symbols = loadRuntime(runtimeRoot);
  std::cout << "[inspect] all required symbols resolved\n";
  std::cout << "[inspect] default launch JS = "
            << *symbols.defaultLaunchJSFileName << '\n';

  if (mode == "inspect") {
    return 0;
  }

  if (mode == "gpu") {
    return jianying_probe::inspectGraphicsContext(runtimeRoot, false) ? 0 : 5;
  }

  if (mode == "textures") {
    return jianying_probe::inspectGraphicsContext(runtimeRoot, true) ? 0 : 6;
  }

  if (mode == "transition") {
    jianying_probe::inspectTransitionCore({
        .runtimeRoot = runtimeRoot,
        .packagePath = std::nullopt,
    });
    return 0;
  }

  if (mode == "transition-load") {
    const char* package = std::getenv("JY_TRANSITION_PACKAGE");
    if (package == nullptr || !fs::is_directory(package)) {
      throw std::runtime_error("transition-load requires JY_TRANSITION_PACKAGE "
                               "to name a package directory");
    }

    const fs::path packagePath(package);
    const char* transitionII = std::getenv("JY_ENABLE_TRANSITION_II");
    const bool enableTransitionII =
        transitionII != nullptr && std::string_view(transitionII) == "1";
    jianying_probe::inspectTransitionCore({
        .runtimeRoot = runtimeRoot,
        .packagePath = packagePath,
        .enableTransitionII = enableTransitionII,
    });
    return 0;
  }

  if (mode == "transition-frame") {
    const char* package = std::getenv("JY_TRANSITION_PACKAGE");
    if (package == nullptr || !fs::is_directory(package)) {
      throw std::runtime_error(
          "transition-frame requires JY_TRANSITION_PACKAGE to name a package "
          "directory");
    }

    double progress = 0.5;
    if (const char* value = std::getenv("JY_TRANSITION_PROGRESS")) {
      std::size_t parsedLength = 0;
      const std::string progressText(value);
      progress = std::stod(progressText, &parsedLength);
      if (parsedLength != progressText.size() || !(progress >= 0.0) ||
          !(progress <= 1.0)) {
        throw std::runtime_error(
            "JY_TRANSITION_PROGRESS must be a number between 0 and 1");
      }
    }

    return jianying_probe::renderTransitionFrame({
               .runtimeRoot = runtimeRoot,
               .packagePath = fs::path(package),
               .progress = progress,
           })
               ? 0
               : 7;
  }

  if (mode == "transition-video") {
    const fs::path packagePath = requireEnvironment("JY_TRANSITION_PACKAGE");
    if (!fs::is_directory(packagePath)) {
      throw std::runtime_error(
          "JY_TRANSITION_PACKAGE must name a package directory");
    }

    const auto result = jianying_probe::renderRawVideoTransition({
        .runtimeRoot = runtimeRoot,
        .packagePath = packagePath,
        .inputAPath = requireEnvironment("JY_RAW_INPUT_A"),
        .inputBPath = requireEnvironment("JY_RAW_INPUT_B"),
        .outputPath = requireEnvironment("JY_RAW_OUTPUT"),
        .width = requirePositiveIntegerEnvironment("JY_VIDEO_WIDTH"),
        .height = requirePositiveIntegerEnvironment("JY_VIDEO_HEIGHT"),
        .frameRate = requirePositiveNumberEnvironment("JY_VIDEO_FPS"),
        .transitionDurationSeconds =
            requirePositiveNumberEnvironment("JY_TRANSITION_DURATION"),
        .holdExactEndpoints =
            optionalBooleanEnvironment("JY_TRANSITION_HOLD_EXACT_ENDPOINTS"),
    });
    return result.outputFrames > 0 ? 0 : 8;
  }

  if (mode == "filter-sequence") {
    const fs::path packagePath = requireEnvironment("JY_FILTER_PACKAGE");
    const fs::path modelDirectory = requireEnvironment("JY_MODEL_DIRECTORY");
    const fs::path manifestPath = requireEnvironment("JY_FILTER_MANIFEST");
    if (!fs::is_directory(packagePath) || !fs::is_directory(modelDirectory) ||
        !fs::is_regular_file(manifestPath)) {
      throw std::runtime_error(
          "filter package, model directory, and manifest must exist");
    }
    const auto result = jianying_probe::renderFilterSequence({
        .runtimeRoot = runtimeRoot,
        .packagePath = packagePath,
        .modelDirectory = modelDirectory,
        .manifestPath = manifestPath,
        .outputDirectory = requireEnvironment("JY_FILTER_OUTPUT"),
        .width = requirePositiveIntegerEnvironment("JY_VIDEO_WIDTH"),
        .height = requirePositiveIntegerEnvironment("JY_VIDEO_HEIGHT"),
        .frameRate = requirePositiveNumberEnvironment("JY_VIDEO_FPS"),
        .nativeTextureFlags = optionalNativeTextureFlags(),
        .inputTextureDataCode =
            optionalByteEnvironment("JY_SWING_INPUT_TEXTURE_DATA_CODE"),
        .outputTextureDataCode =
            optionalByteEnvironment("JY_SWING_OUTPUT_TEXTURE_DATA_CODE"),
        .algorithmCacheFlag =
            optionalByteEnvironment("JY_ALGORITHM_CACHE_FLAG"),
        .featureParameters =
            optionalStringEnvironment("JY_FILTER_FEATURE_PARAMS"),
        .preferExactModelFilename =
            optionalBooleanEnvironment("JY_PREFER_EXACT_MODEL_FILENAME"),
        .exportMode = optionalBooleanEnvironment("JY_EXPORT_MODE"),
        .enableSwingSimplify =
            std::getenv("JY_ENABLE_SWING_SIMPLIFY") == nullptr ||
            optionalBooleanEnvironment("JY_ENABLE_SWING_SIMPLIFY"),
        .enableAdjustColorWithFloat =
            optionalBooleanEnvironment("JY_ENABLE_ADJUST_COLOR_WITH_FLOAT"),
        .enableImageQuality =
            optionalBooleanEnvironment("JY_ENABLE_IMAGE_QUALITY"),
        .managerCreateOption =
            optionalBooleanEnvironment("JY_SWING_MANAGER_CREATE_OPTION"),
        .enableParallelAsyncSwing =
            optionalBooleanEnvironment("JY_ENABLE_PARALLEL_ASYNC_SWING"),
        .useBefContextScope =
            std::getenv("JY_USE_BEF_CONTEXT_SCOPE") == nullptr ||
            optionalBooleanEnvironment("JY_USE_BEF_CONTEXT_SCOPE"),
        .skinSegUseSimdOptim = optionalBooleanOverrideEnvironment(
            "JY_ENABLE_SKIN_SEG_USE_SIMD_OPTIM"),
        .stageDelayMilliseconds = optionalNonNegativeIntegerEnvironment(
            "JY_FILTER_STAGE_DELAY_MS"),
        .postSeekDelayMilliseconds = optionalNonNegativeIntegerEnvironment(
            "JY_FILTER_POST_SEEK_DELAY_MS"),
        .reseekAfterReady =
            optionalBooleanEnvironment("JY_RESEEK_AFTER_READY"),
    });
    std::cout << "[filter] rendered " << result.renderedFrames << '/'
              << result.requestedFrames << " frames\n";
    return result.renderedFrames == result.requestedFrames ? 0 : 9;
  }

  if (mode == "effect-frame") {
    const fs::path packagePath = requireEnvironment("JY_EFFECT_PACKAGE");
    if (!fs::is_directory(packagePath)) {
      throw std::runtime_error(
          "JY_EFFECT_PACKAGE must name a package directory");
    }

    double seconds = 0.0;
    if (const char* value = std::getenv("JY_EFFECT_SECONDS")) {
      std::size_t parsedLength = 0;
      const std::string text(value);
      seconds = std::stod(text, &parsedLength);
      if (parsedLength != text.size() || !std::isfinite(seconds) ||
          seconds < 0.0 || seconds > 60.0) {
        throw std::runtime_error(
            "JY_EFFECT_SECONDS must be a number of seconds from 0 to 60");
      }
    }

    return jianying_probe::inspectEffectPackage(runtimeRoot, packagePath,
                                                seconds)
               ? 0
               : 10;
  }

  if (mode == "text-frame") {
    const fs::path packagePath = requireEnvironment("JY_TEXT_PACKAGE");
    if (!fs::is_directory(packagePath)) {
      throw std::runtime_error(
          "JY_TEXT_PACKAGE must name a package directory");
    }
    int segmentType = 3;
    if (const char* value = std::getenv("JY_TEXT_SEGMENT_TYPE")) {
      std::size_t parsedLength = 0;
      const std::string text(value);
      const long parsed = std::stol(text, &parsedLength);
      if (parsedLength != text.size() || parsed < 0 || parsed > 10) {
        throw std::runtime_error(
            "JY_TEXT_SEGMENT_TYPE must be an integer from 0 to 10");
      }
      segmentType = static_cast<int>(parsed);
    }
    double timestamp = 500'000.0;
    if (const char* value = std::getenv("JY_TEXT_TIMESTAMP")) {
      std::size_t parsedLength = 0;
      const std::string text(value);
      const double parsed = std::stod(text, &parsedLength);
      if (parsedLength != text.size() || !std::isfinite(parsed) ||
          parsed < 0.0 || parsed > 60'000'000.0) {
        throw std::runtime_error(
            "JY_TEXT_TIMESTAMP must be a number from 0 to 60000000");
      }
      timestamp = parsed;
    }
    int resolutionType = -1;
    if (const char* value = std::getenv("JY_TEXT_RESOLUTION_TYPE")) {
      std::size_t parsedLength = 0;
      const std::string text(value);
      const long parsed = std::stol(text, &parsedLength);
      if (parsedLength != text.size() || parsed < -1 || parsed > 8) {
        throw std::runtime_error(
            "JY_TEXT_RESOLUTION_TYPE must be an integer from -1 to 8");
      }
      resolutionType = static_cast<int>(parsed);
    }
    int renderIndex = 0;
    if (const char* value = std::getenv("JY_TEXT_RENDER_INDEX")) {
      std::size_t parsedLength = 0;
      const std::string text(value);
      const long parsed = std::stol(text, &parsedLength);
      if (parsedLength != text.size() || parsed < 0 ||
          parsed > std::numeric_limits<int>::max()) {
        throw std::runtime_error(
            "JY_TEXT_RENDER_INDEX must be a non-negative integer");
      }
      renderIndex = static_cast<int>(parsed);
    }
    double fontSize = 12.0;
    if (const char* value = std::getenv("JY_TEXT_FONT_SIZE")) {
      std::size_t parsedLength = 0;
      const std::string text(value);
      const double parsed = std::stod(text, &parsedLength);
      if (parsedLength != text.size() || parsed <= 0.0 || parsed > 1000.0) {
        throw std::runtime_error(
            "JY_TEXT_FONT_SIZE must be a number from 0 to 1000");
      }
      fontSize = parsed;
    }
    std::vector<std::string> stickerParams;
    for (int index = 0; index < 9; ++index) {
      const std::string variableName =
          "JY_TEXT_PARAM_" + std::to_string(index);
      const char* value = std::getenv(variableName.c_str());
      if (value == nullptr) break;
      stickerParams.emplace_back(value);
    }
    const auto result = jianying_probe::renderTextFrame({
        .runtimeRoot = runtimeRoot,
        .packagePath = packagePath,
        .outputPath = requireEnvironment("JY_TEXT_OUTPUT"),
        .payloadOutputPath =
            std::getenv("JY_TEXT_PAYLOAD_OUTPUT") == nullptr
                ? fs::path()
                : fs::path(std::getenv("JY_TEXT_PAYLOAD_OUTPUT")),
        .fontPath = std::getenv("JY_TEXT_FONT_PATH") == nullptr
                        ? fs::path()
                        : fs::path(std::getenv("JY_TEXT_FONT_PATH")),
        .segmentPayload = std::getenv("JY_TEXT_SEGMENT_PAYLOAD") == nullptr
                              ? std::string()
                              : std::string(
                                    std::getenv("JY_TEXT_SEGMENT_PAYLOAD")),
        .scriptParameters =
            std::getenv("JY_TEXT_SCRIPT_PARAMETERS") == nullptr
                ? std::string()
                : std::string(std::getenv("JY_TEXT_SCRIPT_PARAMETERS")),
        .text = std::getenv("JY_TEXT_CONTENT") == nullptr
                    ? std::string()
                    : std::string(std::getenv("JY_TEXT_CONTENT")),
        .stickerParams = std::move(stickerParams),
        .fontSize = fontSize,
        .innerPadding = optionalNumberEnvironment("JY_TEXT_INNER_PADDING"),
        .lineGap = optionalNumberEnvironment("JY_TEXT_LINE_GAP"),
        .lineMaxWidth =
            optionalNumberEnvironment("JY_TEXT_LINE_MAX_WIDTH"),
        .shadowSmoothing =
            optionalNumberEnvironment("JY_TEXT_SHADOW_SMOOTHING"),
        .enableSwingSimplify =
            optionalBooleanOverrideEnvironment(
                "JY_TEXT_ENABLE_SWING_SIMPLIFY")
                .value_or(true),
        .width = requirePositiveIntegerEnvironment("JY_VIDEO_WIDTH"),
        .height = requirePositiveIntegerEnvironment("JY_VIDEO_HEIGHT"),
        .segmentType = segmentType,
        .resolutionType = resolutionType,
        .renderIndex = renderIndex,
        .timestamp = timestamp,
    });
    return result.visibleAndTransparent ? 0 : 10;
  }

  if (!inspectConfig(symbols, sandboxRoot)) {
    std::cerr << "[config] inferred layout did not pass validation\n";
    return 3;
  }

  if (mode == "config") {
    return 0;
  }

  // Only "launch" reaches the runtime here; a typo like "transition-vidoe"
  // would otherwise fall through and start the bridge instead of reporting it.
  if (mode != "launch") {
    std::cerr << "[mode] unknown mode: " << mode << '\n';
    return 2;
  }

  return launchRuntime(symbols, sandboxRoot) ? 0 : 4;
}

}  // namespace

int main(int argc, char* argv[]) {
  @autoreleasepool {
    if (argc != 3) {
      std::cerr << "Usage: " << argv[0]
                << " <runtime-root> "
                   "<inspect|config|launch|gpu|textures|transition|transition-"
                   "load|transition-frame|transition-video|filter-sequence|"
                   "text-frame|effect-frame>\n";
      return 2;
    }

    try {
      return run(fs::path(argv[1]), argv[2]);
    } catch (const std::exception& error) {
      std::cerr << "[error] " << error.what() << '\n';
      return 1;
    }
  }
}
