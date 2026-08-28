#include "alpha-resize.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <utility>
#include <vector>

int main() {
  const std::vector<std::uint8_t> source{0, 64, 128, 255};
  assert(qcut::matting::resizeAlphaBilinear(source, 2, 2, 2, 2) == source);

  std::uint32_t state = 0x9e3779b9U;
  for (const auto &[width, height] :
       std::vector<std::pair<int, int>>{
           {1, 1}, {3, 5}, {17, 9}, {64, 33}, {360, 640}}) {
    std::vector<std::uint8_t> sameSize(
        static_cast<std::size_t>(width) * height);
    for (auto &value : sameSize) {
      state = state * 1'664'525U + 1'013'904'223U;
      value = static_cast<std::uint8_t>(state >> 24U);
    }
    assert(qcut::matting::resizeAlphaBilinear(sameSize, width, height, width,
                                               height) == sameSize);
  }

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
