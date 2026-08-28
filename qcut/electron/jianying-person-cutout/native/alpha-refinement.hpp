#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

std::vector<std::uint8_t> applyJianyingPortraitBorderLut(
    const std::vector<std::uint8_t> &input);

std::vector<std::uint8_t>
refineAlpha(const std::vector<std::uint8_t> &input,
            std::vector<float> &temporalState, int width, int height,
            float threshold, float temporalSmoothing, float edgeShift,
            float feather);

} // namespace qcut::matting
