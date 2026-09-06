#include "gaussian.hpp"
#include "glow.hpp"
#include "image_io.hpp"
#include "layer.hpp"
#include "lut.hpp"
#include "pipeline.hpp"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>

namespace {

using namespace softglow;

void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

void near(float actual, float expected, float tolerance = 0.00001F) {
    require(std::abs(actual - expected) <= tolerance,
            "expected " + std::to_string(expected) + ", got " + std::to_string(actual));
}

template <typename Function>
void rejects(Function function) {
    bool rejected = false;
    try { function(); } catch (const std::exception&) { rejected = true; }
    require(rejected, "invalid input was accepted");
}

void same(const Image& actual, const Image& expected) {
    require(actual.width == expected.width && actual.height == expected.height, "dimension mismatch");
    require(to_rgba8(actual) == to_rgba8(expected), "expected byte-identical images");
}

void image_contract() {
    const std::vector<std::uint8_t> bytes{0, 1, 254, 255, 42, 117, 191, 0};
    require(to_rgba8(from_rgba8(bytes, 2, 1)) == bytes, "RGBA round trip");
    rejects([] { Image invalid(0, 1); });
    rejects([] { Image invalid(16385, 1); });
    rejects([] { from_rgba8({0, 1, 2}, 1, 1); });
    rejects([] { from_rgba8({0, 1, 2, 3, 4}, 1, 1); });
    Image corrupted(2, 2);
    corrupted.pixels.pop_back();
    rejects([&] { validate_image(corrupted); });
    rejects([&] { sample({corrupted, 0.5F, 0.5F}); });
    corrupted.width = 0;
    rejects([&] { sample({corrupted, 0.5F, 0.5F}); });
    Image nonfinite(1, 1);
    nonfinite.at(0, 0)[0] = std::numeric_limits<float>::quiet_NaN();
    rejects([&] { validate_image(nonfinite); });
    near(rgba8({-1, 0.5F, 2, 1})[1], 128 / 255.0F);
}

void sampling_edges() {
    Image source(2, 1);
    source.at(0, 0) = {0, 0, 0, 1};
    source.at(1, 0) = {1, 1, 1, 1};
    near(sample({source, 0.25F, 0.5F})[0], 0);
    near(sample({source, 0.5F, 0.5F})[0], 0.5F);
    near(sample({source, 0.75F, 0.5F})[0], 1);
    near(sample({source, -5, 0.5F})[0], 0);
    near(sample({source, 5, 0.5F})[0], 1);
    near(sample({source, -0.75F, 0.5F, Border::mirror})[0], 1);
    near(sample({source, 2.25F, 0.5F, Border::mirror})[0], 0);
    near(sample({source, 1.5F, 0.5F, Border::mirror})[0], 0.5F);
    near(sample({source, 0, 0.5F, Border::transparent})[3], 0.5F);
    near(sample({source, -1, 0.5F, Border::transparent})[3], 0);
    same(resize(source, 2, 1), source);
    rejects([&] { sample({source, std::numeric_limits<float>::infinity(), 0}); });
}

void lut_interpolation() {
    const Image atlas = identity_lut();
    const Image chart = test_chart(79, 43);
    const auto actual = to_rgba8(apply_lut(chart, atlas, 1));
    const auto expected = to_rgba8(chart);
    for (std::size_t index = 0; index < actual.size(); ++index) {
        require(std::abs(static_cast<int>(actual[index]) - expected[index]) <= 1, "identity LUT deviation");
    }
    Image swapped = atlas;
    for (auto& pixel : swapped.pixels) pixel = {pixel[2], 1 - pixel[1], pixel[0], 1};
    Image color(1, 1, {0.25F, 0.125F, 0.75F, 1});
    const auto mapped = apply_lut(color, swapped, 1).at(0, 0);
    near(mapped[0], 0.75F, 1 / 255.0F);
    near(mapped[1], 0.875F, 1 / 255.0F);
    near(mapped[2], 0.25F, 1 / 255.0F);
    same(apply_lut(chart, atlas, 0), chart);
    color.at(0, 0)[3] = 0;
    same(apply_lut(color, swapped, 1), color);
    rejects([&] { apply_lut(chart, Image(8, 8), 1); });
    rejects([&] { apply_lut(chart, atlas, -0.1F); });
}

void gaussian_kernel() {
    const auto plan = gaussian_plan({320, 180});
    require(plan.work_width == 160 && plan.work_height == 90, "Gaussian downsample dimensions");
    near(plan.samples_x, 7.4603027F);
    near(plan.sigma_x, 0.01575F);
    near(plan.sigma_y, 0.028F);
    near(plan.step_x, 0.005277936F);
    const Image constant(31, 19, rgba8({0.3F, 0.6F, 0.9F, 1}));
    same(gaussian_blur({constant}), constant);
    GaussianParams disabled;
    disabled.intensity = 0;
    const auto chart = test_chart(43, 29);
    same(gaussian_blur({chart, disabled}), chart);
    for (const auto& size : {std::pair{1, 1}, {1, 7}, {7, 1}, {13, 9}}) {
        const Image small(size.first, size.second, {1, 1, 1, 1});
        same(gaussian_blur({small}), small);
    }
    GaussianParams invalid;
    invalid.space_dither = 0.5F;
    rejects([&] { gaussian_blur({chart, invalid}); });
    invalid.space_dither = 0;
    invalid.gamma = 0;
    rejects([&] { gaussian_blur({chart, invalid}); });
    invalid.gamma = std::numeric_limits<float>::denorm_min();
    rejects([&] { gaussian_blur({chart, invalid}); });
}

void layers() {
    const Image base(3, 3, {0.25F, 0.25F, 0.25F, 1});
    const Image top(3, 3, {0.75F, 0.75F, 0.75F, 1});
    LayerParams params;
    params.opacity = 0.5F;
    near(composite_layer({base, top, params}).at(1, 1)[0], 128 / 255.0F);
    params.mode = LayerBlend::soft_light;
    params.opacity = 1;
    near(composite_layer({base, top, params}).at(1, 1)[0], 96 / 255.0F);
    params.opacity = 0;
    same(composite_layer({base, top, params}), base);
    params.scale_x = 0;
    rejects([&] { composite_layer({base, top, params}); });
}

void glow_limits_and_dither() {
    const auto gray = from_rgba8({128, 128, 128, 255}, 1, 1);
    require(to_rgba8(glow(gray, GlowParameters{})) == std::vector<std::uint8_t>{129, 129, 129, 255},
            "packed center-only glow disagrees with analytic result");
    const Image chart = test_chart(47, 31);
    GlowParameters params;
    params.threshold = 1;
    same(glow(chart, params), chart);
    params.threshold = 0.5F;
    params.brightness = 0;
    same(glow(chart, params), chart);
    params.brightness = 2.4F;
    params.dither = 1;
    same(glow(chart, params), glow(chart, params));
    for (const auto& color : {Pixel{0, 0, 0, 1}, Pixel{1, 1, 1, 1}}) {
        const Image constant(17, 11, color);
        same(glow(constant, params), constant);
    }
    params.glow_width = 0;
    validate_image(glow(chart, params));
    params.threshold = std::numeric_limits<float>::quiet_NaN();
    rejects([&] { glow(chart, params); });
}

void packed_glow_channels() {
    Image impulse(3, 1, {0, 0, 0, 0});
    impulse.at(1, 0) = {1, 0, 0, 1};
    GlowParameters params;
    params.threshold = 0;
    params.glow_width = 1 / 3.0F;
    params.width_y = 0;
    params.width_green = 1;
    params.width_blue = 1;
    int checked = 0;
    const auto sink = [&](std::string_view name, const Image& image) {
        if (name == "glow.horizontal_rg" || name == "glow.vertical_rg") {
            require(to_rgba8(image) == std::vector<std::uint8_t>{12, 222, 0, 0, 229, 67, 0, 0, 12, 222, 0, 0},
                    "RG packed Gaussian impulse differs from analytic weights");
            ++checked;
        }
        if (name == "glow.horizontal_ba" || name == "glow.vertical_ba") {
            require(to_rgba8(image) == std::vector<std::uint8_t>{0, 0, 12, 222, 0, 0, 229, 67, 0, 0, 12, 222},
                    "BA packed Gaussian impulse differs from analytic weights");
            ++checked;
        }
    };
    glow(impulse, params, sink);
    require(checked == 4, "packed blur stages were not observed");
}

void pipeline_detail_and_strength() {
    const Image chart = test_chart();
    const Image atlas = identity_lut();
    same(cinematic_soft_glow({chart, atlas, 0, {}}), chart);
    int stages = 0;
    bool mask_size = false;
    const auto sink = [&](std::string_view name, const Image& image) {
        ++stages;
        validate_image(image);
        for (const auto& pixel : image.pixels) {
            for (const float channel : pixel) near(channel * 255, std::round(channel * 255), 0.00002F);
        }
        if (name == "glow.mask") mask_size = image.width == 240 && image.height == 135;
    };
    const Image full = cinematic_soft_glow({chart, atlas, 1, sink});
    require(stages >= 12 && mask_size, "missing intermediate stages or wrong glow resolution");
    near(full.at(160, 150)[0], 1);
    near(full.at(160, 150)[1], 1);
    near(full.at(160, 150)[2], 1);
    const Image partial = cinematic_soft_glow({chart, atlas, 0.37F, {}});
    for (std::size_t index = 0; index < chart.pixels.size(); ++index) {
        for (std::size_t channel = 0; channel < 4; ++channel) {
            const float expected = std::round(std::lerp(chart.pixels[index][channel], full.pixels[index][channel], 0.37F) * 255) / 255;
            near(partial.pixels[index][channel], expected);
        }
    }
    same(full, cinematic_soft_glow({chart, atlas, 1, {}}));
    Image transparent(1, 1, {0, 0, 0, 0});
    rejects([&] { cinematic_soft_glow({transparent, atlas, 1, {}}); });
    rejects([&] { cinematic_soft_glow({chart, atlas, 2, {}}); });
}

void pipeline_intensity_modes() {
    const auto chart = test_chart(47, 31);
    auto atlas = identity_lut();
    for (auto& pixel : atlas.pixels) pixel = {pixel[2], 1 - pixel[1], pixel[0], 1};
    std::map<std::string, Image> stages;
    const auto sink = [&](std::string_view name, const Image& image) {
        stages.insert_or_assign(std::string(name), image);
    };
    const auto render = [&](float intensity) {
        stages.clear();
        return cinematic_soft_glow({chart, atlas, intensity, sink, IntensityMode::ui_snapshot});
    };
    const auto zero = render(0);
    same(zero, stages.at("02-soft-light"));
    same(zero, stages.at("03-glow"));
    same(zero, stages.at("04-lut"));
    require(to_rgba8(zero) != to_rgba8(chart), "UI zero must preserve the SoftLight contribution");
    same(render(1), cinematic_soft_glow({chart, atlas, 1, {}}));
    const auto full_glow = stages.at("03-glow");

    const auto partial = render(0.37F);
    same(partial, stages.at("05-normal"));
    same(stages.at("04-lut"), apply_lut(stages.at("03-glow"), atlas, 0.296F));
    require(to_rgba8(partial) != to_rgba8(cinematic_soft_glow({chart, atlas, 0.37F, {}})),
            "UI intensity was replaced by a final output blend");

    render(0.8F);
    const auto mask_80 = stages.at("glow.mask");
    const auto glow_80 = stages.at("03-glow");
    same(stages.at("04-lut"), apply_lut(glow_80, atlas, 0.64F));
    render(0.81F);
    same(stages.at("03-glow"), full_glow);
    same(stages.at("04-lut"), apply_lut(full_glow, atlas, 0.648F));
    require(to_rgba8(glow_80) != to_rgba8(full_glow), "80% incorrectly used the above-80% scene branch");
    const auto mask_81 = stages.at("glow.mask");
    require(to_rgba8(mask_80) != to_rgba8(mask_81), "80/81 threshold boundary disappeared");
    for (std::size_t index = 0; index < mask_80.pixels.size(); ++index) {
        for (std::size_t channel = 0; channel < 4; ++channel) {
            require(mask_80.pixels[index][channel] <= mask_81.pixels[index][channel],
                    "lower threshold reduced the selected highlight mask");
        }
    }
    same(render(0), zero);
    render(1);
    render(0.8F);
    same(render(0.37F), partial);
    same(render(1), cinematic_soft_glow({chart, atlas, 1, {}, IntensityMode::output_mix}));

    const Image gray(1, 1, rgba8({0.84F, 0.84F, 0.84F, 1}));
    for (const auto [intensity, cutoff] : {std::pair{0.37F, 0.93525F}, {0.8F, 0.86F}, {0.81F, 0.84F}}) {
        stages.clear();
        cinematic_soft_glow({gray, atlas, intensity, sink, IntensityMode::ui_snapshot});
        const float base = stages.at("02-soft-light").at(0, 0)[0];
        const float selected = std::max(0.0F, (base - cutoff) / (1 - cutoff));
        near(stages.at("glow.mask").at(0, 0)[0], rgba8({selected, 0, 0, 1})[0]);
    }
    require(parse_intensity_mode("output-mix") == IntensityMode::output_mix, "default mode parser");
    require(parse_intensity_mode("ui-snapshot") == IntensityMode::ui_snapshot, "UI mode parser");
    require(intensity_mode_name(IntensityMode::ui_snapshot) == "ui-snapshot", "mode report");
    rejects([] { parse_intensity_mode("ui_snapshot"); });
    rejects([&] { cinematic_soft_glow({chart, atlas, 0, {}, static_cast<IntensityMode>(99)}); });
}

} // namespace

int main() {
    const std::pair<const char*, void (*)()> cases[] = {
        {"image contract", image_contract}, {"sampling edges", sampling_edges},
        {"LUT interpolation", lut_interpolation}, {"Gaussian kernel", gaussian_kernel},
        {"layer blends", layers}, {"glow limits and dither", glow_limits_and_dither},
        {"packed glow channels", packed_glow_channels},
        {"pipeline detail and strength", pipeline_detail_and_strength},
        {"pipeline intensity modes", pipeline_intensity_modes},
    };
    int failed = 0;
    for (const auto& [name, test] : cases) {
        try { test(); std::cout << "PASS " << name << '\n'; }
        catch (const std::exception& error) { ++failed; std::cerr << "FAIL " << name << ": " << error.what() << '\n'; }
    }
    return failed == 0 ? 0 : 1;
}
