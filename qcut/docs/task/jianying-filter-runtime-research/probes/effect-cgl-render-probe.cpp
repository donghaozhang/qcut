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
using EffectGetFeature = Result (*)(EffectHandle, const char*, void**);
using EffectSetIntensity = Result (*)(EffectHandle, std::int32_t, float);
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
        if (!writeSkinSegInfoCpuMask({
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

    if (!writeSkinSegInfoCpuMask({
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

struct ProbeOptions {
    bool useCoreProfile = false;
    bool usePipeline = false;
    bool server = false;
    bool skipAlgorithm = false;
    bool inspectSkinResult = false;
    bool forceSkinSegPictureMode = false;
    std::int32_t skinSegVideoMode = -1;
    const char* maskOutputPath = nullptr;
    const char* inputPath = nullptr;
    const char* inputListPath = nullptr;
    const char* parameterKey = nullptr;
    const char* parameterValue = nullptr;
    const char* featureType = nullptr;
    const char* messageText = nullptr;
    std::int32_t intensityType = -1;
    std::int32_t messageType = -1;
    std::int32_t messageArgument1 = 0;
    std::int32_t messageArgument2 = 0;
    float intensity = 1.0F;
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
        if (argument == "--force-skin-seg-picture-mode") {
            options.forceSkinSegPictureMode = true;
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
        throw std::runtime_error(std::string("unknown or incomplete argument: ") + argv[index]);
    }
    if (options.inputPath != nullptr && options.inputListPath != nullptr) {
        throw std::runtime_error("--input and --input-list are mutually exclusive");
    }
    if (options.server && options.inputPath == nullptr) {
        throw std::runtime_error("--server requires --input for session dimensions and warm-up");
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
    if (fields.size() != 6 || fields[0] != "render") {
        throw std::runtime_error(
            "host command must be render<TAB>id<TAB>timestamp<TAB>input<TAB>output<TAB>mask");
    }
    if (fields[1].empty() || fields[3].empty() || fields[4].empty() || fields[5].empty()) {
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
               "[--skip-algorithm] [--inspect-skin-result] "
               "[--mask-output output.pgm] "
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
    std::cout << "input_texture=" << inputTexture
              << " valid=" << static_cast<int>(glIsTexture(inputTexture)) << '\n';
    std::cout << "output_texture=" << outputTexture
              << " valid=" << static_cast<int>(glIsTexture(outputTexture)) << '\n';
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
    const auto effectGetFeature =
        loadSymbol<EffectGetFeature>({effectLibrary, "bef_effect_get_feature"});
    const auto effectSetIntensity =
        loadSymbol<EffectSetIntensity>({effectLibrary, "bef_effect_set_intensity"});
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
    if (probeOptions.inspectSkinResult) {
        effectGetBachResult = loadSymbol<EffectGetBachResult>(
            {effectLibrary, "bef_effect_get_bach_result"});
        effectGetBachResultByNodeName = loadSymbol<EffectGetBachResultByNodeName>(
            {effectLibrary, "bef_effect_get_bach_result_by_node_name"});
        effectGetBachResultByGraphAndNodeName =
            loadSymbol<EffectGetBachResultByGraphAndNodeName>(
                {effectLibrary, "bef_effect_get_bach_result_by_graph_and_node_name"});
        skinSegTextureId = loadSymbol<SkinSegTextureId>(
            {effectLibrary, "_ZN4Bach11SkinSegInfo9textureIdEv"});
    }
    if (probeOptions.skinSegVideoMode >= 0) {
        effectSetAlgorithmParam = loadSymbol<EffectSetAlgorithmParam>(
            {effectLibrary, "bef_effect_set_algorithm_param"});
    }
    if (probeOptions.forceSkinSegPictureMode) {
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
    std::cout << "set_orientation=" << effectSetOrientation(handle, 0) << '\n';
    result = effectSet(handle, argv[3]);
    std::cout << "set_effect=" << result << '\n';
    if (result != 0) {
        effectDestroy(handle);
        return 12;
    }
    const auto inspectFeature = [&](const char* featureType) {
        void* feature = nullptr;
        const Result featureResult =
            effectGetFeature(handle, featureType, &feature);
        Dl_info featureVtableInfo{};
        const void* featureVtable = feature == nullptr ? nullptr : *static_cast<void**>(feature);
        const bool hasFeatureVtableSymbol =
            featureVtable != nullptr && dladdr(featureVtable, &featureVtableInfo) != 0 &&
            featureVtableInfo.dli_sname != nullptr;
        std::cout << "get_feature type=" << featureType
                  << " result=" << featureResult << " feature=" << feature
                  << " vtable=" << featureVtable << " symbol="
                  << (hasFeatureVtableSymbol ? featureVtableInfo.dli_sname : "<unknown>")
                  << std::endl;
    };
    if (probeOptions.featureType != nullptr) {
        inspectFeature(probeOptions.featureType);
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
    Result finalAlgorithmResult = -1;
    Result processResult = -1;
    DifferenceResult finalDifference{};
    bool processingSucceeded = true;

    const auto applyProbeParameters = [&]() {
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
            if (attempt == 0) {
                applyProbeParameters();
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
            if (attempt == 0) {
                applyProbeParameters();
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
            if (attempt == 0) {
                applyProbeParameters();
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

    effectDestroy(handle);
    const std::array textures = {inputTexture, outputTexture};
    glDeleteTextures(static_cast<GLsizei>(textures.size()), textures.data());
    CGLSetCurrentContext(nullptr);
    CGLDestroyContext(contextResult.context);
    CGLDestroyPixelFormat(contextResult.pixelFormat);
    dlclose(effectLibrary);

    return processingSucceeded ? 0 : 14;
}
