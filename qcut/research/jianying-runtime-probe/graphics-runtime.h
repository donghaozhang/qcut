#pragma once

#import <CoreVideo/CoreVideo.h>

#include "graphics-probe.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <string>
#include <string_view>

namespace jianying_probe {

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

using ObjectMethod = void (*)(void*);
using CreateGraphicsDeviceMethod = void* (*)(int, unsigned int);
using GetObjectMethod = void* (*)(void*);
using CreateTexture2DMethod = DeviceTextureProbe (*)(
    void*, int, int, const void* const*, int, int, int, int, int, int*,
    const char*, bool, bool);
using CreateCvPixelBufferMethod = CVPixelBufferRef (*)(int, int, int,
                                                       std::uint32_t,
                                                       const void*);
using CreateTextureFromNativeBufferMethod = DeviceTextureProbe (*)(
    void*, void*, bool, bool, bool, const char*);
using DestroyTextureMethod = void (*)(void*, DeviceTextureProbe);
using ReadImageMethod = void (*)(void*, DeviceTextureProbe, int, int, void*,
                                 int, int, int, int);
using TextureIntegerProperty = int (*)(const void*);
using TextureIdProperty = std::uint64_t (*)(const void*);
using TexturePointerProperty = void* (*)(const void*);
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
  CreateCvPixelBufferMethod createCvPixelBuffer;
  CreateTextureFromNativeBufferMethod createTextureFromNativeBuffer;
  DestroyTextureMethod destroyTexture;
  ReadImageMethod readImage;
  TextureIntegerProperty textureGetWidth;
  TextureIntegerProperty textureGetHeight;
  TextureIntegerProperty textureGetPixelFormat;
  TextureIdProperty textureGetId;
  TexturePointerProperty textureGetNativeBuffer;
  CreateFramebufferMethod createFramebuffer;
  DestroyFramebufferMethod destroyFramebuffer;
  BeginFrameMethod beginFrame;
  BeginRenderMethod beginRender;
  EndRenderMethod endRender;
  ObjectMethod endFrame;
};

[[nodiscard]] GraphicsSymbols loadGraphicsRuntime(
    const std::filesystem::path& runtimeRoot);
void releaseGraphicsDevice(const GraphicsSymbols& symbols, void* device);
void printTexture(const GraphicsSymbols& symbols, std::string_view label,
                  const DeviceTextureProbe& texture);

}  // namespace jianying_probe
