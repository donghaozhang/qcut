// QCut-owned interoperability probe; third-party libraries and assets are supplied at runtime.
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl.h>

#include <dlfcn.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace {

using EffectHandle = std::uint64_t;
using Result = std::int32_t;
using EffectCreate = Result (*)(EffectHandle*);
using EffectDestroy = void (*)(EffectHandle);
using EffectSetRenderApi = Result (*)(EffectHandle, std::int32_t);
using EffectUsePipeline = Result (*)(EffectHandle, bool);
using EffectInit = Result (*)(EffectHandle, std::int32_t, std::int32_t, const char*, const char*);
using EffectSetWidthHeight = Result (*)(EffectHandle, std::int32_t, std::int32_t);
using EffectSetOrientation = Result (*)(EffectHandle, std::int32_t);
using EffectSet = Result (*)(EffectHandle, const char*);
using EffectComposerSetNodes =
    Result (*)(EffectHandle, const char* const*, std::int32_t);
using EffectComposerSetMode = Result (*)(EffectHandle, std::int32_t, std::int32_t);
using EffectComposerUpdateNode =
    Result (*)(EffectHandle, const char*, const char*, float);
using EffectComposerUpdateNodeWithJson =
    Result (*)(EffectHandle, const char*, const char*, const char*);
using EffectGetFeature = Result (*)(EffectHandle, const char*, EffectHandle*);
using EffectSetIntensity = Result (*)(EffectHandle, std::int32_t, float);
using EffectUpdateReshapeFaceIntensity =
    Result (*)(EffectHandle, float, float);
using EffectSendMessage =
    Result (*)(EffectHandle, std::int32_t, std::int32_t, std::int32_t, const char*);
using EffectSetParamWithKey = void (*)(const char*, const char*);
using EffectSetAlgorithmParam =
    Result (*)(EffectHandle, const char*, const char*, const void*, std::int32_t);
using EffectAlgorithmTexture = Result (*)(EffectHandle, GLuint, double);
using EffectProcessTexture = Result (*)(EffectHandle, GLuint, GLuint, double);
using EffectGetBachResult = Result (*)(EffectHandle, void**, std::int32_t);
using EffectGetBachResultByNodeName = Result (*)(EffectHandle, const char*, void**);
using EffectGetBachResultByGraphAndNodeName =
    Result (*)(EffectHandle, const char*, const char*, void**);
using EffectConfigAbValue = Result (*)(const char*, const void*, std::int32_t);
using SkinSegTextureId = GLuint (*)(void*);

template <typename Function>
Function loadSymbol(const struct SymbolOptions& options);

struct SymbolOptions {
    void* library;
    const char* name;
};

template <typename Function>
Function loadSymbol(const SymbolOptions& options) {
    dlerror();
    void* symbol = dlsym(options.library, options.name);
    if (const char* error = dlerror(); error != nullptr) {
        std::cerr << "dlsym " << options.name << " failed: " << error << '\n';
        std::exit(3);
    }
    return reinterpret_cast<Function>(symbol);
}

struct ImageSize {
    int width;
    int height;
};

struct ImageData {
    ImageSize size;
    std::vector<std::uint8_t> rgba;
};

struct ReadPpmOptions {
    const char* path;
};

struct ReadInputListOptions {
    const char* path;
};

std::vector<std::string> readInputList(const ReadInputListOptions& options) {
    std::ifstream input(options.path);
    if (!input) {
        throw std::runtime_error(std::string("cannot open input list: ") + options.path);
    }

    std::vector<std::string> paths;
    std::string line;
    while (std::getline(input, line)) {
        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }
        if (!line.empty()) {
            paths.push_back(line);
        }
    }
    if (paths.empty()) {
        throw std::runtime_error("input list must contain at least one PPM path");
    }
    return paths;
}

ImageData readPpm(const ReadPpmOptions& options) {
    std::ifstream input(options.path, std::ios::binary);
    if (!input) {
        throw std::runtime_error(std::string("cannot open input PPM: ") + options.path);
    }

    std::string magic;
    int width = 0;
    int height = 0;
    int maxValue = 0;
    input >> magic >> width >> height >> maxValue;
    if (magic != "P6" || width <= 0 || height <= 0 || maxValue != 255) {
        throw std::runtime_error("input must be an 8-bit binary P6 PPM without header comments");
    }
    input.get();

    const auto pixelCount = static_cast<std::uint64_t>(width) * static_cast<std::uint64_t>(height);
    if (pixelCount > std::numeric_limits<std::size_t>::max() / 4) {
        throw std::runtime_error("input dimensions are too large");
    }
    std::vector<std::uint8_t> rgb(static_cast<std::size_t>(pixelCount * 3));
    input.read(reinterpret_cast<char*>(rgb.data()), static_cast<std::streamsize>(rgb.size()));
    if (input.gcount() != static_cast<std::streamsize>(rgb.size())) {
        throw std::runtime_error("input PPM payload is truncated");
    }

    std::vector<std::uint8_t> rgba(static_cast<std::size_t>(pixelCount * 4));
    for (int y = 0; y < height; ++y) {
        const int sourceY = height - y - 1;
        for (int x = 0; x < width; ++x) {
            // Index maths must widen before multiplying: int overflows at
            // ~27 megapixels, well inside the dimensions the guard accepts.
            const std::size_t sourceOffset =
                (static_cast<std::size_t>(sourceY) * width + x) * 3;
            const std::size_t targetOffset = (static_cast<std::size_t>(y) * width + x) * 4;
            rgba[targetOffset] = rgb[sourceOffset];
            rgba[targetOffset + 1] = rgb[sourceOffset + 1];
            rgba[targetOffset + 2] = rgb[sourceOffset + 2];
            rgba[targetOffset + 3] = 255;
        }
    }
    return {.size = {.width = width, .height = height}, .rgba = std::move(rgba)};
}

std::vector<std::uint8_t> makeCalibrationImage(const ImageSize& size) {
    std::vector<std::uint8_t> pixels(static_cast<std::size_t>(size.width) * size.height * 4);
    for (int y = 0; y < size.height; ++y) {
        for (int x = 0; x < size.width; ++x) {
            const std::size_t offset = (static_cast<std::size_t>(y) * size.width + x) * 4;
            pixels[offset] = static_cast<std::uint8_t>((x * 255) / (size.width - 1));
            pixels[offset + 1] = static_cast<std::uint8_t>((y * 255) / (size.height - 1));
            pixels[offset + 2] = static_cast<std::uint8_t>(((x / 8 + y / 8) % 2) * 220 + 20);
            pixels[offset + 3] = 255;
        }
    }
    return pixels;
}

std::vector<std::uint8_t> makeOutputSeed(const ImageSize& size) {
    std::vector<std::uint8_t> pixels(static_cast<std::size_t>(size.width) * size.height * 4);
    for (std::size_t offset = 0; offset < pixels.size(); offset += 4) {
        pixels[offset] = 255;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
    }
    return pixels;
}

struct TextureOptions {
    const std::vector<std::uint8_t>& pixels;
    ImageSize size;
};

struct UpdateTextureOptions {
    GLuint texture;
    const std::vector<std::uint8_t>& pixels;
    ImageSize size;
};

GLuint createTexture(const TextureOptions& options) {
    GLuint texture = 0;
    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_BASE_LEVEL, 0);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, 0);
    glTexImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGBA,
        options.size.width,
        options.size.height,
        0,
        GL_RGBA,
        GL_UNSIGNED_BYTE,
        options.pixels.data());
    glBindTexture(GL_TEXTURE_2D, 0);
    return texture;
}

void updateTexture(const UpdateTextureOptions& options) {
    glBindTexture(GL_TEXTURE_2D, options.texture);
    glTexSubImage2D(
        GL_TEXTURE_2D,
        0,
        0,
        0,
        options.size.width,
        options.size.height,
        GL_RGBA,
        GL_UNSIGNED_BYTE,
        options.pixels.data());
    glBindTexture(GL_TEXTURE_2D, 0);
}

std::vector<std::uint8_t> flipImageRows(
    const std::vector<std::uint8_t>& pixels,
    const ImageSize& size) {
    const std::size_t rowBytes = static_cast<std::size_t>(size.width) * 4;
    std::vector<std::uint8_t> flipped(pixels.size());
    for (int y = 0; y < size.height; ++y) {
        const std::size_t sourceOffset = static_cast<std::size_t>(y) * rowBytes;
        const std::size_t targetOffset =
            static_cast<std::size_t>(size.height - y - 1) * rowBytes;
        std::copy_n(pixels.data() + sourceOffset, rowBytes, flipped.data() + targetOffset);
    }
    return flipped;
}

struct ReadTextureOptions {
    GLuint texture;
    ImageSize size;
};

std::vector<std::uint8_t> readTexture(const ReadTextureOptions& options) {
    GLuint framebuffer = 0;
    glGenFramebuffers(1, &framebuffer);
    glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, options.texture, 0);
    const GLenum framebufferStatus = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    std::cout << "framebuffer_status=0x" << std::hex << framebufferStatus << std::dec << '\n';
    if (framebufferStatus != GL_FRAMEBUFFER_COMPLETE) {
        glDeleteFramebuffers(1, &framebuffer);
        return {};
    }

    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    std::vector<std::uint8_t> pixels(
        static_cast<std::size_t>(options.size.width) * options.size.height * 4);
    glReadPixels(
        0,
        0,
        options.size.width,
        options.size.height,
        GL_RGBA,
        GL_UNSIGNED_BYTE,
        pixels.data());
    glFinish();
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glDeleteFramebuffers(1, &framebuffer);
    return pixels;
}

struct DifferenceResult {
    std::uint64_t fromInput;
    std::uint64_t fromSeed;
    std::uint64_t outputSum;
};

struct DifferenceOptions {
    const std::vector<std::uint8_t>& output;
    const std::vector<std::uint8_t>& input;
    const std::vector<std::uint8_t>& seed;
};

DifferenceResult calculateDifference(const DifferenceOptions& options) {
    DifferenceResult result{};
    for (std::size_t index = 0; index < options.output.size(); ++index) {
        result.fromInput += static_cast<std::uint64_t>(std::abs(
            static_cast<int>(options.output[index]) - static_cast<int>(options.input[index])));
        result.fromSeed += static_cast<std::uint64_t>(std::abs(
            static_cast<int>(options.output[index]) - static_cast<int>(options.seed[index])));
        result.outputSum += options.output[index];
    }
    return result;
}

struct PpmOptions {
    const char* outputPath;
    const std::vector<std::uint8_t>& pixels;
    ImageSize size;
};

// Returns false when the artifact could not be fully written; a silently
// missing or truncated PPM would otherwise read as a real parity result.
[[nodiscard]] bool writePpm(const PpmOptions& options) {
    std::ofstream output(options.outputPath, std::ios::binary);
    if (!output) {
        return false;
    }
    output << "P6\n" << options.size.width << ' ' << options.size.height << "\n255\n";
    for (int y = options.size.height - 1; y >= 0; --y) {
        for (int x = 0; x < options.size.width; ++x) {
            const std::size_t offset =
                (static_cast<std::size_t>(y) * options.size.width + x) * 4;
            output.write(reinterpret_cast<const char*>(options.pixels.data() + offset), 3);
        }
    }
    return output.good();
}

struct ContextResult {
    CGLPixelFormatObj pixelFormat;
    CGLContextObj context;
};

ContextResult createContext(bool useCoreProfile) {
    const CGLPixelFormatAttribute profile = static_cast<CGLPixelFormatAttribute>(
        useCoreProfile ? kCGLOGLPVersion_3_2_Core : kCGLOGLPVersion_Legacy);
    const CGLPixelFormatAttribute attributes[] = {
        kCGLPFAOpenGLProfile,
        profile,
        kCGLPFAAccelerated,
        kCGLPFAAllowOfflineRenderers,
        kCGLPFAColorSize,
        static_cast<CGLPixelFormatAttribute>(32),
        kCGLPFAAlphaSize,
        static_cast<CGLPixelFormatAttribute>(8),
        static_cast<CGLPixelFormatAttribute>(0),
    };

    CGLPixelFormatObj pixelFormat = nullptr;
    GLint pixelFormatCount = 0;
    CGLError error = CGLChoosePixelFormat(attributes, &pixelFormat, &pixelFormatCount);
    std::cout << "choose_pixel_format=" << error << " count=" << pixelFormatCount << '\n';
    if (error != kCGLNoError || pixelFormat == nullptr) {
        return {};
    }

    CGLContextObj context = nullptr;
    error = CGLCreateContext(pixelFormat, nullptr, &context);
    std::cout << "create_context=" << error << '\n';
    if (error != kCGLNoError || context == nullptr) {
        CGLDestroyPixelFormat(pixelFormat);
        return {};
    }

    error = CGLSetCurrentContext(context);
    std::cout << "make_current=" << error << '\n';
    if (error != kCGLNoError) {
        CGLDestroyContext(context);
        CGLDestroyPixelFormat(pixelFormat);
        return {};
    }
    return {.pixelFormat = pixelFormat, .context = context};
}

const char* glString(GLenum name) {
    const auto* value = glGetString(name);
    return value == nullptr ? "<null>" : reinterpret_cast<const char*>(value);
}

struct InspectSkinResultOptions {
    EffectHandle handle;
    EffectGetBachResult getResultByType;
    EffectGetBachResultByNodeName getResult;
    EffectGetBachResultByGraphAndNodeName getResultByGraphAndNode;
    SkinSegTextureId getTextureId;
    const char* maskOutputPath;
};

struct InspectFaceResultOptions {
    EffectHandle handle;
    EffectGetBachResult getResultByType;
    EffectGetBachResultByNodeName getResult;
    const char* outputPath;
    const char* coordinateSpace;
};

struct InspectTextureOptions {
    GLint expectedWidth;
    GLint expectedHeight;
};

void inspectMatchingTextures(const InspectTextureOptions& options) {
    GLint previousTexture = 0;
    glGetIntegerv(GL_TEXTURE_BINDING_2D, &previousTexture);
    for (GLuint texture = 1; texture <= 4096; ++texture) {
        if (glIsTexture(texture) == GL_FALSE) {
            continue;
        }

        while (glGetError() != GL_NO_ERROR) {
        }
        glBindTexture(GL_TEXTURE_2D, texture);
        if (glGetError() != GL_NO_ERROR) {
            continue;
        }

        GLint width = 0;
        GLint height = 0;
        glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_WIDTH, &width);
        glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_HEIGHT, &height);
        if (width != options.expectedWidth || height != options.expectedHeight) {
            continue;
        }

        GLint internalFormat = 0;
        GLint minFilter = 0;
        GLint magFilter = 0;
        glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_INTERNAL_FORMAT, &internalFormat);
        glGetTexParameteriv(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, &minFilter);
        glGetTexParameteriv(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, &magFilter);

        const std::size_t pixelCount = static_cast<std::size_t>(width) * height;
        std::vector<float> rgba(pixelCount * 4);
        glGetTexImage(GL_TEXTURE_2D, 0, GL_RGBA, GL_FLOAT, rgba.data());
        const GLenum readError = glGetError();
        std::array<float, 4> minimum = {
            std::numeric_limits<float>::max(),
            std::numeric_limits<float>::max(),
            std::numeric_limits<float>::max(),
            std::numeric_limits<float>::max(),
        };
        std::array<float, 4> maximum = {
            std::numeric_limits<float>::lowest(),
            std::numeric_limits<float>::lowest(),
            std::numeric_limits<float>::lowest(),
            std::numeric_limits<float>::lowest(),
        };
        std::array<double, 4> sums{};
        std::array<bool, 256> redValues{};
        std::size_t redZeroCount = 0;
        std::size_t redFullCount = 0;
        if (readError == GL_NO_ERROR) {
            for (std::size_t pixel = 0; pixel < pixelCount; ++pixel) {
                for (std::size_t channel = 0; channel < 4; ++channel) {
                    const float value = rgba[pixel * 4 + channel];
                    minimum[channel] = std::min(minimum[channel], value);
                    maximum[channel] = std::max(maximum[channel], value);
                    sums[channel] += value;
                }
                const auto red = static_cast<std::uint8_t>(
                    std::lround(std::clamp(rgba[pixel * 4], 0.0F, 1.0F) * 255.0F));
                redValues[red] = true;
                redZeroCount += red == 0 ? 1 : 0;
                redFullCount += red == 255 ? 1 : 0;
            }
        }

        std::size_t redUniqueCount = 0;
        for (const bool wasSeen : redValues) {
            redUniqueCount += wasSeen ? 1 : 0;
        }

        std::cout << "skin_candidate_texture=" << texture
                  << " size=" << width << 'x' << height
                  << " internal_format=0x" << std::hex << internalFormat
                  << " min_filter=0x" << minFilter
                  << " mag_filter=0x" << magFilter
                  << " read_error=0x" << readError << std::dec;
        if (readError == GL_NO_ERROR) {
            std::cout << " rgba_min=" << minimum[0] << ',' << minimum[1] << ',' << minimum[2]
                      << ',' << minimum[3]
                      << " rgba_max=" << maximum[0] << ',' << maximum[1] << ',' << maximum[2]
                      << ',' << maximum[3]
                      << " rgba_mean=" << sums[0] / pixelCount << ',' << sums[1] / pixelCount
                      << ',' << sums[2] / pixelCount << ',' << sums[3] / pixelCount
                      << " red_unique=" << redUniqueCount
                      << " red_zero_pct=" << 100.0 * redZeroCount / pixelCount
                      << " red_full_pct=" << 100.0 * redFullCount / pixelCount
                      << " red_soft_pct="
                      << 100.0 * (pixelCount - redZeroCount - redFullCount) / pixelCount;
        }
        std::cout << '\n';
    }
    glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(previousTexture));
}

bool writePgmMask(
    const char* outputPath,
    const std::uint8_t* pixels,
    std::int32_t width,
    std::int32_t height) {
    if (outputPath == nullptr) {
        return true;
    }
    std::ofstream output(outputPath, std::ios::binary);
    output << "P5\n" << width << ' ' << height << "\n255\n";
    output.write(
        reinterpret_cast<const char*>(pixels),
        static_cast<std::streamsize>(width) * height);
    if (!output) {
        std::cerr << "failed to write skin mask: " << outputPath << '\n';
        return false;
    }
    std::cout << "skin_mask_output=" << outputPath << " size=" << width << 'x'
              << height << '\n';
    return true;
}

struct WriteSkinSegInfoCpuMaskOptions {
    const void* nativeResult;
    const char* outputPath;
};

bool writeSkinSegInfoCpuMask(const WriteSkinSegInfoCpuMaskOptions& options) {
    const auto* nativeBytes =
        static_cast<const std::uint8_t*>(options.nativeResult);
    std::int32_t width = 0;
    std::int32_t height = 0;
    float reflector = 0.0F;
    std::memcpy(&width, nativeBytes + 0x0c, sizeof(width));
    std::memcpy(&height, nativeBytes + 0x10, sizeof(height));
    std::memcpy(&reflector, nativeBytes + 0x14, sizeof(reflector));
    std::cout << "skin_cpu_mask_size=" << width << 'x' << height
              << " reflector=" << reflector << '\n';
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        return false;
    }

    // Verified libcccreator layout: +0x18 owns a PrimitiveVector whose
    // implementation stores begin/end at +0x10/+0x18.
    const void* container = nullptr;
    std::memcpy(&container, nativeBytes + 0x18, sizeof(container));
    if (container == nullptr) {
        return false;
    }
    const auto* containerBytes = static_cast<const std::uint8_t*>(container);
    const std::uint8_t* begin = nullptr;
    const std::uint8_t* end = nullptr;
    std::memcpy(&begin, containerBytes + 0x10, sizeof(begin));
    std::memcpy(&end, containerBytes + 0x18, sizeof(end));
    const std::size_t expected =
        static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
    if (begin == nullptr || end == nullptr || end < begin ||
        static_cast<std::size_t>(end - begin) != expected) {
        return false;
    }
    return writePgmMask(options.outputPath, begin, width, height);
}

bool inspectSkinResult(const InspectSkinResultOptions& options) {
    void* resultObject = nullptr;
    Result result = options.getResult(options.handle, "skin_seg_0", &resultObject);
    std::cout << "skin_result_by_node_status=" << result << " object=" << resultObject << '\n';

    if (result != 0 || resultObject == nullptr) {
        resultObject = nullptr;
        result = options.getResultByGraphAndNode(
            options.handle,
            "4521b936b02c11ee9c4e7c10c9c055a5",
            "skin_seg_0",
            &resultObject);
        std::cout << "skin_result_by_graph_status=" << result << " object=" << resultObject
                  << '\n';
    }

    if (result != 0 || resultObject == nullptr) {
        resultObject = nullptr;
        result = options.getResultByType(options.handle, &resultObject, 49);
        std::cout << "skin_result_by_type_status=" << result << " object=" << resultObject
                  << '\n';
    }

    if (result != 0 || resultObject == nullptr) {
        return false;
    }

    void* const vtable = *static_cast<void**>(resultObject);
    Dl_info symbolInfo{};
    const bool hasSymbol = dladdr(vtable, &symbolInfo) != 0 && symbolInfo.dli_sname != nullptr;
    const std::string_view symbolName = hasSymbol ? symbolInfo.dli_sname : "<unknown>";
    std::cout << "skin_result_vtable=" << vtable << " symbol=" << symbolName << '\n';

    if (symbolName.find("SkinSegBuffer") != std::string_view::npos) {
        const auto* objectBytes = static_cast<const std::uint8_t*>(resultObject);
        void* nativeResult = nullptr;
        std::memcpy(&nativeResult, objectBytes + 0x38, sizeof(nativeResult));
        std::cout << "skin_buffer_native_result=" << nativeResult << '\n';
        if (nativeResult == nullptr) {
            return false;
        }

        const auto* nativeBytes = static_cast<const std::uint8_t*>(nativeResult);
        std::int32_t width = 0;
        std::int32_t height = 0;
        float reflector = 0.0F;
        std::memcpy(&width, nativeBytes + 0x0c, sizeof(width));
        std::memcpy(&height, nativeBytes + 0x10, sizeof(height));
        std::memcpy(&reflector, nativeBytes + 0x14, sizeof(reflector));
        std::cout << "skin_buffer_size=" << width << 'x' << height
                  << " reflector=" << reflector << '\n';
        // Non-positive native dimensions would make the scan divide by zero in
        // its per-pixel statistics, so bail out before touching any texture.
        if (width <= 0 || height <= 0) {
            return false;
        }
        // Only walk the documented libcccreator layout when the operator
        // asked for a mask; a run without --mask-output must not fail (or
        // dereference container internals) over an unexpected layout.
        if (options.maskOutputPath != nullptr &&
            !writeSkinSegInfoCpuMask({
                .nativeResult = nativeResult,
                .outputPath = options.maskOutputPath,
            })) {
            return false;
        }
        inspectMatchingTextures({.expectedWidth = width, .expectedHeight = height});
        return true;
    }

    if (symbolName.find("SkinSegInfo") == std::string_view::npos) {
        return options.maskOutputPath == nullptr;
    }

    // The observed SkinSegInfo wrapper embeds the native result inline, so
    // the same 0x0c/0x10/0x14/0x18 layout applies to resultObject directly.
    // Still, only touch those offsets when a mask was explicitly requested:
    // reading them on an unverified object type is the crash risk.
    if (options.maskOutputPath != nullptr &&
        !writeSkinSegInfoCpuMask({
            .nativeResult = resultObject,
            .outputPath = options.maskOutputPath,
        })) {
        return false;
    }

    const GLuint texture = options.getTextureId(resultObject);
    std::cout << "skin_result_texture=" << texture
              << " valid=" << static_cast<int>(glIsTexture(texture)) << '\n';
    if (texture == 0 || glIsTexture(texture) == GL_FALSE) {
        return true;
    }

    GLint previousTexture = 0;
    GLint width = 0;
    GLint height = 0;
    GLint internalFormat = 0;
    GLint minFilter = 0;
    GLint magFilter = 0;
    glGetIntegerv(GL_TEXTURE_BINDING_2D, &previousTexture);
    glBindTexture(GL_TEXTURE_2D, texture);
    glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_WIDTH, &width);
    glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_HEIGHT, &height);
    glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_INTERNAL_FORMAT, &internalFormat);
    glGetTexParameteriv(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, &minFilter);
    glGetTexParameteriv(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, &magFilter);
    glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(previousTexture));
    std::cout << "skin_result_texture_size=" << width << 'x' << height
              << " internal_format=0x" << std::hex << internalFormat
              << " min_filter=0x" << minFilter
              << " mag_filter=0x" << magFilter
              << " gl_error=0x" << glGetError() << std::dec << '\n';
    return true;
}

struct FaceLandmark {
    float x = 0.0F;
    float y = 0.0F;
    float visibility = 0.0F;
};

struct FaceObservation {
    std::array<float, 4> rawRect{};
    float score = 0.0F;
    float yaw = 0.0F;
    float pitch = 0.0F;
    float roll = 0.0F;
    float eyeDistance = 0.0F;
    std::int32_t id = 0;
    std::int32_t action = 0;
    std::int32_t trackingCount = 0;
    std::vector<FaceLandmark> landmarks;
};

struct PrimitiveVectorView {
    const std::uint8_t* begin;
    std::size_t size;
};

bool readPrimitiveVectorView(
    const void* object,
    std::size_t elementSize,
    std::size_t maximumElements,
    PrimitiveVectorView* view) {
    if (object == nullptr || elementSize == 0 || view == nullptr) {
        return false;
    }
    const auto* objectBytes = static_cast<const std::uint8_t*>(object);
    const std::uint8_t* begin = nullptr;
    const std::uint8_t* end = nullptr;
    std::memcpy(&begin, objectBytes + 0x10, sizeof(begin));
    std::memcpy(&end, objectBytes + 0x18, sizeof(end));
    const std::uintptr_t beginAddress = reinterpret_cast<std::uintptr_t>(begin);
    const std::uintptr_t endAddress = reinterpret_cast<std::uintptr_t>(end);
    if (begin == nullptr || end == nullptr || endAddress < beginAddress) {
        return false;
    }
    const std::uintptr_t byteCount = endAddress - beginAddress;
    if (byteCount % elementSize != 0 || byteCount / elementSize > maximumElements) {
        return false;
    }
    *view = {.begin = begin, .size = byteCount / elementSize};
    return true;
}

bool readFaceLandmarks(
    const std::uint8_t* faceBytes,
    std::vector<FaceLandmark>* landmarks) {
    const void* pointsObject = nullptr;
    const void* visibilityObject = nullptr;
    std::memcpy(&pointsObject, faceBytes + 0x20, sizeof(pointsObject));
    std::memcpy(&visibilityObject, faceBytes + 0x28, sizeof(visibilityObject));

    PrimitiveVectorView points{};
    PrimitiveVectorView visibility{};
    if (!readPrimitiveVectorView(pointsObject, sizeof(float) * 2, 512, &points) ||
        !readPrimitiveVectorView(visibilityObject, sizeof(float), 512, &visibility) ||
        points.size != visibility.size) {
        return false;
    }

    landmarks->reserve(points.size);
    for (std::size_t index = 0; index < points.size; ++index) {
        FaceLandmark landmark;
        std::memcpy(&landmark.x, points.begin + index * sizeof(float) * 2, sizeof(float));
        std::memcpy(
            &landmark.y,
            points.begin + index * sizeof(float) * 2 + sizeof(float),
            sizeof(float));
        std::memcpy(
            &landmark.visibility,
            visibility.begin + index * sizeof(float),
            sizeof(float));
        if (!std::isfinite(landmark.x) || !std::isfinite(landmark.y) ||
            !std::isfinite(landmark.visibility)) {
            return false;
        }
        landmarks->push_back(landmark);
    }
    return true;
}

bool writeFaceEvidence(
    const char* outputPath,
    const char* coordinateSpace,
    const std::vector<FaceObservation>& faces) {
    if (outputPath == nullptr) {
        return true;
    }
    std::ofstream output(outputPath);
    if (!output) {
        return false;
    }
    output << "{\n  \"schemaVersion\": 1,\n"
           << "  \"coordinateSpace\": \"" << coordinateSpace << "\",\n"
           << "  \"faceCount\": " << faces.size() << ",\n  \"faces\": [";
    for (std::size_t index = 0; index < faces.size(); ++index) {
        const FaceObservation& face = faces[index];
        output << (index == 0 ? "\n" : ",\n")
               << "    {\"rawRect\":[" << face.rawRect[0] << ',' << face.rawRect[1]
               << ',' << face.rawRect[2] << ',' << face.rawRect[3] << "],"
               << "\"score\":" << face.score << ','
               << "\"yaw\":" << face.yaw << ','
               << "\"pitch\":" << face.pitch << ','
               << "\"roll\":" << face.roll << ','
               << "\"eyeDistance\":" << face.eyeDistance << ','
               << "\"id\":" << face.id << ','
               << "\"action\":" << face.action << ','
               << "\"trackingCount\":" << face.trackingCount << ','
               << "\"landmarks\":[";
        for (std::size_t landmarkIndex = 0;
             landmarkIndex < face.landmarks.size();
             ++landmarkIndex) {
            const FaceLandmark& landmark = face.landmarks[landmarkIndex];
            output << (landmarkIndex == 0 ? "" : ",") << '[' << landmark.x << ','
                   << landmark.y << ',' << landmark.visibility << ']';
        }
        output << "]}";
    }
    output << (faces.empty() ? "" : "\n") << "  ]\n}\n";
    return output.good();
}

bool inspectFaceResult(const InspectFaceResultOptions& options) {
    void* resultObject = nullptr;
    Result result = options.getResult(options.handle, "face_0", &resultObject);
    std::cout << "face_result_by_node_status=" << result << " object=" << resultObject << '\n';
    if (result != 0 || resultObject == nullptr) {
        resultObject = nullptr;
        constexpr std::int32_t faceAlgorithmType = 4;
        result = options.getResultByType(
            options.handle, &resultObject, faceAlgorithmType);
        std::cout << "face_result_by_type_status=" << result << " object=" << resultObject
                  << '\n';
    }
    if (result != 0 || resultObject == nullptr) {
        return false;
    }

    void* const vtable = *static_cast<void**>(resultObject);
    Dl_info symbolInfo{};
    const bool hasSymbol =
        dladdr(vtable, &symbolInfo) != 0 && symbolInfo.dli_sname != nullptr;
    const std::string_view symbolName = hasSymbol ? symbolInfo.dli_sname : "<unknown>";
    std::cout << "face_result_vtable=" << vtable << " symbol=" << symbolName << '\n';
    if (symbolName.find("FaceBuffer") == std::string_view::npos) {
        return false;
    }

    // Verified FaceBuffer layout for the UUID-gated local runtime: the primary
    // face vector occupies +0x38/+0x40 and owns pointers to 0x50-byte face records.
    const auto* objectBytes = static_cast<const std::uint8_t*>(resultObject);
    const void* const* begin = nullptr;
    const void* const* end = nullptr;
    std::memcpy(&begin, objectBytes + 0x38, sizeof(begin));
    std::memcpy(&end, objectBytes + 0x40, sizeof(end));
    const std::uintptr_t beginAddress = reinterpret_cast<std::uintptr_t>(begin);
    const std::uintptr_t endAddress = reinterpret_cast<std::uintptr_t>(end);
    if ((begin == nullptr) != (end == nullptr) || endAddress < beginAddress) {
        return false;
    }
    const std::uintptr_t byteCount = endAddress - beginAddress;
    if (byteCount % sizeof(void*) != 0 || byteCount / sizeof(void*) > 10) {
        return false;
    }

    std::vector<FaceObservation> faces;
    faces.reserve(byteCount / sizeof(void*));
    for (std::size_t index = 0; index < byteCount / sizeof(void*); ++index) {
        const void* faceObject = begin[index];
        if (faceObject == nullptr) {
            return false;
        }
        const auto* faceBytes = static_cast<const std::uint8_t*>(faceObject);
        FaceObservation face;
        std::memcpy(face.rawRect.data(), faceBytes + 0x0c, sizeof(face.rawRect));
        std::memcpy(&face.score, faceBytes + 0x1c, sizeof(face.score));
        std::memcpy(&face.yaw, faceBytes + 0x30, sizeof(face.yaw));
        std::memcpy(&face.pitch, faceBytes + 0x34, sizeof(face.pitch));
        std::memcpy(&face.roll, faceBytes + 0x38, sizeof(face.roll));
        std::memcpy(&face.eyeDistance, faceBytes + 0x3c, sizeof(face.eyeDistance));
        std::memcpy(&face.id, faceBytes + 0x40, sizeof(face.id));
        std::memcpy(&face.action, faceBytes + 0x44, sizeof(face.action));
        std::memcpy(&face.trackingCount, faceBytes + 0x48, sizeof(face.trackingCount));
        const bool finite =
            std::all_of(face.rawRect.begin(), face.rawRect.end(), [](float value) {
                return std::isfinite(value);
            }) &&
            std::isfinite(face.score) && std::isfinite(face.yaw) &&
            std::isfinite(face.pitch) && std::isfinite(face.roll) &&
            std::isfinite(face.eyeDistance);
        if (!finite) {
            return false;
        }
        if (!readFaceLandmarks(faceBytes, &face.landmarks)) {
            return false;
        }
        faces.push_back(face);
    }

    std::cout << "face_count=" << faces.size();
    for (std::size_t index = 0; index < faces.size(); ++index) {
        const FaceObservation& face = faces[index];
        std::cout << " face[" << index << "]=" << face.rawRect[0] << ','
                  << face.rawRect[1] << ',' << face.rawRect[2] << ','
                  << face.rawRect[3] << " score=" << face.score;
        std::cout << " landmarks=" << face.landmarks.size();
    }
    std::cout << '\n';
    return writeFaceEvidence(options.outputPath, options.coordinateSpace, faces);
}

struct ProbeOptions {
    bool useCoreProfile = false;
    bool usePipeline = false;
    bool server = false;
    bool skipAlgorithm = false;
    bool inspectSkinResult = false;
    bool inspectFaceResult = false;
    bool forceSkinSegPictureMode = false;
    bool enableComposerNodeEvent = false;
    std::int32_t skinSegVideoMode = -1;
    std::int32_t orientation = 0;
    const char* maskOutputPath = nullptr;
    const char* faceOutputPath = nullptr;
    const char* inputPath = nullptr;
    const char* inputListPath = nullptr;
    const char* parameterKey = nullptr;
    const char* parameterValue = nullptr;
    const char* composerNodePath = nullptr;
    const char* composerKey = nullptr;
    const char* composerJson = nullptr;
    const char* featureType = nullptr;
    const char* messageText = nullptr;
    std::int32_t intensityType = -1;
    std::int32_t messageType = -1;
    std::int32_t messageArgument1 = 0;
    std::int32_t messageArgument2 = 0;
    float intensity = 1.0F;
    float reshapeEyeIntensity = 0.0F;
    float reshapeCheekIntensity = 0.0F;
    float composerValue = 0.0F;
    bool hasComposerValue = false;
    bool hasReshapeFaceIntensity = false;
    double framesPerSecond = 30.0;
};

ProbeOptions parseProbeOptions(int argc, char** argv) {
    ProbeOptions options;
    for (int index = 5; index < argc; ++index) {
        const std::string_view argument = argv[index];
        if (argument == "core32") {
            options.useCoreProfile = true;
            continue;
        }
        if (argument == "legacy") {
            options.useCoreProfile = false;
            continue;
        }
        if (argument == "pipeline") {
            options.usePipeline = true;
            continue;
        }
        if (argument == "--server") {
            options.server = true;
            continue;
        }
        if (argument == "--skip-algorithm") {
            options.skipAlgorithm = true;
            continue;
        }
        if (argument == "--inspect-skin-result") {
            options.inspectSkinResult = true;
            continue;
        }
        if (argument == "--inspect-face-result") {
            options.inspectFaceResult = true;
            continue;
        }
        if (argument == "--force-skin-seg-picture-mode") {
            options.forceSkinSegPictureMode = true;
            continue;
        }
        if (argument == "--enable-composer-node-event") {
            options.enableComposerNodeEvent = true;
            continue;
        }
        if (argument == "--skin-seg-mode" && index + 1 < argc) {
            const std::string_view mode = argv[++index];
            if (mode == "picture") {
                options.skinSegVideoMode = 0;
                continue;
            }
            if (mode == "video") {
                options.skinSegVideoMode = 1;
                continue;
            }
            throw std::runtime_error("--skin-seg-mode must be picture or video");
        }
        if (argument == "--mask-output" && index + 1 < argc) {
            options.maskOutputPath = argv[++index];
            options.inspectSkinResult = true;
            continue;
        }
        if (argument == "--orientation" && index + 1 < argc) {
            const std::string_view value = argv[++index];
            if (value == "0") {
                options.orientation = 0;
            } else if (value == "90") {
                options.orientation = 1;
            } else if (value == "180") {
                options.orientation = 2;
            } else if (value == "270") {
                options.orientation = 3;
            } else {
                throw std::runtime_error("orientation must be 0, 90, 180, or 270");
            }
            continue;
        }
        if (argument == "--face-output" && index + 1 < argc) {
            options.faceOutputPath = argv[++index];
            options.inspectFaceResult = true;
            continue;
        }
        if (argument == "--input" && index + 1 < argc) {
            options.inputPath = argv[++index];
            continue;
        }
        if (argument == "--input-list" && index + 1 < argc) {
            options.inputListPath = argv[++index];
            continue;
        }
        if (argument == "--fps" && index + 1 < argc) {
            const std::string value = argv[++index];
            std::size_t parsedCharacters = 0;
            options.framesPerSecond = std::stod(value, &parsedCharacters);
            if (!std::isfinite(options.framesPerSecond) || options.framesPerSecond <= 0.0) {
                throw std::runtime_error("--fps must be a positive finite number");
            }
            if (parsedCharacters != value.size()) {
                throw std::runtime_error("--fps must contain only a number");
            }
            continue;
        }
        if (argument == "--set-param-with-key" && index + 2 < argc) {
            options.parameterKey = argv[++index];
            options.parameterValue = argv[++index];
            continue;
        }
        if (argument == "--composer-node" && index + 1 < argc) {
            options.composerNodePath = argv[++index];
            continue;
        }
        if (argument == "--composer-key" && index + 1 < argc) {
            options.composerKey = argv[++index];
            continue;
        }
        if (argument == "--composer-value" && index + 1 < argc) {
            const std::string value = argv[++index];
            std::size_t parsedCharacters = 0;
            options.composerValue = std::stof(value, &parsedCharacters);
            if (parsedCharacters != value.size() || !std::isfinite(options.composerValue)) {
                throw std::runtime_error("--composer-value must be finite");
            }
            options.hasComposerValue = true;
            continue;
        }
        if (argument == "--composer-json" && index + 1 < argc) {
            options.composerJson = argv[++index];
            continue;
        }
        if (argument == "--inspect-feature" && index + 1 < argc) {
            options.featureType = argv[++index];
            continue;
        }
        if (argument == "--send-message" && index + 4 < argc) {
            const auto parseMessageInteger = [&](const char* label) {
                const std::string value = argv[++index];
                std::size_t parsedCharacters = 0;
                const long parsed = std::stol(value, &parsedCharacters, 0);
                if (parsedCharacters != value.size() ||
                    parsed < std::numeric_limits<std::int32_t>::min() ||
                    parsed > std::numeric_limits<std::int32_t>::max()) {
                    throw std::runtime_error(std::string(label) + " must be an int32");
                }
                return static_cast<std::int32_t>(parsed);
            };
            options.messageType = parseMessageInteger("message type");
            options.messageArgument1 = parseMessageInteger("message argument 1");
            options.messageArgument2 = parseMessageInteger("message argument 2");
            options.messageText = argv[++index];
            continue;
        }
        if (argument == "--intensity-type" && index + 1 < argc) {
            const std::string value = argv[++index];
            std::size_t parsedCharacters = 0;
            const long parsed = std::stol(value, &parsedCharacters);
            if (parsedCharacters != value.size() || parsed < 0 ||
                parsed > std::numeric_limits<std::int32_t>::max()) {
                throw std::runtime_error("--intensity-type must be a non-negative int32");
            }
            options.intensityType = static_cast<std::int32_t>(parsed);
            continue;
        }
        if (argument == "--intensity" && index + 1 < argc) {
            const std::string value = argv[++index];
            std::size_t parsedCharacters = 0;
            options.intensity = std::stof(value, &parsedCharacters);
            if (parsedCharacters != value.size() || !std::isfinite(options.intensity)) {
                throw std::runtime_error("--intensity must be finite");
            }
            continue;
        }
        if (argument == "--reshape-face-intensity" && index + 2 < argc) {
            const auto parseFiniteFloat = [&](const char* label) {
                const std::string value = argv[++index];
                std::size_t parsedCharacters = 0;
                const float parsed = std::stof(value, &parsedCharacters);
                if (parsedCharacters != value.size() || !std::isfinite(parsed)) {
                    throw std::runtime_error(std::string(label) + " must be finite");
                }
                return parsed;
            };
            options.reshapeEyeIntensity = parseFiniteFloat("reshape eye intensity");
            options.reshapeCheekIntensity = parseFiniteFloat("reshape cheek intensity");
            options.hasReshapeFaceIntensity = true;
            continue;
        }
        throw std::runtime_error(std::string("unknown or incomplete argument: ") + argv[index]);
    }
    if (options.inputPath != nullptr && options.inputListPath != nullptr) {
        throw std::runtime_error("--input and --input-list are mutually exclusive");
    }
    if (options.server && options.inputPath == nullptr) {
        throw std::runtime_error("--server requires --input for session dimensions and warm-up");
    }
    if ((options.composerKey != nullptr || options.hasComposerValue ||
         options.composerJson != nullptr) &&
        options.composerNodePath == nullptr) {
        throw std::runtime_error(
            "composer updates require --composer-node");
    }
    if (options.composerJson != nullptr && options.hasComposerValue) {
        throw std::runtime_error(
            "--composer-json and --composer-value are mutually exclusive");
    }
    const bool hasComposerPayload = options.hasComposerValue || options.composerJson != nullptr;
    if ((options.composerKey != nullptr) != hasComposerPayload) {
        throw std::runtime_error(
            "--composer-key requires either --composer-value or --composer-json");
    }
    return options;
}

enum class HostCommandKind {
    render,
    shutdown,
};

struct HostCommand {
    HostCommandKind kind;
    std::string requestId;
    double timestamp = 0.0;
    std::string inputPath;
    std::string outputPath;
    std::string maskPath;
    std::string facePath;
};

std::vector<std::string> splitHostFields(const std::string& line) {
    std::vector<std::string> fields;
    std::size_t fieldStart = 0;
    while (true) {
        const std::size_t separator = line.find('\t', fieldStart);
        fields.push_back(line.substr(fieldStart, separator - fieldStart));
        if (separator == std::string::npos) {
            break;
        }
        fieldStart = separator + 1;
    }
    return fields;
}

HostCommand parseHostCommand(const std::string& line) {
    if (line == "shutdown") {
        return {.kind = HostCommandKind::shutdown};
    }
    const std::vector<std::string> fields = splitHostFields(line);
    if ((fields.size() != 6 && fields.size() != 7) || fields[0] != "render") {
        throw std::runtime_error(
            "host command must be "
            "render<TAB>id<TAB>timestamp<TAB>input<TAB>output<TAB>mask[<TAB>face]");
    }
    if (fields[1].empty() || fields[3].empty() || fields[4].empty() || fields[5].empty() ||
        (fields.size() == 7 && fields[6].empty())) {
        throw std::runtime_error("host command fields cannot be empty");
    }
    std::size_t parsedCharacters = 0;
    const double timestamp = std::stod(fields[2], &parsedCharacters);
    if (parsedCharacters != fields[2].size() || !std::isfinite(timestamp) || timestamp < 0.0) {
        throw std::runtime_error("host timestamp must be a non-negative finite number");
    }
    return {
        .kind = HostCommandKind::render,
        .requestId = fields[1],
        .timestamp = timestamp,
        .inputPath = fields[3],
        .outputPath = fields[4],
        .maskPath = fields[5],
        .facePath = fields.size() == 7 ? fields[6] : "-",
    };
}

std::string sanitizeHostMessage(std::string message) {
    for (char& character : message) {
        if (character == '\t' || character == '\n' || character == '\r') {
            character = ' ';
        }
    }
    return message;
}

void writeHostMessage(const std::string& message) {
    std::cout << "QCUT\t" << message << '\n' << std::flush;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 5) {
        std::cerr
            << "usage: effect-cgl-render-probe <effect-lib> <models> <effect> "
               "<output.ppm|output-directory> [legacy|core32] [pipeline] "
               "[--input input.ppm|--input-list frames.txt] [--fps 30] "
               "[--server] "
               "[--set-param-with-key key value] "
               "[--inspect-feature type] "
               "[--send-message type arg1 arg2 text] "
               "[--intensity-type type --intensity value] "
               "[--reshape-face-intensity eye cheek] "
               "[--skip-algorithm] [--inspect-skin-result] [--inspect-face-result] "
               "[--mask-output output.pgm] "
               "[--face-output output.json] "
               "[--orientation 0|90|180|270] "
               "[--composer-node path --composer-key key "
               "(--composer-value value | --composer-json json)] "
               "[--enable-composer-node-event] "
               "[--force-skin-seg-picture-mode] "
               "[--skin-seg-mode picture|video]\n";
        return 2;
    }

    ProbeOptions probeOptions;
    ImageSize size = {.width = 64, .height = 64};
    std::vector<std::uint8_t> inputPixels;
    std::vector<std::string> inputPaths;
    try {
        probeOptions = parseProbeOptions(argc, argv);
        if (probeOptions.inputListPath != nullptr) {
            inputPaths = readInputList({.path = probeOptions.inputListPath});
            ImageData image = readPpm({.path = inputPaths.front().c_str()});
            size = image.size;
            inputPixels = std::move(image.rgba);
            std::filesystem::create_directories(argv[4]);
        } else if (probeOptions.inputPath != nullptr) {
            ImageData image = readPpm({.path = probeOptions.inputPath});
            size = image.size;
            inputPixels = std::move(image.rgba);
        } else {
            inputPixels = makeCalibrationImage(size);
        }
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }

    const ContextResult contextResult = createContext(probeOptions.useCoreProfile);
    if (contextResult.context == nullptr) {
        return 4;
    }

    std::cout << "context=" << contextResult.context << '\n';
    std::cout << "current_context=" << CGLGetCurrentContext() << '\n';
    std::cout << "gl_vendor=" << glString(GL_VENDOR) << '\n';
    std::cout << "gl_renderer=" << glString(GL_RENDERER) << '\n';
    std::cout << "gl_version=" << glString(GL_VERSION) << '\n';

    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    const std::vector<std::uint8_t> outputSeed = makeOutputSeed(size);
    if (inputPaths.empty()) {
        const std::string sourceOutputPath = std::string(argv[4]) + ".source.ppm";
        if (!writePpm({.outputPath = sourceOutputPath.c_str(), .pixels = inputPixels, .size = size})) {
            std::cerr << "failed to write source copy: " << sourceOutputPath << '\n';
            return 2;
        }
    }
    const GLuint inputTexture = createTexture({.pixels = inputPixels, .size = size});
    const GLuint outputTexture = createTexture({.pixels = outputSeed, .size = size});
    const bool useFaceAnalyzer =
        probeOptions.server && probeOptions.inspectFaceResult && !probeOptions.skipAlgorithm;
    std::vector<std::uint8_t> faceInputPixels =
        useFaceAnalyzer ? flipImageRows(inputPixels, size) : std::vector<std::uint8_t>{};
    const GLuint faceInputTexture = useFaceAnalyzer
                                        ? createTexture({.pixels = faceInputPixels, .size = size})
                                        : 0;
    const GLuint faceOutputTexture = useFaceAnalyzer
                                         ? createTexture({.pixels = outputSeed, .size = size})
                                         : 0;
    std::cout << "input_texture=" << inputTexture
              << " valid=" << static_cast<int>(glIsTexture(inputTexture)) << '\n';
    std::cout << "output_texture=" << outputTexture
              << " valid=" << static_cast<int>(glIsTexture(outputTexture)) << '\n';
    if (useFaceAnalyzer) {
        std::cout << "face_input_texture=" << faceInputTexture
                  << " valid=" << static_cast<int>(glIsTexture(faceInputTexture)) << '\n';
        std::cout << "face_output_texture=" << faceOutputTexture
                  << " valid=" << static_cast<int>(glIsTexture(faceOutputTexture)) << '\n';
    }
    std::cout << "texture_create_gl_error=0x" << std::hex << glGetError() << std::dec << '\n';

    void* effectLibrary = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (effectLibrary == nullptr) {
        std::cerr << "failed to load effect library: " << dlerror() << '\n';
        return 1;
    }

    const auto effectCreate = loadSymbol<EffectCreate>({effectLibrary, "bef_effect_create_handle"});
    const auto effectDestroy = loadSymbol<EffectDestroy>({effectLibrary, "bef_effect_destroy"});
    const auto effectSetRenderApi =
        loadSymbol<EffectSetRenderApi>({effectLibrary, "bef_effect_set_render_api"});
    const auto effectUsePipeline =
        loadSymbol<EffectUsePipeline>({effectLibrary, "bef_effect_use_pipeline_processor"});
    const auto effectInit = loadSymbol<EffectInit>({effectLibrary, "bef_effect_init"});
    const auto effectSetWidthHeight =
        loadSymbol<EffectSetWidthHeight>({effectLibrary, "bef_effect_set_width_height"});
    const auto effectSetOrientation =
        loadSymbol<EffectSetOrientation>({effectLibrary, "bef_effect_set_orientation"});
    const auto effectSet = loadSymbol<EffectSet>({effectLibrary, "bef_effect_set_effect"});
    EffectComposerSetNodes effectComposerSetNodes = nullptr;
    EffectComposerSetMode effectComposerSetMode = nullptr;
    EffectComposerUpdateNode effectComposerUpdateNode = nullptr;
    EffectComposerUpdateNodeWithJson effectComposerUpdateNodeWithJson = nullptr;
    if (probeOptions.composerNodePath != nullptr) {
        effectComposerSetMode = loadSymbol<EffectComposerSetMode>(
            {effectLibrary, "bef_effect_composer_set_mode"});
        effectComposerSetNodes = loadSymbol<EffectComposerSetNodes>(
            {effectLibrary, "bef_effect_composer_set_nodes"});
        if (probeOptions.composerKey != nullptr) {
            if (probeOptions.composerJson != nullptr) {
                effectComposerUpdateNodeWithJson =
                    loadSymbol<EffectComposerUpdateNodeWithJson>(
                        {effectLibrary, "bef_effect_composer_update_node_with_json"});
            } else {
                effectComposerUpdateNode = loadSymbol<EffectComposerUpdateNode>(
                    {effectLibrary, "bef_effect_composer_update_node"});
            }
        }
    }
    const auto effectGetFeature =
        loadSymbol<EffectGetFeature>({effectLibrary, "bef_effect_get_feature"});
    const auto effectSetIntensity =
        loadSymbol<EffectSetIntensity>({effectLibrary, "bef_effect_set_intensity"});
    EffectUpdateReshapeFaceIntensity effectUpdateReshapeFaceIntensity = nullptr;
    if (probeOptions.hasReshapeFaceIntensity) {
        effectUpdateReshapeFaceIntensity = loadSymbol<EffectUpdateReshapeFaceIntensity>(
            {effectLibrary, "bef_effect_update_reshape_face_intensity"});
    }
    EffectSendMessage effectSendMessage = nullptr;
    if (probeOptions.messageType >= 0) {
        effectSendMessage =
            loadSymbol<EffectSendMessage>({effectLibrary, "bef_effect_send_msg"});
    }
    const auto effectSetParamWithKey = loadSymbol<EffectSetParamWithKey>(
        {effectLibrary, "bef_effect_set_param_with_key"});
    const auto effectAlgorithmTexture =
        loadSymbol<EffectAlgorithmTexture>({effectLibrary, "bef_effect_algorithm_texture"});
    const auto effectProcessTexture =
        loadSymbol<EffectProcessTexture>({effectLibrary, "bef_effect_process_texture"});
    EffectSetAlgorithmParam effectSetAlgorithmParam = nullptr;
    EffectConfigAbValue effectConfigAbValue = nullptr;
    EffectGetBachResultByNodeName effectGetBachResultByNodeName = nullptr;
    EffectGetBachResult effectGetBachResult = nullptr;
    EffectGetBachResultByGraphAndNodeName effectGetBachResultByGraphAndNodeName = nullptr;
    SkinSegTextureId skinSegTextureId = nullptr;
    if (probeOptions.inspectSkinResult || probeOptions.inspectFaceResult) {
        effectGetBachResult = loadSymbol<EffectGetBachResult>(
            {effectLibrary, "bef_effect_get_bach_result"});
        effectGetBachResultByNodeName = loadSymbol<EffectGetBachResultByNodeName>(
            {effectLibrary, "bef_effect_get_bach_result_by_node_name"});
        effectGetBachResultByGraphAndNodeName =
            loadSymbol<EffectGetBachResultByGraphAndNodeName>(
                {effectLibrary, "bef_effect_get_bach_result_by_graph_and_node_name"});
        if (probeOptions.inspectSkinResult) {
            skinSegTextureId = loadSymbol<SkinSegTextureId>(
                {effectLibrary, "_ZN4Bach11SkinSegInfo9textureIdEv"});
        }
    }
    if (probeOptions.skinSegVideoMode >= 0) {
        effectSetAlgorithmParam = loadSymbol<EffectSetAlgorithmParam>(
            {effectLibrary, "bef_effect_set_algorithm_param"});
    }
    if (probeOptions.forceSkinSegPictureMode || probeOptions.enableComposerNodeEvent) {
        effectConfigAbValue =
            loadSymbol<EffectConfigAbValue>({effectLibrary, "bef_effect_config_ab_value"});
    }

    if (probeOptions.forceSkinSegPictureMode) {
        constexpr std::int32_t forceSkinSegPictureMode = 0x8;
        constexpr std::int32_t integerAbValueType = 1;
        const Result configResult = effectConfigAbValue(
            "effectab_swing_force_detect_mode",
            &forceSkinSegPictureMode,
            integerAbValueType);
        std::cout << "config_skin_seg_picture_mode=" << configResult << '\n';
    }
    if (probeOptions.enableComposerNodeEvent) {
        constexpr bool enabled = true;
        constexpr std::int32_t booleanAbValueType = 0;
        const Result configResult = effectConfigAbValue(
            "enable_composerNodeEvent_to_amazingScene",
            &enabled,
            booleanAbValueType);
        std::cout << "config_composer_node_event=" << configResult << '\n';
    }

    EffectHandle handle = 0;
    Result result = effectCreate(&handle);
    std::cout << "create=" << result << " handle=" << handle << '\n';
    std::cout << "context_after_create=" << CGLGetCurrentContext() << '\n';
    if (result != 0 || handle == 0) {
        return 10;
    }

    std::cout << "set_render_api=" << effectSetRenderApi(handle, 1) << '\n';
    std::cout << "use_pipeline=" << effectUsePipeline(handle, probeOptions.usePipeline) << '\n';
    result = effectInit(handle, size.width, size.height, argv[2], "");
    std::cout << "init=" << result << '\n';
    if (result != 0) {
        effectDestroy(handle);
        return 11;
    }
    std::cout << "set_width_height=" << effectSetWidthHeight(handle, size.width, size.height) << '\n';
    std::cout << "set_orientation="
              << effectSetOrientation(handle, probeOptions.orientation)
              << " value=" << probeOptions.orientation << '\n';
    if (effectComposerSetNodes != nullptr) {
        const Result composerModeResult = effectComposerSetMode(handle, 1, 0);
        std::cout << "composer_set_mode=" << composerModeResult << '\n';
        if (composerModeResult != 0) {
            effectDestroy(handle);
            return 12;
        }
        const char* composerNodes[] = {probeOptions.composerNodePath};
        result = effectComposerSetNodes(handle, composerNodes, 1);
        std::cout << "composer_set_nodes=" << result
                  << " node=" << probeOptions.composerNodePath << '\n';
    } else {
        result = effectSet(handle, argv[3]);
        std::cout << "set_effect=" << result << '\n';
    }
    if (result != 0) {
        effectDestroy(handle);
        return 12;
    }

    EffectHandle faceHandle = 0;
    if (useFaceAnalyzer) {
        result = effectCreate(&faceHandle);
        std::cout << "face_create=" << result << " handle=" << faceHandle << '\n';
        if (result != 0 || faceHandle == 0) {
            effectDestroy(handle);
            return 15;
        }
        const Result faceRenderApiResult = effectSetRenderApi(faceHandle, 1);
        const Result facePipelineResult =
            effectUsePipeline(faceHandle, probeOptions.usePipeline);
        const Result faceInitResult =
            effectInit(faceHandle, size.width, size.height, argv[2], "");
        const Result faceSizeResult =
            faceInitResult == 0
                ? effectSetWidthHeight(faceHandle, size.width, size.height)
                : faceInitResult;
        const Result faceOrientationResult =
            faceInitResult == 0 ? effectSetOrientation(faceHandle, 0) : faceInitResult;
        Result faceEffectResult = faceInitResult;
        if (faceInitResult == 0 && effectComposerSetNodes != nullptr) {
            faceEffectResult = effectComposerSetMode(faceHandle, 1, 0);
            const char* composerNodes[] = {probeOptions.composerNodePath};
            if (faceEffectResult == 0) {
                faceEffectResult = effectComposerSetNodes(faceHandle, composerNodes, 1);
            }
        } else if (faceInitResult == 0) {
            faceEffectResult = effectSet(faceHandle, argv[3]);
        }
        std::cout << "face_set_render_api=" << faceRenderApiResult
                  << " face_use_pipeline=" << facePipelineResult
                  << " face_init=" << faceInitResult
                  << " face_set_width_height=" << faceSizeResult
                  << " face_set_orientation=" << faceOrientationResult
                  << " face_set_effect=" << faceEffectResult << '\n';
        if (faceRenderApiResult != 0 || facePipelineResult != 0 || faceInitResult != 0 ||
            faceSizeResult != 0 || faceOrientationResult != 0 || faceEffectResult != 0) {
            effectDestroy(faceHandle);
            effectDestroy(handle);
            return 16;
        }
    }
    if (probeOptions.skinSegVideoMode >= 0) {
        constexpr std::int32_t integerAlgorithmParamType = 1;
        const Result setModeResult = effectSetAlgorithmParam(
            handle,
            "skin_seg_0",
            "skin_seg_is_video_mode",
            &probeOptions.skinSegVideoMode,
            integerAlgorithmParamType);
        std::cout << "set_skin_seg_mode=" << setModeResult << '\n';
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(250));
    if (probeOptions.featureType != nullptr) {
        // Features are created during the first seek/render, so querying after
        // a bare sleep can report a missing handle. Run one warm-up render
        // before asking.
        Result warmUpAlgorithmResult = -1;
        if (!probeOptions.skipAlgorithm) {
            warmUpAlgorithmResult = effectAlgorithmTexture(handle, inputTexture, 0.0);
        }
        const Result warmUpProcessResult =
            effectProcessTexture(handle, inputTexture, outputTexture, 0.0);
        std::cout << "get_feature_warm_up algorithm=" << warmUpAlgorithmResult
                  << " process=" << warmUpProcessResult << '\n';
        EffectHandle feature = 0;
        const Result featureResult =
            effectGetFeature(handle, probeOptions.featureType, &feature);
        std::cout << "get_feature type=" << probeOptions.featureType
                  << " result=" << featureResult << " handle=" << feature
                  << std::endl;
    }
    Result finalAlgorithmResult = -1;
    Result processResult = -1;
    DifferenceResult finalDifference{};
    bool processingSucceeded = true;
    bool probeParametersApplied = false;

    const auto applyProbeParameters = [&]() {
        if (effectComposerUpdateNode != nullptr) {
            const Result composerResult = effectComposerUpdateNode(
                handle,
                probeOptions.composerNodePath,
                probeOptions.composerKey,
                probeOptions.composerValue);
            std::cout << "composer_update_node=" << composerResult
                      << " key=" << probeOptions.composerKey
                      << " value=" << probeOptions.composerValue << '\n';
        }
        if (effectComposerUpdateNodeWithJson != nullptr) {
            const Result composerResult = effectComposerUpdateNodeWithJson(
                handle,
                probeOptions.composerNodePath,
                probeOptions.composerKey,
                probeOptions.composerJson);
            std::cout << "composer_update_node_with_json=" << composerResult
                      << " key=" << probeOptions.composerKey << '\n';
        }
        if (probeOptions.parameterKey != nullptr) {
            effectSetParamWithKey(probeOptions.parameterKey, probeOptions.parameterValue);
            std::cout << "set_param_with_key=" << probeOptions.parameterKey << '\n';
        }
        if (probeOptions.intensityType >= 0) {
            const Result intensityResult = effectSetIntensity(
                handle, probeOptions.intensityType, probeOptions.intensity);
            std::cout << "set_intensity type=" << probeOptions.intensityType
                      << " value=" << probeOptions.intensity
                      << " result=" << intensityResult << '\n';
        }
        if (effectUpdateReshapeFaceIntensity != nullptr) {
            const Result reshapeResult = effectUpdateReshapeFaceIntensity(
                handle,
                probeOptions.reshapeEyeIntensity,
                probeOptions.reshapeCheekIntensity);
            std::cout << "update_reshape_face_intensity eye="
                      << probeOptions.reshapeEyeIntensity
                      << " cheek=" << probeOptions.reshapeCheekIntensity
                      << " result=" << reshapeResult << '\n';
            if (reshapeResult != 0) {
                // A silently ignored parameter produces a fake reference frame,
                // so a failed reshape update must fail the probe run.
                processingSucceeded = false;
            }
        }
        if (effectSendMessage != nullptr) {
            const Result messageResult = effectSendMessage(
                handle,
                probeOptions.messageType,
                probeOptions.messageArgument1,
                probeOptions.messageArgument2,
                probeOptions.messageText);
            std::cout << "send_message type=" << probeOptions.messageType
                      << " arg1=" << probeOptions.messageArgument1
                      << " arg2=" << probeOptions.messageArgument2
                      << " text=" << probeOptions.messageText
                      << " result=" << messageResult << '\n';
        }
    };

    if (probeOptions.server) {
        for (int attempt = 0; attempt < 20; ++attempt) {
            Result algorithmResult = -1;
            if (!probeOptions.skipAlgorithm) {
                algorithmResult = effectAlgorithmTexture(handle, inputTexture, 0.0);
            }
            processResult = effectProcessTexture(handle, inputTexture, outputTexture, 0.0);
            Result faceAlgorithmResult = -1;
            Result faceProcessResult = -1;
            if (faceHandle != 0) {
                faceAlgorithmResult =
                    effectAlgorithmTexture(faceHandle, faceInputTexture, 0.0);
                faceProcessResult = effectProcessTexture(
                    faceHandle, faceInputTexture, faceOutputTexture, 0.0);
            }
            const bool algorithmReady = probeOptions.skipAlgorithm || algorithmResult == 0;
            if (!probeParametersApplied && algorithmReady && processResult == 0) {
                applyProbeParameters();
                probeParametersApplied = true;
            }
            std::cout << "warmup[" << attempt << "] algorithm=";
            if (probeOptions.skipAlgorithm) {
                std::cout << "skipped";
            } else {
                std::cout << algorithmResult;
            }
            std::cout << " process=" << processResult;
            if (faceHandle != 0) {
                std::cout << " face_algorithm=" << faceAlgorithmResult
                          << " face_process=" << faceProcessResult;
            }
            std::cout << " gl_error=0x" << std::hex
                      << glGetError() << std::dec << '\n';
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }

        writeHostMessage("READY\t1");
        std::string commandLine;
        while (std::getline(std::cin, commandLine)) {
            HostCommand command;
            try {
                command = parseHostCommand(commandLine);
            } catch (const std::exception& error) {
                writeHostMessage("ERROR\t2\t" + sanitizeHostMessage(error.what()));
                continue;
            }
            if (command.kind == HostCommandKind::shutdown) {
                writeHostMessage("STOPPED\t0");
                break;
            }

            try {
                ImageData frame = readPpm({.path = command.inputPath.c_str()});
                if (frame.size.width != size.width || frame.size.height != size.height) {
                    throw std::runtime_error("host frame dimensions changed; start a new session");
                }
                inputPixels = std::move(frame.rgba);
                updateTexture({.texture = inputTexture, .pixels = inputPixels, .size = size});

                Result algorithmResult = -1;
                if (!probeOptions.skipAlgorithm) {
                    algorithmResult =
                        effectAlgorithmTexture(handle, inputTexture, command.timestamp);
                }
                updateTexture({.texture = outputTexture, .pixels = outputSeed, .size = size});
                processResult = effectProcessTexture(
                    handle, inputTexture, outputTexture, command.timestamp);
                glFinish();

                const bool algorithmSucceeded =
                    probeOptions.skipAlgorithm || algorithmResult == 0;
                if (!algorithmSucceeded || processResult != 0) {
                    throw std::runtime_error(
                        "native effect processing failed: algorithm=" +
                        std::to_string(algorithmResult) + " process=" +
                        std::to_string(processResult));
                }
                if (command.maskPath != "-") {
                    if (!probeOptions.inspectSkinResult) {
                        throw std::runtime_error("skin mask capture was not enabled for this host");
                    }
                    const bool wroteMask = inspectSkinResult({
                        .handle = handle,
                        .getResultByType = effectGetBachResult,
                        .getResult = effectGetBachResultByNodeName,
                        .getResultByGraphAndNode = effectGetBachResultByGraphAndNodeName,
                        .getTextureId = skinSegTextureId,
                        .maskOutputPath = command.maskPath.c_str(),
                    });
                    if (!wroteMask) {
                        throw std::runtime_error("native effect did not expose a skin mask");
                    }
                }

                const std::vector<std::uint8_t> outputPixels =
                    readTexture({.texture = outputTexture, .size = size});
                if (outputPixels.empty()) {
                    throw std::runtime_error("native effect returned an empty texture");
                }
                if (!writePpm({
                        .outputPath = command.outputPath.c_str(),
                        .pixels = outputPixels,
                        .size = size,
                    })) {
                    throw std::runtime_error("failed to write native effect output");
                }
                if (command.facePath != "-") {
                    if (faceHandle == 0) {
                        throw std::runtime_error("face capture was not enabled for this host");
                    }
                    faceInputPixels = flipImageRows(inputPixels, size);
                    updateTexture({
                        .texture = faceInputTexture,
                        .pixels = faceInputPixels,
                        .size = size,
                    });
                    updateTexture({
                        .texture = faceOutputTexture,
                        .pixels = outputSeed,
                        .size = size,
                    });
                    const Result faceAlgorithmResult = effectAlgorithmTexture(
                        faceHandle, faceInputTexture, command.timestamp);
                    const Result faceProcessResult = effectProcessTexture(
                        faceHandle,
                        faceInputTexture,
                        faceOutputTexture,
                        command.timestamp);
                    glFinish();
                    if (faceAlgorithmResult != 0 || faceProcessResult != 0) {
                        throw std::runtime_error(
                            "native face analysis failed: algorithm=" +
                            std::to_string(faceAlgorithmResult) + " process=" +
                            std::to_string(faceProcessResult));
                    }
                    if (!inspectFaceResult({
                            .handle = faceHandle,
                            .getResultByType = effectGetBachResult,
                            .getResult = effectGetBachResultByNodeName,
                            .outputPath = command.facePath.c_str(),
                            .coordinateSpace = "source-normalized-top-left",
                        })) {
                        throw std::runtime_error("native effect did not expose face evidence");
                    }
                }
                finalAlgorithmResult = algorithmResult;
                finalDifference = calculateDifference({
                    .output = outputPixels,
                    .input = inputPixels,
                    .seed = outputSeed,
                });
                std::cout << "host_frame[" << command.requestId << "] algorithm=";
                if (probeOptions.skipAlgorithm) {
                    std::cout << "skipped";
                } else {
                    std::cout << algorithmResult;
                }
                std::cout << " process=" << processResult
                          << " difference_from_input=" << finalDifference.fromInput
                          << " output_sum=" << finalDifference.outputSum << '\n';
                writeHostMessage("RESULT\t" + command.requestId + "\t0");
            } catch (const std::exception& error) {
                writeHostMessage(
                    "RESULT\t" + command.requestId + "\t14\t" +
                    sanitizeHostMessage(error.what()));
            }
        }
    } else if (!inputPaths.empty()) {
        for (int attempt = 0; attempt < 20; ++attempt) {
            Result algorithmResult = -1;
            if (!probeOptions.skipAlgorithm) {
                algorithmResult = effectAlgorithmTexture(handle, inputTexture, 0.0);
            }
            processResult = effectProcessTexture(handle, inputTexture, outputTexture, 0.0);
            const bool algorithmReady = probeOptions.skipAlgorithm || algorithmResult == 0;
            if (!probeParametersApplied && algorithmReady && processResult == 0) {
                applyProbeParameters();
                probeParametersApplied = true;
            }
            std::cout << "warmup[" << attempt << "] algorithm=";
            if (probeOptions.skipAlgorithm) {
                std::cout << "skipped";
            } else {
                std::cout << algorithmResult;
            }
            std::cout << " process=" << processResult << " gl_error=0x" << std::hex
                      << glGetError() << std::dec << '\n';
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }

        if (probeOptions.inspectSkinResult) {
            processingSucceeded = inspectSkinResult({
                .handle = handle,
                .getResultByType = effectGetBachResult,
                .getResult = effectGetBachResultByNodeName,
                .getResultByGraphAndNode = effectGetBachResultByGraphAndNodeName,
                .getTextureId = skinSegTextureId,
                .maskOutputPath = probeOptions.maskOutputPath,
            });
        }
        if (probeOptions.inspectFaceResult) {
            processingSucceeded = inspectFaceResult({
                .handle = handle,
                .getResultByType = effectGetBachResult,
                .getResult = effectGetBachResultByNodeName,
                .outputPath = probeOptions.faceOutputPath,
                .coordinateSpace = "algorithm-input",
            }) && processingSucceeded;
        }

        const std::filesystem::path outputDirectory(argv[4]);
        for (std::size_t frameIndex = 0; frameIndex < inputPaths.size(); ++frameIndex) {
            if (frameIndex > 0) {
                try {
                    ImageData frame = readPpm({.path = inputPaths[frameIndex].c_str()});
                    if (frame.size.width != size.width || frame.size.height != size.height) {
                        throw std::runtime_error("all sequence frames must have identical dimensions");
                    }
                    inputPixels = std::move(frame.rgba);
                } catch (const std::exception& error) {
                    std::cerr << "sequence frame " << frameIndex << ": " << error.what() << '\n';
                    processingSucceeded = false;
                    break;
                }
                updateTexture({.texture = inputTexture, .pixels = inputPixels, .size = size});
            }

            const double timestamp =
                static_cast<double>(frameIndex) / probeOptions.framesPerSecond;
            Result algorithmResult = -1;
            if (!probeOptions.skipAlgorithm) {
                algorithmResult = effectAlgorithmTexture(handle, inputTexture, timestamp);
            }
            updateTexture({.texture = outputTexture, .pixels = outputSeed, .size = size});
            processResult = effectProcessTexture(handle, inputTexture, outputTexture, timestamp);
            finalAlgorithmResult = algorithmResult;
            glFinish();

            const std::vector<std::uint8_t> outputPixels =
                readTexture({.texture = outputTexture, .size = size});
            if (outputPixels.empty()) {
                processingSucceeded = false;
                break;
            }
            finalDifference = calculateDifference({
                .output = outputPixels,
                .input = inputPixels,
                .seed = outputSeed,
            });
            // Prefix with the frame index: inputs from different directories can
            // share a filename, and bare filenames would silently overwrite.
            char framePrefix[16];
            std::snprintf(framePrefix, sizeof(framePrefix), "%04zu_", frameIndex);
            const std::filesystem::path outputPath =
                outputDirectory /
                (framePrefix + std::filesystem::path(inputPaths[frameIndex]).filename().string());
            const std::string outputPathString = outputPath.string();
            if (!writePpm({
                    .outputPath = outputPathString.c_str(),
                    .pixels = outputPixels,
                    .size = size,
                })) {
                std::cerr << "failed to write frame output: " << outputPathString << '\n';
                processingSucceeded = false;
                break;
            }

            std::cout << "sequence_frame[" << frameIndex << "] algorithm=";
            if (probeOptions.skipAlgorithm) {
                std::cout << "skipped";
            } else {
                std::cout << algorithmResult;
            }
            std::cout << " process=" << processResult
                      << " difference_from_input=" << finalDifference.fromInput
                      << " output_sum=" << finalDifference.outputSum
                      << " gl_error=0x" << std::hex << glGetError() << std::dec << '\n';
            const bool algorithmSucceeded = probeOptions.skipAlgorithm || algorithmResult == 0;
            processingSucceeded = processingSucceeded && algorithmSucceeded && processResult == 0 &&
                                  finalDifference.fromSeed != 0 &&
                                  finalDifference.outputSum != 0;
        }
    } else {
        for (int attempt = 0; attempt < 20; ++attempt) {
            const double timestamp = attempt / probeOptions.framesPerSecond;
            Result algorithmResult = -1;
            if (!probeOptions.skipAlgorithm) {
                algorithmResult = effectAlgorithmTexture(handle, inputTexture, timestamp);
            }
            updateTexture({.texture = outputTexture, .pixels = outputSeed, .size = size});
            processResult = effectProcessTexture(handle, inputTexture, outputTexture, timestamp);
            const bool algorithmReady = probeOptions.skipAlgorithm || algorithmResult == 0;
            if (!probeParametersApplied && algorithmReady && processResult == 0) {
                applyProbeParameters();
                probeParametersApplied = true;
            }
            finalAlgorithmResult = algorithmResult;
            std::cout << "frame[" << attempt << "] algorithm=";
            if (probeOptions.skipAlgorithm) {
                std::cout << "skipped";
            } else {
                std::cout << algorithmResult;
            }
            std::cout << " process=" << processResult
                      << " context=" << CGLGetCurrentContext()
                      << " input_valid=" << static_cast<int>(glIsTexture(inputTexture))
                      << " output_valid=" << static_cast<int>(glIsTexture(outputTexture))
                      << " gl_error=0x" << std::hex << glGetError() << std::dec << '\n';
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
        if (probeOptions.inspectSkinResult) {
            processingSucceeded = inspectSkinResult({
                .handle = handle,
                .getResultByType = effectGetBachResult,
                .getResult = effectGetBachResultByNodeName,
                .getResultByGraphAndNode = effectGetBachResultByGraphAndNodeName,
                .getTextureId = skinSegTextureId,
                .maskOutputPath = probeOptions.maskOutputPath,
            });
        }
        if (probeOptions.inspectFaceResult) {
            processingSucceeded = inspectFaceResult({
                .handle = handle,
                .getResultByType = effectGetBachResult,
                .getResult = effectGetBachResultByNodeName,
                .outputPath = probeOptions.faceOutputPath,
                .coordinateSpace = "algorithm-input",
            }) && processingSucceeded;
        }
        glFinish();

        const std::vector<std::uint8_t> outputPixels =
            readTexture({.texture = outputTexture, .size = size});
        if (outputPixels.empty()) {
            processingSucceeded = false;
        } else {
            finalDifference = calculateDifference({
                .output = outputPixels,
                .input = inputPixels,
                .seed = outputSeed,
            });
            std::cout << "readback_gl_error=0x" << std::hex << glGetError() << std::dec << '\n';
            std::cout << "difference_from_input=" << finalDifference.fromInput << '\n';
            std::cout << "difference_from_seed=" << finalDifference.fromSeed << '\n';
            std::cout << "output_sum=" << finalDifference.outputSum << '\n';
            if (!writePpm({.outputPath = argv[4], .pixels = outputPixels, .size = size})) {
                std::cerr << "failed to write output: " << argv[4] << '\n';
                processingSucceeded = false;
            }
            const bool algorithmSucceeded =
                probeOptions.skipAlgorithm || finalAlgorithmResult == 0;
            processingSucceeded = processingSucceeded && algorithmSucceeded && processResult == 0 &&
                                  finalDifference.fromSeed != 0 && finalDifference.outputSum != 0;
        }
    }

    if (faceHandle != 0) {
        effectDestroy(faceHandle);
    }
    effectDestroy(handle);
    const std::array textures = {
        inputTexture,
        outputTexture,
        faceInputTexture,
        faceOutputTexture,
    };
    glDeleteTextures(static_cast<GLsizei>(textures.size()), textures.data());
    CGLSetCurrentContext(nullptr);
    CGLDestroyContext(contextResult.context);
    CGLDestroyPixelFormat(contextResult.pixelFormat);
    dlclose(effectLibrary);

    return processingSucceeded ? 0 : 14;
}
