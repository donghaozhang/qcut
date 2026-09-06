#include "glow.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace softglow {
namespace {

struct RangeCheck {
    float value;
    float minimum;
    float maximum;
    const char* name;
};

void check_range(const RangeCheck& check) {
    if (!std::isfinite(check.value) || check.value < check.minimum ||
        check.value > check.maximum) {
        throw std::invalid_argument(std::string("invalid glow parameter: ") + check.name);
    }
}

void validate_parameters(const GlowParameters& parameters) {
    const std::array<RangeCheck, 15> ranges{{
        {parameters.threshold, 0, 1, "threshold"},
        {parameters.brightness, 0, 50, "brightness"},
        {parameters.glow_width, 0, 1, "glow_width"},
        {parameters.width_x, 0, 5, "width_x"},
        {parameters.width_y, 0, 5, "width_y"},
        {parameters.width_red, 0, 5, "width_red"},
        {parameters.width_green, 0, 5, "width_green"},
        {parameters.width_blue, 0, 5, "width_blue"},
        {parameters.source_opacity, 0, 1, "source_opacity"},
        {parameters.quality, 0, 1, "quality"},
        {parameters.dither, 0, 1, "dither"},
        {parameters.glow_from_alpha, 0, 1, "glow_from_alpha"},
        {parameters.glow_under_source, 0, 1, "glow_under_source"},
        {parameters.bg_brightness, 0, 1, "bg_brightness"},
        {parameters.light_background, 0, 1, "light_background"},
    }};
    for (const auto& range : ranges) {
        check_range(range);
    }
    for (const auto channel : parameters.threshold_color) {
        check_range({channel, 0, 1, "threshold_color"});
    }
    for (const auto channel : parameters.glow_color) {
        check_range({channel, 0, 1, "glow_color"});
    }
    switch (parameters.combine) {
        case GlowCombine::screen:
        case GlowCombine::add:
        case GlowCombine::multiply:
        case GlowCombine::difference:
        case GlowCombine::overlay:
            break;
        default:
            throw std::invalid_argument("unsupported glow combine mode");
    }
    if (parameters.edge != GlowEdge::transparent && parameters.edge != GlowEdge::reflect) {
        throw std::invalid_argument("unsupported glow edge mode");
    }
}

struct MaskRequest {
    const Image& source;
    const GlowParameters& parameters;
    int width;
    int height;
};

Image threshold_mask(const MaskRequest& request) {
    const auto& [source, parameters, width, height] = request;
    Image result(width, height);
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            Pixel color = sample({source, (x + 0.5F) / width, (y + 0.5F) / height,
                                  Border::mirror});
            float sum = 0;
            float selected = 0;
            for (std::size_t channel = 0; channel < 3; ++channel) {
                color[channel] = std::lerp(color[channel], 1.0F, parameters.glow_from_alpha);
                const float cutoff = parameters.threshold + parameters.threshold_color[channel];
                sum += color[channel];
                if (color[channel] > cutoff) {
                    selected += (color[channel] - cutoff) / (1.0F - cutoff);
                }
            }
            const float gain = selected / std::max(sum, 0.000001F);
            for (auto& channel : color) {
                channel *= gain;
            }
            result.at(x, y) = rgba8(color);
        }
    }
    return result;
}

struct Tap {
    float distance;
    Pixel weights;
};

struct Kernel {
    float stride;
    Pixel total_weight{1, 1, 1, 1};
    std::vector<Tap> taps;
};

struct KernelRequest {
    const GlowParameters& parameters;
    float radius;
    float axis_scale;
};

Kernel make_kernel(const KernelRequest& request) {
    const auto& [parameters, radius, axis_scale] = request;
    const Pixel radii{radius * axis_scale * parameters.width_red,
                     radius * axis_scale * parameters.width_green,
                     radius * axis_scale * parameters.width_blue, radius};
    const float largest_color_radius = std::max({radii[0], radii[1], radii[2]});
    const float budget = 10.0F + std::floor(100.0F * parameters.quality);
    Kernel kernel{std::max(1.0F, largest_color_radius / budget), {1, 1, 1, 1}, {}};
    float distance = 1.0F;
    for (int index = 0; index < 128; ++index) {
        // Alpha has its own radius; only the RGB radii control the loop boundary.
        if (distance > 128 || distance > budget * kernel.stride ||
            distance > largest_color_radius) {
            break;
        }
        Pixel weights{};
        for (std::size_t channel = 0; channel < 4; ++channel) {
            if (distance <= radii[channel]) {
                const float sigma = radii[channel] / 2.4F;
                weights[channel] = std::exp(-(distance * distance) / (2.0F * sigma * sigma));
            }
            kernel.total_weight[channel] += 2.0F * weights[channel];
        }
        kernel.taps.push_back({distance, weights});
        distance += kernel.stride;
    }
    return kernel;
}

float fractional(float value) {
    return value - std::floor(value);
}

struct NoiseRequest {
    float seed_x;
    float seed_y;
};

float dither_noise(const NoiseRequest& request) {
    float a = fractional(request.seed_x * 13.517F);
    float b = fractional(request.seed_y * 13.517F);
    const float interaction = a * (b + 22.541F) + b * (a + 22.541F);
    a += interaction;
    b += interaction;
    return fractional((a + b) * b) - 0.5F;
}

struct PairRequest {
    float first;
    float second;
};

Pixel pack_pair(const PairRequest& request) {
    const float first = request.first * 255.0F;
    const float second = request.second * 255.0F;
    return rgba8({std::floor(first) / 255.0F, fractional(first),
                  std::floor(second) / 255.0F, fractional(second)});
}

std::array<float, 2> unpack_pair(const Pixel& value) {
    return {value[0] + value[1] / 255.0F, value[2] + value[3] / 255.0F};
}

struct BlurRequest {
    const Image& source;
    const Kernel& kernel;
    const GlowParameters& parameters;
    bool vertical;
    std::size_t first_channel;
};

struct BlurSampleRequest {
    const BlurRequest& pass;
    float u;
    float v;
};

std::array<float, 2> read_pair(const BlurSampleRequest& request) {
    const auto& [pass, u, v] = request;
    const float position = pass.vertical ? v : u;
    if (pass.parameters.edge == GlowEdge::transparent && (position < 0 || position > 1)) {
        return {0, 0};
    }
    const Pixel pixel = sample({pass.source, u, v, Border::mirror});
    if (pass.vertical) {
        // Interpolate the quantized packed texture before decoding its two channels.
        return unpack_pair(pixel);
    }
    return {pixel[pass.first_channel], pixel[pass.first_channel + 1]};
}

Image blur_pair(const BlurRequest& request) {
    const auto& [source, kernel, parameters, vertical, first_channel] = request;
    Image result(source.width, source.height);
    const float plus_seed = vertical ? 0.223F : 0.199F;
    const float minus_seed = vertical ? 0.569F : 0.677F;
    const float axis_pixels = static_cast<float>(vertical ? source.height : source.width);
    for (int y = 0; y < source.height; ++y) {
        const float v = (y + 0.5F) / source.height;
        for (int x = 0; x < source.width; ++x) {
            const float u = (x + 0.5F) / source.width;
            auto accumulated = read_pair({request, u, v});
            for (const auto& tap : kernel.taps) {
                const float noise_scale = parameters.dither * kernel.stride;
                const float positive = (tap.distance + noise_scale *
                    dither_noise({tap.distance + u + plus_seed, tap.distance * v})) / axis_pixels;
                const float negative = (tap.distance + noise_scale *
                    dither_noise({tap.distance + u + minus_seed, tap.distance * v})) / axis_pixels;
                const auto plus = read_pair({request, u + (vertical ? 0 : positive),
                                            v + (vertical ? positive : 0)});
                const auto minus = read_pair({request, u - (vertical ? 0 : negative),
                                             v - (vertical ? negative : 0)});
                for (std::size_t channel = 0; channel < 2; ++channel) {
                    accumulated[channel] += (plus[channel] + minus[channel]) *
                        tap.weights[first_channel + channel];
                }
            }
            result.at(x, y) = pack_pair({
                accumulated[0] / kernel.total_weight[first_channel],
                accumulated[1] / kernel.total_weight[first_channel + 1]});
        }
    }
    return result;
}

struct CombineRequest {
    float base;
    float light;
    GlowCombine mode;
};

float combine_channel(const CombineRequest& request) {
    const auto& [base, light, mode] = request;
    switch (mode) {
        case GlowCombine::add: return base + light;
        case GlowCombine::multiply: return base * light;
        case GlowCombine::difference: return std::abs(light - base);
        case GlowCombine::overlay:
            return base < 0.5F ? 2.0F * base * light :
                1.0F - 2.0F * (1.0F - base) * (1.0F - light);
        case GlowCombine::screen: return 1.0F - (1.0F - base) * (1.0F - light);
    }
    throw std::invalid_argument("unsupported glow combine mode");
}

struct CompositeRequest {
    const Image& source;
    const Image& red_green;
    const Image& blue_alpha;
    const GlowParameters& parameters;
};

Image composite(const CompositeRequest& request) {
    const auto& [source, red_green, blue_alpha, parameters] = request;
    Image result(source.width, source.height);
    for (int y = 0; y < source.height; ++y) {
        const float v = (y + 0.5F) / source.height;
        for (int x = 0; x < source.width; ++x) {
            const float u = (x + 0.5F) / source.width;
            const auto rg = unpack_pair(sample({red_green, u, v, Border::mirror}));
            const auto ba = unpack_pair(sample({blue_alpha, u, v, Border::mirror}));
            const Pixel blurred{rg[0], rg[1], ba[0], ba[1]};
            const Pixel original = source.at(x, y);
            Pixel output{};
            for (std::size_t channel = 0; channel < 3; ++channel) {
                const float light = blurred[channel] * parameters.glow_color[channel] * parameters.brightness;
                const float under_source = std::lerp(light, original[channel], parameters.source_opacity);
                const float glow_layer = std::lerp(light, under_source, parameters.glow_under_source) *
                    (1.0F - parameters.light_background);
                const float base = saturate(original[channel] * parameters.source_opacity * parameters.bg_brightness);
                output[channel] = combine_channel({base, glow_layer, parameters.combine});
            }
            // The alpha equation uses brightened blur before under-source/light-background mixing.
            const float glow_alpha = blurred[3] * parameters.brightness;
            output[3] = glow_alpha + (1.0F - glow_alpha) * original[3];
            result.at(x, y) = rgba8(output);
        }
    }
    return result;
}

} // namespace

Image glow(const Image& source, const GlowParameters& parameters, const StageSink& sink) {
    validate_image(source);
    validate_parameters(parameters);
    if (parameters.show_threshold) {
        Image mask = threshold_mask({source, parameters, source.width, source.height});
        if (sink) sink("glow.threshold", mask);
        return mask;
    }
    const double maximum_width = std::clamp(static_cast<double>(parameters.quality) * 1200.0, 120.0, 360.0);
    const double blur_width = std::min(static_cast<double>(source.width), maximum_width);
    const int width = static_cast<int>(std::floor(blur_width));
    const int height = static_cast<int>(std::floor(source.height * blur_width / source.width));
    if (width < 1 || height < 1) {
        throw std::invalid_argument("glow quality and aspect ratio produce an empty render target");
    }
    const float radius = static_cast<float>(parameters.glow_width * blur_width);
    const Kernel horizontal = make_kernel({parameters, radius, parameters.width_x});
    const Kernel vertical = make_kernel({parameters, radius, parameters.width_y});
    const Image mask = threshold_mask({source, parameters, width, height});
    if (sink) sink("glow.mask", mask);
    const Image horizontal_rg = blur_pair({mask, horizontal, parameters, false, 0});
    if (sink) sink("glow.horizontal_rg", horizontal_rg);
    const Image vertical_rg = blur_pair({horizontal_rg, vertical, parameters, true, 0});
    if (sink) sink("glow.vertical_rg", vertical_rg);
    const Image horizontal_ba = blur_pair({mask, horizontal, parameters, false, 2});
    if (sink) sink("glow.horizontal_ba", horizontal_ba);
    const Image vertical_ba = blur_pair({horizontal_ba, vertical, parameters, true, 2});
    if (sink) sink("glow.vertical_ba", vertical_ba);
    Image result = composite({source, vertical_rg, vertical_ba, parameters});
    if (sink) sink("glow.result", result);
    return result;
}

} // namespace softglow
