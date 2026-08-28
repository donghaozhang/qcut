#include "video-object-alpha-quality.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace {

bool rejects(const std::vector<std::uint8_t> &alpha) {
  try {
    qcut::matting::requireCalibratedVideoObjectAlpha(alpha);
    return false;
  } catch (const std::runtime_error &) {
    return true;
  }
}

} // namespace

int main() {
  assert(rejects({}));
  assert(rejects({0, 1, 2, 2, 1, 0}));
  assert(!rejects({0, 3, 255, 127}));
  return 0;
}
