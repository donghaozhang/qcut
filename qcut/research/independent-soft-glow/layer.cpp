#include "layer.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace softglow {
namespace {

void validate_params(const LayerParams& params) {
    for (float value : {params.opacity, params.scale_x, params.scale_y}) {
        if (!std::isfinite(value)) {
            throw std::invalid_argument("Layer parameters must be finite");
        }
    }
    if (params.scale_x <= 0 || params.scale_y <= 0) {
        throw std::invalid_argument("Layer scale must be positive");
    }
    switch (params.mode) {
        case LayerBlend::normal:
        case LayerBlend::soft_light:
            break;
        default:
            throw std::invalid_argument("Unsupported layer blend mode");
    }
    switch (params.type) {
        case LayerType::adjustment:
        case LayerType::precomp:
            break;
        default:
            throw std::invalid_argument("Unsupported layer type");
    }
}

float reflected_coordinate(double value) {
    double period = std::fmod(value, 2);
    if (period < 0) {
        period += 2;
    }
    return static_cast<float>(period <= 1 ? period : 2 - period);
}

Pixel transformed_source(const LayerRequest& request, float u, float v) {
    if (!request.params.transform) {
        return sample({request.source, u, v});
    }
    const double source_u = (static_cast<double>(u) - 0.5) / request.params.scale_x + 0.5;
    const double source_v = (static_cast<double>(v) - 0.5) / request.params.scale_y + 0.5;
    const bool outside = source_u < 0 || source_u > 1 || source_v < 0 || source_v > 1;
    if (outside && !request.params.mirror_edge) {
        return {0, 0, 0, 0};
    }
    const float sample_u = request.params.mirror_edge ? reflected_coordinate(source_u)
                                                     : static_cast<float>(source_u);
    const float sample_v = request.params.mirror_edge ? reflected_coordinate(source_v)
                                                     : static_cast<float>(source_v);
    Pixel pixel = sample({request.source, sample_u, sample_v, Border::clamp});
    if (request.params.type == LayerType::precomp) {
        const float opacity = std::clamp(request.params.opacity, 0.0F, 1.0F);
        for (float& channel : pixel) {
            channel *= opacity;
        }
    }
    return pixel;
}

float soft_light(float base, float source) {
    if (source < 0.5F) {
        return base - (1 - 2 * source) * base * (1 - base);
    }
    const float lift = base < 0.25F ? base * ((16 * base - 12) * base + 3)
                                    : std::sqrt(base) - base;
    return base + (2 * source - 1) * lift;
}

Pixel composite(Pixel base, Pixel source, const LayerParams& params) {
    const float base_alpha = base[3];
    const float source_alpha = source[3];
    const float opacity = std::clamp(params.opacity, 0.0F, 1.0F);
    Pixel output = {0, 0, 0, 0};
    output[3] = params.type == LayerType::adjustment
        ? base_alpha + opacity * (source_alpha - base_alpha)
        : source_alpha + base_alpha * (1 - source_alpha);
    for (int channel = 0; channel < 3; ++channel) {
        const float backdrop = base[channel] / std::max(base_alpha, 1e-5F);
        const float foreground = source[channel] / std::max(source_alpha, 1e-5F);
        const float blended = params.mode == LayerBlend::soft_light
            ? soft_light(backdrop, foreground) : foreground;
        if (params.type == LayerType::adjustment) {
            output[channel] = (backdrop + opacity * (blended - backdrop)) * output[3];
            continue;
        }
        output[channel] = backdrop * base_alpha * (1 - source_alpha)
            + foreground * source_alpha * (1 - base_alpha)
            + blended * source_alpha * base_alpha;
    }
    return rgba8(output);
}

} // namespace

Image composite_layer(const LayerRequest& request) {
    validate_params(request.params);
    validate_image(request.base);
    validate_image(request.source);
    Image output(request.base.width, request.base.height);
    for (int y = 0; y < output.height; ++y) {
        const float v = (static_cast<float>(y) + 0.5F) / static_cast<float>(output.height);
        for (int x = 0; x < output.width; ++x) {
            const float u = (static_cast<float>(x) + 0.5F) / static_cast<float>(output.width);
            output.at(x, y) = composite(request.base.at(x, y), transformed_source(request, u, v), request.params);
        }
    }
    return output;
}

} // namespace softglow
