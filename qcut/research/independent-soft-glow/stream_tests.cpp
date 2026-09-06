#include "image_io.hpp"
#include "lut.hpp"
#include "pipeline.hpp"
#include "stream_io.hpp"

#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <streambuf>
#include <string>

namespace {

using namespace softglow;

void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

std::string raw(const Image& image) {
    const auto bytes = to_rgba8(image);
    return {reinterpret_cast<const char*>(bytes.data()), bytes.size()};
}

template <typename Function>
void rejects(Function function, const std::string& expected) {
    try {
        function();
    } catch (const std::exception& error) {
        require(std::string(error.what()).find(expected) != std::string::npos,
                "unexpected failure: " + std::string(error.what()));
        return;
    }
    throw std::runtime_error("invalid stream was accepted");
}

void boundaries_and_order(const Image& lut) {
    const auto first = test_chart(17, 9);
    Image second = first;
    for (auto& pixel : second.pixels) pixel = {pixel[2], 1 - pixel[1], pixel[0], 1};
    const auto first_result = raw(cinematic_soft_glow({first, lut, 0.37F, {}}));
    const auto second_result = raw(cinematic_soft_glow({second, lut, 0.37F, {}}));
    require(first_result != second_result, "order test needs distinct frames");
    std::istringstream input(raw(second) + raw(first) + raw(second));
    std::ostringstream output;
    const auto stats = process_rgba_stream({input, output, lut, 17, 9, 0.37F});
    require(stats.frames == 3 && stats.bytes == 17 * 9 * 4 * 3, "frame statistics differ");
    require(output.str() == second_result + first_result + second_result,
            "stream differs from independent random-order frames");

    std::istringstream identity_input(raw(first) + raw(second));
    std::ostringstream identity_output;
    process_rgba_stream({identity_input, identity_output, lut, 17, 9, 0});
    require(identity_output.str() == raw(first) + raw(second), "zero intensity changed bytes");
}

void eof_and_short_frames(const Image& lut) {
    std::istringstream empty;
    std::ostringstream output;
    require(process_rgba_stream({empty, output, lut, 2, 1}).frames == 0, "empty EOF rejected");
    require(output.str().empty(), "empty stream emitted bytes");
    const auto frame = raw(Image(2, 1, {0.25F, 0.5F, 0.75F, 1}));
    for (std::size_t tail = 1; tail < frame.size(); ++tail) {
        std::istringstream input(frame + frame.substr(0, tail));
        std::ostringstream partial_output;
        rejects([&] { process_rgba_stream({input, partial_output, lut, 2, 1, 0}); },
                "short RGBA8 frame 1");
        require(partial_output.str() == frame, "short frame was padded or emitted");
    }
}

void ui_snapshot_stream(const Image& lut) {
    const auto first = test_chart(17, 9);
    Image second = first;
    for (auto& pixel : second.pixels) pixel = {pixel[2], 1 - pixel[1], pixel[0], 1};
    for (const float intensity : {0.0F, 0.37F, 0.8F, 0.81F, 1.0F}) {
        const auto first_result = raw(cinematic_soft_glow({first, lut, intensity, {}, IntensityMode::ui_snapshot}));
        const auto second_result = raw(cinematic_soft_glow({second, lut, intensity, {}, IntensityMode::ui_snapshot}));
        std::istringstream input(raw(second) + raw(first) + raw(second));
        std::ostringstream output;
        const auto stats = process_rgba_stream({input, output, lut, 17, 9, intensity, IntensityMode::ui_snapshot});
        require(stats.frames == 3 && output.str() == second_result + first_result + second_result,
                "UI stream mode differs from independent random-order frames");
        if (intensity == 0) require(first_result != raw(first), "UI stream zero became passthrough");
    }
}

class FailedOutput : public std::streambuf {
    std::streamsize xsputn(const char*, std::streamsize) override { return 0; }
    int_type overflow(int_type) override { return traits_type::eof(); }
};

class FailedFlush : public std::stringbuf {
    int sync() override { return -1; }
};

void errors_and_validation(const Image& lut) {
    const auto frame = raw(Image(1, 1));
    std::istringstream bad_input(frame);
    bad_input.setstate(std::ios::badbit);
    std::ostringstream output;
    rejects([&] { process_rgba_stream({bad_input, output, lut, 1, 1}); }, "input read failed");
    FailedOutput failed;
    std::ostream bad_output(&failed);
    std::istringstream input(frame);
    rejects([&] { process_rgba_stream({input, bad_output, lut, 1, 1}); }, "output write failed");
    FailedFlush flush;
    std::ostream flush_output(&flush);
    std::istringstream flush_input(frame);
    rejects([&] { process_rgba_stream({flush_input, flush_output, lut, 1, 1}); }, "output write failed");

    std::istringstream empty;
    rejects([&] { process_rgba_stream({empty, output, lut, 0, 1}); }, "dimensions");
    rejects([&] { process_rgba_stream({empty, output, Image(1, 1), 1, 1}); }, "LUT");
    rejects([&] { process_rgba_stream({empty, output, lut, 1, 1,
                                     std::numeric_limits<float>::quiet_NaN()}); }, "intensity");
    rejects([&] { process_rgba_stream({empty, output, lut, 1, 1, 0,
                                     static_cast<IntensityMode>(99)}); }, "mode");
    std::istringstream transparent(raw(Image(1, 1, {0, 0, 0, 0})));
    rejects([&] { process_rgba_stream({transparent, output, lut, 1, 1}); }, "opaque");
    require(output.str().empty(), "invalid stream emitted output");
}

} // namespace

int main() {
    try {
        const auto lut = identity_lut();
        boundaries_and_order(lut);
        ui_snapshot_stream(lut);
        eof_and_short_frames(lut);
        errors_and_validation(lut);
        std::cout << "PASS: both intensity modes, stream ordering/statelessness, EOF/truncation, failures/validation\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
}
