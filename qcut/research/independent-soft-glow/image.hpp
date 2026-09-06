#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string_view>
#include <vector>

namespace softglow {

using Pixel = std::array<float, 4>;

struct Image {
    int width;
    int height;
    std::vector<Pixel> pixels;

    Image(int width, int height, Pixel fill = {0, 0, 0, 1});
    Pixel& at(int x, int y);
    const Pixel& at(int x, int y) const;
};

enum class Border { clamp, mirror, transparent };

struct SampleRequest {
    const Image& image;
    float u;
    float v;
    Border border = Border::clamp;
};

using StageSink = std::function<void(std::string_view, const Image&)>;

float saturate(float value);
Pixel rgba8(Pixel value);
Pixel sample(const SampleRequest& request);
Image resize(const Image& source, int width, int height, Border border = Border::clamp);
Image from_rgba8(const std::vector<std::uint8_t>& bytes, int width, int height);
std::vector<std::uint8_t> to_rgba8(const Image& image);
void validate_image(const Image& image);

} // namespace softglow
