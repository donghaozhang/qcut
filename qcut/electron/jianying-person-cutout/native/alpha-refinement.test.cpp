#include "alpha-refinement.hpp"

#include <cassert>
#include <cstdint>
#include <vector>

int main() {
  const auto jianyingBorder = qcut::matting::applyJianyingPortraitBorderLut(
      {0, 64, 96, 112, 115, 116, 117, 128, 155, 165, 166, 167, 192, 214,
       215, 216, 224, 255});
  assert(jianyingBorder ==
         std::vector<std::uint8_t>({0, 0, 0, 0, 0, 0, 0, 9, 85, 124, 128,
                                    132, 221, 254, 254, 255, 255, 255}));

  std::vector<float> temporalState;
  const std::vector<std::uint8_t> source = {0, 64, 128, 255};
  const auto unchanged = qcut::matting::refineAlpha(
      source, temporalState, 2, 2, 0.5F, 0.0F, 0.0F, 0.0F);
  assert(unchanged == source);

  temporalState.clear();
  const auto shifted = qcut::matting::refineAlpha(
      source, temporalState, 2, 2, 0.7F, 0.0F, 0.0F, 2.0F);
  assert(shifted[2] < source[2]);
  assert(shifted[3] == 255);

  temporalState.clear();
  const auto first = qcut::matting::refineAlpha(
      {255}, temporalState, 1, 1, 0.5F, 0.5F, 0.0F, 0.0F);
  const auto second = qcut::matting::refineAlpha(
      {0}, temporalState, 1, 1, 0.5F, 0.5F, 0.0F, 0.0F);
  assert(first[0] == 255);
  assert(second[0] == 128);
}
