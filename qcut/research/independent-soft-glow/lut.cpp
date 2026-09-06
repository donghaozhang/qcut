#include "lut.hpp"

#include <cmath>
#include <stdexcept>

namespace softglow {

Image identity_lut() {
    Image atlas(512, 512);
    for (int blue = 0; blue < 64; ++blue) {
        for (int green = 0; green < 64; ++green) {
            for (int red = 0; red < 64; ++red) {
                atlas.at((blue % 8) * 64 + red, (blue / 8) * 64 + green) =
                    rgba8({red / 63.0F, green / 63.0F, blue / 63.0F, 1});
            }
        }
    }
    return atlas;
}

Image apply_lut(const Image& source, const Image& atlas, float opacity) {
    validate_image(source);
    validate_image(atlas);
    if (atlas.width != 512 || atlas.height != 512) {
        throw std::invalid_argument("LUT must be a 512 by 512 RGBA atlas");
    }
    if (!std::isfinite(opacity) || opacity < 0 || opacity > 1) {
        throw std::invalid_argument("LUT opacity must be in [0, 1]");
    }
    if (opacity < 0.00001F) {
        return source;
    }
    Image result(source.width, source.height);
    for (std::size_t index = 0; index < source.pixels.size(); ++index) {
        const Pixel input = source.pixels[index];
        const float blue = input[2] * 63;
        const int lower = static_cast<int>(std::floor(blue));
        const int upper = static_cast<int>(std::ceil(blue));
        const auto lookup = [&](int slice) {
            const float u = ((slice % 8) * 64 + 0.5F + 63 * input[0]) / 512;
            const float v = ((slice / 8) * 64 + 0.5F + 63 * input[1]) / 512;
            // The package loader and LUT shader each flip Y; they cancel for a top-down atlas.
            return sample({atlas, u, v});
        };
        const Pixel first = lookup(lower);
        const Pixel second = lookup(upper);
        Pixel output = input;
        for (std::size_t channel = 0; channel < 3; ++channel) {
            const float mapped = std::lerp(first[channel], second[channel], blue - lower);
            output[channel] = std::lerp(input[channel], mapped, opacity * input[3]);
        }
        result.pixels[index] = rgba8(output);
    }
    return result;
}

} // namespace softglow
