#include "video-object-alpha-quality.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::string observeError(
    qcut::matting::VideoObjectAlphaQualityGate &qualityGate,
    const std::vector<std::uint8_t> &alpha) {
  try {
    qualityGate.observe(alpha);
  } catch (const std::runtime_error &error) {
    return error.what();
  }
  return {};
}

std::string finalizeError(
    const qcut::matting::VideoObjectAlphaQualityGate &qualityGate) {
  try {
    qualityGate.finalize();
  } catch (const std::runtime_error &error) {
    return error.what();
  }
  return {};
}

} // namespace

int main() {
  qcut::matting::VideoObjectAlphaQualityGate hostlessGate;
  assert(observeError(hostlessGate, {0, 1, 2, 2, 1, 0}).empty());
  assert(observeError(hostlessGate, {0, 0, 1, 2}).empty());
  assert(observeError(hostlessGate, {2, 1, 0, 2}).empty());
  const auto confirmedHostlessError = finalizeError(hostlessGate);
  assert(confirmedHostlessError.find(
             qcut::matting::videoObjectAlphaQualityCapability()) !=
         std::string::npos);

  qcut::matting::VideoObjectAlphaQualityGate prefixEmptyThenUsableGate;
  for (int frame = 0; frame < 120; ++frame) {
    assert(observeError(prefixEmptyThenUsableGate, {0, 0, 0, 0}).empty());
  }
  assert(observeError(prefixEmptyThenUsableGate, {0, 3, 255, 127}).empty());
  assert(finalizeError(prefixEmptyThenUsableGate).empty());

  qcut::matting::VideoObjectAlphaQualityGate allZeroGate;
  for (int frame = 0; frame < 120; ++frame) {
    assert(observeError(allZeroGate, {0, 0, 0, 0}).empty());
  }
  assert(finalizeError(allZeroGate).empty());

  qcut::matting::VideoObjectAlphaQualityGate noiseThenUsableGate;
  assert(observeError(noiseThenUsableGate, {0, 1, 2}).empty());
  assert(observeError(noiseThenUsableGate, {0, 4, 0}).empty());
  assert(observeError(noiseThenUsableGate, {0, 1, 2}).empty());
  assert(finalizeError(noiseThenUsableGate).empty());

  qcut::matting::VideoObjectAlphaQualityGate emptyGate;
  const auto emptyError = observeError(emptyGate, {});
  assert(!emptyError.empty());
  assert(emptyError.find(qcut::matting::videoObjectAlphaQualityCapability()) ==
         std::string::npos);
  return 0;
}
