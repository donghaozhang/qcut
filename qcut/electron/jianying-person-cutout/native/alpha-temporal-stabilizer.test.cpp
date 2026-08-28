#include "alpha-temporal-stabilizer.hpp"

#include <algorithm>
#include <cassert>
#include <cmath>
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

std::vector<std::uint8_t>
expectedNoMotionAlpha(const std::vector<std::uint8_t> &target,
                      const std::vector<const std::vector<std::uint8_t> *>
                          &references,
                      const std::vector<int> &frameOffsets,
                      float decayPerFrame) {
  auto expected = target;
  for (std::size_t index = 0; index < target.size(); ++index) {
    for (std::size_t referenceIndex = 0; referenceIndex < references.size();
         ++referenceIndex) {
      const auto referenceAlpha = (*references[referenceIndex])[index];
      if (referenceAlpha < 192 || referenceAlpha <= target[index] + 12) {
        continue;
      }
      const auto decay = std::pow(
          decayPerFrame,
          static_cast<float>(std::abs(frameOffsets[referenceIndex])));
      const auto carried = static_cast<std::uint8_t>(
          std::round(static_cast<float>(referenceAlpha) * decay));
      expected[index] = std::max(expected[index], carried);
    }
  }
  return expected;
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

  constexpr int randomizedWidth = 257;
  const std::vector<std::uint8_t> randomizedRgba(randomizedWidth * 4, 80);
  std::vector<std::uint8_t> randomizedTarget(randomizedWidth);
  std::vector<std::uint8_t> referenceMinusFive(randomizedWidth);
  std::vector<std::uint8_t> referenceMinusTwo(randomizedWidth);
  std::vector<std::uint8_t> referencePlusOne(randomizedWidth);
  std::vector<std::uint8_t> referencePlusThree(randomizedWidth);
  std::uint32_t randomState = 0x243f6a88U;
  const auto nextRandom = [&randomState]() {
    randomState = randomState * 1'664'525U + 1'013'904'223U;
    return static_cast<std::uint8_t>(randomState >> 24U);
  };
  for (std::size_t index = 0; index < randomizedTarget.size(); ++index) {
    randomizedTarget[index] =
        static_cast<std::uint8_t>(48 + nextRandom() % 144);
    referenceMinusFive[index] =
        static_cast<std::uint8_t>(192 + nextRandom() % 64);
    referenceMinusTwo[index] =
        static_cast<std::uint8_t>(192 + nextRandom() % 64);
    referencePlusOne[index] =
        static_cast<std::uint8_t>(192 + nextRandom() % 64);
    referencePlusThree[index] =
        static_cast<std::uint8_t>(192 + nextRandom() % 64);
  }
  const qcut::matting::TemporalForegroundConfig randomizedConfig{
      .decayPerFrame = 0.973F,
      .interiorRadius = 0,
      .maximumMotionPixels = 0,
      .motionRefinementRadius = 64,
  };
  const std::vector<const std::vector<std::uint8_t> *> references{
      &referenceMinusFive,
      &referenceMinusTwo,
      &referencePlusOne,
      &referencePlusThree,
  };
  const std::vector<int> referenceOffsets{-5, -2, 1, 3};
  const auto expectedRandomized = expectedNoMotionAlpha(
      randomizedTarget, references, referenceOffsets,
      randomizedConfig.decayPerFrame);
  const auto stabilizedRandomized =
      qcut::matting::stabilizeTemporalForeground(
          {view(randomizedRgba, referenceMinusFive, -5),
           view(randomizedRgba, referenceMinusTwo, -2),
           view(randomizedRgba, randomizedTarget, 0),
           view(randomizedRgba, referencePlusOne, 1),
           view(randomizedRgba, referencePlusThree, 3)},
          randomizedWidth, 1, randomizedConfig);
  assert(stabilizedRandomized == expectedRandomized);
  return 0;
}
