#include "image_io.hpp"

#include <cmath>
#include <fstream>
#include <stdexcept>

namespace softglow {
namespace {

std::ofstream output_stream(const std::filesystem::path& path) {
    std::ofstream stream(path, std::ios::binary);
    if (!stream) {
        throw std::runtime_error("cannot create output: " + path.string());
    }
    stream.exceptions(std::ios::failbit | std::ios::badbit);
    return stream;
}

} // namespace

Image read_raw(const std::filesystem::path& path, int width, int height) {
    Image size_check(width, height);
    const auto expected = size_check.pixels.size() * 4;
    if (std::filesystem::file_size(path) != expected) {
        throw std::invalid_argument("raw input size differs from width * height * 4: " + path.string());
    }
    std::ifstream stream(path, std::ios::binary);
    stream.exceptions(std::ios::failbit | std::ios::badbit);
    std::vector<std::uint8_t> bytes(expected);
    stream.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    return from_rgba8(bytes, width, height);
}

void write_raw(const std::filesystem::path& path, const Image& image) {
    auto stream = output_stream(path);
    const auto bytes = to_rgba8(image);
    stream.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
}

void write_ppm(const std::filesystem::path& path, const Image& image) {
    auto stream = output_stream(path);
    const auto bytes = to_rgba8(image);
    stream << "P6\n" << image.width << ' ' << image.height << "\n255\n";
    for (std::size_t index = 0; index < bytes.size(); index += 4) {
        stream.write(reinterpret_cast<const char*>(bytes.data() + index), 3);
    }
}

Image test_chart(int width, int height) {
    Image image(width, height);
    constexpr std::array<std::array<int, 3>, 4> skins = {{{234, 189, 157}, {185, 128, 96}, {121, 78, 55}, {242, 204, 177}}};
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const int chart_x = static_cast<int>(x * 320LL / width);
            const int chart_y = static_cast<int>(y * 180LL / height);
            const int column = chart_x / 20;
            const int row = chart_y / 20;
            std::array<int, 3> rgb{20, 20, 20};
            if (row == 0) {
                const int gray = static_cast<int>(std::round(column * 255.0 / 15));
                rgb = {gray, gray, gray};
            } else if (row == 1) {
                rgb = skins[column % 4];
            } else if (row <= 5) {
                rgb = {(column % 4) * 85, (column / 4) * 85, (row - 2) * 85};
            } else {
                const int circle_x = chart_x - 64;
                const int circle_y = chart_y - 150;
                const bool circle = circle_x * circle_x + circle_y * circle_y < 180;
                const bool square = chart_x > 210 && chart_x < 235 && chart_y > 130 && chart_y < 160;
                if (circle || square || chart_x == 160) {
                    rgb = {255, 255, 255};
                }
            }
            image.at(x, y) = {rgb[0] / 255.0F, rgb[1] / 255.0F, rgb[2] / 255.0F, 1};
        }
    }
    return image;
}

} // namespace softglow
