#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

struct PersonAlphaFusionConfig {
  float visionConfidenceMultiplier = 2.0F;
};

std::vector<std::uint8_t> fusePersonAlpha(
    const std::vector<std::uint8_t> &portraitAlpha,
    const std::vector<std::uint8_t> &visionAlpha,
    PersonAlphaFusionConfig config = {});

} // namespace qcut::matting
