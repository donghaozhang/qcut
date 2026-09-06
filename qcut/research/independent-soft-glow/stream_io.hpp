#pragma once

#include "pipeline.hpp"

#include <cstdint>
#include <iosfwd>

namespace softglow {

struct StreamRequest {
    std::istream& input;
    std::ostream& output;
    const Image& lut;
    int width;
    int height;
    float intensity = 1;
    IntensityMode intensity_mode = IntensityMode::output_mix;
};

struct StreamStatistics {
    std::uint64_t frames = 0;
    std::uint64_t bytes = 0;
};

// Frame boundaries are implicit; EOF is valid only between complete RGBA8 frames.
StreamStatistics process_rgba_stream(const StreamRequest& request);

} // namespace softglow
