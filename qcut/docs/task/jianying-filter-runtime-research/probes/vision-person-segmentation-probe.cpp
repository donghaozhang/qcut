#include "vision-person-segmentation.hpp"

#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

int positiveInteger(const char *value, const char *label) {
  const int parsed = std::stoi(value);
  if (parsed <= 0) {
    throw std::invalid_argument(std::string(label) + " must be positive");
  }
  return parsed;
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 5) {
    std::cerr << "usage: vision-person-segmentation-probe <input.rgba> "
                 "<width> <height> <output.gray>\n";
    return 2;
  }
  try {
    const int width = positiveInteger(argv[2], "width");
    const int height = positiveInteger(argv[3], "height");
    const auto frameBytes = static_cast<std::size_t>(width) * height * 4;
    std::ifstream input(argv[1], std::ios::binary | std::ios::ate);
    if (!input) {
      throw std::runtime_error("cannot open input");
    }
    const auto inputBytes = input.tellg();
    if (inputBytes <= 0 ||
        static_cast<std::size_t>(inputBytes) % frameBytes != 0) {
      throw std::runtime_error("input does not contain complete RGBA frames");
    }
    const auto frameCount = static_cast<std::size_t>(inputBytes) / frameBytes;
    input.seekg(0);
    std::ofstream output(argv[4], std::ios::binary);
    if (!output) {
      throw std::runtime_error("cannot open output");
    }

    qcut::matting::VisionPersonSegmentation segmentation(width, height);
    std::vector<std::uint8_t> rgba(frameBytes);
    for (std::size_t frame = 0; frame < frameCount; ++frame) {
      input.read(reinterpret_cast<char *>(rgba.data()),
                 static_cast<std::streamsize>(rgba.size()));
      if (static_cast<std::size_t>(input.gcount()) != rgba.size()) {
        throw std::runtime_error("input ended with an incomplete frame");
      }
      const auto alpha = segmentation.segment(rgba);
      output.write(reinterpret_cast<const char *>(alpha.data()),
                   static_cast<std::streamsize>(alpha.size()));
      if (!output) {
        throw std::runtime_error("cannot write output");
      }
      std::cerr << "progress frame=" << frame + 1 << " total=" << frameCount
                << '\n';
    }
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
