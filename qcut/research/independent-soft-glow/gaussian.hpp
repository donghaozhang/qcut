#pragma once

#include "image.hpp"

namespace softglow {

enum class GaussianBorder { renormalize, replicate, black, reflect };
enum class GaussianDirection { both, horizontal, vertical };

struct GaussianParams {
    float intensity = 70;
    float quality = 0.2F;
    float horizontal_strength = 1;
    float vertical_strength = 1;
    bool inverse_gamma = true;
    bool blur_alpha = true;
    float gamma = 2.2F;
    float normalization_size = 1000;
    float radius_over_sigma = 2.5F;
    float space_dither = 0;
    GaussianBorder border = GaussianBorder::renormalize;
    GaussianDirection direction = GaussianDirection::both;
};

struct GaussianPlan {
    int work_width;
    int work_height;
    float downscale;
    float samples_x;
    float samples_y;
    float radius_x;
    float radius_y;
    float sigma_x;
    float sigma_y;
    float step_x;
    float step_y;
    bool horizontal;
    bool vertical;
};

struct GaussianPlanRequest {
    int width;
    int height;
    GaussianParams params = {};
};

struct GaussianRequest {
    const Image& source;
    GaussianParams params = {};
    StageSink sink = {};
};

GaussianPlan gaussian_plan(const GaussianPlanRequest& request);
Image gaussian_blur(const GaussianRequest& request);

} // namespace softglow
