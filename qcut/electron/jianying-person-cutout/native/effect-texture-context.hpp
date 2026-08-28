#pragma once

#include <cstdint>
#include <memory>
#include <vector>

namespace qcut::matting {

enum class EffectTextureContextMode {
  CreateStandalone,
  AdoptCurrent,
};

class EffectTextureContext {
public:
  explicit EffectTextureContext(
      EffectTextureContextMode mode =
          EffectTextureContextMode::CreateStandalone);
  ~EffectTextureContext();

  EffectTextureContext(const EffectTextureContext &) = delete;
  EffectTextureContext &operator=(const EffectTextureContext &) = delete;

  std::uint32_t createTexture(int width, int height,
                              const std::vector<std::uint8_t> &pixels);
  void deleteTextures(const std::vector<std::uint32_t> &textures);
  void setUnpackAlignment(int alignment);
  void updateTexture(std::uint32_t texture, int width, int height,
                     const std::vector<std::uint8_t> &pixels);

private:
  struct Implementation;
  std::unique_ptr<Implementation> implementation_;
};

} // namespace qcut::matting
