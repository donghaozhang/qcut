#include "alpha-resize.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <vector>

int main() {
  const std::vector<std::uint8_t> source{0, 64, 128, 255};
  assert(qcut::matting::resizeAlphaBilinear(source, 2, 2, 2, 2) == source);

  const auto resized =
      qcut::matting::resizeAlphaBilinear(source, 2, 2, 4, 4);
  assert(resized.size() == 16);
  assert(resized.front() == 0);
  assert(resized.back() == 255);

  bool rejected = false;
  try {
    static_cast<void>(qcut::matting::resizeAlphaBilinear(source, 3, 2, 4, 4));
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  assert(rejected);
  return 0;
}
