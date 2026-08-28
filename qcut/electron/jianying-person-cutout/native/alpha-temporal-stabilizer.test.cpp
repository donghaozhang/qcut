#include "alpha-temporal-stabilizer.hpp"

#include <cassert>
#include <cstdint>
#include <vector>

namespace {

std::vector<std::uint8_t> solidRgba(std::uint8_t value) {
  return std::vector<std::uint8_t>{value, value, value, 255};
}

std::vector<std::uint8_t> objectFrame(int width, int height, int left,
                                      int top, int right, int bottom) {
  std::vector<std::uint8_t> rgba(static_cast<std::size_t>(width) * height * 4,
                                 20);
  for (std::size_t offset = 3; offset < rgba.size(); offset += 4) {
    rgba[offset] = 255;
  }
  for (int y = top; y <= bottom; ++y) {
    for (int x = left; x <= right; ++x) {
      const auto offset = (static_cast<std::size_t>(y) * width + x) * 4;
      rgba[offset] = 90;
      rgba[offset + 1] = 110;
      rgba[offset + 2] = 130;
    }
  }
  return rgba;
}

std::vector<std::uint8_t> objectAlpha(int width, int height, int left,
                                      int top, int right, int bottom) {
  std::vector<std::uint8_t> alpha(static_cast<std::size_t>(width) * height);
  for (int y = top; y <= bottom; ++y) {
    for (int x = left; x <= right; ++x) {
      alpha[static_cast<std::size_t>(y) * width + x] = 255;
    }
  }
  return alpha;
}

qcut::matting::TemporalForegroundFrameView
view(const std::vector<std::uint8_t> &rgba,
     const std::vector<std::uint8_t> &alpha, int frameOffset) {
  return {.rgba = &rgba, .alpha = &alpha, .frameOffset = frameOffset};
}

} // namespace

int main() {
  const auto stableColor = solidRgba(80);
  const std::vector<std::uint8_t> solidAlpha{255};
  const std::vector<std::uint8_t> droppedAlpha{100};
  const std::vector<std::uint8_t> backgroundAlpha{0};

  assert(qcut::matting::stabilizeTemporalForeground(
             {view(stableColor, solidAlpha, -1),
              view(stableColor, droppedAlpha, 0)},
             1, 1)[0] >= 250);
  assert(qcut::matting::stabilizeTemporalForeground(
             {view(stableColor, droppedAlpha, 0),
              view(stableColor, solidAlpha, 1)},
             1, 1)[0] >= 250);

  const auto changedColor = solidRgba(220);
  assert(qcut::matting::stabilizeTemporalForeground(
             {view(stableColor, solidAlpha, -1),
              view(changedColor, droppedAlpha, 0)},
             1, 1)[0] == 100);
  assert(qcut::matting::stabilizeTemporalForeground(
             {view(stableColor, solidAlpha, -1),
              view(stableColor, backgroundAlpha, 0)},
             1, 1)[0] == 0);

  const std::vector<std::uint8_t> interiorRgba(9 * 9 * 4, 80);
  const std::vector<std::uint8_t> softInteriorAlpha(9 * 9, 100);
  const auto solidInterior = qcut::matting::stabilizeTemporalForeground(
      {view(interiorRgba, softInteriorAlpha, 0)}, 9, 9);
  assert(solidInterior[4 * 9 + 4] == 244);
  assert(solidInterior[0] == 100);

  constexpr int motionWidth = 13;
  constexpr int motionHeight = 9;
  const auto previousRgba =
      objectFrame(motionWidth, motionHeight, 2, 2, 6, 6);
  const auto targetRgba =
      objectFrame(motionWidth, motionHeight, 4, 2, 8, 6);
  const auto futureRgba =
      objectFrame(motionWidth, motionHeight, 6, 2, 10, 6);
  const auto previousAlpha =
      objectAlpha(motionWidth, motionHeight, 2, 2, 6, 6);
  auto targetAlpha = objectAlpha(motionWidth, motionHeight, 4, 2, 8, 6);
  const auto futureAlpha =
      objectAlpha(motionWidth, motionHeight, 6, 2, 10, 6);
  const auto missingInteriorIndex = static_cast<std::size_t>(4) * motionWidth + 6;
  targetAlpha[missingInteriorIndex] = 0;
  const qcut::matting::TemporalForegroundConfig motionConfig{
      .interiorRadius = 0,
      .maximumMotionPixels = 4,
      .motionRefinementRadius = 0,
      .motionSampleStride = 1,
      .referenceInteriorRadius = 1,
      .minimumZeroAlphaReferences = 2,
  };
  const auto motionStabilized = qcut::matting::stabilizeTemporalForeground(
      {view(previousRgba, previousAlpha, -1),
       view(targetRgba, targetAlpha, 0),
       view(futureRgba, futureAlpha, 1)},
      motionWidth, motionHeight, motionConfig);
  assert(motionStabilized[missingInteriorIndex] >= 250);
  assert(motionStabilized[static_cast<std::size_t>(4) * motionWidth + 3] == 0);

  auto noMotionConfig = motionConfig;
  noMotionConfig.maximumMotionPixels = 0;
  assert(qcut::matting::stabilizeTemporalForeground(
             {view(previousRgba, previousAlpha, -1),
              view(targetRgba, targetAlpha, 0),
              view(futureRgba, futureAlpha, 1)},
             motionWidth, motionHeight, noMotionConfig)[missingInteriorIndex] ==
         0);
  return 0;
}
