#import <Metal/Metal.h>

#define GL_SILENCE_DEPRECATION
#include <OpenGL/OpenGL.h>

#include <array>
#include <cstdint>
#include <dlfcn.h>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

struct ProbeResult {
  std::string status;
  std::string detail;
};

class OpenGlContext {
 public:
  OpenGlContext() {
    const CGLPixelFormatAttribute attributes[] = {
        kCGLPFAOpenGLProfile,
        static_cast<CGLPixelFormatAttribute>(kCGLOGLPVersion_Legacy),
        kCGLPFAAccelerated,
        kCGLPFAAllowOfflineRenderers,
        static_cast<CGLPixelFormatAttribute>(0),
    };
    GLint count = 0;
    if (CGLChoosePixelFormat(attributes, &pixelFormat_, &count) != kCGLNoError ||
        pixelFormat_ == nullptr || count == 0) {
      throw std::runtime_error("cannot choose an OpenGL pixel format");
    }
    if (CGLCreateContext(pixelFormat_, nullptr, &context_) != kCGLNoError ||
        context_ == nullptr || CGLSetCurrentContext(context_) != kCGLNoError) {
      throw std::runtime_error("cannot create an OpenGL context");
    }
  }

  OpenGlContext(const OpenGlContext &) = delete;
  OpenGlContext &operator=(const OpenGlContext &) = delete;

  ~OpenGlContext() {
    CGLSetCurrentContext(nullptr);
    if (context_ != nullptr) {
      CGLDestroyContext(context_);
    }
    if (pixelFormat_ != nullptr) {
      CGLDestroyPixelFormat(pixelFormat_);
    }
  }

 private:
  CGLPixelFormatObj pixelFormat_ = nullptr;
  CGLContextObj context_ = nullptr;
};

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  dlerror();
  void *symbol = dlsym(library, name);
  if (const char *error = dlerror(); error != nullptr) {
    throw std::runtime_error(std::string("missing symbol ") + name + ": " +
                             error);
  }
  return reinterpret_cast<Function>(symbol);
}

void *loadLibrary(const std::filesystem::path &path) {
  void *library = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (library == nullptr) {
    throw std::runtime_error(std::string("cannot load ") + path.string() +
                             ": " + dlerror());
  }
  return library;
}

std::string jsonEscape(const std::string &value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char character : value) {
    switch (character) {
      case '\\':
        escaped += "\\\\";
        break;
      case '"':
        escaped += "\\\"";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        escaped += character;
    }
  }
  return escaped;
}

void printResult(const std::string &mode, const ProbeResult &result) {
  std::cout << "{\"mode\":\"" << jsonEscape(mode) << "\",\"status\":\""
            << jsonEscape(result.status) << "\",\"detail\":\""
            << jsonEscape(result.detail) << "\"}\n";
}

void loadMetalLibrary(const std::filesystem::path &path) {
  @autoreleasepool {
    id<MTLDevice> device = MTLCreateSystemDefaultDevice();
    if (device == nil) {
      throw std::runtime_error("Metal device is unavailable");
    }
    NSError *error = nil;
    NSURL *url = [NSURL fileURLWithPath:@(path.c_str())];
    id<MTLLibrary> library = [device newLibraryWithURL:url error:&error];
    if (library == nil) {
      const char *message =
          error == nil ? "unknown Metal error" : error.localizedDescription.UTF8String;
      throw std::runtime_error(std::string("cannot load Metal library: ") +
                               message);
    }
  }
}

ProbeResult probeFactory(void *library, const char *createSymbol,
                         const char *deleteSymbol) {
  using Create = void *(*)();
  using Delete = void (*)(void *);
  const auto create = requireSymbol<Create>(library, createSymbol);
  const auto destroy = requireSymbol<Delete>(library, deleteSymbol);
  void *instance = create();
  if (instance == nullptr) {
    throw std::runtime_error("factory returned a null instance");
  }
  destroy(instance);
  return {.status = "constructed",
          .detail = "factory created and released a local algorithm object"};
}

ProbeResult probeLensFactory(const std::string &mode,
                             const std::filesystem::path &frameworks,
                             const std::filesystem::path &models) {
  void *library = loadLibrary(frameworks / "liblens.dylib");
  ProbeResult result;
  if (mode == "deflicker") {
    result = probeFactory(
        library,
        "_ZN3ies9deflicker16DeflickerFactory23createDeflickerInstanceEv",
        "_ZN3ies9deflicker16DeflickerFactory23deleteDeflickerInstanceEPNS0_18DeflickerInterfaceE");
    loadMetalLibrary(models /
                     "deflicker/deflicker.bundle/deflicker.metallib");
    result = {.status = "model-loaded",
              .detail = "Deflicker factory and Metal library loaded"};
  } else if (mode == "stabilization") {
    result = probeFactory(
        library, "_ZN3ies3vas10VASFactory17createVASInstanceEv",
        "_ZN3ies3vas10VASFactory17deleteVASInstanceEPNS0_12VASInterfaceE");
  } else if (mode == "umvfi-interpolation") {
    result = probeFactory(
        library, "_ZN3ies5umvfi12UMVFIFactory19createUMVFIInstanceEv",
        "_ZN3ies5umvfi12UMVFIFactory19deleteUMVFIInstanceEPNS0_14UMVFIInterfaceE");
    loadMetalLibrary(models / "umvfi/umvfi.bundle/umvfi.metallib");
    result = {.status = "model-loaded",
              .detail = "UMVFI factory and Metal library loaded"};
  } else if (mode == "optical-flow-motion-blur") {
    result = probeFactory(
        library, "_ZN3ies3vmb10VMBFactory17createVMBInstanceEv",
        "_ZN3ies3vmb10VMBFactory17deleteVMBInstanceEPNS0_12VMBInterfaceE");
  } else {
    dlclose(library);
    throw std::runtime_error("unsupported Lens probe mode");
  }
  dlclose(library);
  return result;
}

ProbeResult probeByteNn(const std::filesystem::path &frameworks,
                        const std::filesystem::path &models) {
  void *library = loadLibrary(frameworks / "libbytenn.dylib");
  using CreateFromFile = void *(*)(const char *);
  const auto createFromFile = requireSymbol<CreateFromFile>(
      library, "_ZN5IESNN11Interpreter14CreateFromFileEPKc");
  const auto modelPath = models / "noise_reduction/nn_denoise.bytenn";
  void *interpreter = createFromFile(modelPath.c_str());
  if (interpreter == nullptr) {
    dlclose(library);
    throw std::runtime_error("ByteNN rejected the denoise model");
  }
  // The worker exits immediately because this private build does not export
  // the matching Interpreter destructor.
  return {.status = "model-loaded",
          .detail = "ByteNN parsed nn_denoise.bytenn"};
}

ProbeResult probeObjectTracking(const std::filesystem::path &frameworks,
                                const std::filesystem::path &models) {
  void *library = loadLibrary(frameworks / "libcccreator.dylib");
  using CreateHandle = int (*)(void **);
  using GetDefaultParams = void (*)(void *);
  using Initialize = int (*)(void *, const char *, void *);
  using ReleaseHandle = int (*)(void *);
  const auto createHandle = requireSymbol<CreateHandle>(
      library, "_Z33Bingo_ObjectTracking_createHandlePPv");
  const auto getDefaultParams = requireSymbol<GetDefaultParams>(
      library, "_Z36Bingo_ObjectTracking_getDefaultParamP27Bingo_ObjectTracking_Params");
  const auto initialize = requireSymbol<Initialize>(
      library, "_Z25Bingo_ObjectTracking_initPvPKcP27Bingo_ObjectTracking_Params");
  const auto releaseHandle = requireSymbol<ReleaseHandle>(
      library, "_Z34Bingo_ObjectTracking_releaseHandlePv");

  alignas(16) std::array<std::uint8_t, 4096> parameters{};
  getDefaultParams(parameters.data());
  void *handle = nullptr;
  const int createStatus = createHandle(&handle);
  if (createStatus != 0 || handle == nullptr) {
    dlclose(library);
    throw std::runtime_error("cannot create object-tracking handle: " +
                             std::to_string(createStatus));
  }
  const auto modelPath =
      models / "object_tracking/bingo_objectTracking_v1.0.dat";
  const int initStatus = initialize(handle, modelPath.c_str(), parameters.data());
  releaseHandle(handle);
  dlclose(library);
  if (initStatus != 0) {
    throw std::runtime_error("object-tracking model init failed: " +
                             std::to_string(initStatus));
  }
  return {.status = "model-loaded",
          .detail = "Bingo object-tracking model initialized"};
}

ProbeResult probeEffectRuntime(const std::filesystem::path &frameworks,
                               const std::filesystem::path &models) {
  OpenGlContext context;
  void *library = loadLibrary(frameworks / "libcccreator.dylib");
  using EffectHandle = std::uint64_t;
  using Create = int (*)(EffectHandle *);
  using Destroy = void (*)(EffectHandle);
  using SetRenderApi = int (*)(EffectHandle, int);
  using Initialize = int (*)(EffectHandle, int, int, const char *, const char *);
  const auto create =
      requireSymbol<Create>(library, "bef_effect_create_handle");
  const auto destroy = requireSymbol<Destroy>(library, "bef_effect_destroy");
  const auto setRenderApi =
      requireSymbol<SetRenderApi>(library, "bef_effect_set_render_api");
  const auto initialize = requireSymbol<Initialize>(library, "bef_effect_init");
  EffectHandle handle = 0;
  const int createStatus = create(&handle);
  if (createStatus != 0 || handle == 0) {
    dlclose(library);
    throw std::runtime_error("cannot create effect runtime: " +
                             std::to_string(createStatus));
  }
  const int renderStatus = setRenderApi(handle, 1);
  const int initStatus = initialize(handle, 360, 640, models.c_str(), "");
  destroy(handle);
  dlclose(library);
  if (renderStatus != 0 || initStatus != 0) {
    throw std::runtime_error("effect runtime init failed: render=" +
                             std::to_string(renderStatus) +
                             " init=" + std::to_string(initStatus));
  }
  return {.status = "constructed",
          .detail = "Bach/Amazing runtime initialized with the local model root"};
}

ProbeResult runProbe(const std::string &mode,
                     const std::filesystem::path &frameworks,
                     const std::filesystem::path &models) {
  if (mode == "deflicker" || mode == "stabilization" ||
      mode == "umvfi-interpolation" ||
      mode == "optical-flow-motion-blur") {
    return probeLensFactory(mode, frameworks, models);
  }
  if (mode == "bytenn-denoise") {
    return probeByteNn(frameworks, models);
  }
  if (mode == "camera-tracking") {
    return probeObjectTracking(frameworks, models);
  }
  if (mode == "eye-correction") {
    return probeEffectRuntime(frameworks, models);
  }
  throw std::runtime_error("unsupported probe mode: " + mode);
}

}  // namespace

int main(int argc, char **argv) {
  if (argc != 4) {
    std::cerr << "usage: runtime-probe <mode> <frameworks-dir> <models-dir>\n";
    return 2;
  }
  const std::string mode(argv[1]);
  try {
    printResult(mode, runProbe(mode, argv[2], argv[3]));
    return 0;
  } catch (const std::exception &error) {
    printResult(mode, {.status = "failed", .detail = error.what()});
    return 1;
  }
}
