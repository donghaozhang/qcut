#include "image_io.hpp"
#include "lut.hpp"
#include "pipeline.hpp"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

struct Options {
    std::filesystem::path input;
    std::filesystem::path output;
    std::filesystem::path lut;
    std::filesystem::path trace;
    std::filesystem::path reference;
    int width = 320;
    int height = 180;
    float intensity = 1;
    softglow::IntensityMode intensity_mode = softglow::IntensityMode::output_mix;
    bool demo = false;
};

int positive_integer(const std::string& value) {
    int result = 0;
    const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result);
    if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size() || result <= 0) {
        throw std::invalid_argument("expected a positive integer: " + value);
    }
    return result;
}

Options parse_options(int argc, char** argv) {
    Options options;
    for (int index = 1; index < argc; ++index) {
        const std::string flag(argv[index]);
        if (flag == "--demo") {
            options.demo = true;
            continue;
        }
        if (++index >= argc) {
            throw std::invalid_argument("missing value after " + flag);
        }
        const std::string value(argv[index]);
        if (flag == "--input") options.input = value;
        else if (flag == "--output") options.output = value;
        else if (flag == "--lut") options.lut = value;
        else if (flag == "--trace") options.trace = value;
        else if (flag == "--reference") options.reference = value;
        else if (flag == "--width") options.width = positive_integer(value);
        else if (flag == "--height") options.height = positive_integer(value);
        else if (flag == "--intensity-mode") options.intensity_mode = softglow::parse_intensity_mode(value);
        else if (flag == "--intensity") {
            std::size_t end = 0;
            options.intensity = std::stof(value, &end);
            if (end != value.size() || !std::isfinite(options.intensity) ||
                options.intensity < 0 || options.intensity > 1) {
                throw std::invalid_argument("intensity must be in [0, 1]");
            }
        } else {
            throw std::invalid_argument("unknown option: " + flag);
        }
    }
    if (options.output.empty() || options.demo == !options.input.empty()) {
        throw std::invalid_argument("provide --output and exactly one of --demo or --input");
    }
    return options;
}

void report_error(const softglow::Image& image, const softglow::Image& reference) {
    const auto output = softglow::to_rgba8(image);
    const auto expected = softglow::to_rgba8(reference);
    double absolute_sum = 0;
    double squared_sum = 0;
    int maximum = 0;
    int alpha_maximum = 0;
    for (std::size_t index = 0; index < output.size(); ++index) {
        const int difference = std::abs(static_cast<int>(output[index]) - expected[index]);
        if (index % 4 == 3) {
            alpha_maximum = std::max(alpha_maximum, difference);
            continue;
        }
        absolute_sum += difference;
        squared_sum += difference * difference;
        maximum = std::max(maximum, difference);
    }
    const double channels = image.pixels.size() * 3.0;
    std::cout << ",\"rgb_mae\":" << absolute_sum / channels
              << ",\"rgb_rmse\":" << std::sqrt(squared_sum / channels)
              << ",\"rgb_max\":" << maximum
              << ",\"alpha_max\":" << alpha_maximum;
}

} // namespace

int main(int argc, char** argv) {
    if (argc == 1 || (argc == 2 && std::string(argv[1]) == "--help")) {
        std::cout << "soft-glow --demo | --input IN.rgba --output OUT.rgba|OUT.ppm\n"
                     "  [--width 320 --height 180] [--lut ATLAS.rgba] [--intensity 1]\n"
                     "  [--intensity-mode output-mix|ui-snapshot] (default: output-mix)\n"
                     "  [--trace DIR] [--reference REFERENCE.rgba]\n"
                     "Raw files: RGBA8, top-down, tightly packed. LUT: 512x512 tiled 64-cube.\n"
                     "Omitting --lut uses an identity atlas for a self-contained demonstration.\n";
        return 0;
    }
    try {
        const Options options = parse_options(argc, argv);
        const auto input = options.demo ? softglow::test_chart(options.width, options.height)
                                        : softglow::read_raw(options.input, options.width, options.height);
        const auto lut = options.lut.empty() ? softglow::identity_lut()
                                            : softglow::read_raw(options.lut, 512, 512);
        softglow::StageSink sink;
        if (!options.trace.empty()) {
            std::filesystem::create_directories(options.trace);
            sink = [&](std::string_view name, const softglow::Image& stage) {
                const auto path = options.trace / std::string(name);
                softglow::write_raw(path.string() + ".rgba", stage);
                softglow::write_ppm(path.string() + ".ppm", stage);
            };
        }
        const auto start = std::chrono::steady_clock::now();
        const auto output = softglow::cinematic_soft_glow(
            {input, lut, options.intensity, sink, options.intensity_mode});
        const auto elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
        if (options.output.extension() == ".ppm") {
            softglow::write_ppm(options.output, output);
        } else {
            softglow::write_raw(options.output, output);
        }
        std::cout << std::fixed << std::setprecision(6)
                  << "{\"width\":" << output.width << ",\"height\":" << output.height
                  << ",\"intensity\":" << options.intensity
                  << ",\"intensity_mode\":\"" << softglow::intensity_mode_name(options.intensity_mode) << '"'
                  << ",\"seconds\":" << elapsed
                  << ",\"lut\":\"" << (options.lut.empty() ? "identity-demo" : "external-atlas") << '"';
        if (!options.reference.empty()) {
            report_error(output, softglow::read_raw(options.reference, options.width, options.height));
        }
        std::cout << "}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "soft-glow: " << error.what() << '\n';
        return 1;
    }
}
