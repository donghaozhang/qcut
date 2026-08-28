#include "vision-person-segmentation.hpp"

#include <cassert>
#include <cstdint>
#include <vector>

int main() {
  constexpr int width = 64;
  constexpr int height = 64;
  std::vector<std::uint8_t> rgba(
      static_cast<std::size_t>(width) * height * 4, 0);
  for (std::size_t offset = 3; offset < rgba.size(); offset += 4) {
    rgba[offset] = 255;
  }
  qcut::matting::VisionPersonSegmentation segmentation(width, height);
  const auto alpha = segmentation.segment(rgba);
  assert(alpha.size() == static_cast<std::size_t>(width) * height);
  return 0;
}
