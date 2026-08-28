#include "effect-texture-context.hpp"

#include <OpenGL/OpenGL.h>
#include <OpenGL/gl.h>

#include <stdexcept>

namespace qcut::matting {

struct EffectTextureContext::Implementation {
  CGLPixelFormatObj pixelFormat = nullptr;
  CGLContextObj context = nullptr;

  Implementation() {
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
        pixelFormat == nullptr || count == 0) {
      throw std::runtime_error("cannot choose an accelerated OpenGL context");
    }
    if (CGLCreateContext(pixelFormat, nullptr, &context) != kCGLNoError ||
        context == nullptr) {
      throw std::runtime_error("cannot create the OpenGL context");
    }
    if (CGLSetCurrentContext(context) != kCGLNoError) {
      throw std::runtime_error("cannot activate the OpenGL context");
    }
  }

  ~Implementation() {
    CGLSetCurrentContext(nullptr);
    if (context != nullptr) {
      CGLDestroyContext(context);
    }
    if (pixelFormat != nullptr) {
      CGLDestroyPixelFormat(pixelFormat);
    }
  }
};

EffectTextureContext::EffectTextureContext()
    : implementation_(std::make_unique<Implementation>()) {}

EffectTextureContext::~EffectTextureContext() = default;

std::uint32_t EffectTextureContext::createTexture(
    int width, int height, const std::vector<std::uint8_t> &pixels) {
  GLuint texture = 0;
  glGenTextures(1, &texture);
  glBindTexture(GL_TEXTURE_2D, texture);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_BASE_LEVEL, 0);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, 0);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA,
               GL_UNSIGNED_BYTE, pixels.data());
  glBindTexture(GL_TEXTURE_2D, 0);
  if (texture == 0 || glGetError() != GL_NO_ERROR) {
    throw std::runtime_error("cannot create the segmentation input texture");
  }
  return texture;
}

void EffectTextureContext::deleteTextures(
    const std::vector<std::uint32_t> &textures) {
  glDeleteTextures(static_cast<GLsizei>(textures.size()), textures.data());
}

void EffectTextureContext::setUnpackAlignment(int alignment) {
  glPixelStorei(GL_UNPACK_ALIGNMENT, alignment);
}

void EffectTextureContext::updateTexture(
    std::uint32_t texture, int width, int height,
    const std::vector<std::uint8_t> &pixels) {
  glBindTexture(GL_TEXTURE_2D, texture);
  glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, width, height, GL_RGBA,
                  GL_UNSIGNED_BYTE, pixels.data());
  glBindTexture(GL_TEXTURE_2D, 0);
  if (glGetError() != GL_NO_ERROR) {
    throw std::runtime_error("cannot update the segmentation input texture");
  }
}

} // namespace qcut::matting
