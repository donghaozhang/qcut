#import <AppKit/AppKit.h>
#import <IOSurface/IOSurface.h>

#include "graphics-probe.h"
#include "probe-utils.h"
#include "transition-probe.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

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
      if (parsedLength != progressText.size()) {
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

  if (!inspectConfig(symbols, sandboxRoot)) {
    std::cerr << "[config] inferred layout did not pass validation\n";
    return 3;
  }

  if (mode == "config") {
    return 0;
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
                   "load|transition-frame>\n";
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
