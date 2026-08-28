#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

void requireCalibratedVideoObjectAlpha(
    const std::vector<std::uint8_t> &alpha);

} // namespace qcut::matting
