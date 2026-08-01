#import <AppKit/AppKit.h>

#include "transition-probe.h"

#include "graphics-probe.h"
#include "probe-utils.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>

namespace jianying_probe {
namespace {

constexpr std::size_t kTransitionSegmentStorageSize = 0x368;
constexpr std::size_t kAmazerContextScopeStorageSize = 0x8;
constexpr int kVideoSegmentType = 7;
constexpr int kTransitionSegmentType = 8;
constexpr int kAutomaticRendererType = 14;
constexpr std::int64_t kProbeTimelineDuration = 1'000'000;
constexpr std::uintptr_t kAmazerContextScopeConstructorOffset = 0x3fb3bc;
constexpr std::uintptr_t kAmazerContextScopeDestructorOffset = 0x3fb3e8;
constexpr std::size_t kLeftInputSegmentOffset = 0x2c8;
constexpr std::size_t kRightInputSegmentOffset = 0x2d0;
constexpr std::size_t kInputATextureOffset = 0x2d8;
constexpr std::size_t kInputAMetadataOffset = 0x2e0;
constexpr std::size_t kInputBTextureOffset = 0x2e8;
constexpr std::size_t kInputBMetadataOffset = 0x2f0;
constexpr std::size_t kInputValidOffset = 0x358;

constexpr std::string_view kTransitionConstructor =
    "_ZN13AmazingEngine17TransitionSegmentC1Ev";
constexpr std::string_view kTransitionDestructor =
    "_ZN13AmazingEngine17TransitionSegmentD1Ev";
constexpr std::string_view kTransitionLoadSegment =
    "_ZN13AmazingEngine17TransitionSegment11loadSegmentERKNSt3__112basic_"
    "stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE";
constexpr std::string_view kTransitionUnloadSegment =
    "_ZN13AmazingEngine17TransitionSegment13unloadSegmentEv";
constexpr std::string_view kTransitionSyncResource =
    "_ZN13AmazingEngine17TransitionSegment12syncResourceEv";
constexpr std::string_view kCreateSwingManagerApi =
    "bef_swing_manager_create_with_gpdevice";
constexpr std::string_view kDestroySwingManagerApi =
    "bef_swing_manager_destroy";
constexpr std::string_view kGetSwingManagerAmazer =
    "_ZNK13AmazingEngine12SwingManager9getAmazerEv";
constexpr std::string_view kGetSwingManagerViewer =
    "_ZNK13AmazingEngine12SwingManager9getViewerEv";
constexpr std::string_view kGetSwingManagerGraphicsDevice =
    "_ZNK13AmazingEngine12SwingManager11getGPDeviceEv";
constexpr std::string_view kCreateSegmentApi = "bef_swing_segment_create";
constexpr std::string_view kDestroySegmentApi = "bef_swing_segment_destroy";
constexpr std::string_view kSetSegmentTimeRangeApi =
    "bef_swing_segment_set_time_range";
constexpr std::string_view kSetSegmentRenderIndexApi =
    "bef_swing_segment_set_render_index";
constexpr std::string_view kSetVideoDeviceTextureApi =
    "bef_swing_segment_video_set_device_texture";
constexpr std::string_view kAddManagerSegmentApi =
    "bef_swing_manager_add_segment";
constexpr std::string_view kSeekManagerDeviceTextureApi =
    "bef_swing_manager_seek_frame_device_texture";
constexpr std::string_view kSetManagerParameterBoolApi =
    "bef_swing_manager_set_parameter_bool";
constexpr std::string_view kConvertMetalTextureInPlace =
    "_ZN13AmazingEngine12SwingTexture26convertMetalTextureInPlaceER13DeviceText"
    "urePNS_12SwingManagerERKNS_12RendererTypeEx";
constexpr std::string_view kTransitionSetInputApi =
    "bef_swing_segment_transition_set_input";
constexpr std::string_view kConfigureABValue = "bef_effect_config_ab_value";

using ObjectMethod = void (*)(void*);
using LoadSegmentMethod = void (*)(void*, const std::string&);
using ConfigureABValueMethod = int (*)(const char*, const void*, int);
using ResourceFinderMethod = char* (*)(void*, const char*, const char*);
using CreateSwingManagerApiMethod = int (*)(void**, unsigned int, unsigned int,
                                            ResourceFinderMethod, bool, void*);
using DestroySwingManagerApiMethod = int (*)(void*);
using GetObjectMethod = void* (*)(const void*);
using CreateSegmentApiMethod = int (*)(void*, void**, int, const char*);
using DestroySegmentApiMethod = int (*)(void*);
using SetSegmentTimeRangeApiMethod = int (*)(void*, std::int64_t, std::int64_t);
using SetSegmentRenderIndexApiMethod = int (*)(void*, int);
using SetVideoDeviceTextureApiMethod = int (*)(void*,
                                               const DeviceTextureProbe*);
using AddManagerSegmentApiMethod = int (*)(void*, void*);
using SeekManagerDeviceTextureApiMethod = int (*)(void*, std::int64_t,
                                                  const DeviceTextureProbe*,
                                                  const DeviceTextureProbe*);
using SetManagerParameterBoolApiMethod = int (*)(void*, const char*, bool);
using ConvertMetalTextureInPlaceMethod = void (*)(DeviceTextureProbe*, void*,
                                                  const int*, std::int64_t);
using ContextScopeConstructorMethod = void (*)(void*, void*);
using SetTransitionInputApiMethod = int (*)(void*, void*, void*);

struct TransitionSymbols {
  ObjectMethod constructor;
  ObjectMethod destructor;
  LoadSegmentMethod loadSegment;
  ObjectMethod unloadSegment;
  ObjectMethod syncResource;
  SetTransitionInputApiMethod setTransitionInput;
  CreateSwingManagerApiMethod createSwingManager;
  DestroySwingManagerApiMethod destroySwingManager;
  GetObjectMethod getSwingManagerAmazer;
  GetObjectMethod getSwingManagerViewer;
  GetObjectMethod getSwingManagerGraphicsDevice;
  CreateSegmentApiMethod createSegmentApi;
  DestroySegmentApiMethod destroySegmentApi;
  SetSegmentTimeRangeApiMethod setSegmentTimeRangeApi;
  SetSegmentRenderIndexApiMethod setSegmentRenderIndexApi;
  SetVideoDeviceTextureApiMethod setVideoDeviceTextureApi;
  AddManagerSegmentApiMethod addManagerSegmentApi;
  SeekManagerDeviceTextureApiMethod seekManagerDeviceTextureApi;
  SetManagerParameterBoolApiMethod setManagerParameterBoolApi;
  ConvertMetalTextureInPlaceMethod convertMetalTextureInPlace;
  ContextScopeConstructorMethod contextScopeConstructor;
  ObjectMethod contextScopeDestructor;
  ConfigureABValueMethod configureABValue;
};

template <std::size_t Size>
struct alignas(16) ObjectStorage {
  std::array<std::byte, Size> bytes{};

  void* data() { return bytes.data(); }
  const void* data() const { return bytes.data(); }
};

template <std::size_t Size>
class StackEngineObject {
 public:
  StackEngineObject(ObjectMethod constructor, ObjectMethod destructor)
      : destructor_(destructor) {
    constructor(storage_.data());
  }

  ~StackEngineObject() { destructor_(storage_.data()); }

  StackEngineObject(const StackEngineObject&) = delete;
  StackEngineObject& operator=(const StackEngineObject&) = delete;

  void* data() { return storage_.data(); }

 private:
  ObjectStorage<Size> storage_;
  ObjectMethod destructor_;
};

class AmazerContextScope {
 public:
  AmazerContextScope(ContextScopeConstructorMethod constructor,
                     ObjectMethod destructor, void* context)
      : destructor_(destructor) {
    constructor(storage_.data(), context);
  }

  ~AmazerContextScope() { destructor_(storage_.data()); }

  AmazerContextScope(const AmazerContextScope&) = delete;
  AmazerContextScope& operator=(const AmazerContextScope&) = delete;

 private:
  ObjectStorage<kAmazerContextScopeStorageSize> storage_;
  ObjectMethod destructor_;
};

class SwingManagerHandle {
 public:
  SwingManagerHandle(CreateSwingManagerApiMethod create,
                     DestroySwingManagerApiMethod destroy, int width, int height,
                     void* graphicsDevice)
      : destroy_(destroy) {
    const int result =
        create(&manager_, static_cast<unsigned int>(width),
               static_cast<unsigned int>(height), nullptr, false, graphicsDevice);
    std::cout << "[host] swing_manager_create_with_gpdevice result = " << result
              << '\n';
    if (result != 0) {
      if (manager_ != nullptr) {
        static_cast<void>(destroy_(manager_));
      }
      manager_ = nullptr;
    }
  }

  ~SwingManagerHandle() {
    if (manager_ != nullptr) {
      const int result = destroy_(manager_);
      std::cout << "[host] swing_manager_destroy result = " << result << '\n';
    }
  }

  SwingManagerHandle(const SwingManagerHandle&) = delete;
  SwingManagerHandle& operator=(const SwingManagerHandle&) = delete;

  void* get() const { return manager_; }

 private:
  void* manager_ = nullptr;
  DestroySwingManagerApiMethod destroy_;
};

class SegmentHandle {
 public:
  SegmentHandle(CreateSegmentApiMethod create, DestroySegmentApiMethod destroy,
                void* manager, int type, const char* path,
                std::string_view label)
      : destroy_(destroy), label_(label) {
    const int result = create(manager, &segment_, type, path);
    std::cout << "[host] create " << label_ << " result = " << result
              << ", segment = " << segment_ << '\n';
    if (result != 0) {
      if (segment_ != nullptr) {
        static_cast<void>(destroy_(segment_));
      }
      segment_ = nullptr;
    }
  }

  ~SegmentHandle() {
    if (segment_ != nullptr) {
      const int result = destroy_(segment_);
      std::cout << "[host] destroy " << label_ << " result = " << result
                << '\n';
    }
  }

  SegmentHandle(const SegmentHandle&) = delete;
  SegmentHandle& operator=(const SegmentHandle&) = delete;

  void* get() const { return segment_; }

 private:
  void* segment_ = nullptr;
  DestroySegmentApiMethod destroy_;
  std::string_view label_;
};

template <typename Function>
[[nodiscard]] Function resolveImageOffset(ObjectMethod knownSymbol,
                                          std::uintptr_t offset,
                                          std::string_view label) {
  Dl_info image{};
  const auto knownAddress = reinterpret_cast<std::uintptr_t>(knownSymbol);
  if (dladdr(reinterpret_cast<void*>(knownAddress), &image) == 0 ||
      image.dli_fbase == nullptr) {
    throw std::runtime_error("dladdr failed while resolving " +
                             std::string(label));
  }

  const auto imageBase = reinterpret_cast<std::uintptr_t>(image.dli_fbase);
  std::cout << "[symbol] " << label << " @ image+0x" << std::hex << offset
            << std::dec << '\n';
  return reinterpret_cast<Function>(imageBase + offset);
}

[[nodiscard]] TransitionSymbols loadTransitionCore(
    const fs::path& runtimeRoot) {
  void* transitionCore =
      openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib");
  const ObjectMethod constructor =
      resolveSymbol<ObjectMethod>(transitionCore, kTransitionConstructor);

  return {
      .constructor = constructor,
      .destructor =
          resolveSymbol<ObjectMethod>(transitionCore, kTransitionDestructor),
      .loadSegment = resolveSymbol<LoadSegmentMethod>(transitionCore,
                                                      kTransitionLoadSegment),
      .unloadSegment =
          resolveSymbol<ObjectMethod>(transitionCore, kTransitionUnloadSegment),
      .syncResource =
          resolveSymbol<ObjectMethod>(transitionCore, kTransitionSyncResource),
      .setTransitionInput = resolveSymbol<SetTransitionInputApiMethod>(
          transitionCore, kTransitionSetInputApi),
      .createSwingManager = resolveSymbol<CreateSwingManagerApiMethod>(
          transitionCore, kCreateSwingManagerApi),
      .destroySwingManager = resolveSymbol<DestroySwingManagerApiMethod>(
          transitionCore, kDestroySwingManagerApi),
      .getSwingManagerAmazer = resolveSymbol<GetObjectMethod>(
          transitionCore, kGetSwingManagerAmazer),
      .getSwingManagerViewer = resolveSymbol<GetObjectMethod>(
          transitionCore, kGetSwingManagerViewer),
      .getSwingManagerGraphicsDevice = resolveSymbol<GetObjectMethod>(
          transitionCore, kGetSwingManagerGraphicsDevice),
      .createSegmentApi = resolveSymbol<CreateSegmentApiMethod>(
          transitionCore, kCreateSegmentApi),
      .destroySegmentApi = resolveSymbol<DestroySegmentApiMethod>(
          transitionCore, kDestroySegmentApi),
      .setSegmentTimeRangeApi = resolveSymbol<SetSegmentTimeRangeApiMethod>(
          transitionCore, kSetSegmentTimeRangeApi),
      .setSegmentRenderIndexApi = resolveSymbol<SetSegmentRenderIndexApiMethod>(
          transitionCore, kSetSegmentRenderIndexApi),
      .setVideoDeviceTextureApi = resolveSymbol<SetVideoDeviceTextureApiMethod>(
          transitionCore, kSetVideoDeviceTextureApi),
      .addManagerSegmentApi = resolveSymbol<AddManagerSegmentApiMethod>(
          transitionCore, kAddManagerSegmentApi),
      .seekManagerDeviceTextureApi =
          resolveSymbol<SeekManagerDeviceTextureApiMethod>(
              transitionCore, kSeekManagerDeviceTextureApi),
      .setManagerParameterBoolApi =
          resolveSymbol<SetManagerParameterBoolApiMethod>(
              transitionCore, kSetManagerParameterBoolApi),
      .convertMetalTextureInPlace =
          resolveSymbol<ConvertMetalTextureInPlaceMethod>(
              transitionCore, kConvertMetalTextureInPlace),
      .contextScopeConstructor =
          resolveImageOffset<ContextScopeConstructorMethod>(
              constructor, kAmazerContextScopeConstructorOffset,
              "AmazerContextScope::AmazerContextScope"),
      .contextScopeDestructor = resolveImageOffset<ObjectMethod>(
          constructor, kAmazerContextScopeDestructorOffset,
          "AmazerContextScope::~AmazerContextScope"),
      .configureABValue = resolveSymbol<ConfigureABValueMethod>(
          transitionCore, kConfigureABValue),
  };
}

void enableTransitionII(const TransitionSymbols& symbols) {
  const bool enabled = true;
  const int result =
      symbols.configureABValue("enable_transition_ii", &enabled, 0);
  std::cout << "[transition] enable_transition_ii result = " << result << '\n';
}

[[nodiscard]] std::size_t sceneCount(const void* segment) {
  const auto* bytes = static_cast<const std::byte*>(segment);
  void* const* begin = *reinterpret_cast<void* const* const*>(bytes + 0x340);
  void* const* end = *reinterpret_cast<void* const* const*>(bytes + 0x348);
  if (begin == nullptr || end == nullptr || end < begin) {
    return 0;
  }
  return static_cast<std::size_t>(end - begin);
}

void printTransitionLoadState(const void* segment) {
  const auto* bytes = static_cast<const std::byte*>(segment);
  const auto* storedPath = reinterpret_cast<const std::string*>(bytes + 0x2b0);
  void* parsedConfig = *reinterpret_cast<void* const*>(bytes + 0x328);
  std::cout << "[transition] stored package = " << *storedPath << '\n';
  std::cout << "[transition] parsed config = " << parsedConfig << '\n';
}

template <typename Value>
[[nodiscard]] Value readObjectField(const void* object, std::size_t offset) {
  static_assert(std::is_trivially_copyable_v<Value>);
  Value value;
  const auto* bytes = static_cast<const std::byte*>(object);
  std::memcpy(&value, bytes + offset, sizeof(value));
  return value;
}

void printTransitionInputState(const void* transition, std::string_view stage) {
  const auto left = readObjectField<void*>(transition, kLeftInputSegmentOffset);
  const auto right =
      readObjectField<void*>(transition, kRightInputSegmentOffset);
  const auto textureA =
      readObjectField<void*>(transition, kInputATextureOffset);
  const auto metadataA =
      readObjectField<std::uint64_t>(transition, kInputAMetadataOffset);
  const auto textureB =
      readObjectField<void*>(transition, kInputBTextureOffset);
  const auto metadataB =
      readObjectField<std::uint64_t>(transition, kInputBMetadataOffset);
  const auto valid = readObjectField<bool>(transition, kInputValidOffset);

  std::cout << "[host] input state after " << stage << ": left=" << left
            << ", right=" << right << ", textureA=" << textureA
            << ", metadataA=0x" << std::hex << metadataA
            << ", textureB=" << textureB << ", metadataB=0x" << metadataB
            << std::dec << ", valid=" << std::boolalpha << valid << '\n';
}

[[nodiscard]] DeviceTextureProbe bridgeTexture(
    const TransitionSymbols& symbols, void* manager,
    const DeviceTextureProbe& texture, std::int64_t timestamp,
    std::string_view label) {
  DeviceTextureProbe bridged = texture;
  symbols.convertMetalTextureInPlace(&bridged, manager, &kAutomaticRendererType,
                                     timestamp);
  std::cout << "[host] bridge " << label << ": " << texture.texture << " -> "
            << bridged.texture << '\n';
  return bridged;
}

class SwingRenderSession {
 public:
  SwingRenderSession(const TransitionSymbols& symbols,
                     const fs::path& packagePath,
                     const GraphicsFrameResources& resources)
      : symbols_(symbols), graphicsDevice_(resources.graphicsDevice) {
    manager_ = std::make_unique<SwingManagerHandle>(
        symbols.createSwingManager, symbols.destroySwingManager,
        resources.width, resources.height, resources.graphicsDevice);
    if (manager_->get() == nullptr) {
      return;
    }

    void* globalContext = symbols.getSwingManagerAmazer(manager_->get());
    void* viewer = symbols.getSwingManagerViewer(manager_->get());
    void* managerGraphicsDevice =
        symbols.getSwingManagerGraphicsDevice(manager_->get());
    std::cout << "[host] SwingManager global context = " << globalContext
              << '\n';
    std::cout << "[host] SwingManager viewer = " << viewer << '\n';
    std::cout << "[host] SwingManager GPDevice = " << managerGraphicsDevice
              << " (requested " << resources.graphicsDevice << ")\n";
    if (globalContext == nullptr || viewer == nullptr ||
        managerGraphicsDevice != resources.graphicsDevice) {
      return;
    }

    const int simplifyResult = symbols.setManagerParameterBoolApi(
        manager_->get(), "EnableSwingSimplify", true);
    std::cout << "[host] EnableSwingSimplify result = " << simplifyResult
              << '\n';
    if (simplifyResult != 0) {
      return;
    }

    contextScope_ = std::make_unique<AmazerContextScope>(
        symbols.contextScopeConstructor, symbols.contextScopeDestructor,
        globalContext);
    inputSegmentA_ = std::make_unique<SegmentHandle>(
        symbols.createSegmentApi, symbols.destroySegmentApi, manager_->get(),
        kVideoSegmentType, "", "left video segment");
    inputSegmentB_ = std::make_unique<SegmentHandle>(
        symbols.createSegmentApi, symbols.destroySegmentApi, manager_->get(),
        kVideoSegmentType, "", "right video segment");

    const std::string package = packagePath.string();
    transitionSegment_ = std::make_unique<SegmentHandle>(
        symbols.createSegmentApi, symbols.destroySegmentApi, manager_->get(),
        kTransitionSegmentType, package.c_str(), "transition segment");
    void* transition = transitionSegment_->get();
    if (inputSegmentA_->get() == nullptr || inputSegmentB_->get() == nullptr ||
        transition == nullptr) {
      return;
    }

    printTransitionLoadState(transition);
    std::cout << "[host] generated scenes = " << sceneCount(transition)
              << '\n';
    symbols.syncResource(transition);

    const int timeRangeAResult = symbols.setSegmentTimeRangeApi(
        inputSegmentA_->get(), 0, kProbeTimelineDuration);
    const int timeRangeBResult = symbols.setSegmentTimeRangeApi(
        inputSegmentB_->get(), 0, kProbeTimelineDuration);
    const int transitionTimeRangeResult = symbols.setSegmentTimeRangeApi(
        transition, 0, kProbeTimelineDuration);
    const int renderIndexAResult =
        symbols.setSegmentRenderIndexApi(inputSegmentA_->get(), 0);
    const int renderIndexBResult =
        symbols.setSegmentRenderIndexApi(inputSegmentB_->get(), 1);
    const int transitionRenderIndexResult =
        symbols.setSegmentRenderIndexApi(transition, 2);
    const int setInputResult = symbols.setTransitionInput(
        transition, inputSegmentA_->get(), inputSegmentB_->get());
    const int addInputAResult =
        symbols.addManagerSegmentApi(manager_->get(), inputSegmentA_->get());
    const int addInputBResult =
        symbols.addManagerSegmentApi(manager_->get(), inputSegmentB_->get());
    const int addTransitionResult =
        symbols.addManagerSegmentApi(manager_->get(), transition);

    std::cout << "[host] time ranges = " << timeRangeAResult << ", "
              << timeRangeBResult << ", " << transitionTimeRangeResult
              << '\n';
    std::cout << "[host] render index results (A=0, B=1, transition=2) = "
              << renderIndexAResult << ", " << renderIndexBResult << ", "
              << transitionRenderIndexResult << '\n';
    std::cout << "[host] transition input = " << setInputResult << '\n';
    std::cout << "[host] add segments = " << addInputAResult << ", "
              << addInputBResult << ", " << addTransitionResult << '\n';
    printTransitionInputState(transition, "logical input binding");

    ready_ = timeRangeAResult == 0 && timeRangeBResult == 0 &&
             transitionTimeRangeResult == 0 && renderIndexAResult == 0 &&
             renderIndexBResult == 0 && transitionRenderIndexResult == 0 &&
             setInputResult == 0 && addInputAResult == 0 &&
             addInputBResult == 0 && addTransitionResult == 0;
  }

  ~SwingRenderSession() {
    if (transitionSegment_ != nullptr &&
        transitionSegment_->get() != nullptr) {
      static_cast<void>(symbols_.setTransitionInput(
          transitionSegment_->get(), nullptr, nullptr));
    }
    transitionSegment_.reset();
    inputSegmentB_.reset();
    inputSegmentA_.reset();
    contextScope_.reset();
    manager_.reset();
  }

  SwingRenderSession(const SwingRenderSession&) = delete;
  SwingRenderSession& operator=(const SwingRenderSession&) = delete;

  [[nodiscard]] bool render(const GraphicsFrameResources& resources,
                            double progress) {
    if (!ready_ || resources.graphicsDevice != graphicsDevice_) {
      return false;
    }

    const auto frameTimestamp = static_cast<std::int64_t>(
        std::llround(progress * kProbeTimelineDuration));
    const DeviceTextureProbe inputA =
        bridgeTexture(symbols_, manager_->get(), resources.inputA,
                      frameTimestamp, "input A");
    const DeviceTextureProbe inputB =
        bridgeTexture(symbols_, manager_->get(), resources.inputB,
                      frameTimestamp, "input B");
    const DeviceTextureProbe output =
        bridgeTexture(symbols_, manager_->get(), resources.output,
                      frameTimestamp, "output");
    if (inputA.texture == nullptr || inputB.texture == nullptr ||
        output.texture == nullptr) {
      return false;
    }

    const int textureAResult =
        symbols_.setVideoDeviceTextureApi(inputSegmentA_->get(), &inputA);
    const int textureBResult =
        symbols_.setVideoDeviceTextureApi(inputSegmentB_->get(), &inputB);
    const int setInputResult = symbols_.setTransitionInput(
        transitionSegment_->get(), inputSegmentA_->get(),
        inputSegmentB_->get());
    const bool frameReady = textureAResult == 0 && textureBResult == 0 &&
                            setInputResult == 0;
    int seekResult = -1;
    if (frameReady) {
      seekResult = symbols_.seekManagerDeviceTextureApi(
          manager_->get(), frameTimestamp, &inputA, &output);
      std::cout << "[host] manager seek result = " << seekResult
                << ", progress = " << progress << '\n';
      printTransitionInputState(transitionSegment_->get(), "manager seek");
    }
    static_cast<void>(symbols_.setTransitionInput(transitionSegment_->get(),
                                                  nullptr, nullptr));
    return frameReady && seekResult == 0;
  }

 private:
  const TransitionSymbols& symbols_;
  void* graphicsDevice_ = nullptr;
  std::unique_ptr<SwingManagerHandle> manager_;
  std::unique_ptr<AmazerContextScope> contextScope_;
  std::unique_ptr<SegmentHandle> inputSegmentA_;
  std::unique_ptr<SegmentHandle> inputSegmentB_;
  std::unique_ptr<SegmentHandle> transitionSegment_;
  bool ready_ = false;
};

struct HostRenderContext {
  const TransitionSymbols& symbols;
  const fs::path& packagePath;
  double progress;
  std::unique_ptr<SwingRenderSession> session;
};

[[nodiscard]] bool renderWithSwingHost(
    const GraphicsFrameResources& resources) {
  if (resources.callbackContext == nullptr) {
    return false;
  }

  auto& context =
      *static_cast<HostRenderContext*>(resources.callbackContext);
  if (context.session == nullptr) {
    context.session = std::make_unique<SwingRenderSession>(
        context.symbols, context.packagePath, resources);
  }
  return context.session->render(resources, context.progress);
}

[[nodiscard]] int channelError(std::uint8_t actual, std::uint8_t expected) {
  return std::abs(static_cast<int>(actual) - static_cast<int>(expected));
}

[[nodiscard]] bool validateOutput(const GraphicsFrameProbeResult& result,
                                  double progress) {
  constexpr int kMaximumChannelError = 8;
  if (result.outputPixels.empty() ||
      result.inputAPixels.size() != result.outputPixels.size() ||
      result.inputBPixels.size() != result.outputPixels.size()) {
    return false;
  }

  int maximumError = 0;
  std::array<std::uint64_t, 4> sums{};
  for (std::size_t offset = 0; offset < result.outputPixels.size();
       offset += 4) {
    for (std::size_t channel = 0; channel < sums.size(); ++channel) {
      const double mixed =
          (1.0 - progress) * result.inputAPixels[offset + channel] +
          progress * result.inputBPixels[offset + channel];
      const auto expected = static_cast<std::uint8_t>(std::lround(mixed));
      maximumError = std::max(
          maximumError,
          channelError(result.outputPixels[offset + channel], expected));
      sums[channel] += result.outputPixels[offset + channel];
    }
  }

  const std::size_t pixelCount = result.outputPixels.size() / 4;
  std::cout << "[readback] average RGBA = (" << sums[0] / pixelCount << ", "
            << sums[1] / pixelCount << ", " << sums[2] / pixelCount << ", "
            << sums[3] / pixelCount << ")\n";
  std::cout << "[validation] maximum channel error = " << maximumError << '\n';
  return maximumError <= kMaximumChannelError;
}

void validateProgress(double progress) {
  if (!std::isfinite(progress) || progress < 0.0 || progress > 1.0) {
    throw std::runtime_error("transition progress must be between 0 and 1");
  }
}

[[nodiscard]] GraphicsFrameProbeResult renderTransitionPixels(
    const fs::path& runtimeRoot, const fs::path& packagePath, int width,
    int height, std::span<const std::uint8_t> inputAPixels,
    std::span<const std::uint8_t> inputBPixels, double progress,
    bool verifyInputReadback) {
  validateProgress(progress);

  const TransitionSymbols symbols = loadTransitionCore(runtimeRoot);
  enableTransitionII(symbols);
  GraphicsProbeSession graphics(runtimeRoot, width, height);
  HostRenderContext context = {
      .symbols = symbols,
      .packagePath = packagePath,
      .progress = progress,
  };
  return graphics.renderFrame({
      .renderer = renderWithSwingHost,
      .callbackContext = &context,
      .inputAPixels = inputAPixels,
      .inputBPixels = inputBPixels,
      .verifyInputReadback = verifyInputReadback,
  });
}

}  // namespace

struct TransitionPixelSession::Impl {
  TransitionSymbols symbols;
  fs::path packagePath;
  GraphicsProbeSession graphics;
  HostRenderContext context;

  Impl(const fs::path& runtimeRoot, const fs::path& transitionPackagePath,
       int width, int height)
      : symbols(loadTransitionCore(runtimeRoot)),
        packagePath(transitionPackagePath),
        graphics(runtimeRoot, width, height),
        context{
            .symbols = symbols,
            .packagePath = packagePath,
            .progress = 0.0,
        } {
    enableTransitionII(symbols);
  }

  [[nodiscard]] TransitionPixelFrameResult renderFrame(
      const TransitionSessionFrameRequest& request) {
    validateProgress(request.progress);
    context.progress = request.progress;
    GraphicsFrameProbeResult result = graphics.renderFrame({
        .renderer = renderWithSwingHost,
        .callbackContext = &context,
        .inputAPixels = request.inputAPixels,
        .inputBPixels = request.inputBPixels,
        .verifyInputReadback = false,
    });
    return {
        .rendered = result.rendered && result.inputsReadable,
        .outputPixels = std::move(result.outputPixels),
    };
  }
};

TransitionPixelSession::TransitionPixelSession(
    const fs::path& runtimeRoot, const fs::path& packagePath, int width,
    int height)
    : impl_(std::make_unique<Impl>(runtimeRoot, packagePath, width, height)) {}

TransitionPixelSession::~TransitionPixelSession() = default;
TransitionPixelSession::TransitionPixelSession(
    TransitionPixelSession&&) noexcept = default;
TransitionPixelSession& TransitionPixelSession::operator=(
    TransitionPixelSession&&) noexcept = default;

TransitionPixelFrameResult TransitionPixelSession::renderFrame(
    const TransitionSessionFrameRequest& request) {
  if (impl_ == nullptr) {
    return {};
  }
  return impl_->renderFrame(request);
}

void inspectTransitionCore(const TransitionInspectRequest& request) {
  [NSApplication sharedApplication];

  const TransitionSymbols symbols = loadTransitionCore(request.runtimeRoot);
  StackEngineObject<kTransitionSegmentStorageSize> segment(symbols.constructor,
                                                           symbols.destructor);
  std::cout << "[transition] TransitionSegment constructed\n";

  if (!request.packagePath.has_value()) {
    return;
  }

  if (request.enableTransitionII) {
    enableTransitionII(symbols);
  }

  const std::string path = request.packagePath->string();
  symbols.loadSegment(segment.data(), path);
  std::cout << "[transition] loadSegment returned\n";
  printTransitionLoadState(segment.data());
  symbols.unloadSegment(segment.data());
  std::cout << "[transition] unloadSegment returned\n";
}

bool renderTransitionFrame(const TransitionFrameRequest& request) {
  const GraphicsFrameProbeResult result = renderTransitionPixels(
      request.runtimeRoot, request.packagePath, kProbeTextureSize,
      kProbeTextureSize, {}, {}, request.progress, true);

  const bool outputMatches = result.rendered && result.inputsReadable &&
                             validateOutput(result, request.progress);
  std::cout << "[validation] dissolve output = "
            << (outputMatches ? "PASS" : "FAIL") << '\n';
  return outputMatches;
}

TransitionPixelFrameResult renderTransitionPixelFrame(
    const TransitionPixelFrameRequest& request) {
  TransitionPixelSession session(request.runtimeRoot, request.packagePath,
                                 request.width, request.height);
  return session.renderFrame({
      .inputAPixels = request.inputAPixels,
      .inputBPixels = request.inputBPixels,
      .progress = request.progress,
  });
}

}  // namespace jianying_probe
