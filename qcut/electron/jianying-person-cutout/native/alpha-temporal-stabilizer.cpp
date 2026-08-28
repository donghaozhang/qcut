#include "alpha-temporal-stabilizer.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <stdexcept>

namespace qcut::matting {
namespace {

struct MotionTranslation {
  int x = 0;
  int y = 0;
};

struct ForegroundCentroid {
  double x = 0.0;
  double y = 0.0;
  double weight = 0.0;
};

struct RegisteredFrame {
  const TemporalForegroundFrameView *frame;
  MotionTranslation translation;
  float alphaDecay;
};

int colorDistance(const std::vector<std::uint8_t> &first,
                  const std::vector<std::uint8_t> &second,
                  std::size_t firstPixelIndex,
                  std::size_t secondPixelIndex) {
  const auto firstOffset = firstPixelIndex * 4;
  const auto secondOffset = secondPixelIndex * 4;
  int distance = 0;
  for (std::size_t channel = 0; channel < 3; ++channel) {
    distance += std::abs(static_cast<int>(first[firstOffset + channel]) -
                         static_cast<int>(second[secondOffset + channel]));
  }
  return distance / 3;
}

const TemporalForegroundFrameView &
targetFrame(const std::vector<TemporalForegroundFrameView> &frames) {
  const auto target = std::find_if(
      frames.begin(), frames.end(),
      [](const auto &frame) { return frame.frameOffset == 0; });
  if (target == frames.end()) {
    throw std::invalid_argument("temporal window has no target frame");
  }
  return *target;
}

ForegroundCentroid foregroundCentroid(
    const std::vector<std::uint8_t> &alpha, int width, int height,
    const TemporalForegroundConfig &config) {
  ForegroundCentroid centroid;
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const auto index = static_cast<std::size_t>(y) * width + x;
      if (alpha[index] < config.minimumReferenceAlpha) {
        continue;
      }
      const double weight = static_cast<double>(alpha[index]);
      centroid.x += static_cast<double>(x) * weight;
      centroid.y += static_cast<double>(y) * weight;
      centroid.weight += weight;
    }
  }
  if (centroid.weight > 0.0) {
    centroid.x /= centroid.weight;
    centroid.y /= centroid.weight;
  }
  return centroid;
}

bool translatedPixelIndex(int x, int y, MotionTranslation translation,
                          int width, int height, std::size_t *index) {
  const int candidateX = x - translation.x;
  const int candidateY = y - translation.y;
  if (candidateX < 0 || candidateY < 0 || candidateX >= width ||
      candidateY >= height) {
    return false;
  }
  *index = static_cast<std::size_t>(candidateY) * width + candidateX;
  return true;
}

double translationScore(
    const TemporalForegroundFrameView &target,
    const TemporalForegroundFrameView &candidate,
    MotionTranslation translation, MotionTranslation centroidTranslation,
    int width, int height, const TemporalForegroundConfig &config) {
  std::uint64_t colorDistanceSum = 0;
  std::size_t sampleCount = 0;
  const int stride = config.motionSampleStride;
  for (int y = stride / 2; y < height; y += stride) {
    for (int x = stride / 2; x < width; x += stride) {
      const auto targetIndex = static_cast<std::size_t>(y) * width + x;
      if ((*target.alpha)[targetIndex] < config.minimumReferenceAlpha) {
        continue;
      }
      std::size_t candidateIndex = 0;
      if (!translatedPixelIndex(x, y, translation, width, height,
                                &candidateIndex) ||
          (*candidate.alpha)[candidateIndex] <
              config.minimumReferenceAlpha) {
        continue;
      }
      colorDistanceSum += colorDistance(*target.rgba, *candidate.rgba,
                                        targetIndex, candidateIndex);
      sampleCount += 1;
    }
  }
  if (sampleCount == 0) {
    return std::numeric_limits<double>::infinity();
  }
  const int refinementDistance =
      std::abs(translation.x - centroidTranslation.x) +
      std::abs(translation.y - centroidTranslation.y);
  return static_cast<double>(colorDistanceSum) / sampleCount +
         static_cast<double>(refinementDistance);
}

MotionTranslation estimateTranslation(
    const TemporalForegroundFrameView &target,
    const TemporalForegroundFrameView &candidate, int width, int height,
    const TemporalForegroundConfig &config) {
  if (config.maximumMotionPixels == 0) {
    return {};
  }
  const auto targetCentroid =
      foregroundCentroid(*target.alpha, width, height, config);
  const auto candidateCentroid =
      foregroundCentroid(*candidate.alpha, width, height, config);
  if (targetCentroid.weight == 0.0 || candidateCentroid.weight == 0.0) {
    return {};
  }
  const MotionTranslation centroidTranslation{
      .x = std::clamp(
          static_cast<int>(std::lround(targetCentroid.x - candidateCentroid.x)),
          -config.maximumMotionPixels, config.maximumMotionPixels),
      .y = std::clamp(
          static_cast<int>(std::lround(targetCentroid.y - candidateCentroid.y)),
          -config.maximumMotionPixels, config.maximumMotionPixels),
  };
  MotionTranslation best = centroidTranslation;
  double bestScore = translationScore(target, candidate, best,
                                      centroidTranslation, width, height,
                                      config);
  for (int offsetY = -config.motionRefinementRadius;
       offsetY <= config.motionRefinementRadius; ++offsetY) {
    for (int offsetX = -config.motionRefinementRadius;
         offsetX <= config.motionRefinementRadius; ++offsetX) {
      const MotionTranslation candidateTranslation{
          .x = std::clamp(centroidTranslation.x + offsetX,
                          -config.maximumMotionPixels,
                          config.maximumMotionPixels),
          .y = std::clamp(centroidTranslation.y + offsetY,
                          -config.maximumMotionPixels,
                          config.maximumMotionPixels),
      };
      const double score =
          translationScore(target, candidate, candidateTranslation,
                           centroidTranslation, width, height, config);
      if (score >= bestScore) {
        continue;
      }
      best = candidateTranslation;
      bestScore = score;
    }
  }
  return best;
}

bool isReferenceInterior(const std::vector<std::uint8_t> &alpha, int x, int y,
                         int width, int height,
                         const TemporalForegroundConfig &config) {
  const int radius = config.referenceInteriorRadius;
  if (x < radius || y < radius || x + radius >= width ||
      y + radius >= height) {
    return false;
  }
  for (int sampleY = y - radius; sampleY <= y + radius; ++sampleY) {
    for (int sampleX = x - radius; sampleX <= x + radius; ++sampleX) {
      if (alpha[static_cast<std::size_t>(sampleY) * width + sampleX] <
          config.minimumReferenceAlpha) {
        return false;
      }
    }
  }
  return true;
}

void solidifyForegroundInterior(std::vector<std::uint8_t> &alpha, int width,
                                int height,
                                const TemporalForegroundConfig &config) {
  const int radius = config.interiorRadius;
  if (radius == 0 || width <= radius * 2 || height <= radius * 2) {
    return;
  }
  std::vector<std::uint8_t> horizontal(alpha.size(), 0);
  for (int y = 0; y < height; ++y) {
    for (int x = radius; x < width - radius; ++x) {
      bool supported = true;
      for (int sampleX = x - radius; sampleX <= x + radius; ++sampleX) {
        if (alpha[static_cast<std::size_t>(y) * width + sampleX] >=
            config.interiorSupportAlpha) {
          continue;
        }
        supported = false;
        break;
      }
      horizontal[static_cast<std::size_t>(y) * width + x] = supported ? 1 : 0;
    }
  }
  for (int y = radius; y < height - radius; ++y) {
    for (int x = radius; x < width - radius; ++x) {
      bool interior = true;
      for (int sampleY = y - radius; sampleY <= y + radius; ++sampleY) {
        if (horizontal[static_cast<std::size_t>(sampleY) * width + x] != 0) {
          continue;
        }
        interior = false;
        break;
      }
      if (!interior) {
        continue;
      }
      const auto index = static_cast<std::size_t>(y) * width + x;
      alpha[index] = std::max(alpha[index], config.interiorTargetAlpha);
    }
  }
}

} // namespace

std::vector<std::uint8_t> stabilizeTemporalForeground(
    const std::vector<TemporalForegroundFrameView> &frames, int width,
    int height, TemporalForegroundConfig config) {
  if (width <= 0 || height <= 0 || config.interiorRadius < 0 ||
      config.maximumMotionPixels < 0 || config.motionRefinementRadius < 0 ||
      config.motionSampleStride <= 0 || config.referenceInteriorRadius < 0 ||
      config.minimumZeroAlphaReferences <= 0 ||
      config.decayPerFrame <= 0.0F || config.decayPerFrame > 1.0F) {
    throw std::invalid_argument("invalid temporal foreground configuration");
  }
  const auto pixelCount = static_cast<std::size_t>(width) * height;
  for (const auto &frame : frames) {
    if (!frame.rgba || !frame.alpha || frame.rgba->size() != pixelCount * 4 ||
        frame.alpha->size() != pixelCount) {
      throw std::invalid_argument("frame dimensions do not match stabilizer");
    }
  }

  const auto &target = targetFrame(frames);
  std::vector<RegisteredFrame> registeredFrames;
  registeredFrames.reserve(frames.size());
  for (const auto &candidate : frames) {
    if (candidate.frameOffset == 0) {
      continue;
    }
    registeredFrames.push_back(RegisteredFrame{
        .frame = &candidate,
        .translation =
            estimateTranslation(target, candidate, width, height, config),
        .alphaDecay = std::pow(
            config.decayPerFrame,
            static_cast<float>(std::abs(candidate.frameOffset))),
    });
  }
  auto stabilized = *target.alpha;
  for (std::size_t index = 0; index < pixelCount; ++index) {
    const auto currentAlpha = (*target.alpha)[index];
    if (currentAlpha >= config.minimumReferenceAlpha) {
      continue;
    }
    if (currentAlpha < config.minimumCurrentAlpha &&
        config.maximumMotionPixels == 0) {
      continue;
    }

    std::uint8_t bestCarriedAlpha = currentAlpha;
    int referenceCount = 0;
    const int x = static_cast<int>(index % static_cast<std::size_t>(width));
    const int y = static_cast<int>(index / static_cast<std::size_t>(width));
    for (const auto &registered : registeredFrames) {
      std::size_t candidateIndex = 0;
      if (currentAlpha < config.minimumCurrentAlpha) {
        if (!translatedPixelIndex(x, y, registered.translation, width, height,
                                  &candidateIndex)) {
          continue;
        }
      } else {
        candidateIndex = index;
      }
      const auto &candidate = *registered.frame;
      const auto candidateAlpha = (*candidate.alpha)[candidateIndex];
      if (candidateAlpha < config.minimumReferenceAlpha ||
          candidateAlpha <= currentAlpha + 12) {
        continue;
      }
      const int candidateX = x - registered.translation.x;
      const int candidateY = y - registered.translation.y;
      if (currentAlpha < config.minimumCurrentAlpha &&
          !isReferenceInterior(*candidate.alpha, candidateX, candidateY, width,
                               height, config)) {
        continue;
      }
      const int frameDistance = std::abs(candidate.frameOffset);
      const int score = colorDistance(*target.rgba, *candidate.rgba, index,
                                      candidateIndex) +
                        frameDistance * 2;
      if (score > config.maximumColorDistance) {
        continue;
      }
      referenceCount += 1;
      const auto carried = static_cast<std::uint8_t>(std::round(
          static_cast<float>(candidateAlpha) * registered.alphaDecay));
      bestCarriedAlpha = std::max(bestCarriedAlpha, carried);
    }
    if (currentAlpha < config.minimumCurrentAlpha &&
        referenceCount < config.minimumZeroAlphaReferences) {
      continue;
    }
    stabilized[index] = bestCarriedAlpha;
  }
  solidifyForegroundInterior(stabilized, width, height, config);
  return stabilized;
}

} // namespace qcut::matting
