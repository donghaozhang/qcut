#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

std::vector<std::uint8_t>
resizeAlphaBilinear(const std::vector<std::uint8_t> &source, int sourceWidth,
                    int sourceHeight, int targetWidth, int targetHeight);

} // namespace qcut::matting
