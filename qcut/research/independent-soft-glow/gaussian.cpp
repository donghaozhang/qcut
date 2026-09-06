#include "gaussian.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

namespace softglow {
namespace {

constexpr float minimum_samples = 1e-5F;

void validate_params(const GaussianParams& params) {
    for (float value : {params.intensity, params.quality, params.horizontal_strength,
                        params.vertical_strength, params.gamma, params.normalization_size,
                        params.radius_over_sigma, params.space_dither}) {
        if (!std::isfinite(value)) {
            throw std::invalid_argument("Gaussian parameters must be finite");
        }
    }
    if (params.gamma <= 0 || params.normalization_size <= 0 || params.radius_over_sigma <= 0) {
        throw std::invalid_argument("Gaussian normalization and gamma must be positive");
    }
    if (params.inverse_gamma && !std::isfinite(1.0F / params.gamma)) {
        throw std::invalid_argument("Gaussian reciprocal gamma must be finite");
    }
    if (params.space_dither != 0) {
        throw std::invalid_argument("Gaussian spatial dither is outside this reference profile");
    }
    switch (params.border) {
        case GaussianBorder::renormalize:
        case GaussianBorder::replicate:
        case GaussianBorder::black:
        case GaussianBorder::reflect:
            break;
        default:
            throw std::invalid_argument("Unknown Gaussian border mode");
    }
    switch (params.direction) {
        case GaussianDirection::both:
        case GaussianDirection::horizontal:
        case GaussianDirection::vertical:
            break;
        default:
            throw std::invalid_argument("Unknown Gaussian direction");
    }
}

Image quantized(Image image) {
    for (Pixel& pixel : image.pixels) {
        pixel = rgba8(pixel);
    }
    return image;
}

Pixel gamma_sample(const SampleRequest& request, const GaussianParams& params) {
    Pixel pixel = sample(request);
    if (params.inverse_gamma) {
        for (int channel = 0; channel < 3; ++channel) {
            pixel[channel] = std::pow(pixel[channel], params.gamma);
        }
    }
    return pixel;
}

struct AxisRequest {
    const Image& source;
    const GaussianParams& params;
    float samples;
    float step;
    float sigma;
    bool horizontal;
};

struct WeightedTap {
    float offset;
    float weight;
};

std::vector<WeightedTap> axis_taps(const AxisRequest& request) {
    const int count = std::min(1024, static_cast<int>(std::floor(request.samples)));
    std::vector<WeightedTap> taps;
    taps.reserve(static_cast<std::size_t>(count));
    for (int index = 1; index <= count; ++index) {
        const float distance = static_cast<float>(index) * request.step;
        if (!std::isfinite(distance)) {
            throw std::invalid_argument("Gaussian sample distance exceeds floating-point range");
        }
        const float relative_distance = distance / request.sigma;
        taps.push_back({distance, std::exp(-0.5F * relative_distance * relative_distance)});
    }
    return taps;
}

Image blur_axis(const AxisRequest& request) {
    if (request.samples < minimum_samples || request.sigma <= 0) {
        return quantized(request.source);
    }
    const auto taps = axis_taps(request);
    Image result(request.source.width, request.source.height);
    for (int y = 0; y < result.height; ++y) {
        const float v = (static_cast<float>(y) + 0.5F) / static_cast<float>(result.height);
        for (int x = 0; x < result.width; ++x) {
            const float u = (static_cast<float>(x) + 0.5F) / static_cast<float>(result.width);
            const Pixel center = gamma_sample({request.source, u, v}, request.params);
            Pixel sum = center;
            float total_weight = 1;
            for (const WeightedTap& tap : taps) {
                for (float sign : {-1.0F, 1.0F}) {
                    float coordinate = (request.horizontal ? u : v) + sign * tap.offset;
                    const bool outside = coordinate < 0 || coordinate > 1;
                    if (outside && request.params.border == GaussianBorder::renormalize) {
                        continue;
                    }
                    total_weight += tap.weight;
                    if (outside && request.params.border == GaussianBorder::black) {
                        continue;
                    }
                    if (outside && request.params.border == GaussianBorder::reflect) {
                        // The shader reflects once, then the texture's clamp sampler applies.
                        coordinate = coordinate < 0 ? -coordinate : 2 - coordinate;
                    }
                    const Pixel pixel = gamma_sample(
                        {request.source, request.horizontal ? coordinate : u,
                         request.horizontal ? v : coordinate, Border::clamp}, request.params);
                    for (int channel = 0; channel < 4; ++channel) {
                        sum[channel] += pixel[channel] * tap.weight;
                    }
                }
            }
            for (float& channel : sum) {
                channel /= total_weight;
            }
            if (request.params.inverse_gamma) {
                for (int channel = 0; channel < 3; ++channel) {
                    sum[channel] = std::pow(sum[channel], 1 / request.params.gamma);
                }
            }
            if (!request.params.blur_alpha) {
                sum[3] = center[3];
            }
            result.at(x, y) = rgba8(sum);
        }
    }
    return result;
}

} // namespace

GaussianPlan gaussian_plan(const GaussianPlanRequest& request) {
    validate_params(request.params);
    if (request.width <= 0 || request.height <= 0) {
        throw std::invalid_argument("Gaussian dimensions must be positive");
    }
    const float intensity = std::clamp(request.params.intensity, 0.0F, 1000.0F);
    float downscale;
    float sample_budget;
    if (intensity <= 30) {
        downscale = 0.5F;
        sample_budget = (0.5F * intensity + 2) * 0.78F;
    } else if (intensity <= 100) {
        downscale = 0.5F;
        sample_budget = (0.5F * intensity + 10) * 0.66F;
    } else if (intensity <= 200) {
        downscale = 0.25F;
        sample_budget = (0.25F * intensity + 50) * 0.7F;
    } else {
        downscale = 0.125F;
        sample_budget = (0.125F * intensity + 80) * 0.8F;
    }
    if (sample_budget < 2) {
        sample_budget = std::floor(sample_budget + 0.5F);
    }
    const float quality_offset = 2 * std::clamp(request.params.quality, 0.0F, 1.0F) - 1;
    const float quality = quality_offset < 0 ? std::pow(10.0F, quality_offset)
                                             : 2 * quality_offset + 1;
    const float width = static_cast<float>(request.width);
    const float height = static_cast<float>(request.height);
    const float reference_size = std::max(std::min(width, height), std::max(width, height) / 2);
    const float horizontal_strength = std::clamp(request.params.horizontal_strength, 0.0F, 1.0F);
    const float vertical_strength = std::clamp(request.params.vertical_strength, 0.0F, 1.0F);
    const bool horizontal = intensity > 0.01F && request.params.direction != GaussianDirection::vertical;
    const bool vertical = intensity > 0.01F && request.params.direction != GaussianDirection::horizontal;
    const float radius_x = horizontal ? reference_size / width * intensity * horizontal_strength /
                                           request.params.normalization_size : 0;
    const float radius_y = vertical ? reference_size / height * intensity * vertical_strength /
                                         request.params.normalization_size : 0;
    const float samples_x = sample_budget * horizontal_strength * quality;
    const float samples_y = sample_budget * vertical_strength * quality;
    GaussianPlan plan {
        std::max(1, static_cast<int>(width * downscale)),
        std::max(1, static_cast<int>(height * downscale)),
        downscale, samples_x, samples_y, radius_x, radius_y,
        radius_x / request.params.radius_over_sigma, radius_y / request.params.radius_over_sigma,
        radius_x / std::max(samples_x, minimum_samples),
        radius_y / std::max(samples_y, minimum_samples), horizontal, vertical,
    };
    for (float value : {plan.radius_x, plan.radius_y, plan.sigma_x, plan.sigma_y, plan.step_x, plan.step_y}) {
        if (!std::isfinite(value)) {
            throw std::invalid_argument("Gaussian parameters produce nonfinite sampling coordinates");
        }
    }
    const bool horizontal_underflow = horizontal && samples_x >= minimum_samples && plan.sigma_x <= 0;
    const bool vertical_underflow = vertical && samples_y >= minimum_samples && plan.sigma_y <= 0;
    if (horizontal_underflow || vertical_underflow) {
        throw std::invalid_argument("Gaussian sigma is below floating-point range");
    }
    return plan;
}

Image gaussian_blur(const GaussianRequest& request) {
    validate_image(request.source);
    const GaussianPlan plan = gaussian_plan({request.source.width, request.source.height, request.params});
    if (!plan.horizontal && !plan.vertical) {
        return quantized(request.source);
    }
    Image working = resize(request.source, plan.work_width, plan.work_height);
    if (request.sink) {
        request.sink("gaussian.downsample", working);
    }
    if (plan.horizontal) {
        working = blur_axis({working, request.params, plan.samples_x, plan.step_x, plan.sigma_x, true});
        if (request.sink) {
            request.sink("gaussian.x", working);
        }
    }
    if (plan.vertical) {
        working = blur_axis({working, request.params, plan.samples_y, plan.step_y, plan.sigma_y, false});
        if (request.sink) {
            request.sink("gaussian.y", working);
        }
    }
    Image output = resize(working, request.source.width, request.source.height);
    if (request.sink) {
        request.sink("gaussian.output", output);
    }
    return output;
}

} // namespace softglow
