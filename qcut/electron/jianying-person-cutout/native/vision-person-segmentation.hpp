#pragma once

#include <cstdint>
#include <memory>
#include <vector>

namespace qcut::matting {

class VisionPersonSegmentation {
public:
  VisionPersonSegmentation(int width, int height);
  ~VisionPersonSegmentation();

  VisionPersonSegmentation(const VisionPersonSegmentation &) = delete;
  VisionPersonSegmentation &operator=(const VisionPersonSegmentation &) = delete;
  VisionPersonSegmentation(VisionPersonSegmentation &&) noexcept;
  VisionPersonSegmentation &operator=(VisionPersonSegmentation &&) noexcept;

  std::vector<std::uint8_t>
  segment(const std::vector<std::uint8_t> &rgba) const;

private:
  class Implementation;
  std::unique_ptr<Implementation> implementation;
};

} // namespace qcut::matting
