#include "alpha-mask-fusion.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace qcut::matting {

std::vector<std::uint8_t>
fusePersonAlpha(const std::vector<std::uint8_t> &portraitAlpha,
                const std::vector<std::uint8_t> &visionAlpha,
                PersonAlphaFusionConfig config) {
  if (portraitAlpha.empty() || portraitAlpha.size() != visionAlpha.size() ||
      !std::isfinite(config.visionConfidenceMultiplier) ||
      config.visionConfidenceMultiplier <= 0.0F) {
    throw std::invalid_argument("invalid person alpha fusion input");
  }
  std::vector<std::uint8_t> fused(portraitAlpha.size());
  for (std::size_t index = 0; index < portraitAlpha.size(); ++index) {
    const auto boostedVision = static_cast<std::uint8_t>(std::min(
        255.0F, std::round(visionAlpha[index] *
                           config.visionConfidenceMultiplier)));
    fused[index] = std::max(portraitAlpha[index], boostedVision);
  }
  return fused;
}

void composeSourceAlphaInPlace(const std::vector<std::uint8_t> &rgba,
                               std::vector<std::uint8_t> &matteAlpha) {
  if (matteAlpha.empty() || rgba.size() != matteAlpha.size() * 4U) {
    throw std::invalid_argument("invalid source alpha composition input");
  }
  for (std::size_t index = 0; index < matteAlpha.size(); ++index) {
    const auto sourceAlpha = static_cast<unsigned int>(rgba[index * 4U + 3U]);
    const auto matte = static_cast<unsigned int>(matteAlpha[index]);
    matteAlpha[index] = static_cast<std::uint8_t>(
        (sourceAlpha * matte + 127U) / 255U);
  }
}

} // namespace qcut::matting
