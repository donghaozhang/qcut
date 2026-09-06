#pragma once

#include "image.hpp"

namespace softglow {

enum class LayerBlend { normal, soft_light };
enum class LayerType { adjustment, precomp };

struct LayerParams {
    LayerBlend mode = LayerBlend::normal;
    LayerType type = LayerType::adjustment;
    float opacity = 1;
    float scale_x = 1;
    float scale_y = 1;
    bool transform = true;
    bool mirror_edge = false;
};

struct LayerRequest {
    const Image& base;
    const Image& source;
    LayerParams params = {};
};

// Textures contain premultiplied RGBA; the blend calculation uses straight RGB.
Image composite_layer(const LayerRequest& request);

} // namespace softglow
