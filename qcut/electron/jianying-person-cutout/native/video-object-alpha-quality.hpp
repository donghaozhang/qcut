#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

const char *videoObjectAlphaQualityCapability();

class VideoObjectAlphaQualityGate {
public:
  void observe(const std::vector<std::uint8_t> &alpha);
  void finalize() const;

private:
  bool hasObservedUsableAlpha_ = false;
  bool hasObservedQuantizedNoise_ = false;
};

} // namespace qcut::matting
