#pragma once

#include "image.hpp"

#include <filesystem>

namespace softglow {

Image read_raw(const std::filesystem::path& path, int width, int height);
void write_raw(const std::filesystem::path& path, const Image& image);
void write_ppm(const std::filesystem::path& path, const Image& image);
Image test_chart(int width = 320, int height = 180);

} // namespace softglow
