#ifndef GL_SILENCE_DEPRECATION
#define GL_SILENCE_DEPRECATION
#endif
#include "metal-matting-blend.hpp"

#include <OpenGL/OpenGL.h>

#include <dlfcn.h>

#include <array>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <vector>

namespace qcut::matting {
namespace {

constexpr int kRgba8PixelFormat = 0x2b;
constexpr int kLinearFilter = 1;
constexpr int kClampWrap = 1;

struct DeviceTexture {
  void *texture = nullptr;
  std::uint64_t metadata = 0;

  DeviceTexture() = default;
  DeviceTexture(const DeviceTexture &other)
      : texture(other.texture), metadata(other.metadata) {}
  DeviceTexture &operator=(const DeviceTexture &other) {
    texture = other.texture;
    metadata = other.metadata;
    return *this;
  }
  ~DeviceTexture() {}
};

static_assert(sizeof(DeviceTexture) == 0x10);
static_assert(!std::is_trivially_copy_constructible_v<DeviceTexture>);

struct MattingImage {
  std::uint32_t format = 0;
  std::uint32_t reserved = 0;
  const void *data = nullptr;
  std::uint32_t width = 0;
  std::uint32_t height = 0;
};

static_assert(sizeof(MattingImage) == 0x18);

struct FrameSize {
  int width;
  int height;
};

using BindRlContext = void (*)(void *, bool);
using BlendDeviceTextureWithData = int (*) (
    void *, const MattingImage *, const MattingImage *, int, int,
    const MattingImage *, const float *, const std::uint8_t *);
using ConstructBlendEffect = void *(*)(void *);
using CreateRlContext = void (*)(std::shared_ptr<void> *, int);
using CreateSharedRlDevice = std::shared_ptr<void> (*)(void *, void *, void *);
using CreateTexture2D = DeviceTexture (*)(
    void *, int, int, const void *const *, int, int, int, int, int, int *,
    const char *, bool, bool);
using DestroyBlendEffect = void (*)(void *);
using DestroyTexture = void (*)(void *, DeviceTexture);
using GetGlobalAbConfig = void *(*)();
using GetGpDevice = void *(*)(void *);
using GetRenderDevice = void *(*)(void *);
using GetRlDeviceManager = void *(*)();
using InitBlendEffect = int (*)(void *, const FrameSize &);
using InitRlContext = void (*)(void *);
using ReadImage = void (*)(void *, DeviceTexture, int, int, void *, int, int,
                           int, int);
using RemoveRlDevice = void (*)(void *, void *);
using SetAbBool = void (*)(void *, int, bool);
using SetBlendMode = int (*)(void *, int);
using SetCallerManagedLegacyFallback = int (*)(void *, bool);
using SetStrokeParam = void (*)(void *, std::int64_t, std::int64_t,
                                std::int64_t, const std::string &);
using UnbindRlContext = void (*)(void *);
using UpdateTexture = void (*)(void *, DeviceTexture, const void *);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  auto *symbol = dlsym(library, name);
  if (!symbol) {
    throw std::runtime_error(std::string("missing native blend symbol: ") +
                             name);
  }
  return reinterpret_cast<Function>(symbol);
}

void setBooleanConfig(void *library, const char *name, int expectedKey) {
  auto *configId = static_cast<int *>(dlsym(library, name));
  if (!configId) {
    const std::string underscoredName = std::string("_") + name;
    configId = static_cast<int *>(dlsym(library, underscoredName.c_str()));
  }
  if (!configId || *configId != expectedKey) {
    throw std::runtime_error(std::string("unsupported native blend config: ") +
                             name);
  }
  const auto getGlobalConfig = requireSymbol<GetGlobalAbConfig>(
      library, "_ZN10CCABConfig17getGlobalABConfigEv");
  const auto setBool = requireSymbol<SetAbBool>(
      library, "_ZN10CCABConfig7setBoolE11CCABKeyBoolb");
  setBool(getGlobalConfig(), *configId, true);
}

class GlContext {
public:
  GlContext() {
    const CGLPixelFormatAttribute attributes[] = {
        kCGLPFAOpenGLProfile,
        static_cast<CGLPixelFormatAttribute>(kCGLOGLPVersion_Legacy),
        kCGLPFAAccelerated,
        kCGLPFAAllowOfflineRenderers,
        kCGLPFAColorSize,
        static_cast<CGLPixelFormatAttribute>(32),
        kCGLPFAAlphaSize,
        static_cast<CGLPixelFormatAttribute>(8),
        static_cast<CGLPixelFormatAttribute>(0),
    };
    GLint count = 0;
    if (CGLChoosePixelFormat(attributes, &pixelFormat_, &count) != kCGLNoError ||
        !pixelFormat_) {
      throw std::runtime_error("cannot choose native blend pixel format");
    }
    if (CGLCreateContext(pixelFormat_, nullptr, &context_) != kCGLNoError ||
        !context_ || !makeCurrent()) {
      if (context_) {
        if (CGLGetCurrentContext() == context_) {
          CGLSetCurrentContext(nullptr);
        }
        CGLDestroyContext(context_);
        context_ = nullptr;
      }
      CGLDestroyPixelFormat(pixelFormat_);
      pixelFormat_ = nullptr;
      throw std::runtime_error("cannot create native blend GL context");
    }
  }

  ~GlContext() {
    if (CGLGetCurrentContext() == context_) {
      CGLSetCurrentContext(nullptr);
    }
    if (context_) {
      CGLDestroyContext(context_);
    }
    if (pixelFormat_) {
      CGLDestroyPixelFormat(pixelFormat_);
    }
  }

  GlContext(const GlContext &) = delete;
  GlContext &operator=(const GlContext &) = delete;

  bool makeCurrent() const noexcept {
    return context_ != nullptr &&
           CGLSetCurrentContext(context_) == kCGLNoError &&
           CGLGetCurrentContext() == context_;
  }

private:
  CGLPixelFormatObj pixelFormat_ = nullptr;
  CGLContextObj context_ = nullptr;
};

class RlHostContext {
public:
  explicit RlHostContext(void *library)
      : unbind_(requireSymbol<UnbindRlContext>(
            library, "_ZN17TERLRenderContext6unbindEv")) {
    const auto construct = requireSymbol<void *(*)(void *, int)>(
        library, "_ZN17TERLRenderContextC1Ei");
    // This private factory offset is gated by the dylib SHA-256 in runtime.ts.
    const auto create = reinterpret_cast<CreateRlContext>(
        reinterpret_cast<std::uintptr_t>(construct) + 0x2178U);
    create(&context_, 30);
    if (!context_) {
      throw std::runtime_error("cannot create native blend render context");
    }
    const auto init = requireSymbol<InitRlContext>(
        library, "_ZN17TERLRenderContext5_initEv");
    const auto bind = requireSymbol<BindRlContext>(
        library, "_ZN17TERLRenderContext4bindEb");
    init(context_.get());
    const auto getManager = requireSymbol<GetRlDeviceManager>(
        library, "_ZN17TERLDeviceManager11getInstanceEv");
    const auto removeDevice = requireSymbol<RemoveRlDevice>(
        library,
        "_ZN17TERLDeviceManager27removeRLDeviceFromGLContextEP17TESharedGLContext");
    const auto createDevice = requireSymbol<CreateSharedRlDevice>(
        library,
        "_ZN17TERLDeviceManager27createRLDeviceFromGLContextEP17TESharedGLContextS1_");
    void *manager = getManager();
    removeDevice(manager, context_.get());
    const std::shared_ptr<void> metalDevice =
        createDevice(manager, context_.get(), nullptr);
    if (!metalDevice) {
      throw std::runtime_error("cannot create native blend Metal device");
    }
    *reinterpret_cast<void **>(static_cast<std::uint8_t *>(context_.get()) +
                               0x260) = metalDevice.get();
    bind(context_.get(), true);
    isBound_ = true;

    const auto getRenderDevice = requireSymbol<GetRenderDevice>(
        library, "_ZN17TESharedGLContext15getRenderDeviceEv");
    const auto getGpDevice = requireSymbol<GetGpDevice>(
        library, "_ZN13AmazingEngine14RendererDevice11getGPDeviceEv");
    renderDevice_ = getRenderDevice(context_.get());
    void *rlDevice = *reinterpret_cast<void **>(
        static_cast<std::uint8_t *>(context_.get()) + 0x260);
    void *ownerRenderDevice =
        rlDevice ? *reinterpret_cast<void **>(
                       static_cast<std::uint8_t *>(rlDevice) + 0x8)
                 : nullptr;
    gpDevice_ = renderDevice_ ? getGpDevice(renderDevice_) : nullptr;
    if (!renderDevice_ || !gpDevice_ || renderDevice_ != ownerRenderDevice ||
        gpDevice_ != getGpDevice(ownerRenderDevice)) {
      throw std::runtime_error("native blend Metal device ownership mismatch");
    }
  }

  ~RlHostContext() {
    if (isBound_) {
      unbind_(context_.get());
    }
  }

  RlHostContext(const RlHostContext &) = delete;
  RlHostContext &operator=(const RlHostContext &) = delete;

  void *renderDevice() const { return renderDevice_; }
  const std::shared_ptr<void> &sharedContext() const { return context_; }

private:
  std::shared_ptr<void> context_;
  void *gpDevice_ = nullptr;
  void *renderDevice_ = nullptr;
  UnbindRlContext unbind_;
  bool isBound_ = false;
};

class BlendEffectRuntime {
public:
  BlendEffectRuntime(void *library, const std::shared_ptr<void> &sharedContext,
                     int width, int height)
      : destroy_(requireSymbol<DestroyBlendEffect>(
            library, "_ZN22TEMattingBlendEffectV2D1Ev")) {
    const auto construct = requireSymbol<ConstructBlendEffect>(
        library, "_ZN22TEMattingBlendEffectV2C1Ev");
    const auto init = requireSymbol<InitBlendEffect>(
        library, "_ZN22TEMattingBlendEffectV24initERK7TESizei");
    construct(storage_.data());
    isConstructed_ = true;
    auto &targetContext = *reinterpret_cast<std::shared_ptr<void> *>(
        storage_.data() + 0x50);
    targetContext = sharedContext;
    const FrameSize frameSize = {.width = width, .height = height};
    const int status = init(storage_.data(), frameSize);
    handle_ = *reinterpret_cast<void **>(storage_.data() + 0x70);
    if (status != 1 || storage_[0x48] != 1 || !handle_) {
      throw std::runtime_error("native TEMattingBlendEffectV2 init failed");
    }
    const auto setStrokeParam = requireSymbol<SetStrokeParam>(
        library,
        "_ZN22TEMattingBlendEffectV214setStrokeParamExxxRKNSt3__1"
        "12basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE");
    setStrokeParam(
        storage_.data(), 0, 1'000'000, 0,
        R"({"morphologyParams":true,"erode_dilate_kernel_size":0,"blur_kernel_size":0,"enable_reverse":false,"blendPath":"device","featurePath":""})");

    const auto setMode = requireSymbol<SetBlendMode>(
        library, "bef_portrait_matting_v2_set_blend_mode");
    const auto setFallback = requireSymbol<SetCallerManagedLegacyFallback>(
        library,
        "bef_portrait_matting_v2_set_caller_managed_legacy_fallback");
    if (setMode(handle_, 0) != 0 || setFallback(handle_, true) != 0) {
      throw std::runtime_error("cannot configure native matting blend");
    }
  }

  ~BlendEffectRuntime() {
    if (isConstructed_) {
      destroy_(storage_.data());
    }
  }

  BlendEffectRuntime(const BlendEffectRuntime &) = delete;
  BlendEffectRuntime &operator=(const BlendEffectRuntime &) = delete;

  void *handle() const { return handle_; }

private:
  alignas(16) std::array<std::uint8_t, 256> storage_{};
  DestroyBlendEffect destroy_;
  void *handle_ = nullptr;
  bool isConstructed_ = false;
};

class OwnedTexture {
public:
  OwnedTexture(void *renderDevice, DestroyTexture destroyTexture,
               DeviceTexture texture)
      : renderDevice_(renderDevice), destroyTexture_(destroyTexture),
        texture_(texture) {
    if (!texture_.texture) {
      throw std::runtime_error("cannot create native blend texture");
    }
  }

  ~OwnedTexture() { destroyTexture_(renderDevice_, texture_); }

  OwnedTexture(const OwnedTexture &) = delete;
  OwnedTexture &operator=(const OwnedTexture &) = delete;

  const DeviceTexture &value() const { return texture_; }

private:
  void *renderDevice_;
  DestroyTexture destroyTexture_;
  DeviceTexture texture_;
};

std::size_t checkedPixelCount(int width, int height, const char *label) {
  if (width <= 0 || height <= 0) {
    throw std::runtime_error(std::string(label) + " dimensions are invalid");
  }
  const auto pixelCount =
      static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
  if (pixelCount > std::numeric_limits<std::size_t>::max() / 4U) {
    throw std::runtime_error(std::string(label) + " dimensions overflow");
  }
  return pixelCount;
}

} // namespace

namespace detail {

void validateMetalMattingBlendFrame(const MetalMattingBlendFrame &frame,
                                    int width, int height) {
  const std::size_t sourcePixelCount =
      checkedPixelCount(width, height, "native blend source");
  const std::size_t alphaPixelCount = checkedPixelCount(
      frame.alphaWidth, frame.alphaHeight, "native blend Alpha");
  if (frame.rgba.size() != sourcePixelCount * 4U ||
      frame.alpha.size() != alphaPixelCount) {
    throw std::runtime_error("native blend frame dimensions do not match");
  }
}

std::vector<std::uint8_t> extractMetalMattingBlendAlpha(
    const MetalMattingBlendFrame &frame,
    const std::vector<std::uint8_t> &blendedRgba, int width, int height) {
  validateMetalMattingBlendFrame(frame, width, height);
  const std::size_t pixelCount = checkedPixelCount(
      width, height, "native blend output");
  if (blendedRgba.size() != pixelCount * 4U) {
    throw std::runtime_error("native blend output dimensions do not match");
  }
  const bool alphaMatchesSource =
      frame.alphaWidth == width && frame.alphaHeight == height;
  std::vector<std::uint8_t> blendedAlpha(pixelCount);
  for (std::size_t index = 0; index < pixelCount; ++index) {
    const std::size_t rgbaOffset = index * 4U;
    const std::uint8_t sourceAlpha = frame.rgba[rgbaOffset + 3U];
    const std::uint8_t outputAlpha = blendedRgba[rgbaOffset + 3U];
    blendedAlpha[index] = outputAlpha;
    if (alphaMatchesSource) {
      const auto expected = static_cast<std::uint8_t>(
          (static_cast<unsigned int>(sourceAlpha) * frame.alpha[index] +
           127U) /
          255U);
      if (outputAlpha != expected) {
        throw std::runtime_error("native blend alpha verification failed");
      }
      continue;
    }
    if (outputAlpha > sourceAlpha) {
      throw std::runtime_error("native blend source alpha bound failed");
    }
  }
  return blendedAlpha;
}

void clampMetalMattingBlendAlphaToSource(
    const std::vector<std::uint8_t> &rgba,
    std::vector<std::uint8_t> &alpha) {
  if (alpha.size() > std::numeric_limits<std::size_t>::max() / 4U ||
      rgba.size() != alpha.size() * 4U) {
    throw std::runtime_error("native blend source alpha dimensions do not match");
  }
  for (std::size_t index = 0; index < alpha.size(); ++index) {
    alpha[index] = std::min(alpha[index], rgba[index * 4U + 3U]);
  }
}

} // namespace detail

class MetalMattingBlend::Impl {
public:
  explicit Impl(const MetalMattingBlendConfig &config)
      : width_(config.width), height_(config.height), glContext_(),
        rlContext_(config.library),
        blendEffect_(config.library, rlContext_.sharedContext(), config.width,
                     config.height),
        createTexture_(requireSymbol<CreateTexture2D>(
            config.library,
            "_ZN13AmazingEngine14RendererDevice15createTexture2DEiiPKPKvNS_"
            "14AMGPixelFormatENS_13AMGFilterModeES6_NS_11AMGWrapModeES7_PiPKcbb")),
        destroyTexture_(requireSymbol<DestroyTexture>(
            config.library,
            "_ZN13AmazingEngine14RendererDevice14destroyTextureE13DeviceTexture")),
        updateTexture_(requireSymbol<UpdateTexture>(
            config.library,
            "_ZN13AmazingEngine14RendererDevice13updateTextureE13DeviceTexturePKv")),
        readImage_(requireSymbol<ReadImage>(
            config.library,
            "_ZN13AmazingEngine14RendererDevice9readImageE13DeviceTextureiiPvNS_"
            "8FlipModeENS_10RotateModeENS_13AMGFilterModeENS_14AMGPixelFormatE")),
        blend_(requireSymbol<BlendDeviceTextureWithData>(
            config.library,
            "bef_portrait_matting_v2_blend_device_texture_with_data")) {
    void *renderDevice = rlContext_.renderDevice();
    inputTexture_ = createTexture(renderDevice, width_, height_,
                                  "qcut matting input");
    outputTexture_ = std::make_unique<OwnedTexture>(
        renderDevice, destroyTexture_,
        createTexture_(renderDevice, width_, height_, nullptr,
                       kRgba8PixelFormat, kLinearFilter, kLinearFilter,
                       kClampWrap, kClampWrap, nullptr,
                       "qcut matting output", false, false));
  }

  ~Impl() noexcept {
    if (!glContext_.makeCurrent()) {
      std::terminate();
    }
  }

  std::vector<std::uint8_t>
  blendAlpha(const MetalMattingBlendFrame &frame) {
    detail::validateMetalMattingBlendFrame(frame, width_, height_);
    if (!glContext_.makeCurrent()) {
      throw std::runtime_error("cannot restore native blend GL context");
    }
    const std::size_t alphaPixelCount =
        static_cast<std::size_t>(frame.alphaWidth) * frame.alphaHeight;
    if (!alphaTexture_ || alphaWidth_ != frame.alphaWidth ||
        alphaHeight_ != frame.alphaHeight) {
      alphaTexture_ = createTexture(rlContext_.renderDevice(),
                                    frame.alphaWidth, frame.alphaHeight,
                                    "qcut matting alpha");
      alphaWidth_ = frame.alphaWidth;
      alphaHeight_ = frame.alphaHeight;
    }
    std::vector<std::uint8_t> alphaRgba(alphaPixelCount * 4U);
    for (std::size_t index = 0; index < alphaPixelCount; ++index) {
      const std::uint8_t value = frame.alpha[index];
      const std::size_t offset = index * 4U;
      alphaRgba[offset] = value;
      alphaRgba[offset + 1U] = value;
      alphaRgba[offset + 2U] = value;
      alphaRgba[offset + 3U] = value;
    }
    void *renderDevice = rlContext_.renderDevice();
    updateTexture_(renderDevice, inputTexture_->value(), frame.rgba.data());
    updateTexture_(renderDevice, alphaTexture_->value(), alphaRgba.data());

    const MattingImage inputImage = {
        .data = &inputTexture_->value(),
        .width = static_cast<std::uint32_t>(width_),
        .height = static_cast<std::uint32_t>(height_),
    };
    const MattingImage outputImage = {
        .data = &outputTexture_->value(),
        .width = static_cast<std::uint32_t>(width_),
        .height = static_cast<std::uint32_t>(height_),
    };
    const MattingImage alphaImage = {
        .data = &alphaTexture_->value(),
        .width = static_cast<std::uint32_t>(frame.alphaWidth),
        .height = static_cast<std::uint32_t>(frame.alphaHeight),
    };
    const std::array<float, 4> fullFrame = {0.0F, 0.0F, 1.0F, 1.0F};
    const std::array<std::uint8_t, 4> transparent = {0, 0, 0, 0};
    const int blendStatus = blend_(
        blendEffect_.handle(), &inputImage, &outputImage, width_, height_,
        &alphaImage, fullFrame.data(), transparent.data());
    if (blendStatus != 0) {
      throw std::runtime_error("native matting blend failed: " +
                               std::to_string(blendStatus));
    }

    std::vector<std::uint8_t> blendedRgba(frame.rgba.size());
    readImage_(renderDevice, outputTexture_->value(), width_, height_,
               blendedRgba.data(), 0, 0, kLinearFilter, kRgba8PixelFormat);
    return detail::extractMetalMattingBlendAlpha(frame, blendedRgba, width_,
                                                  height_);
  }

private:
  std::unique_ptr<OwnedTexture> createTexture(void *renderDevice, int width,
                                              int height,
                                              const char *label) {
    return std::make_unique<OwnedTexture>(
        renderDevice, destroyTexture_,
        createTexture_(renderDevice, width, height, nullptr,
                       kRgba8PixelFormat, kLinearFilter, kLinearFilter,
                       kClampWrap, kClampWrap, nullptr, label, false, false));
  }

  int width_;
  int height_;
  GlContext glContext_;
  RlHostContext rlContext_;
  BlendEffectRuntime blendEffect_;
  CreateTexture2D createTexture_;
  DestroyTexture destroyTexture_;
  UpdateTexture updateTexture_;
  ReadImage readImage_;
  BlendDeviceTextureWithData blend_;
  std::unique_ptr<OwnedTexture> inputTexture_;
  std::unique_ptr<OwnedTexture> alphaTexture_;
  std::unique_ptr<OwnedTexture> outputTexture_;
  int alphaWidth_ = 0;
  int alphaHeight_ = 0;
};

MetalMattingBlend::MetalMattingBlend(const MetalMattingBlendConfig &config)
    : impl_(nullptr) {
  if (!config.library || config.width <= 0 || config.height <= 0) {
    throw std::runtime_error("invalid native blend configuration");
  }
  setBooleanConfig(config.library, "ConfigID_EnableAGFXMetal", 372);
  setBooleanConfig(config.library, "ConfigID_VeabtestEnableMetalV2", 377);
  setBooleanConfig(config.library, "ConfigID_EnablePortraitMattingBlendV2",
                   568);
  impl_ = std::make_unique<Impl>(config);
}

MetalMattingBlend::~MetalMattingBlend() = default;

std::vector<std::uint8_t>
MetalMattingBlend::blendAlpha(const MetalMattingBlendFrame &frame) {
  return impl_->blendAlpha(frame);
}

} // namespace qcut::matting
