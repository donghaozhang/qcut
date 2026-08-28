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

  std::vector<std::uint8_t> composed{255, 128, 64};
  qcut::matting::composeSourceAlphaInPlace(
      std::vector<std::uint8_t>{
          10, 20, 30, 255,
          40, 50, 60, 128,
          70, 80, 90, 0,
      },
      composed);
  assert((composed == std::vector<std::uint8_t>{255, 64, 0}));

  bool rejected = false;
  try {
    static_cast<void>(qcut::matting::fusePersonAlpha(
        std::vector<std::uint8_t>{0}, std::vector<std::uint8_t>{0, 1}));
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  assert(rejected);

  rejected = false;
  try {
    std::vector<std::uint8_t> alpha{255};
    qcut::matting::composeSourceAlphaInPlace(
        std::vector<std::uint8_t>{0, 0, 0}, alpha);
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  assert(rejected);
  return 0;
}
