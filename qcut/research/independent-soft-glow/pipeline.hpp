#pragma once

#include "image.hpp"

namespace softglow {

enum class IntensityMode { output_mix, ui_snapshot };

IntensityMode parse_intensity_mode(std::string_view value);
std::string_view intensity_mode_name(IntensityMode mode);

struct PipelineRequest {
    const Image& source;
    const Image& lut;
    float intensity = 1;
    StageSink sink;
    IntensityMode intensity_mode = IntensityMode::output_mix;
};

// output_mix blends the static scene; ui_snapshot reconstructs fresh UI exports.
// The verified input contract is opaque RGBA8, SDR, with top-down rows.
Image cinematic_soft_glow(const PipelineRequest& request);

} // namespace softglow
