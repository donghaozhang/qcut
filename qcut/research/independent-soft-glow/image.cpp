#include "image.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace softglow {
namespace {

std::size_t pixel_count(int width, int height) {
    if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
        throw std::invalid_argument("image dimensions must be in [1, 16384]");
    }
    const auto count = static_cast<std::size_t>(width) * height;
    if (count > 64U * 1024U * 1024U) {
        throw std::invalid_argument("image exceeds 64 million pixels");
    }
    return count;
}

float wrap_coordinate(float coordinate, Border border) {
    if (!std::isfinite(coordinate)) {
        throw std::invalid_argument("sampling coordinate must be finite");
    }
    if (border == Border::mirror) {
        const float period = coordinate - 2 * std::floor(coordinate / 2);
        return period <= 1 ? period : 2 - period;
    }
    return std::clamp(coordinate, -1.0F, 2.0F);
}

Pixel fetch(const Image& image, int x, int y, Border border) {
    const bool outside = x < 0 || y < 0 || x >= image.width || y >= image.height;
    if (outside && border == Border::transparent) {
        return {0, 0, 0, 0};
    }
    return image.at(std::clamp(x, 0, image.width - 1), std::clamp(y, 0, image.height - 1));
}

} // namespace

Image::Image(int requested_width, int requested_height, Pixel fill)
    : width(requested_width), height(requested_height),
      pixels(pixel_count(width, height), fill) {}

Pixel& Image::at(int x, int y) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
        throw std::out_of_range("pixel coordinate outside image");
    }
    return pixels.at(static_cast<std::size_t>(y) * width + x);
}

const Pixel& Image::at(int x, int y) const {
    if (x < 0 || y < 0 || x >= width || y >= height) {
        throw std::out_of_range("pixel coordinate outside image");
    }
    return pixels.at(static_cast<std::size_t>(y) * width + x);
}

float saturate(float value) {
    if (!std::isfinite(value)) {
        throw std::invalid_argument("channel value must be finite");
    }
    return std::clamp(value, 0.0F, 1.0F);
}

Pixel rgba8(Pixel value) {
    for (auto& channel : value) {
        channel = std::round(saturate(channel) * 255.0F) / 255.0F;
    }
    return value;
}

Pixel sample(const SampleRequest& request) {
    const auto& [image, u, v, border] = request;
    if (image.pixels.size() != pixel_count(image.width, image.height)) {
        throw std::invalid_argument("sample image shape does not match dimensions");
    }
    if (border != Border::clamp && border != Border::mirror && border != Border::transparent) {
        throw std::invalid_argument("unknown sampler border mode");
    }
    const float x = wrap_coordinate(u, border) * image.width - 0.5F;
    const float y = wrap_coordinate(v, border) * image.height - 0.5F;
    const int left = static_cast<int>(std::floor(x));
    const int top = static_cast<int>(std::floor(y));
    const float horizontal = x - left;
    const float vertical = y - top;
    const Pixel upper_left = fetch(image, left, top, border);
    const Pixel upper_right = fetch(image, left + 1, top, border);
    const Pixel lower_left = fetch(image, left, top + 1, border);
    const Pixel lower_right = fetch(image, left + 1, top + 1, border);
    Pixel result{};
    for (std::size_t channel = 0; channel < result.size(); ++channel) {
        const float upper = std::lerp(upper_left[channel], upper_right[channel], horizontal);
        const float lower = std::lerp(lower_left[channel], lower_right[channel], horizontal);
        result[channel] = std::lerp(upper, lower, vertical);
    }
    return result;
}

void validate_image(const Image& image) {
    if (image.pixels.size() != pixel_count(image.width, image.height)) {
        throw std::invalid_argument("pixel count does not match dimensions");
    }
    for (const auto& pixel : image.pixels) {
        for (const auto channel : pixel) {
            if (!std::isfinite(channel) || channel < 0 || channel > 1) {
                throw std::invalid_argument("image must contain finite normalized RGBA values");
            }
        }
    }
}

Image resize(const Image& source, int width, int height, Border border) {
    validate_image(source);
    Image output(width, height);
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            output.at(x, y) = rgba8(sample({source, (x + 0.5F) / width, (y + 0.5F) / height, border}));
        }
    }
    return output;
}

Image from_rgba8(const std::vector<std::uint8_t>& bytes, int width, int height) {
    if (bytes.size() != pixel_count(width, height) * 4) {
        throw std::invalid_argument("RGBA input byte count does not match dimensions");
    }
    Image image(width, height);
    for (std::size_t index = 0; index < image.pixels.size(); ++index) {
        for (std::size_t channel = 0; channel < 4; ++channel) {
            image.pixels[index][channel] = bytes[index * 4 + channel] / 255.0F;
        }
    }
    return image;
}

std::vector<std::uint8_t> to_rgba8(const Image& image) {
    validate_image(image);
    std::vector<std::uint8_t> bytes(image.pixels.size() * 4);
    for (std::size_t index = 0; index < image.pixels.size(); ++index) {
        for (std::size_t channel = 0; channel < 4; ++channel) {
            bytes[index * 4 + channel] = static_cast<std::uint8_t>(std::round(image.pixels[index][channel] * 255.0F));
        }
    }
    return bytes;
}

} // namespace softglow
