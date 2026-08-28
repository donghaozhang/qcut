#include "video-object-coreml-preprocess.hpp"

#include <algorithm>
#include <cassert>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

int main() {
  using namespace qcut::matting;
  const std::vector<std::uint8_t> redPixel{255, 0, 0, 255};
  const auto input = prepareVideoObjectCoreMLInput(redPixel, 1, 1);
  constexpr std::size_t plane = 256 * 256;
  assert(input.size() == plane * 3);
  assert(std::all_of(input.begin(), input.begin() + plane,
                     [](float value) { return value == 0.0F; }));
  assert(std::all_of(input.begin() + plane, input.begin() + plane * 2,
                     [](float value) { return value == 0.0F; }));
  assert(std::all_of(input.begin() + plane * 2, input.end(),
                     [](float value) { return value == 1.0F; }));

  const std::vector<std::uint8_t> source{
      0,   10,  20,  255, 30,  40,  50,  255, 60,  70,  80,  255,
      90,  100, 110, 255, 120, 130, 140, 255, 150, 160, 170, 255,
  };
  const auto directResize =
      resizeVideoObjectRgbaBilinear(source, 3, 2, 256, 256);
  const auto directInput = prepareVideoObjectCoreMLInput(source, 3, 2);
  for (std::size_t pixel : {0UL, 127UL, plane - 1}) {
    assert(directInput[pixel] == directResize[pixel * 4 + 2] / 255.0F);
    assert(directInput[plane + pixel] ==
           directResize[pixel * 4 + 1] / 255.0F);
    assert(directInput[plane * 2 + pixel] ==
           directResize[pixel * 4] / 255.0F);
  }

  VideoObjectCoreMLTemporalState state;
  std::vector<float> image(state.kImageElementCount, 0.25F);
  std::vector<float> mask(state.kMaskElementCount, 0.75F);
  state.advance(image.data(), mask.data());
  assert(state.previousImage()[123] == 0.25F);
  assert(state.previousMask()[123] == 0.75F);
  state.reset();
  assert(state.previousImage()[123] == 0.0F);
  assert(state.previousMask()[123] == 0.0F);

  std::vector<float> whiteMask(plane, 1.0F);
  const auto output = finalizeVideoObjectCoreMLOutput(whiteMask.data(), 3, 5);
  assert(output.size() == 15);
  assert(std::all_of(output.begin(), output.end(),
                     [](std::uint8_t value) { return value == 255; }));

  std::vector<float> lowMask(plane);
  lowMask[0] = 1.0F / 255.0F;
  lowMask[1] = 2.0F / 255.0F;
  const auto lowOutput =
      finalizeVideoObjectCoreMLOutput(lowMask.data(), 256, 256);
  assert(lowOutput[0] == 1);
  assert(lowOutput[1] == 2);
  assert(lowOutput[2] == 0);

  lowMask[0] = std::numeric_limits<float>::quiet_NaN();
  bool rejectedNonFinite = false;
  try {
    static_cast<void>(
        finalizeVideoObjectCoreMLOutput(lowMask.data(), 256, 256));
  } catch (const std::runtime_error &) {
    rejectedNonFinite = true;
  }
  assert(rejectedNonFinite);
}
