#include "stream_io.hpp"

#include <cmath>
#include <istream>
#include <ostream>
#include <stdexcept>
#include <string>

namespace softglow {

StreamStatistics process_rgba_stream(const StreamRequest& request) {
    const auto& [input, output, lut, width, height, intensity, intensity_mode] = request;
    intensity_mode_name(intensity_mode);
    Image source(width, height);
    validate_image(lut);
    if (lut.width != 512 || lut.height != 512) {
        throw std::invalid_argument("stream LUT must be 512 by 512");
    }
    if (!std::isfinite(intensity) || intensity < 0 || intensity > 1) {
        throw std::invalid_argument("stream intensity must be in [0, 1]");
    }
    std::vector<std::uint8_t> bytes(source.pixels.size() * 4);
    const auto frame_bytes = static_cast<std::streamsize>(bytes.size());
    StreamStatistics statistics;
    while (true) {
        input.read(reinterpret_cast<char*>(bytes.data()), frame_bytes);
        const auto count = input.gcount();
        if (input.bad() || (input.fail() && !input.eof())) {
            throw std::runtime_error("input read failed at frame " + std::to_string(statistics.frames));
        }
        if (count == 0 && input.eof()) {
            break;
        }
        if (count != frame_bytes) {
            throw std::runtime_error("short RGBA8 frame " + std::to_string(statistics.frames) +
                                     ": received " + std::to_string(count) + " of " +
                                     std::to_string(frame_bytes) + " bytes");
        }
        source = from_rgba8(bytes, width, height);
        const auto result = cinematic_soft_glow({source, lut, intensity, {}, intensity_mode});
        const auto encoded = to_rgba8(result);
        output.write(reinterpret_cast<const char*>(encoded.data()), frame_bytes);
        // A persistent caller must receive this frame before sending its next input.
        output.flush();
        if (!output) {
            throw std::runtime_error("output write failed at frame " + std::to_string(statistics.frames));
        }
        ++statistics.frames;
        statistics.bytes += bytes.size();
    }
    output.flush();
    if (!output) {
        throw std::runtime_error("output flush failed");
    }
    return statistics;
}

} // namespace softglow
