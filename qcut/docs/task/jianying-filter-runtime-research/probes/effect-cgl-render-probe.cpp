// QCut-owned interoperability probe; third-party libraries and assets are supplied at runtime.
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl.h>

#include <dlfcn.h>

#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>
#include <thread>
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
using EffectAlgorithmTexture = Result (*)(EffectHandle, GLuint, double);
using EffectProcessTexture = Result (*)(EffectHandle, GLuint, GLuint, double);

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

std::vector<std::uint8_t> makeCalibrationImage(const ImageSize& size) {
    std::vector<std::uint8_t> pixels(static_cast<std::size_t>(size.width * size.height * 4));
    for (int y = 0; y < size.height; ++y) {
        for (int x = 0; x < size.width; ++x) {
            const std::size_t offset = static_cast<std::size_t>((y * size.width + x) * 4);
            pixels[offset] = static_cast<std::uint8_t>((x * 255) / (size.width - 1));
            pixels[offset + 1] = static_cast<std::uint8_t>((y * 255) / (size.height - 1));
            pixels[offset + 2] = static_cast<std::uint8_t>(((x / 8 + y / 8) % 2) * 220 + 20);
            pixels[offset + 3] = 255;
        }
    }
    return pixels;
}

std::vector<std::uint8_t> makeOutputSeed(const ImageSize& size) {
    std::vector<std::uint8_t> pixels(static_cast<std::size_t>(size.width * size.height * 4));
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
        static_cast<std::size_t>(options.size.width * options.size.height * 4));
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

void writePpm(const PpmOptions& options) {
    std::ofstream output(options.outputPath, std::ios::binary);
    output << "P6\n" << options.size.width << ' ' << options.size.height << "\n255\n";
    for (int y = options.size.height - 1; y >= 0; --y) {
        for (int x = 0; x < options.size.width; ++x) {
            const std::size_t offset = static_cast<std::size_t>((y * options.size.width + x) * 4);
            output.write(reinterpret_cast<const char*>(options.pixels.data() + offset), 3);
        }
    }
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

}  // namespace

int main(int argc, char** argv) {
    if (argc < 5 || argc > 7) {
        std::cerr << "usage: effect-cgl-render-probe <effect-lib> <models> <effect> <output.ppm> [legacy|core32] [pipeline]\n";
        return 2;
    }

    constexpr ImageSize size = {.width = 64, .height = 64};
    const bool useCoreProfile = argc >= 6 && std::string_view(argv[5]) == "core32";
    const bool usePipeline = argc == 7 && std::string_view(argv[6]) == "pipeline";
    const ContextResult contextResult = createContext(useCoreProfile);
    if (contextResult.context == nullptr) {
        return 4;
    }

    std::cout << "context=" << contextResult.context << '\n';
    std::cout << "current_context=" << CGLGetCurrentContext() << '\n';
    std::cout << "gl_vendor=" << glString(GL_VENDOR) << '\n';
    std::cout << "gl_renderer=" << glString(GL_RENDERER) << '\n';
    std::cout << "gl_version=" << glString(GL_VERSION) << '\n';

    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    const std::vector<std::uint8_t> inputPixels = makeCalibrationImage(size);
    const std::vector<std::uint8_t> outputSeed = makeOutputSeed(size);
    const std::string sourceOutputPath = std::string(argv[4]) + ".source.ppm";
    writePpm({.outputPath = sourceOutputPath.c_str(), .pixels = inputPixels, .size = size});
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
    const auto effectAlgorithmTexture =
        loadSymbol<EffectAlgorithmTexture>({effectLibrary, "bef_effect_algorithm_texture"});
    const auto effectProcessTexture =
        loadSymbol<EffectProcessTexture>({effectLibrary, "bef_effect_process_texture"});

    EffectHandle handle = 0;
    Result result = effectCreate(&handle);
    std::cout << "create=" << result << " handle=" << handle << '\n';
    std::cout << "context_after_create=" << CGLGetCurrentContext() << '\n';
    if (result != 0 || handle == 0) {
        return 10;
    }

    std::cout << "set_render_api=" << effectSetRenderApi(handle, 1) << '\n';
    std::cout << "use_pipeline=" << effectUsePipeline(handle, usePipeline) << '\n';
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

    std::this_thread::sleep_for(std::chrono::milliseconds(250));
    Result processResult = -1;
    for (int attempt = 0; attempt < 20; ++attempt) {
        const double timestamp = attempt / 30.0;
        const Result algorithmResult = effectAlgorithmTexture(handle, inputTexture, timestamp);
        processResult = effectProcessTexture(handle, inputTexture, outputTexture, timestamp);
        std::cout << "frame[" << attempt << "] algorithm=" << algorithmResult
                  << " process=" << processResult
                  << " context=" << CGLGetCurrentContext()
                  << " input_valid=" << static_cast<int>(glIsTexture(inputTexture))
                  << " output_valid=" << static_cast<int>(glIsTexture(outputTexture))
                  << " gl_error=0x" << std::hex << glGetError() << std::dec << '\n';
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    glFinish();

    const std::vector<std::uint8_t> outputPixels = readTexture({.texture = outputTexture, .size = size});
    if (outputPixels.empty()) {
        effectDestroy(handle);
        return 13;
    }
    const DifferenceResult difference = calculateDifference({
        .output = outputPixels,
        .input = inputPixels,
        .seed = outputSeed,
    });
    std::cout << "readback_gl_error=0x" << std::hex << glGetError() << std::dec << '\n';
    std::cout << "difference_from_input=" << difference.fromInput << '\n';
    std::cout << "difference_from_seed=" << difference.fromSeed << '\n';
    std::cout << "output_sum=" << difference.outputSum << '\n';
    writePpm({.outputPath = argv[4], .pixels = outputPixels, .size = size});

    effectDestroy(handle);
    const std::array textures = {inputTexture, outputTexture};
    glDeleteTextures(static_cast<GLsizei>(textures.size()), textures.data());
    CGLSetCurrentContext(nullptr);
    CGLDestroyContext(contextResult.context);
    CGLDestroyPixelFormat(contextResult.pixelFormat);
    dlclose(effectLibrary);

    return processResult == 0 && difference.fromSeed != 0 && difference.outputSum != 0 ? 0 : 14;
}
