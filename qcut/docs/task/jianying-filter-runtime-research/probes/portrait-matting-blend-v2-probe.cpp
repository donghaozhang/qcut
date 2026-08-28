// QCut-owned ABI probe; Jianying libraries are supplied from a private local runtime.
#define GL_SILENCE_DEPRECATION
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl.h>

#include <objc/message.h>
#include <objc/runtime.h>

#include <dlfcn.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <vector>

namespace {

using SetBlendMode = int (*)(void *, int);
using SetCallerManagedLegacyFallback = int (*)(void *, bool);
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

using BlendDeviceTextureWithData = int (*)(
    void *, const MattingImage *, const MattingImage *, int, int,
    const MattingImage *, const float *, const std::uint8_t *);
using ConstructBlendEffect = void *(*)(void *);
using DestroyBlendEffect = void (*)(void *);
using GetRenderDevice = void *(*)(void *);
using GetGpDevice = void *(*)(void *);
using CreateRlContext = void (*)(std::shared_ptr<void> *, int);
using InitRlContext = void (*)(void *);
using BindRlContext = void (*)(void *, bool);
using UnbindRlContext = void (*)(void *);
using GetRlDeviceManager = void *(*)();
using RemoveRlDevice = void (*)(void *, void *);
using CreateSharedRlDevice = std::shared_ptr<void> (*)(void *, void *, void *);
using GetGlobalAbConfig = void *(*)();
using SetAbBool = void (*)(void *, int, bool);
using GetAbBool = bool (*)(const void *, int);
using CreateTexture2D = DeviceTexture (*)(
    void *, int, int, const void *const *, int, int, int, int, int, int *,
    const char *, bool, bool);
using DestroyTexture = void (*)(void *, DeviceTexture);
using ReadImage = void (*)(void *, DeviceTexture, int, int, void *, int, int,
                           int, int);
using ResolveBlendHandle = void (*)(void *, void *);
using ReleaseResolvedBlendHandle = void (*)(void *);
using SelectBlendPath = int (*)(void *, int, int, int, int, const void *, int,
                                int, std::uint16_t);
struct FrameSize {
  int width;
  int height;
};
using InitBlendEffect = int (*)(void *, const FrameSize &);
using SetStrokeParam = void (*)(void *, std::int64_t, std::int64_t,
                                std::int64_t, const std::string &);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  auto *symbol = dlsym(library, name);
  if (!symbol) {
    throw std::runtime_error(std::string("missing symbol: ") + name);
  }
  return reinterpret_cast<Function>(symbol);
}

void setBooleanConfig(void *library, const char *name) {
  auto *configId = static_cast<int *>(dlsym(library, name));
  if (!configId) {
    const std::string underscoredName = std::string("_") + name;
    configId = static_cast<int *>(dlsym(library, underscoredName.c_str()));
  }
  if (!configId) {
    throw std::runtime_error(std::string("config ID unavailable: ") + name);
  }
  const auto getGlobalConfig = requireSymbol<GetGlobalAbConfig>(
      library, "_ZN10CCABConfig17getGlobalABConfigEv");
  const auto setBool = requireSymbol<SetAbBool>(
      library, "_ZN10CCABConfig7setBoolE11CCABKeyBoolb");
  const auto getBool = requireSymbol<GetAbBool>(
      library, "_ZNK10CCABConfig7getBoolE11CCABKeyBool");
  void *config = getGlobalConfig();
  setBool(config, *configId, true);
  std::cerr << name << '=' << getBool(config, *configId)
            << " key=" << *configId << '\n';
}

std::vector<std::uint8_t> readExact(const char *path, std::size_t size) {
  std::ifstream input(path, std::ios::binary | std::ios::ate);
  if (!input || static_cast<std::size_t>(input.tellg()) != size) {
    throw std::runtime_error(std::string("unexpected input size: ") + path);
  }
  input.seekg(0);
  std::vector<std::uint8_t> bytes(size);
  input.read(reinterpret_cast<char *>(bytes.data()),
             static_cast<std::streamsize>(bytes.size()));
  if (!input) {
    throw std::runtime_error(std::string("cannot read input: ") + path);
  }
  return bytes;
}

struct GlContext {
  CGLPixelFormatObj pixelFormat = nullptr;
  CGLContextObj context = nullptr;

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
    if (CGLChoosePixelFormat(attributes, &pixelFormat, &count) != kCGLNoError ||
        !pixelFormat) {
      throw std::runtime_error("cannot choose OpenGL pixel format");
    }
    if (CGLCreateContext(pixelFormat, nullptr, &context) != kCGLNoError ||
        !context || CGLSetCurrentContext(context) != kCGLNoError) {
      throw std::runtime_error("cannot create OpenGL context");
    }
  }

  ~GlContext() {
    CGLSetCurrentContext(nullptr);
    if (context) {
      CGLDestroyContext(context);
    }
    if (pixelFormat) {
      CGLDestroyPixelFormat(pixelFormat);
    }
  }
};

class BlendEffectRuntime {
public:
  BlendEffectRuntime(void *library, void *sharedContextStorage, int width,
                     int height)
      : library_(library), destroy_(requireSymbol<DestroyBlendEffect>(
            library, "_ZN22TEMattingBlendEffectV2D1Ev")) {
    const auto construct = requireSymbol<ConstructBlendEffect>(
        library, "_ZN22TEMattingBlendEffectV2C1Ev");
    const auto init = requireSymbol<InitBlendEffect>(
        library, "_ZN22TEMattingBlendEffectV24initERK7TESizei");
    construct(storage_.data());
    isConstructed_ = true;
    if (!sharedContextStorage) {
      throw std::runtime_error("TEMattingBlendEffectV2 shared context missing");
    }
    auto &targetContext = *reinterpret_cast<std::shared_ptr<void> *>(
        storage_.data() + 0x50);
    const auto &sourceContext =
        *reinterpret_cast<const std::shared_ptr<void> *>(sharedContextStorage);
    targetContext = sourceContext;
    const FrameSize frameSize = {.width = width, .height = height};
    const int status = init(storage_.data(), frameSize);
    handle_ = *reinterpret_cast<void **>(storage_.data() + 0x70);
    std::cerr << "tematting_init_status=" << status
              << " v2_active="
              << static_cast<int>(storage_[0x48])
              << " handle=" << handle_ << '\n';
    if (!handle_) {
      throw std::runtime_error("TEMattingBlendEffectV2 init failed: " +
                               std::to_string(status));
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

  void setStrokeParameters(const std::string &parameters) {
    const auto setStrokeParam = requireSymbol<SetStrokeParam>(
        library_,
        "_ZN22TEMattingBlendEffectV214setStrokeParamExxxRKNSt3__1"
        "12basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE");
    setStrokeParam(storage_.data(), 0, 1'000'000, 0, parameters);
  }

private:
  alignas(16) std::array<std::uint8_t, 256> storage_{};
  void *library_ = nullptr;
  DestroyBlendEffect destroy_;
  void *handle_ = nullptr;
  bool isConstructed_ = false;
};

struct EngineContext {
  void *owner = nullptr;
  void *sharedContextStorage = nullptr;
  void *renderDevice = nullptr;
  void *gpDevice = nullptr;
};

class RlHostContext {
public:
  explicit RlHostContext(void *library)
      : unbind_(requireSymbol<UnbindRlContext>(
            library, "_ZN17TERLRenderContext6unbindEv")) {
    const auto construct = requireSymbol<void *(*)(void *, int)>(
        library, "_ZN17TERLRenderContextC1Ei");
    const auto create = reinterpret_cast<CreateRlContext>(
        reinterpret_cast<std::uintptr_t>(construct) + 0x2178U);
    create(&context_, 30);
    if (!context_) {
      throw std::runtime_error("cannot create TERLRenderContext");
    }
    const auto init = requireSymbol<InitRlContext>(
        library, "_ZN17TERLRenderContext5_initEv");
    const auto bind = requireSymbol<BindRlContext>(
        library, "_ZN17TERLRenderContext4bindEb");
    init(context_.get());
    const auto getRlDeviceManager = requireSymbol<GetRlDeviceManager>(
        library, "_ZN17TERLDeviceManager11getInstanceEv");
    const auto removeRlDevice = requireSymbol<RemoveRlDevice>(
        library,
        "_ZN17TERLDeviceManager27removeRLDeviceFromGLContextEP17TESharedGLContext");
    const auto createSharedRlDevice = requireSymbol<CreateSharedRlDevice>(
        library,
        "_ZN17TERLDeviceManager27createRLDeviceFromGLContextEP17TESharedGLContextS1_");
    void *rlDeviceManager = getRlDeviceManager();
    removeRlDevice(rlDeviceManager, context_.get());
    const std::shared_ptr<void> metalRlDevice =
        createSharedRlDevice(rlDeviceManager, context_.get(), nullptr);
    if (!metalRlDevice) {
      throw std::runtime_error("cannot create Metal RLDevice");
    }
    *reinterpret_cast<void **>(static_cast<std::uint8_t *>(context_.get()) +
                               0x260) = metalRlDevice.get();
    bind(context_.get(), true);
    isBound_ = true;
    const auto getRenderDevice = requireSymbol<GetRenderDevice>(
        library, "_ZN17TESharedGLContext15getRenderDeviceEv");
    const auto getGpDevice = requireSymbol<GetGpDevice>(
        library, "_ZN13AmazingEngine14RendererDevice11getGPDeviceEv");
    renderDevice_ = getRenderDevice(context_.get());
    gpDevice_ = renderDevice_ ? getGpDevice(renderDevice_) : nullptr;
    void *rlDevice = *reinterpret_cast<void **>(
        static_cast<std::uint8_t *>(context_.get()) + 0x260);
    void *ownerRenderDevice = rlDevice
                                  ? *reinterpret_cast<void **>(
                                        static_cast<std::uint8_t *>(rlDevice) +
                                        0x8)
                                  : nullptr;
    void *ownerGpDevice =
        ownerRenderDevice ? getGpDevice(ownerRenderDevice) : nullptr;
    std::cout << "rl_context=" << context_.get()
              << " render_device=" << renderDevice_
              << " gp_device=" << gpDevice_
              << " owner_render_device=" << ownerRenderDevice
              << " owner_gp_device=" << ownerGpDevice
              << " owner_match="
              << (renderDevice_ == ownerRenderDevice &&
                  gpDevice_ == ownerGpDevice)
              << '\n';
  }

  ~RlHostContext() {
    if (isBound_) {
      unbind_(context_.get());
    }
  }

  RlHostContext(const RlHostContext &) = delete;
  RlHostContext &operator=(const RlHostContext &) = delete;

  EngineContext engineContext() {
    return {
        .owner = context_.get(),
        .sharedContextStorage = &context_,
        .renderDevice = renderDevice_,
        .gpDevice = gpDevice_,
    };
  }

private:
  std::shared_ptr<void> context_;
  void *renderDevice_ = nullptr;
  void *gpDevice_ = nullptr;
  UnbindRlContext unbind_;
  bool isBound_ = false;
};

EngineContext adoptEngineGlContext(void *library) {
  Class contextClass = objc_getClass("HTSGLContext");
  if (!contextClass) {
    return {};
  }
  const auto send = reinterpret_cast<id (*)(id, SEL)>(objc_msgSend);
  send(reinterpret_cast<id>(contextClass), sel_registerName("preloadGLContext"));
  id context = send(reinterpret_cast<id>(contextClass),
                    sel_registerName("sharedImageProcessingContext"));
  if (!context) {
    context = send(reinterpret_cast<id>(contextClass),
                   sel_registerName("shareProcesingContext"));
  }
  if (!context) {
    context = send(reinterpret_cast<id>(contextClass),
                   sel_registerName("defaultImageProcessingContext"));
  }
  if (!context) {
    return {};
  }
  reinterpret_cast<void (*)(id, SEL, BOOL)>(objc_msgSend)(
      context, sel_registerName("bind:"), YES);
  std::cerr << "engine_context_bound=" << context << '\n';
  const auto getCppContext =
      reinterpret_cast<void *(*)(id, SEL)>(objc_msgSend);
  void *cppContext =
      getCppContext(context, sel_registerName("getCppContext"));
  std::cerr << "cpp_context_resolved=" << cppContext << '\n';
  void *cppContextObject =
      cppContext ? *static_cast<void **>(cppContext) : nullptr;
  const auto getRenderDevice = requireSymbol<GetRenderDevice>(
      library, "_ZN17TESharedGLContext15getRenderDeviceEv");
  const auto getGpDevice = requireSymbol<GetGpDevice>(
      library, "_ZN13AmazingEngine14RendererDevice11getGPDeviceEv");
  std::cerr << "resolving_render_device\n";
  void *renderDevice =
      cppContextObject ? getRenderDevice(cppContextObject) : nullptr;
  std::cerr << "render_device_resolved=" << renderDevice << '\n';
  void *gpDevice = renderDevice ? getGpDevice(renderDevice) : nullptr;
  std::cout << "cpp_context=" << cppContext
            << " render_device=" << renderDevice
            << " gp_device=" << gpDevice << '\n';
  return {
      .owner = context,
      .sharedContextStorage = cppContext,
      .renderDevice = renderDevice,
      .gpDevice = gpDevice};
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 9 && argc != 10) {
    std::cerr << "usage: portrait-matting-blend-v2-probe <libcccreator> "
                 "<input.rgba> <width> <height> <alpha.gray> <alpha-width> "
                 "<alpha-height> <output.rgba> [--rl-host]\n";
    return 2;
  }
  try {
    const bool useRlHost =
        argc == 10 && std::string_view(argv[9]) == "--rl-host";
    if (argc == 10 && !useRlHost) {
      throw std::runtime_error("unknown context mode");
    }
    const int width = std::stoi(argv[3]);
    const int height = std::stoi(argv[4]);
    const int alphaWidth = std::stoi(argv[6]);
    const int alphaHeight = std::stoi(argv[7]);
    const auto rgba = readExact(
        argv[2], static_cast<std::size_t>(width) * height * 4U);
    const auto alpha = readExact(
        argv[5], static_cast<std::size_t>(alphaWidth) * alphaHeight);
    void *library = dlopen(argv[1], RTLD_NOW | RTLD_GLOBAL);
    if (!library) {
      throw std::runtime_error(std::string("cannot load runtime: ") + dlerror());
    }
    if (useRlHost) {
      setBooleanConfig(library, "ConfigID_EnableAGFXMetal");
      setBooleanConfig(library, "ConfigID_VeabtestEnableMetalV2");
      setBooleanConfig(library, "ConfigID_EnablePortraitMattingBlendV2");
    }
    std::unique_ptr<GlContext> fallbackContext;
    if (useRlHost && !CGLGetCurrentContext()) {
      fallbackContext = std::make_unique<GlContext>();
    }
    std::unique_ptr<RlHostContext> rlHostContext;
    EngineContext engineContext;
    if (useRlHost) {
      rlHostContext = std::make_unique<RlHostContext>(library);
      engineContext = rlHostContext->engineContext();
    } else {
      engineContext = adoptEngineGlContext(library);
    }
    if (!CGLGetCurrentContext()) {
      fallbackContext = std::make_unique<GlContext>();
    }
    if (!CGLGetCurrentContext()) {
      throw std::runtime_error("cannot bind OpenGL context");
    }
    std::cout << "context="
              << (useRlHost ? "rl-host"
                            : engineContext.owner ? "engine" : "standalone")
              << '\n';
    const auto setMode = requireSymbol<SetBlendMode>(
        library, "bef_portrait_matting_v2_set_blend_mode");
    const auto setCallerManagedLegacyFallback =
        requireSymbol<SetCallerManagedLegacyFallback>(
            library,
            "bef_portrait_matting_v2_set_caller_managed_legacy_fallback");
    const auto blend = requireSymbol<BlendDeviceTextureWithData>(
        library, "bef_portrait_matting_v2_blend_device_texture_with_data");
    BlendEffectRuntime blendEffect(
        library, engineContext.sharedContextStorage, width, height);
    if (useRlHost) {
      blendEffect.setStrokeParameters(
          R"({"morphologyParams":true,"erode_dilate_kernel_size":0,"blur_kernel_size":0,"enable_reverse":false,"blendPath":"device","featurePath":""})");
    }
    void *handle = blendEffect.handle();
    const int modeStatus = setMode(handle, 0);
    if (modeStatus != 0) {
      throw std::runtime_error("set blend mode failed: " +
                               std::to_string(modeStatus));
    }
    const int fallbackStatus = setCallerManagedLegacyFallback(handle, true);
    if (fallbackStatus != 0) {
      throw std::runtime_error("configure legacy fallback failed: " +
                               std::to_string(fallbackStatus));
    }

    if (!engineContext.renderDevice) {
      throw std::runtime_error("AGFX render device unavailable");
    }
    constexpr int kRgba8PixelFormat = 0x2b;
    constexpr int kLinearFilter = 1;
    constexpr int kClampWrap = 1;
    const auto createTexture2D = requireSymbol<CreateTexture2D>(
        library,
        "_ZN13AmazingEngine14RendererDevice15createTexture2DEiiPKPKvNS_"
        "14AMGPixelFormatENS_13AMGFilterModeES6_NS_11AMGWrapModeES7_PiPKcbb");
    const auto destroyTexture = requireSymbol<DestroyTexture>(
        library,
        "_ZN13AmazingEngine14RendererDevice14destroyTextureE13DeviceTexture");
    const auto readImage = requireSymbol<ReadImage>(
        library,
        "_ZN13AmazingEngine14RendererDevice9readImageE13DeviceTextureiiPvNS_"
        "8FlipModeENS_10RotateModeENS_13AMGFilterModeENS_14AMGPixelFormatE");
    const void *inputMipData[] = {rgba.data()};
    std::vector<std::uint8_t> alphaRgba(alpha.size() * 4U);
    for (std::size_t index = 0; index < alpha.size(); ++index) {
      const std::uint8_t value = alpha[index];
      const std::size_t pixelOffset = index * 4U;
      alphaRgba[pixelOffset] = value;
      alphaRgba[pixelOffset + 1U] = value;
      alphaRgba[pixelOffset + 2U] = value;
      alphaRgba[pixelOffset + 3U] = value;
    }
    const void *alphaMipData[] = {alphaRgba.data()};
    const DeviceTexture inputTexture = createTexture2D(
        engineContext.renderDevice, width, height, inputMipData,
        kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
        kClampWrap, nullptr, "qcut matting v2 input", false, false);
    const DeviceTexture outputTexture = createTexture2D(
        engineContext.renderDevice, width, height, nullptr, kRgba8PixelFormat,
        kLinearFilter, kLinearFilter, kClampWrap, kClampWrap, nullptr,
        "qcut matting v2 output", false, false);
    const DeviceTexture alphaTexture = createTexture2D(
        engineContext.renderDevice, alphaWidth, alphaHeight, alphaMipData,
        kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
        kClampWrap, nullptr, "qcut matting v2 alpha", false, false);
    std::cerr << "agfx_input=" << inputTexture.texture
              << " metadata=" << inputTexture.metadata
              << " agfx_output=" << outputTexture.texture
              << " metadata=" << outputTexture.metadata
              << " agfx_alpha=" << alphaTexture.texture
              << " metadata=" << alphaTexture.metadata << '\n';
    if (!inputTexture.texture || !outputTexture.texture ||
        !alphaTexture.texture) {
      if (alphaTexture.texture) {
        destroyTexture(engineContext.renderDevice, alphaTexture);
      }
      if (outputTexture.texture) {
        destroyTexture(engineContext.renderDevice, outputTexture);
      }
      if (inputTexture.texture) {
        destroyTexture(engineContext.renderDevice, inputTexture);
      }
      throw std::runtime_error("cannot create AGFX textures");
    }
    const std::array<float, 4> fullFrame = {0.0F, 0.0F, 1.0F, 1.0F};
    const MattingImage inputImage = {
        .data = &inputTexture,
        .width = static_cast<std::uint32_t>(width),
        .height = static_cast<std::uint32_t>(height),
    };
    const MattingImage outputImage = {
        .data = &outputTexture,
        .width = static_cast<std::uint32_t>(width),
        .height = static_cast<std::uint32_t>(height),
    };
    const MattingImage alphaImage = {
        .data = &alphaTexture,
        .width = static_cast<std::uint32_t>(alphaWidth),
        .height = static_cast<std::uint32_t>(alphaHeight),
    };
    const std::array<std::uint8_t, 4> transparent = {0, 0, 0, 0};
    const auto blendAddress = reinterpret_cast<std::uintptr_t>(blend);
    const auto resolveBlendHandle = reinterpret_cast<ResolveBlendHandle>(
        blendAddress - 0x1490U);
    const auto releaseResolvedBlendHandle =
        reinterpret_cast<ReleaseResolvedBlendHandle>(blendAddress - 0x13b8U);
    const auto selectBlendPath =
        reinterpret_cast<SelectBlendPath>(blendAddress - 0x534U);
    alignas(16) std::array<std::uint8_t, 32> resolvedHandle{};
    resolveBlendHandle(resolvedHandle.data(), handle);
    void *internalHandle = *reinterpret_cast<void **>(resolvedHandle.data());
    const int selectedPath = internalHandle
                                 ? selectBlendPath(
                                       internalHandle, width, height,
                                       alphaWidth, alphaHeight,
                                       transparent.data(), 0, 0, 0x101)
                                 : -1;
    std::cerr << "internal_handle=" << internalHandle
              << " selected_path=" << selectedPath;
    if (internalHandle) {
      const auto *bytes = static_cast<const std::uint8_t *>(internalHandle);
      std::cerr << " flags=" << static_cast<int>(bytes[0x9c]) << ','
                << static_cast<int>(bytes[0xc9]) << ','
                << static_cast<int>(bytes[0xb8]) << ','
                << static_cast<int>(bytes[0xc8]);
    }
    std::cerr << '\n';
    releaseResolvedBlendHandle(resolvedHandle.data());
    const int blendStatus = blend(
        handle, &inputImage, &outputImage, width, height, &alphaImage,
        fullFrame.data(), transparent.data());
    std::vector<std::uint8_t> output(rgba.size());
    if (blendStatus == 0) {
      readImage(engineContext.renderDevice, outputTexture, width, height,
                output.data(), 0, 0, kLinearFilter, kRgba8PixelFormat);
      std::uint64_t totalAbsoluteError = 0;
      std::uint8_t maximumAbsoluteError = 0;
      std::size_t differentChannels = 0;
      for (std::size_t pixel = 0; pixel < alpha.size(); ++pixel) {
        for (std::size_t channel = 0; channel < 4U; ++channel) {
          const std::size_t offset = pixel * 4U + channel;
          const auto expected = static_cast<std::uint8_t>(
              (static_cast<unsigned int>(rgba[offset]) * alpha[pixel] + 127U) /
              255U);
          const auto difference = static_cast<std::uint8_t>(
              output[offset] > expected ? output[offset] - expected
                                        : expected - output[offset]);
          totalAbsoluteError += difference;
          maximumAbsoluteError = std::max(maximumAbsoluteError, difference);
          differentChannels += difference != 0 ? 1U : 0U;
        }
      }
      std::cout << "formula_max_error="
                << static_cast<unsigned int>(maximumAbsoluteError)
                << " formula_mae="
                << static_cast<double>(totalAbsoluteError) / output.size()
                << " different_channels=" << differentChannels << '\n';
    }
    destroyTexture(engineContext.renderDevice, alphaTexture);
    destroyTexture(engineContext.renderDevice, outputTexture);
    destroyTexture(engineContext.renderDevice, inputTexture);
    if (blendStatus != 0) {
      throw std::runtime_error("blend failed: status=" +
                               std::to_string(blendStatus));
    }
    std::ofstream outputFile(argv[8], std::ios::binary);
    outputFile.write(reinterpret_cast<const char *>(output.data()),
                     static_cast<std::streamsize>(output.size()));
    if (!outputFile) {
      throw std::runtime_error("cannot write output");
    }
    std::cout << "ok width=" << width << " height=" << height
              << " alphaWidth=" << alphaWidth
              << " alphaHeight=" << alphaHeight << '\n';
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
