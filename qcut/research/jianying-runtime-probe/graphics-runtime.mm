#include "graphics-runtime.h"

#include "probe-utils.h"

#include <iostream>

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
constexpr std::string_view kCreateCvPixelBuffer =
    "_ZN13AmazingEngine5Utils19createCVPixelBufferEiiijPKv";
constexpr std::string_view kCreateTextureFromNativeBuffer =
    "_ZN13AmazingEngine14RendererDevice29createTextureFromNativeBufferEPvbbbPKc";
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
constexpr std::string_view kTextureGetNativeBuffer =
    "_ZN13DeviceWrapperI11TextureBaseE15getNativeBufferEv";
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

}  // namespace

GraphicsSymbols loadGraphicsRuntime(const std::filesystem::path& runtimeRoot) {
  void* graphics =
      openLibrary(runtimeRoot / "Frameworks" / "libAGFX.dylib");

  return {
      .createDevice = resolveSymbol<CreateGraphicsDeviceMethod>(
          graphics, kCreateGraphicsDevice),
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
      .createCvPixelBuffer = resolveSymbol<CreateCvPixelBufferMethod>(
          graphics, kCreateCvPixelBuffer),
      .createTextureFromNativeBuffer =
          resolveSymbol<CreateTextureFromNativeBufferMethod>(
              graphics, kCreateTextureFromNativeBuffer),
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
      .textureGetNativeBuffer = resolveSymbol<TexturePointerProperty>(
          graphics, kTextureGetNativeBuffer),
      .createFramebuffer =
          resolveSymbol<CreateFramebufferMethod>(graphics, kCreateFramebuffer),
      .destroyFramebuffer = resolveSymbol<DestroyFramebufferMethod>(
          graphics, kDestroyFramebuffer),
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
              << symbols.textureGetPixelFormat(texture.texture)
              << ", native = "
              << symbols.textureGetNativeBuffer(texture.texture);
  }
  std::cout << '\n';
}

}  // namespace jianying_probe
