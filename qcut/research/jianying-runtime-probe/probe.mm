#import <AppKit/AppKit.h>
#import <IOSurface/IOSurface.h>

#include "graphics-probe.h"
#include "probe-utils.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {

namespace fs = std::filesystem;

constexpr std::size_t kConfigStorageSize = 0x100;
constexpr std::size_t kBridgeStorageSize = 0x200;
constexpr std::size_t kTransitionSegmentStorageSize = 0x400;
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

constexpr std::string_view kTransitionConstructor =
    "_ZN13AmazingEngine17TransitionSegmentC1Ev";
constexpr std::string_view kTransitionDestructor =
    "_ZN13AmazingEngine17TransitionSegmentD1Ev";
constexpr std::string_view kTransitionLoadSegment =
    "_ZN13AmazingEngine17TransitionSegment11loadSegmentERKNSt3__112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE";
constexpr std::string_view kTransitionUnloadSegment =
    "_ZN13AmazingEngine17TransitionSegment13unloadSegmentEv";
constexpr std::string_view kConfigureABValue = "bef_effect_config_ab_value";
constexpr std::array<std::string_view, 6> kTransitionMethods = {
    "_ZN13AmazingEngine17TransitionSegment12syncResourceEv",
    "_ZN13AmazingEngine17TransitionSegment13renderSegmentEd13DeviceTextureS1_",
    "_ZN13AmazingEngine17TransitionSegment14releaseSegmentEv",
    "_ZN13AmazingEngine17TransitionSegment15generateSegmentEv",
    "_ZN13AmazingEngine17TransitionSegment18setTransitionInputEPNS_7SegmentES2_",
    "_ZN13AmazingEngine17TransitionSegment21updateTransitionInputE13DeviceTextureS1_",
};

using ObjectMethod = void (*)(void*);
using ConstObjectPredicate = bool (*)(const void*);
using RegisterConfigMethod = void (*)(void*, const void*);
using LaunchMethod = bool (*)(void*);
using UpdateFrameMethod = void (*)(void*, double);
using GetIOSurfaceMethod = IOSurfaceRef (*)(const void*);
using LoadSegmentMethod = void (*)(void*, const std::string&);
using ConfigureABValueMethod = int (*)(const char*, const void*, int);

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

struct TransitionSymbols {
  ObjectMethod constructor;
  ObjectMethod destructor;
  LoadSegmentMethod loadSegment;
  ObjectMethod unloadSegment;
  ConfigureABValueMethod configureABValue;
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

[[nodiscard]] TransitionSymbols loadTransitionCore(
    const fs::path& runtimeRoot) {
  void* transitionCore =
      openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib");
  void* constructor = resolveSymbol<void*>(transitionCore, kTransitionConstructor);
  void* destructor = resolveSymbol<void*>(transitionCore, kTransitionDestructor);
  LoadSegmentMethod loadSegment =
      resolveSymbol<LoadSegmentMethod>(transitionCore, kTransitionLoadSegment);
  ObjectMethod unloadSegment =
      resolveSymbol<ObjectMethod>(transitionCore, kTransitionUnloadSegment);
  ConfigureABValueMethod configureABValue =
      resolveSymbol<ConfigureABValueMethod>(transitionCore, kConfigureABValue);

  for (const std::string_view method : kTransitionMethods) {
    static_cast<void>(resolveSymbol<void*>(transitionCore, method));
  }

  return {
      .constructor = reinterpret_cast<ObjectMethod>(constructor),
      .destructor = reinterpret_cast<ObjectMethod>(destructor),
      .loadSegment = loadSegment,
      .unloadSegment = unloadSegment,
      .configureABValue = configureABValue,
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

void inspectTransitionCore(const fs::path& runtimeRoot,
                           const fs::path* packagePath,
                           bool enableTransitionII) {
  [NSApplication sharedApplication];

  const TransitionSymbols symbols = loadTransitionCore(runtimeRoot);
  ObjectStorage<kTransitionSegmentStorageSize> segment;
  symbols.constructor(segment.data());
  std::cout << "[transition] TransitionSegment constructed\n";

  if (packagePath != nullptr) {
    if (enableTransitionII) {
      const bool enabled = true;
      const int result = symbols.configureABValue(
          "enable_transition_ii", &enabled, 0);
      std::cout << "[transition] enable_transition_ii result = " << result
                << '\n';
    }

    const std::string path = packagePath->string();
    symbols.loadSegment(segment.data(), path);

    const auto* bytes = static_cast<const std::byte*>(segment.data());
    const auto* storedPath =
        reinterpret_cast<const std::string*>(bytes + 0x2b0);
    void* parsedConfig =
        *reinterpret_cast<void* const*>(bytes + 0x328);
    std::cout << "[transition] loadSegment returned\n";
    std::cout << "[transition] stored package = " << *storedPath << '\n';
    std::cout << "[transition] parsed config = " << parsedConfig << '\n';

    symbols.unloadSegment(segment.data());
    std::cout << "[transition] unloadSegment returned\n";
  }

  symbols.destructor(segment.data());
  std::cout << "[transition] TransitionSegment destroyed\n";
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
    inspectTransitionCore(runtimeRoot, nullptr, false);
    return 0;
  }

  if (mode == "transition-load") {
    const char* package = std::getenv("JY_TRANSITION_PACKAGE");
    if (package == nullptr || !fs::is_directory(package)) {
      throw std::runtime_error(
          "transition-load requires JY_TRANSITION_PACKAGE to name a package directory");
    }

    const fs::path packagePath(package);
    const char* transitionII = std::getenv("JY_ENABLE_TRANSITION_II");
    const bool enableTransitionII =
        transitionII != nullptr && std::string_view(transitionII) == "1";
    inspectTransitionCore(runtimeRoot, &packagePath, enableTransitionII);
    return 0;
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
                   "<inspect|config|launch|gpu|textures|transition|transition-load>\n";
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
