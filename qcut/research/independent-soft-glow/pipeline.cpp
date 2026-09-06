#include "pipeline.hpp"

#include "gaussian.hpp"
#include "glow.hpp"
#include "layer.hpp"
#include "lut.hpp"

#include <cmath>
#include <stdexcept>

namespace softglow {

IntensityMode parse_intensity_mode(std::string_view value) {
    if (value == "output-mix") return IntensityMode::output_mix;
    if (value == "ui-snapshot") return IntensityMode::ui_snapshot;
    throw std::invalid_argument("intensity mode must be output-mix or ui-snapshot");
}

std::string_view intensity_mode_name(IntensityMode mode) {
    switch (mode) {
        case IntensityMode::output_mix: return "output-mix";
        case IntensityMode::ui_snapshot: return "ui-snapshot";
    }
    throw std::invalid_argument("unsupported intensity mode");
}

Image cinematic_soft_glow(const PipelineRequest& request) {
    const auto& [source, lut, intensity, sink, intensity_mode] = request;
    intensity_mode_name(intensity_mode);
    const bool ui_snapshot = intensity_mode == IntensityMode::ui_snapshot;
    validate_image(source);
    validate_image(lut);
    if (lut.width != 512 || lut.height != 512) {
        throw std::invalid_argument("pipeline LUT must be 512 by 512");
    }
    if (!std::isfinite(intensity) || intensity < 0 || intensity > 1) {
        throw std::invalid_argument("pipeline intensity must be in [0, 1]");
    }
    for (const auto& pixel : source.pixels) {
        if (pixel[3] != 1) {
            throw std::invalid_argument("pipeline currently requires opaque source pixels");
        }
    }
    const auto record = [&](std::string_view name, const Image& stage) {
        if (sink) sink(name, stage);
    };
    record("00-input", source);
    if (!ui_snapshot && intensity == 0) {
        record("06-output", source);
        return source;
    }

    const auto blurred = gaussian_blur({source, GaussianParams{}, sink});
    record("01-gaussian", blurred);
    LayerParams soft_light;
    soft_light.mode = LayerBlend::soft_light;
    soft_light.type = LayerType::precomp;
    soft_light.opacity = 0.7F;
    soft_light.scale_x = 1.03F;
    soft_light.scale_y = 1.03F;
    const auto base = composite_layer({source, blurred, soft_light});
    record("02-soft-light", base);

    GlowParameters glow_parameters;
    glow_parameters.threshold = 0.84F;
    glow_parameters.brightness = 2.4F;
    glow_parameters.glow_width = 0.13F;
    glow_parameters.width_x = 0.41F;
    glow_parameters.width_y = 0.65F;
    glow_parameters.width_red = 1;
    glow_parameters.width_green = 1;
    glow_parameters.width_blue = 1;
    glow_parameters.dither = 1;
    // Above 0.8 the observed fresh export keeps the instantiated scene values.
    if (ui_snapshot && intensity <= 0.8F) {
        glow_parameters.threshold = 1 - 0.175F * intensity;
        glow_parameters.brightness = 3 * intensity;
    }
    const auto glowing = glow(base, glow_parameters, sink);
    record("03-glow", glowing);
    const auto graded = apply_lut(glowing, lut, ui_snapshot ? 0.8F * intensity : 0.8F);
    record("04-lut", graded);

    LayerParams normal;
    normal.opacity = 0.64F;
    const auto composed = composite_layer({base, graded, normal});
    record("05-normal", composed);
    if (ui_snapshot) {
        record("06-output", composed);
        return composed;
    }
    Image output(source.width, source.height);
    for (std::size_t index = 0; index < output.pixels.size(); ++index) {
        Pixel pixel = source.pixels[index];
        for (std::size_t channel = 0; channel < 4; ++channel) {
            pixel[channel] = std::lerp(pixel[channel], composed.pixels[index][channel], intensity);
        }
        output.pixels[index] = rgba8(pixel);
    }
    record("06-output", output);
    return output;
}

} // namespace softglow
