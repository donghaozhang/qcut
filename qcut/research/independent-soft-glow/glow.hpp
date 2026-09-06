#pragma once

#include "image.hpp"

#include <array>

namespace softglow {

enum class GlowCombine { screen, add, multiply, difference, overlay };
enum class GlowEdge { transparent, reflect };

struct GlowParameters {
    float threshold = 0.5F;
    float brightness = 2.0F;
    float glow_width = 0.1F;
    float width_x = 1.0F;
    float width_y = 1.0F;
    float width_red = 1.0F;
    float width_green = 1.2F;
    float width_blue = 1.4F;
    float source_opacity = 1.0F;
    float quality = 0.2F;
    float dither = 0.0F;
    std::array<float, 3> threshold_color{0.0F, 0.0F, 0.0F};
    std::array<float, 3> glow_color{1.0F, 1.0F, 1.0F};
    float glow_from_alpha = 0.0F;
    float glow_under_source = 0.0F;
    float bg_brightness = 1.0F;
    float light_background = 0.0F;
    GlowCombine combine = GlowCombine::screen;
    GlowEdge edge = GlowEdge::reflect;
    bool show_threshold = false;
};

Image glow(const Image& source, const GlowParameters& parameters,
           const StageSink& sink = {});

} // namespace softglow
