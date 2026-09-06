#include "image_io.hpp"
#include "stream_io.hpp"

#include <charconv>
#include <chrono>
#include <cmath>
#include <csignal>
#include <cstdio>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace {

struct Options {
    std::filesystem::path lut;
    int width = 0;
    int height = 0;
    float intensity = 1;
    softglow::IntensityMode intensity_mode = softglow::IntensityMode::output_mix;
};

int dimension(const std::string& value) {
    int parsed = 0;
    const auto result = std::from_chars(value.data(), value.data() + value.size(), parsed);
    if (result.ec != std::errc{} || result.ptr != value.data() + value.size() || parsed <= 0) {
        throw std::invalid_argument("expected a positive dimension: " + value);
    }
    return parsed;
}

Options parse_options(int argc, char** argv) {
    Options options;
    std::set<std::string> seen;
    for (int index = 1; index < argc; ++index) {
        const std::string flag(argv[index]);
        if (!seen.insert(flag).second) {
            throw std::invalid_argument("duplicate option: " + flag);
        }
        if (flag != "--lut" && flag != "--width" && flag != "--height" &&
            flag != "--intensity" && flag != "--intensity-mode") {
            throw std::invalid_argument("unknown option: " + flag);
        }
        if (++index >= argc) throw std::invalid_argument("missing value after " + flag);
        const std::string value(argv[index]);
        if (flag == "--lut") options.lut = value;
        else if (flag == "--width") options.width = dimension(value);
        else if (flag == "--height") options.height = dimension(value);
        else if (flag == "--intensity-mode") options.intensity_mode = softglow::parse_intensity_mode(value);
        else {
            std::size_t end = 0;
            options.intensity = std::stof(value, &end);
            if (end != value.size() || !std::isfinite(options.intensity) ||
                options.intensity < 0 || options.intensity > 1) {
                throw std::invalid_argument("intensity must be in [0, 1]");
            }
        }
    }
    if (options.lut.empty() || options.width == 0 || options.height == 0) {
        throw std::invalid_argument("--lut, --width and --height are required");
    }
    return options;
}

void configure_standard_streams() {
#ifdef _WIN32
    if (_setmode(_fileno(stdin), _O_BINARY) == -1 ||
        _setmode(_fileno(stdout), _O_BINARY) == -1) {
        throw std::runtime_error("cannot set standard streams to binary mode");
    }
#endif
#ifdef SIGPIPE
    std::signal(SIGPIPE, SIG_IGN);
#endif
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
}

} // namespace

int main(int argc, char** argv) {
    if (argc == 2 && std::string(argv[1]) == "--help") {
        std::cerr << "soft-glow-stream --lut ATLAS.rgba --width W --height H [--intensity 1]\n"
                     "  [--intensity-mode output-mix|ui-snapshot] (default: output-mix)\n"
                     "stdin/stdout: opaque RGBA8, top-down, tightly packed, W*H*4 bytes/frame.\n"
                     "LUT: external 512x512 RGBA8 atlas. No headers, timestamps or audio.\n"
                     "Each complete output frame is flushed. EOF must fall on a frame boundary.\n"
                     "Statistics and errors go to stderr; stdout contains only pixel bytes.\n";
        return 0;
    }
    try {
        const auto options = parse_options(argc, argv);
        configure_standard_streams();
        const auto lut = softglow::read_raw(options.lut, 512, 512);
        const auto start = std::chrono::steady_clock::now();
        const auto statistics = softglow::process_rgba_stream(
            {std::cin, std::cout, lut, options.width, options.height, options.intensity,
             options.intensity_mode});
        const double seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
        std::cerr << std::fixed << std::setprecision(6)
                  << "{\"protocol\":\"rgba8-frames-v1\",\"frames\":" << statistics.frames
                  << ",\"bytes_in\":" << statistics.bytes << ",\"bytes_out\":" << statistics.bytes
                  << ",\"width\":" << options.width << ",\"height\":" << options.height
                  << ",\"intensity\":" << options.intensity
                  << ",\"intensity_mode\":\"" << softglow::intensity_mode_name(options.intensity_mode) << '"'
                  << ",\"seconds\":" << seconds << "}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "soft-glow-stream: " << error.what() << '\n';
        return 1;
    }
}
