#import <AppKit/AppKit.h>

#include "graphics-probe.h"
#include "probe-utils.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <limits>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace jianying_probe {
namespace {

constexpr int kMetalRendererType = 6;
constexpr int kRgba8PixelFormat = 0x2b;
constexpr int kLinearFilter = 1;
constexpr int kClampWrap = 1;

constexpr std::string_view kCreateGraphicsDevice =
    "_ZN13AmazingEngine8GPDevice12createDeviceENS_12RendererTypeEj";
constexpr std::string_view kGraphicsDeviceInit =
    "_ZN13AmazingEngine8GPDevice4initEv";
constexpr std::string_view kGraphicsDeviceDeinit =
    "_ZN13AmazingEngine8GPDevice6deinitEv";
constexpr std::string_view kGetRendererDevice =
    "_ZN13AmazingEngine8GPDevice17getRendererDeviceEv";
constexpr std::string_view kGraphicsDeviceDestructor =
    "_ZN13AmazingEngine8GPDeviceD1Ev";
constexpr std::string_view kGraphicsDeviceDelete =
    "_ZN13AmazingEngine8GPDevicedlEPv";
constexpr std::string_view kCreateTexture2D =
    "_ZN13AmazingEngine14RendererDevice15createTexture2DEiiPKPKvNS_14AMGPixelFormatENS_13AMGFilterModeES6_NS_11AMGWrapModeES7_PiPKcbb";
constexpr std::string_view kDestroyTexture =
    "_ZN13AmazingEngine14RendererDevice14destroyTextureE13DeviceTexture";
constexpr std::string_view kReadImage =
    "_ZN13AmazingEngine14RendererDevice9readImageE13DeviceTextureiiPvNS_"
    "8FlipModeENS_10RotateModeENS_13AMGFilterModeENS_14AMGPixelFormatE";
constexpr std::string_view kTextureGetWidth =
    "_ZN13DeviceWrapperI11TextureBaseE8getWidthEv";
constexpr std::string_view kTextureGetHeight =
    "_ZN13DeviceWrapperI11TextureBaseE9getHeightEv";
constexpr std::string_view kTextureGetPixelFormat =
    "_ZN13DeviceWrapperI11TextureBaseE14getPixelFormatEv";
constexpr std::string_view kTextureGetId =
    "_ZN13DeviceWrapperI11TextureBaseE5getIdEv";
constexpr std::string_view kCreateFramebuffer =
    "_ZN13AmazingEngine14RendererDevice17createFramebufferEPKNS_16RenderTargetDescE";
constexpr std::string_view kDestroyFramebuffer =
    "_ZN13AmazingEngine14RendererDevice18destroyFramebufferEP26handle_DeviceFramebuffer_t";
constexpr std::string_view kBeginFrame =
    "_ZN13AmazingEngine14RendererDevice10beginFrameEP21handle_DeviceWindow_t";
constexpr std::string_view kBeginRender =
    "_ZN13AmazingEngine14RendererDevice11beginRenderEP26handle_DeviceFramebuffer_tPKNS_22framebuffer_clear_infoEP23handle_DeviceSequence_t";
constexpr std::string_view kEndRender =
    "_ZN13AmazingEngine14RendererDevice9endRenderEP23handle_DeviceSequence_t";
constexpr std::string_view kEndFrame =
    "_ZN13AmazingEngine14RendererDevice8endFrameEv";

using ObjectMethod = void (*)(void*);
using CreateGraphicsDeviceMethod = void* (*)(int, unsigned int);
using GetObjectMethod = void* (*)(void*);

struct RenderTargetAttachmentProbe {
  DeviceTextureProbe texture;
  std::array<std::byte, 0x10> options{};
};

struct RenderTargetDescProbe {
  std::int32_t multisampleMode = 0;
  std::int32_t colorAttachmentCount = 1;
  RenderTargetAttachmentProbe* colorAttachments = nullptr;
  RenderTargetAttachmentProbe* depthAttachment = nullptr;
  RenderTargetAttachmentProbe* stencilAttachment = nullptr;
  std::string label;
};

static_assert(sizeof(RenderTargetAttachmentProbe) == 0x20);
static_assert(sizeof(RenderTargetDescProbe) == 0x38);

using CreateTexture2DMethod = DeviceTextureProbe (*)(void*, int, int,
                                                     const void* const*, int,
                                                     int, int, int, int, int*,
                                                     const char*, bool, bool);
using DestroyTextureMethod = void (*)(void*, DeviceTextureProbe);
using ReadImageMethod = void (*)(void*, DeviceTextureProbe, int, int, void*,
                                 int, int, int, int);
using TextureIntegerProperty = int (*)(const void*);
using TextureIdProperty = std::uint64_t (*)(const void*);
using CreateFramebufferMethod = void* (*)(void*, const RenderTargetDescProbe*);
using DestroyFramebufferMethod = void (*)(void*, void*);
using BeginFrameMethod = void (*)(void*, void*);
using BeginRenderMethod = void (*)(void*, void*, const void*, void*);
using EndRenderMethod = void (*)(void*, void*);

struct GraphicsSymbols {
  CreateGraphicsDeviceMethod createDevice;
  ObjectMethod init;
  ObjectMethod deinit;
  GetObjectMethod getRendererDevice;
  ObjectMethod destructor;
  ObjectMethod releaseMemory;
  CreateTexture2DMethod createTexture2D;
  DestroyTextureMethod destroyTexture;
  ReadImageMethod readImage;
  TextureIntegerProperty textureGetWidth;
  TextureIntegerProperty textureGetHeight;
  TextureIntegerProperty textureGetPixelFormat;
  TextureIdProperty textureGetId;
  CreateFramebufferMethod createFramebuffer;
  DestroyFramebufferMethod destroyFramebuffer;
  BeginFrameMethod beginFrame;
  BeginRenderMethod beginRender;
  EndRenderMethod endRender;
  ObjectMethod endFrame;
};

struct ProbeTextures {
  DeviceTextureProbe inputA;
  DeviceTextureProbe inputB;
  DeviceTextureProbe output;
};

struct FrameDimensions {
  int width;
  int height;
  std::size_t pixelBytes;
};

[[nodiscard]] GraphicsSymbols loadGraphics(const fs::path& runtimeRoot) {
  void* graphics =
      openLibrary(runtimeRoot / "Frameworks" / "libAGFX.dylib");

  return {
      .createDevice =
          resolveSymbol<CreateGraphicsDeviceMethod>(graphics, kCreateGraphicsDevice),
      .init = resolveSymbol<ObjectMethod>(graphics, kGraphicsDeviceInit),
      .deinit = resolveSymbol<ObjectMethod>(graphics, kGraphicsDeviceDeinit),
      .getRendererDevice =
          resolveSymbol<GetObjectMethod>(graphics, kGetRendererDevice),
      .destructor =
          resolveSymbol<ObjectMethod>(graphics, kGraphicsDeviceDestructor),
      .releaseMemory =
          resolveSymbol<ObjectMethod>(graphics, kGraphicsDeviceDelete),
      .createTexture2D =
          resolveSymbol<CreateTexture2DMethod>(graphics, kCreateTexture2D),
      .destroyTexture =
          resolveSymbol<DestroyTextureMethod>(graphics, kDestroyTexture),
      .readImage = resolveSymbol<ReadImageMethod>(graphics, kReadImage),
      .textureGetWidth =
          resolveSymbol<TextureIntegerProperty>(graphics, kTextureGetWidth),
      .textureGetHeight =
          resolveSymbol<TextureIntegerProperty>(graphics, kTextureGetHeight),
      .textureGetPixelFormat = resolveSymbol<TextureIntegerProperty>(
          graphics, kTextureGetPixelFormat),
      .textureGetId =
          resolveSymbol<TextureIdProperty>(graphics, kTextureGetId),
      .createFramebuffer =
          resolveSymbol<CreateFramebufferMethod>(graphics, kCreateFramebuffer),
      .destroyFramebuffer =
          resolveSymbol<DestroyFramebufferMethod>(graphics, kDestroyFramebuffer),
      .beginFrame = resolveSymbol<BeginFrameMethod>(graphics, kBeginFrame),
      .beginRender = resolveSymbol<BeginRenderMethod>(graphics, kBeginRender),
      .endRender = resolveSymbol<EndRenderMethod>(graphics, kEndRender),
      .endFrame = resolveSymbol<ObjectMethod>(graphics, kEndFrame),
  };
}

void releaseGraphicsDevice(const GraphicsSymbols& symbols, void* device) {
  symbols.deinit(device);
  symbols.destructor(device);
  symbols.releaseMemory(device);
  std::cout << "[gpu] GPDevice released\n";
}

void printTexture(const GraphicsSymbols& symbols, std::string_view label,
                  const DeviceTextureProbe& texture) {
  std::cout << "[texture] " << label << " object = " << texture.texture;
  if (texture.texture != nullptr) {
    std::cout << ", id = " << symbols.textureGetId(texture.texture)
              << ", size = " << symbols.textureGetWidth(texture.texture) << 'x'
              << symbols.textureGetHeight(texture.texture)
              << ", format = "
              << symbols.textureGetPixelFormat(texture.texture);
  }
  std::cout << '\n';
}

[[nodiscard]] FrameDimensions resolveDimensions(int width, int height) {
  constexpr int kMaximumDimension = 16'384;
  if (width <= 0 || height <= 0 || width > kMaximumDimension ||
      height > kMaximumDimension) {
    throw std::runtime_error("frame dimensions must be between 1 and 16384");
  }

  const auto widthValue = static_cast<std::size_t>(width);
  const auto heightValue = static_cast<std::size_t>(height);
  if (heightValue > std::numeric_limits<std::size_t>::max() / widthValue / 4) {
    throw std::runtime_error("frame dimensions overflow RGBA byte count");
  }

  return {
      .width = width,
      .height = height,
      .pixelBytes = widthValue * heightValue * 4,
  };
}

[[nodiscard]] std::vector<std::uint8_t> makeSolidPixels(
    const FrameDimensions& dimensions,
    const std::array<std::uint8_t, 4>& color) {
  std::vector<std::uint8_t> pixels(dimensions.pixelBytes);
  for (std::size_t offset = 0; offset < pixels.size(); offset += 4) {
    std::copy(color.begin(), color.end(), pixels.begin() + offset);
  }
  return pixels;
}

[[nodiscard]] ProbeTextures createProbeTextures(
    const GraphicsSymbols& symbols, void* renderer,
    const FrameDimensions& dimensions,
    std::span<const std::uint8_t> inputAPixels,
    std::span<const std::uint8_t> inputBPixels) {
  const void* inputAMipData[] = {inputAPixels.data()};
  const void* inputBMipData[] = {inputBPixels.data()};
  return {
      .inputA = symbols.createTexture2D(
          renderer, dimensions.width, dimensions.height, inputAMipData,
          kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
          kClampWrap, nullptr, "qcut probe input A", false, false),
      .inputB = symbols.createTexture2D(
          renderer, dimensions.width, dimensions.height, inputBMipData,
          kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
          kClampWrap, nullptr, "qcut probe input B", false, false),
      .output = symbols.createTexture2D(
          renderer, dimensions.width, dimensions.height, nullptr,
          kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
          kClampWrap, nullptr, "qcut probe output", false, false),
  };
}

[[nodiscard]] bool allTexturesCreated(const ProbeTextures& textures) {
  return textures.inputA.texture != nullptr &&
         textures.inputB.texture != nullptr &&
         textures.output.texture != nullptr;
}

void destroyProbeTextures(const GraphicsSymbols& symbols, void* renderer,
                          const ProbeTextures& textures) {
  if (textures.output.texture != nullptr) {
    symbols.destroyTexture(renderer, textures.output);
  }
  if (textures.inputB.texture != nullptr) {
    symbols.destroyTexture(renderer, textures.inputB);
  }
  if (textures.inputA.texture != nullptr) {
    symbols.destroyTexture(renderer, textures.inputA);
  }
  std::cout << "[texture] all probe textures released\n";
}

void readTexture(const GraphicsSymbols& symbols, void* renderer,
                 const DeviceTextureProbe& texture,
                 const FrameDimensions& dimensions,
                 std::vector<std::uint8_t>& pixels) {
  constexpr int kNoFlip = 0;
  constexpr int kNoRotation = 0;
  pixels.resize(dimensions.pixelBytes);
  symbols.readImage(renderer, texture, dimensions.width, dimensions.height,
                    pixels.data(), kNoFlip, kNoRotation, kLinearFilter,
                    kRgba8PixelFormat);
}

[[nodiscard]] bool matchesPixels(const std::vector<std::uint8_t>& actual,
                                 std::span<const std::uint8_t> expected) {
  return actual.size() == expected.size() &&
         std::equal(actual.begin(), actual.end(), expected.begin());
}

}  // namespace

struct GraphicsProbeSession::Impl {
  GraphicsSymbols symbols;
  FrameDimensions dimensions;
  void* device = nullptr;
  void* renderer = nullptr;

  Impl(const fs::path& runtimeRoot, int width, int height)
      : symbols(loadGraphics(runtimeRoot)),
        dimensions(resolveDimensions(width, height)) {
    device = symbols.createDevice(kMetalRendererType, 0);
    std::cout << "[gpu] GPDevice = " << device << '\n';
    if (device == nullptr) {
      return;
    }

    symbols.init(device);
    renderer = symbols.getRendererDevice(device);
    std::cout << "[gpu] RendererDevice = " << renderer << '\n';
    if (renderer == nullptr) {
      releaseGraphicsDevice(symbols, device);
      device = nullptr;
    }
  }

  ~Impl() {
    if (device != nullptr) {
      releaseGraphicsDevice(symbols, device);
    }
  }

  [[nodiscard]] bool ready() const {
    return device != nullptr && renderer != nullptr;
  }
};

GraphicsProbeSession::GraphicsProbeSession(const fs::path& runtimeRoot,
                                           int width, int height) {
  [NSApplication sharedApplication];
  impl_ = std::make_unique<Impl>(runtimeRoot, width, height);
}

GraphicsProbeSession::~GraphicsProbeSession() = default;
GraphicsProbeSession::GraphicsProbeSession(GraphicsProbeSession&&) noexcept =
    default;
GraphicsProbeSession& GraphicsProbeSession::operator=(
    GraphicsProbeSession&&) noexcept = default;

bool GraphicsProbeSession::ready() const {
  return impl_ != nullptr && impl_->ready();
}

GraphicsFrameProbeResult GraphicsProbeSession::renderFrame(
    const GraphicsSessionFrameRequest& request) {
  GraphicsFrameProbeResult result;
  if (!ready() || request.renderer == nullptr) {
    return result;
  }

  std::vector<std::uint8_t> defaultInputA;
  std::vector<std::uint8_t> defaultInputB;
  std::span<const std::uint8_t> inputAPixels = request.inputAPixels;
  std::span<const std::uint8_t> inputBPixels = request.inputBPixels;
  if (inputAPixels.empty() && inputBPixels.empty()) {
    defaultInputA =
        makeSolidPixels(impl_->dimensions, {0xff, 0x00, 0x00, 0xff});
    defaultInputB =
        makeSolidPixels(impl_->dimensions, {0x00, 0x00, 0xff, 0xff});
    inputAPixels = defaultInputA;
    inputBPixels = defaultInputB;
  }
  if (inputAPixels.size() != impl_->dimensions.pixelBytes ||
      inputBPixels.size() != impl_->dimensions.pixelBytes) {
    throw std::runtime_error("input RGBA byte count does not match dimensions");
  }

  const ProbeTextures textures =
      createProbeTextures(impl_->symbols, impl_->renderer, impl_->dimensions,
                          inputAPixels, inputBPixels);
  printTexture(impl_->symbols, "input A", textures.inputA);
  printTexture(impl_->symbols, "input B", textures.inputB);
  printTexture(impl_->symbols, "output", textures.output);
  if (!allTexturesCreated(textures)) {
    destroyProbeTextures(impl_->symbols, impl_->renderer, textures);
    return result;
  }

  result.inputsReadable = true;
  if (request.verifyInputReadback) {
    readTexture(impl_->symbols, impl_->renderer, textures.inputA,
                impl_->dimensions, result.inputAPixels);
    readTexture(impl_->symbols, impl_->renderer, textures.inputB,
                impl_->dimensions, result.inputBPixels);
    result.inputsReadable =
        matchesPixels(result.inputAPixels, inputAPixels) &&
        matchesPixels(result.inputBPixels, inputBPixels);
    std::cout << "[readback] input textures = "
              << (result.inputsReadable ? "expected RGBA"
                                        : "unexpected bytes")
              << '\n';
  }

  const GraphicsFrameResources resources = {
      .width = impl_->dimensions.width,
      .height = impl_->dimensions.height,
      .graphicsDevice = impl_->device,
      .inputA = textures.inputA,
      .inputB = textures.inputB,
      .output = textures.output,
      .callbackContext = request.callbackContext,
  };
  result.rendered = request.renderer(resources);
  if (result.rendered) {
    readTexture(impl_->symbols, impl_->renderer, textures.output,
                impl_->dimensions, result.outputPixels);
  }

  destroyProbeTextures(impl_->symbols, impl_->renderer, textures);
  return result;
}

bool inspectGraphicsContext(const fs::path& runtimeRoot, bool createTextures) {
  [NSApplication sharedApplication];

  const GraphicsSymbols symbols = loadGraphics(runtimeRoot);
  void* device = symbols.createDevice(kMetalRendererType, 0);
  std::cout << "[gpu] GPDevice = " << device << '\n';
  if (device == nullptr) {
    return false;
  }

  symbols.init(device);
  std::cout << "[gpu] GPDevice initialized\n";
  void* renderer = symbols.getRendererDevice(device);
  std::cout << "[gpu] RendererDevice = " << renderer << '\n';

  if (renderer == nullptr || !createTextures) {
    releaseGraphicsDevice(symbols, device);
    return renderer != nullptr;
  }

  const FrameDimensions dimensions =
      resolveDimensions(kProbeTextureSize, kProbeTextureSize);
  const std::vector<std::uint8_t> redPixels =
      makeSolidPixels(dimensions, {0xff, 0x00, 0x00, 0xff});
  const std::vector<std::uint8_t> bluePixels =
      makeSolidPixels(dimensions, {0x00, 0x00, 0xff, 0xff});
  const ProbeTextures textures = createProbeTextures(
      symbols, renderer, dimensions, redPixels, bluePixels);
  printTexture(symbols, "input A", textures.inputA);
  printTexture(symbols, "input B", textures.inputB);
  printTexture(symbols, "output", textures.output);
  bool renderTargetCreated = false;
  if (textures.output.texture != nullptr) {
    RenderTargetAttachmentProbe colorAttachment;
    colorAttachment.texture = textures.output;
    RenderTargetDescProbe renderTargetDesc;
    renderTargetDesc.colorAttachments = &colorAttachment;
    renderTargetDesc.label = "qcut probe render target";

    void* framebuffer =
        symbols.createFramebuffer(renderer, &renderTargetDesc);
    std::cout << "[render-target] framebuffer = " << framebuffer << '\n';
    if (framebuffer != nullptr) {
      symbols.beginFrame(renderer, nullptr);
      symbols.beginRender(renderer, framebuffer, nullptr, nullptr);
      symbols.endRender(renderer, nullptr);
      symbols.endFrame(renderer);
      symbols.destroyFramebuffer(renderer, framebuffer);
      renderTargetCreated = true;
      std::cout << "[render-target] bound and released\n";
    }
  }

  const bool texturesCreated =
      allTexturesCreated(textures) && renderTargetCreated;

  destroyProbeTextures(symbols, renderer, textures);

  releaseGraphicsDevice(symbols, device);
  return texturesCreated;
}

GraphicsFrameProbeResult renderGraphicsProbeFrame(
    const GraphicsFrameProbeRequest& request) {
  GraphicsProbeSession session(request.runtimeRoot, request.width,
                               request.height);
  return session.renderFrame({
      .renderer = request.renderer,
      .callbackContext = request.callbackContext,
      .inputAPixels = request.inputAPixels,
      .inputBPixels = request.inputBPixels,
      .verifyInputReadback = request.verifyInputReadback,
  });
}

}  // namespace jianying_probe
