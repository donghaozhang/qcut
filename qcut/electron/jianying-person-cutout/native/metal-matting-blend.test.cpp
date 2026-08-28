#include "metal-matting-blend.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace {

template <typename Operation> void expectRuntimeError(Operation operation) {
  bool threw = false;
  try {
    operation();
  } catch (const std::runtime_error &) {
    threw = true;
  }
  assert(threw);
}

std::vector<std::uint8_t> makeRgba(std::size_t pixelCount) {
  std::vector<std::uint8_t> rgba(pixelCount * 4U, 127);
  for (std::size_t index = 0; index < pixelCount; ++index) {
    rgba[index * 4U + 3U] = static_cast<std::uint8_t>((index * 37U) % 256U);
  }
  return rgba;
}

} // namespace

int main() {
  using qcut::matting::MetalMattingBlendFrame;
  using qcut::matting::detail::clampMetalMattingBlendAlphaToSource;
  using qcut::matting::detail::extractMetalMattingBlendAlpha;
  using qcut::matting::detail::validateMetalMattingBlendFrame;

  auto source = makeRgba(16);
  const std::vector<std::uint8_t> lowResolutionAlpha = {0, 64, 128, 255};
  const MetalMattingBlendFrame lowResolutionFrame = {
      .rgba = source,
      .alpha = lowResolutionAlpha,
      .alphaWidth = 2,
      .alphaHeight = 2,
  };
  validateMetalMattingBlendFrame(lowResolutionFrame, 4, 4);

  auto blended = source;
  for (std::size_t index = 0; index < 16; ++index) {
    blended[index * 4U + 3U] = source[index * 4U + 3U] / 2U;
  }
  const auto extracted =
      extractMetalMattingBlendAlpha(lowResolutionFrame, blended, 4, 4);
  assert(extracted.size() == 16);
  assert(extracted.front() == 0);

  blended[4U + 3U] = static_cast<std::uint8_t>(source[4U + 3U] + 1U);
  expectRuntimeError([&] {
    extractMetalMattingBlendAlpha(lowResolutionFrame, blended, 4, 4);
  });

  const std::vector<std::uint8_t> malformedAlpha = {0, 1, 2};
  const MetalMattingBlendFrame malformedFrame = {
      .rgba = source,
      .alpha = malformedAlpha,
      .alphaWidth = 2,
      .alphaHeight = 2,
  };
  expectRuntimeError(
      [&] { validateMetalMattingBlendFrame(malformedFrame, 4, 4); });
  expectRuntimeError(
      [&] { validateMetalMattingBlendFrame(lowResolutionFrame, 0, 4); });

  std::vector<std::uint8_t> sameSizeSource = {
      10, 20, 30, 255,
      40, 50, 60, 100,
  };
  const std::vector<std::uint8_t> sameSizeAlpha = {128, 255};
  const MetalMattingBlendFrame sameSizeFrame = {
      .rgba = sameSizeSource,
      .alpha = sameSizeAlpha,
      .alphaWidth = 2,
      .alphaHeight = 1,
  };
  std::vector<std::uint8_t> sameSizeBlended = sameSizeSource;
  sameSizeBlended[3] = 128;
  sameSizeBlended[7] = 100;
  const std::vector<std::uint8_t> expectedSameSizeAlpha = {128, 100};
  assert(extractMetalMattingBlendAlpha(sameSizeFrame, sameSizeBlended, 2, 1) ==
         expectedSameSizeAlpha);
  sameSizeBlended[7] = 99;
  expectRuntimeError([&] {
    extractMetalMattingBlendAlpha(sameSizeFrame, sameSizeBlended, 2, 1);
  });

  std::vector<std::uint8_t> refinedAlpha(16, 255);
  clampMetalMattingBlendAlphaToSource(source, refinedAlpha);
  for (std::size_t index = 0; index < refinedAlpha.size(); ++index) {
    assert(refinedAlpha[index] == source[index * 4U + 3U]);
  }
  std::vector<std::uint8_t> invalidRefinedAlpha(15, 255);
  expectRuntimeError(
      [&] { clampMetalMattingBlendAlphaToSource(source, invalidRefinedAlpha); });
  return 0;
}
