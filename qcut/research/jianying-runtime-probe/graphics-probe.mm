#import <AppKit/AppKit.h>

#include "graphics-probe.h"
#include "probe-utils.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <string>
#include <string_view>
#include <type_traits>

namespace jianying_probe {
namespace {

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

// Non-trivial lifetime preserves DeviceTexture's arm64 indirect-passing ABI.
struct DeviceTextureProbe {
  void* texture = nullptr;
  std::uint64_t metadata = 0;

  DeviceTextureProbe() = default;
  DeviceTextureProbe(const DeviceTextureProbe& other)
      : texture(other.texture), metadata(other.metadata) {}
  DeviceTextureProbe& operator=(const DeviceTextureProbe& other) {
    texture = other.texture;
    metadata = other.metadata;
    return *this;
  }
  ~DeviceTextureProbe() {}
};

static_assert(sizeof(DeviceTextureProbe) == 0x10);
static_assert(!std::is_trivially_copy_constructible_v<DeviceTextureProbe>);

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

using CreateTexture2DMethod = DeviceTextureProbe (*)(
    void*, int, int, const void* const*, int, int, int, int, int, int*,
    const char*, bool, bool);
using DestroyTextureMethod = void (*)(void*, DeviceTextureProbe);
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

}  // namespace

bool inspectGraphicsContext(const fs::path& runtimeRoot, bool createTextures) {
  [NSApplication sharedApplication];

  constexpr int kMetalRendererType = 6;
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

  constexpr int kTextureSize = 4;
  constexpr int kRgba8PixelFormat = 0x2b;
  constexpr int kLinearFilter = 1;
  constexpr int kClampWrap = 1;
  std::array<std::uint8_t, kTextureSize * kTextureSize * 4> redPixels{};
  std::array<std::uint8_t, kTextureSize * kTextureSize * 4> bluePixels{};
  for (std::size_t offset = 0; offset < redPixels.size(); offset += 4) {
    redPixels[offset] = 0xff;
    redPixels[offset + 3] = 0xff;
    bluePixels[offset + 2] = 0xff;
    bluePixels[offset + 3] = 0xff;
  }

  const void* redMipData[] = {redPixels.data()};
  const void* blueMipData[] = {bluePixels.data()};
  DeviceTextureProbe inputA = symbols.createTexture2D(
      renderer, kTextureSize, kTextureSize, redMipData, kRgba8PixelFormat,
      kLinearFilter, kLinearFilter, kClampWrap, kClampWrap, nullptr,
      "qcut probe input A", false, false);
  DeviceTextureProbe inputB = symbols.createTexture2D(
      renderer, kTextureSize, kTextureSize, blueMipData, kRgba8PixelFormat,
      kLinearFilter, kLinearFilter, kClampWrap, kClampWrap, nullptr,
      "qcut probe input B", false, false);
  DeviceTextureProbe output = symbols.createTexture2D(
      renderer, kTextureSize, kTextureSize, nullptr, kRgba8PixelFormat,
      kLinearFilter, kLinearFilter, kClampWrap, kClampWrap, nullptr,
      "qcut probe output", false, false);

  printTexture(symbols, "input A", inputA);
  printTexture(symbols, "input B", inputB);
  printTexture(symbols, "output", output);
  bool renderTargetCreated = false;
  if (output.texture != nullptr) {
    RenderTargetAttachmentProbe colorAttachment;
    colorAttachment.texture = output;
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

  const bool texturesCreated = inputA.texture != nullptr &&
                               inputB.texture != nullptr &&
                               output.texture != nullptr &&
                               renderTargetCreated;

  if (output.texture != nullptr) {
    symbols.destroyTexture(renderer, output);
  }
  if (inputB.texture != nullptr) {
    symbols.destroyTexture(renderer, inputB);
  }
  if (inputA.texture != nullptr) {
    symbols.destroyTexture(renderer, inputA);
  }
  std::cout << "[texture] all probe textures released\n";

  releaseGraphicsDevice(symbols, device);
  return texturesCreated;
}

}  // namespace jianying_probe
