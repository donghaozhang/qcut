#include "alpha-mask-fusion.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <vector>

int main() {
  const auto fused = qcut::matting::fusePersonAlpha(
      std::vector<std::uint8_t>{0, 40, 180, 255},
      std::vector<std::uint8_t>{20, 80, 120, 200});
  assert((fused == std::vector<std::uint8_t>{40, 160, 240, 255}));

  bool rejected = false;
  try {
    static_cast<void>(qcut::matting::fusePersonAlpha(
        std::vector<std::uint8_t>{0}, std::vector<std::uint8_t>{0, 1}));
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  assert(rejected);
  return 0;
}
