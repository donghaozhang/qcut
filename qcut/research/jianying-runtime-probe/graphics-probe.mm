#import <AppKit/AppKit.h>
#import <CoreVideo/CoreVideo.h>

#include "graphics-probe.h"
#include "graphics-runtime.h"
#include "probe-utils.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <limits>
#include <span>
#include <stdexcept>
#include <vector>

namespace jianying_probe {
namespace {

constexpr int kMetalRendererType = 6;
constexpr int kRgba8PixelFormat = 0x2b;
constexpr int kLinearFilter = 1;
constexpr int kClampWrap = 1;

struct ProbeTextures {
  DeviceTextureProbe inputA;
  DeviceTextureProbe inputB;
  DeviceTextureProbe output;
  CVPixelBufferRef inputANativeBuffer = nullptr;
  CVPixelBufferRef inputBNativeBuffer = nullptr;
};

struct FrameDimensions {
  int width;
  int height;
  std::size_t pixelBytes;
};

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
    std::span<const std::uint8_t> inputBPixels, bool useNativeInputs,
    const std::array<bool, 3>& nativeTextureFlags) {
  const void* inputAMipData[] = {inputAPixels.data()};
  const void* inputBMipData[] = {inputBPixels.data()};
  ProbeTextures textures;
  if (useNativeInputs) {
    std::vector<std::uint8_t> inputABgra(inputAPixels.begin(),
                                         inputAPixels.end());
    std::vector<std::uint8_t> inputBBgra(inputBPixels.begin(),
                                         inputBPixels.end());
    for (std::size_t offset = 0; offset < inputABgra.size(); offset += 4) {
      std::swap(inputABgra[offset], inputABgra[offset + 2]);
      std::swap(inputBBgra[offset], inputBBgra[offset + 2]);
    }
    const int bytesPerRow = dimensions.width * 4;
    textures.inputANativeBuffer = symbols.createCvPixelBuffer(
        dimensions.width, dimensions.height, bytesPerRow,
        kCVPixelFormatType_32BGRA, inputABgra.data());
    textures.inputBNativeBuffer = symbols.createCvPixelBuffer(
        dimensions.width, dimensions.height, bytesPerRow,
        kCVPixelFormatType_32BGRA, inputBBgra.data());
    if (textures.inputANativeBuffer != nullptr) {
      textures.inputA = symbols.createTextureFromNativeBuffer(
          renderer, textures.inputANativeBuffer, nativeTextureFlags[0],
          nativeTextureFlags[1], nativeTextureFlags[2],
          "qcut probe native input A");
    }
    if (textures.inputBNativeBuffer != nullptr) {
      textures.inputB = symbols.createTextureFromNativeBuffer(
          renderer, textures.inputBNativeBuffer, nativeTextureFlags[0],
          nativeTextureFlags[1], nativeTextureFlags[2],
          "qcut probe native input B");
    }
  } else {
    textures.inputA = symbols.createTexture2D(
        renderer, dimensions.width, dimensions.height, inputAMipData,
        kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
        kClampWrap, nullptr, "qcut probe input A", false, false);
    textures.inputB = symbols.createTexture2D(
        renderer, dimensions.width, dimensions.height, inputBMipData,
        kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap,
        kClampWrap, nullptr, "qcut probe input B", false, false);
  }
  textures.output = symbols.createTexture2D(
      renderer, dimensions.width, dimensions.height, nullptr,
      kRgba8PixelFormat, kLinearFilter, kLinearFilter, kClampWrap, kClampWrap,
      nullptr, "qcut probe output", false, false);
  return textures;
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
  if (textures.inputBNativeBuffer != nullptr) {
    CVPixelBufferRelease(textures.inputBNativeBuffer);
  }
  if (textures.inputANativeBuffer != nullptr) {
    CVPixelBufferRelease(textures.inputANativeBuffer);
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
      : symbols(loadGraphicsRuntime(runtimeRoot)),
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
                          inputAPixels, inputBPixels,
                          request.useNativeInputTextures,
                          request.nativeTextureFlags);
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

  const GraphicsSymbols symbols = loadGraphicsRuntime(runtimeRoot);
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
      symbols, renderer, dimensions, redPixels, bluePixels, false, {});
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
      .useNativeInputTextures = request.useNativeInputTextures,
      .nativeTextureFlags = request.nativeTextureFlags,
  });
}

}  // namespace jianying_probe
