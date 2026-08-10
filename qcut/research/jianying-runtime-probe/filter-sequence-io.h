#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <span>
#include <string>
#include <vector>

namespace jianying_probe {

struct UpdateModePass {
  std::vector<int> modes;
};

struct FilterSequenceStep {
  std::filesystem::path inputPath;
  std::vector<UpdateModePass> renderPasses;
  std::string resetAction;
};

[[nodiscard]] std::vector<FilterSequenceStep> readFilterManifest(
    const std::filesystem::path& path);
[[nodiscard]] std::vector<std::uint8_t> readRgbaFrame(
    const std::filesystem::path& path, std::size_t expectedBytes);
void convertBgraToRgba(std::span<std::uint8_t> pixels);
void writeRgbaFrame(const std::filesystem::path& path,
                    std::span<const std::uint8_t> pixels);

}  // namespace jianying_probe
