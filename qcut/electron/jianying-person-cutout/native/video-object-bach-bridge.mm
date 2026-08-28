#define GL_SILENCE_DEPRECATION

#include "alpha-refinement.hpp"
#include "metal-matting-blend.hpp"

#import <AppKit/AppKit.h>
#import <OpenGL/OpenGL.h>

#include <CommonCrypto/CommonDigest.h>
#include <CoreVideo/CoreVideo.h>
#include <dlfcn.h>
#include <mach-o/loader.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <exception>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#if defined(QCUT_BACH_RESEARCH_CAPTURE)
extern "C" void installByteCoreMLNn3Capture();
#endif

namespace {

constexpr std::size_t kFrameObjectSize = 0x2c8;
constexpr std::size_t kMattingObjectSize = 0x388;
constexpr std::size_t kMaskStorageSize = 0x80;
constexpr int kObjectMattingType = 1;
constexpr int kVideoSaliencyModelType = 3;
constexpr int kBgraPixelFormat = 13;
constexpr int kModelDimension = 256;
constexpr std::string_view kProviderId =
    "video-object-jianying-bach-v2-exact-d634-v1";
constexpr std::string_view kBlendId =
    "TEMattingBlendEffectV2-vendor-exact";
constexpr std::string_view kExactRefinementId =
    "vendor-v2-exact-no-qcut-refinement-v1";
constexpr std::string_view kAdvancedRefinementId =
    "qcut-alpha-refinement-after-vendor-v2-v1";
constexpr std::string_view kExpectedRuntimeUuid =
    "D6342ECD-5432-33F0-A2AD-0C28F5699994";
constexpr std::string_view kExpectedLibrarySha256 =
    "0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9";
constexpr std::string_view kExpectedGraphSha256 =
    "797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b";
constexpr std::string_view kExpectedModelSha256 =
    "346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef";
constexpr std::string_view kRuntimeFrameworkClosureId =
    "jianying-runtime-framework-closure-d634-v1-"
    "e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e";

struct PinnedRuntimeFramework {
  std::string_view fileName;
  std::string_view sha256;
};

constexpr std::array<PinnedRuntimeFramework, 22> kRuntimeFrameworks{{
    {"libAGFX.dylib",
     "1b9493940eebda3b79d72b7308adf8abfbff56c9cfce9d7d73b31cd080453eee"},
    {"libByteVC1_dec.dylib",
     "1934d8af041763669bf671ae4bc36920b50a671112eee97e238d59e2c6f4f80a"},
    {"libEGL.dylib",
     "9b47714f4e4db6a99567a361df7d68fe3f1ba1ce0f2277a7c2d13f8df144cedc"},
    {"libGLESv2.dylib",
     "6553b3bf3900e51c31d81d1734b689410aec7eedd48e199b8909e6824763842f"},
    {"libIESAppLogger.dylib",
     "90e6e7b203d42c3315c704e4912288e9a6e9fab7db310e404a48657b1c662687"},
    {"libLumiGeneRuntime.dylib",
     "2ef804016a7e3c359c9cbb430a33d15eee37b6a9c274e27d00246dfdadb907ab"},
    {"libavcodec.dylib",
     "83dcaf3834b561ef9cb7dfe23979053932ae075e33bae60c1c1ffccdb2f3c831"},
    {"libavdevice.dylib",
     "e50acfe1423795507e0e8a8beec6a22504e4b3484961d617700cc1389f33e0c9"},
    {"libavfilter.dylib",
     "04bca9d6227f80b916fa149f2f786e6ccfaa264e58d3903d3eccc347eb6e6ea0"},
    {"libavformat.dylib",
     "e3e123b6f6efdfebbd20fbd554006a6da8348671150eaa8ff27999edad00dc04"},
    {"libavutil.dylib",
     "647f031c96f4e75506c8a663970e06594f15ac76196b1d0d82e1f2c1273b8fd1"},
    {"libbytenn.dylib",
     "febfce4549cd6337c232c22ed00463a54cda7b255c4961426a33bfc78542b863"},
    {"libdav1d.dylib",
     "08f14e26884aa68653471bf737d1e619def2376d256c57265dc443bdf8fc3751"},
    {"libfastcv.dylib",
     "679fc0665d9e24a6130f1bf53cc04d7a54edde4fcba6d9607e4559b627ae066f"},
    {"libffmpeg.dylib",
     "f9d7e2346b80bb14265ee274bb69cadaa5e7d8b86ab14339290f9fa6cb2231e5"},
    {"liblens.dylib",
     "fdf576dd066a11db7b54d815621893ed62a8ed223e22834d5753738dc66df161"},
    {"libmp3lame.0.dylib",
     "7e94d5e4ac4f9bba67399b3f161fb4f6297ed9a56e7772ca805ebbd2e8905294"},
    {"libsamicore.dylib",
     "79494a89151fbf4b11ac8093e993a58ca075b2f379d17b4ccba309ec1aca6214"},
    {"libsscronet.dylib",
     "0f9f0b5adfd2128dc12b1885c60b5f4a0099fb0cddf0fbc5f8eef108a0f2428c"},
    {"libswresample.dylib",
     "b87bdbb71fb77ebe00a25709fc47ffaf2edbd9850aff698ba8e6e0fa2e4db53d"},
    {"libswscale.dylib",
     "114efa544ceced50e59d24956ae4bb8d0b42679389f0e251b6da43fde1b918bd"},
    {"libvecryptor.dylib",
     "8cc1f5cf094ee0dd8673a3c626f51892d6bd37ea15a178e3c80246c939a3a81e"},
}};

struct ITEVideoFrame;
struct BachAlgorithmSystem;

struct TagSteImgPos {
  std::array<std::byte, 0x18> bytes{};
};

struct VEMattingTypeParam {
  int mattingType = 0;
  int padding04 = 0;
  std::string field08;
  std::string graphPath;
  std::string field38;
  std::string field50;
  int modelType = 0;
  int field6c = 0;
  bool field70 = false;
  std::array<std::byte, 7> padding71{};
  std::string field78;
  std::uint64_t field90 = 0;
  std::uint32_t field98 = 0;
  std::uint32_t padding9c = 0;
};

static_assert(sizeof(std::string) == 0x18);
static_assert(sizeof(TagSteImgPos) == 0x18);
static_assert(sizeof(VEMattingTypeParam) == 0xa0);
static_assert(offsetof(VEMattingTypeParam, graphPath) == 0x20);
static_assert(offsetof(VEMattingTypeParam, modelType) == 0x68);

using ResourceFinder =
    std::function<char *(void *, const char *, const char *)>;
using GetEffectConfig = void *(*)();
using SetExternalFinder = void (*)(void *, const ResourceFinder &);
using FrameConstructor = void (*)(void *, int, const TagSteImgPos &, int);
using FrameDestructor = void (*)(void *);
using StorePixelBuffer = void (*)(void *, void *);
using MattingConstructor = void (*)(void *);
using MattingDestructor = void (*)(void *);
using InitBach = int (*)(void *, const VEMattingTypeParam &,
                         const VEMattingTypeParam &, int);
using AIMattingInternal =
    int (*)(void *, const std::shared_ptr<ITEVideoFrame> &,
            const VEMattingTypeParam &,
            const std::shared_ptr<BachAlgorithmSystem> &, bool);
using GetMaskAndBoundingBox =
    int (*)(void *, int, int, void *,
            const std::shared_ptr<BachAlgorithmSystem> &);

std::filesystem::path targetModelPath;

template <typename Symbol>
Symbol requireSymbol(void *library, const char *name) {
  dlerror();
  void *address = dlsym(library, name);
  const char *error = dlerror();
  if (error != nullptr || address == nullptr) {
    throw std::runtime_error("missing audited symbol " + std::string(name) +
                             ": " +
                             (error == nullptr ? "null" : error));
  }
  return reinterpret_cast<Symbol>(address);
}

class LibraryHandle {
public:
  explicit LibraryHandle(const std::filesystem::path &path) {
    handle_ = dlopen(path.c_str(), RTLD_NOW | RTLD_GLOBAL);
    if (handle_ == nullptr) {
      throw std::runtime_error("cannot load audited Jianying runtime: " +
                               std::string(dlerror()));
    }
  }

  ~LibraryHandle() {
    if (handle_ != nullptr) {
      dlclose(handle_);
    }
  }

  LibraryHandle(const LibraryHandle &) = delete;
  LibraryHandle &operator=(const LibraryHandle &) = delete;

  void *get() const { return handle_; }

private:
  void *handle_ = nullptr;
};

class EngineGlContext {
public:
  EngineGlContext() {
    [NSApplication sharedApplication];
    const NSOpenGLPixelFormatAttribute attributes[] = {
        NSOpenGLPFAOpenGLProfile,
        NSOpenGLProfileVersion3_2Core,
        NSOpenGLPFAAccelerated,
        NSOpenGLPFAAllowOfflineRenderers,
        NSOpenGLPFAColorSize,
        32,
        NSOpenGLPFAAlphaSize,
        8,
        0,
    };
    pixelFormat_ =
        [[NSOpenGLPixelFormat alloc] initWithAttributes:attributes];
    if (pixelFormat_ == nil) {
      throw std::runtime_error("cannot create the audited OpenGL context");
    }
    context_ = [[NSOpenGLContext alloc] initWithFormat:pixelFormat_
                                          shareContext:nil];
    if (context_ == nil) {
      throw std::runtime_error("cannot create the audited OpenGL context");
    }
    makeCurrent();
  }

  ~EngineGlContext() {
    if ([NSOpenGLContext currentContext] == context_) {
      [NSOpenGLContext clearCurrentContext];
    }
  }

  EngineGlContext(const EngineGlContext &) = delete;
  EngineGlContext &operator=(const EngineGlContext &) = delete;

  bool makeCurrentNoexcept() const noexcept {
    [context_ makeCurrentContext];
    return [NSOpenGLContext currentContext] == context_ &&
           CGLGetCurrentContext() != nullptr;
  }

  void makeCurrent() const {
    if (!makeCurrentNoexcept()) {
      throw std::runtime_error("audited OpenGL context is not current");
    }
  }

private:
  __strong NSOpenGLPixelFormat *pixelFormat_ = nil;
  __strong NSOpenGLContext *context_ = nil;
};

class EngineContextRestore {
public:
  explicit EngineContextRestore(const EngineGlContext &context)
      : context_(context) {}

  ~EngineContextRestore() noexcept {
    if (!context_.makeCurrentNoexcept()) {
      std::terminate();
    }
  }

  EngineContextRestore(const EngineContextRestore &) = delete;
  EngineContextRestore &operator=(const EngineContextRestore &) = delete;

private:
  const EngineGlContext &context_;
};

class PixelBuffer {
public:
  PixelBuffer(const std::vector<std::uint8_t> &rgba, int width, int height) {
    const CVReturn createResult = CVPixelBufferCreate(
        kCFAllocatorDefault, static_cast<std::size_t>(width),
        static_cast<std::size_t>(height), kCVPixelFormatType_32BGRA, nullptr,
        &buffer_);
    if (createResult != kCVReturnSuccess || buffer_ == nullptr) {
      throw std::runtime_error("cannot allocate BGRA CVPixelBuffer: " +
                               std::to_string(createResult));
    }
    const CVReturn lockResult = CVPixelBufferLockBaseAddress(buffer_, 0);
    if (lockResult != kCVReturnSuccess) {
      CVPixelBufferRelease(buffer_);
      buffer_ = nullptr;
      throw std::runtime_error("cannot lock BGRA CVPixelBuffer: " +
                               std::to_string(lockResult));
    }
    auto *base =
        static_cast<std::uint8_t *>(CVPixelBufferGetBaseAddress(buffer_));
    const std::size_t rowBytes = CVPixelBufferGetBytesPerRow(buffer_);
    for (int y = 0; y < height; ++y) {
      auto *destination = base + static_cast<std::size_t>(y) * rowBytes;
      const auto *source =
          rgba.data() + static_cast<std::size_t>(y) * width * 4;
      for (int x = 0; x < width; ++x) {
        destination[x * 4] = source[x * 4 + 2];
        destination[x * 4 + 1] = source[x * 4 + 1];
        destination[x * 4 + 2] = source[x * 4];
        destination[x * 4 + 3] = source[x * 4 + 3];
      }
    }
    CVPixelBufferUnlockBaseAddress(buffer_, 0);
  }

  ~PixelBuffer() {
    if (buffer_ != nullptr) {
      CVPixelBufferRelease(buffer_);
    }
  }

  PixelBuffer(const PixelBuffer &) = delete;
  PixelBuffer &operator=(const PixelBuffer &) = delete;

  CVPixelBufferRef get() const { return buffer_; }

private:
  CVPixelBufferRef buffer_ = nullptr;
};

std::string sha256File(const std::filesystem::path &path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("cannot open pinned runtime asset: " +
                             path.string());
  }
  CC_SHA256_CTX context{};
  CC_SHA256_Init(&context);
  std::array<char, 1024 * 1024> buffer{};
  while (input) {
    input.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    const auto count = input.gcount();
    if (count > 0) {
      CC_SHA256_Update(&context, buffer.data(),
                       static_cast<CC_LONG>(count));
    }
  }
  if (!input.eof()) {
    throw std::runtime_error("cannot read pinned runtime asset: " +
                             path.string());
  }
  std::array<unsigned char, CC_SHA256_DIGEST_LENGTH> digest{};
  CC_SHA256_Final(digest.data(), &context);
  std::ostringstream result;
  result << std::hex << std::setfill('0');
  for (const unsigned char byte : digest) {
    result << std::setw(2) << static_cast<unsigned int>(byte);
  }
  return result.str();
}

void requireSha256(const std::filesystem::path &path,
                   std::string_view expected, std::string_view label) {
  const std::string actual = sha256File(path);
  if (actual != expected) {
    throw std::runtime_error(std::string(label) +
                             " SHA-256 does not match the audited asset");
  }
}

void requireRuntimeFrameworkClosure(
    const std::filesystem::path &libraryPath) {
  const auto frameworkDirectory = libraryPath.parent_path();
  for (const auto &framework : kRuntimeFrameworks) {
    requireSha256(frameworkDirectory / framework.fileName, framework.sha256,
                  framework.fileName);
  }
}

std::string loadedImageUuid(void *symbol) {
  Dl_info info{};
  if (dladdr(symbol, &info) == 0 || info.dli_fbase == nullptr) {
    throw std::runtime_error("cannot inspect loaded runtime UUID");
  }
  const auto *header = static_cast<const mach_header_64 *>(info.dli_fbase);
  if (header->magic != MH_MAGIC_64) {
    throw std::runtime_error("loaded runtime is not native ARM64 Mach-O");
  }
  const auto *command = reinterpret_cast<const load_command *>(header + 1);
  for (std::uint32_t index = 0; index < header->ncmds; ++index) {
    if (command->cmd == LC_UUID && command->cmdsize >= sizeof(uuid_command)) {
      const auto *uuid = reinterpret_cast<const uuid_command *>(command)->uuid;
      std::ostringstream output;
      output << std::uppercase << std::hex << std::setfill('0');
      for (int byte = 0; byte < 16; ++byte) {
        if (byte == 4 || byte == 6 || byte == 8 || byte == 10) {
          output << '-';
        }
        output << std::setw(2) << static_cast<unsigned int>(uuid[byte]);
      }
      return output.str();
    }
    command = reinterpret_cast<const load_command *>(
        reinterpret_cast<const std::byte *>(command) + command->cmdsize);
  }
  throw std::runtime_error("loaded runtime has no UUID");
}

char *copyUrl(const std::filesystem::path &path) {
  const std::string value = "file://" + path.string();
  auto *copy = static_cast<char *>(std::malloc(value.size() + 1));
  if (copy == nullptr) {
    return nullptr;
  }
  std::memcpy(copy, value.c_str(), value.size() + 1);
  return copy;
}

char *resolveModel(void *, const char *directory, const char *name) noexcept {
  try {
    const std::string request =
        std::string(directory == nullptr ? "" : directory) + "/" +
        std::string(name == nullptr ? "" : name);
    if (request.find("video_saliency_seg_bce") == std::string::npos) {
      return nullptr;
    }
    return copyUrl(targetModelPath);
  } catch (...) {
    return nullptr;
  }
}

int parsePositiveInteger(const char *value, const char *label) {
  char *end = nullptr;
  errno = 0;
  const long parsed = std::strtol(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0' || parsed <= 0 ||
      parsed > 16384) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  return static_cast<int>(parsed);
}

float parseBoundedFloat(const char *value, float minimum, float maximum,
                        const char *label) {
  char *end = nullptr;
  errno = 0;
  const float parsed = std::strtof(value, &end);
  if (errno != 0 || end == value || *end != '\0' || !std::isfinite(parsed) ||
      parsed < minimum || parsed > maximum) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  return parsed;
}

std::size_t readAll(int descriptor, std::uint8_t *data, std::size_t size) {
  std::size_t bytesRead = 0;
  while (bytesRead < size) {
    const auto result = ::read(descriptor, data + bytesRead, size - bytesRead);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result < 0) {
      throw std::runtime_error("cannot read video-object RGBA input");
    }
    if (result == 0) {
      break;
    }
    bytesRead += static_cast<std::size_t>(result);
  }
  return bytesRead;
}

void writeAll(int descriptor, const std::uint8_t *data, std::size_t size) {
  std::size_t bytesWritten = 0;
  while (bytesWritten < size) {
    const auto result =
        ::write(descriptor, data + bytesWritten, size - bytesWritten);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result <= 0) {
      throw std::runtime_error("cannot write video-object Alpha output");
    }
    bytesWritten += static_cast<std::size_t>(result);
  }
}

class BachMattingSession {
public:
  BachMattingSession(void *library, const std::filesystem::path &graphPath)
      : frameConstructor_(requireSymbol<FrameConstructor>(
            library,
            "_ZN20TECVPixelBufferFrameC1E9ETEPixFmtRK12tagSTEImgPos15ETERota"
            "tionType")),
        frameDestructor_(requireSymbol<FrameDestructor>(
            library, "_ZN20TECVPixelBufferFrameD1Ev")),
        storePixelBuffer_(requireSymbol<StorePixelBuffer>(
            library, "_ZN20TECVPixelBufferFrame18storeCVPixelBufferEPv")),
        mattingConstructor_(requireSymbol<MattingConstructor>(
            library, "_ZN22TEBachMattingAlgorithmC1Ev")),
        mattingDestructor_(requireSymbol<MattingDestructor>(
            library, "_ZN22TEBachMattingAlgorithmD1Ev")),
        initBach_(requireSymbol<InitBach>(
            library,
            "_ZN22TEBachMattingAlgorithm8initBachERK18VEMattingTypeParamS2_i")),
        aiMattingInternal_(requireSymbol<AIMattingInternal>(
            library,
            "_ZN22TEBachMattingAlgorithm17AIMattingInternalERKNSt3__110shared_"
            "ptrI13ITEVideoFrameEERK18VEMattingTypeParamRKNS1_IN4Bach19BachAlg"
            "orithmSystemEEEb")),
        getMaskAndBoundingBox_(requireSymbol<GetMaskAndBoundingBox>(
            library,
            "_ZN22TEBachMattingAlgorithm21getMaskAndBoundingBoxE13VEMattingTy"
            "pe18VEMattingModelTypeR17TEMattingMaskInfoRKNSt3__110shared_ptrIN"
            "4Bach19BachAlgorithmSystemEEE")) {
    current_.mattingType = kObjectMattingType;
    current_.graphPath = graphPath.string();
    current_.modelType = kVideoSaliencyModelType;
    mattingMemory_ = ::operator new(kMattingObjectSize);
    try {
      mattingConstructor_(mattingMemory_);
      mattingConstructed_ = true;
      const int result = initBach_(mattingMemory_, current_, base_, 0);
      if (result != 0) {
        throw std::runtime_error("TEBachMattingAlgorithm::initBach failed: " +
                                 std::to_string(result));
      }
    } catch (...) {
      if (mattingConstructed_) {
        mattingDestructor_(mattingMemory_);
      }
      ::operator delete(mattingMemory_);
      mattingMemory_ = nullptr;
      mattingConstructed_ = false;
      throw;
    }
  }

  ~BachMattingSession() {
    if (mattingConstructed_) {
      mattingDestructor_(mattingMemory_);
    }
    ::operator delete(mattingMemory_);
  }

  BachMattingSession(const BachMattingSession &) = delete;
  BachMattingSession &operator=(const BachMattingSession &) = delete;

  std::vector<std::uint8_t>
  processRawMask(const std::vector<std::uint8_t> &rgba, int width,
                 int height) {
    PixelBuffer pixelBuffer(rgba, width, height);
    void *frameMemory = ::operator new(kFrameObjectSize);
    const TagSteImgPos position{};
    try {
      frameConstructor_(frameMemory, kBgraPixelFormat, position, 0);
    } catch (...) {
      ::operator delete(frameMemory);
      throw;
    }
    std::shared_ptr<ITEVideoFrame> frame(
        reinterpret_cast<ITEVideoFrame *>(frameMemory),
        [destructor = frameDestructor_](ITEVideoFrame *pointer) {
          destructor(pointer);
          ::operator delete(pointer);
        });
    storePixelBuffer_(frameMemory, pixelBuffer.get());

    const std::shared_ptr<BachAlgorithmSystem> externalSystem;
    const int executeResult = aiMattingInternal_(
        mattingMemory_, frame, current_, externalSystem, true);
    if (executeResult != 0) {
      throw std::runtime_error("Bach video-object inference failed: " +
                               std::to_string(executeResult));
    }

    alignas(16) std::array<std::byte, kMaskStorageSize> maskStorage{};
    *reinterpret_cast<float *>(maskStorage.data()) = -1.0F;
    const int maskResult = getMaskAndBoundingBox_(
        mattingMemory_, kObjectMattingType, kVideoSaliencyModelType,
        maskStorage.data(), externalSystem);
    if (maskResult != 0) {
      throw std::runtime_error("cannot read Bach saliency_mask: " +
                               std::to_string(maskResult));
    }

    auto *alpha =
        *reinterpret_cast<std::uint8_t **>(maskStorage.data() + 0x10);
    const std::unique_ptr<std::uint8_t[]> ownedAlpha(alpha);
    const int alphaWidth =
        *reinterpret_cast<const int *>(maskStorage.data() + 0x18);
    const int alphaHeight =
        *reinterpret_cast<const int *>(maskStorage.data() + 0x1c);
    if (ownedAlpha == nullptr || alphaWidth != kModelDimension ||
        alphaHeight != kModelDimension) {
      throw std::runtime_error(
          "Bach saliency_mask violates the audited 256x256 contract");
    }
    const std::size_t alphaSize =
        static_cast<std::size_t>(alphaWidth) * alphaHeight;
    return std::vector<std::uint8_t>(ownedAlpha.get(),
                                     ownedAlpha.get() + alphaSize);
  }

private:
  FrameConstructor frameConstructor_;
  FrameDestructor frameDestructor_;
  StorePixelBuffer storePixelBuffer_;
  MattingConstructor mattingConstructor_;
  MattingDestructor mattingDestructor_;
  InitBach initBach_;
  AIMattingInternal aiMattingInternal_;
  GetMaskAndBoundingBox getMaskAndBoundingBox_;
  VEMattingTypeParam current_;
  VEMattingTypeParam base_;
  void *mattingMemory_ = nullptr;
  bool mattingConstructed_ = false;
};

} // namespace

int main(int argc, char **argv) {
  if (argc != 8 && argc != 12) {
    std::cerr << "usage: jianying-video-object-bach-bridge <libcccreator> "
                 "<graph-dir> <model-file> <input.rgba|-> <width> <height> "
                 "<output.gray|-> [<threshold> <temporal-smoothing> "
                 "<edge-shift> <feather>]\n";
    return 2;
  }
  try {
    const std::filesystem::path libraryPath = argv[1];
    const std::filesystem::path graphPath = argv[2];
    targetModelPath = argv[3];
    const std::filesystem::path inputPath = argv[4];
    const int width = parsePositiveInteger(argv[5], "width");
    const int height = parsePositiveInteger(argv[6], "height");
    const std::filesystem::path outputPath = argv[7];
    const float threshold =
        argc == 12 ? parseBoundedFloat(argv[8], 0.0F, 1.0F, "threshold")
                   : 0.5F;
    const float temporalSmoothing =
        argc == 12
            ? parseBoundedFloat(argv[9], 0.0F, 0.95F, "temporal smoothing")
            : 0.0F;
    const float edgeShift =
        argc == 12
            ? parseBoundedFloat(argv[10], -12.0F, 12.0F, "edge shift")
            : 0.0F;
    const float feather =
        argc == 12 ? parseBoundedFloat(argv[11], 0.0F, 16.0F, "feather")
                   : 0.0F;
    const bool useRefinement = threshold != 0.5F || temporalSmoothing != 0.0F ||
                               edgeShift != 0.0F || feather != 0.0F;
    const std::size_t frameBytes =
        static_cast<std::size_t>(width) * height * 4;
    const bool streamInput = inputPath == "-";
    const bool streamOutput = outputPath == "-";

    requireSha256(libraryPath, kExpectedLibrarySha256, "libcccreator");
    requireRuntimeFrameworkClosure(libraryPath);
    requireSha256(graphPath / "algorithmConfig.json", kExpectedGraphSha256,
                  "video-object graph");
    requireSha256(targetModelPath, kExpectedModelSha256,
                  "video-object packed model");

    std::unique_ptr<std::ifstream> inputFile;
    std::istream *input = &std::cin;
    std::size_t expectedFrameCount = 0;
    if (!streamInput) {
      inputFile = std::make_unique<std::ifstream>(
          inputPath, std::ios::binary | std::ios::ate);
      if (!*inputFile) {
        throw std::runtime_error("cannot open video-object RGBA input");
      }
      const auto inputBytes = inputFile->tellg();
      if (inputBytes <= 0 ||
          static_cast<std::size_t>(inputBytes) % frameBytes != 0) {
        throw std::runtime_error("video-object input has incomplete frames");
      }
      expectedFrameCount =
          static_cast<std::size_t>(inputBytes) / frameBytes;
      inputFile->seekg(0);
      input = inputFile.get();
    }

    std::unique_ptr<std::ofstream> outputFile;
    int outputDescriptor = -1;
    if (streamOutput) {
      outputDescriptor = ::dup(STDOUT_FILENO);
      if (outputDescriptor < 0 || ::dup2(STDERR_FILENO, STDOUT_FILENO) < 0) {
        throw std::runtime_error("cannot isolate video-object Alpha stream");
      }
    } else {
      outputFile =
          std::make_unique<std::ofstream>(outputPath, std::ios::binary);
      if (!*outputFile) {
        throw std::runtime_error("cannot open video-object Alpha output");
      }
    }

    LibraryHandle library(libraryPath);
    const auto getEffectConfig = requireSymbol<GetEffectConfig>(
        library.get(), "_ZN14TEEffectConfig11getInstanceEv");
    if (loadedImageUuid(reinterpret_cast<void *>(getEffectConfig)) !=
        kExpectedRuntimeUuid) {
      throw std::runtime_error("runtime UUID does not match the audited image");
    }
#if defined(QCUT_BACH_RESEARCH_CAPTURE)
    installByteCoreMLNn3Capture();
#endif
    const auto setExternalFinder = requireSymbol<SetExternalFinder>(
        library.get(),
        "_ZN14TEEffectConfig17setExternalFinderERKNSt3__18functionIFPcPvPKcS5_"
        "EEE");
    const ResourceFinder finder(resolveModel);
    setExternalFinder(getEffectConfig(), finder);

    EngineGlContext engineGlContext;
    BachMattingSession session(library.get(), graphPath);
    // Teardown is V2 -> restore Engine context -> Bach session.
    EngineContextRestore engineContextRestore(engineGlContext);
    auto vendorBlend = std::make_unique<qcut::matting::MetalMattingBlend>(
        qcut::matting::MetalMattingBlendConfig{
            .library = library.get(),
            .width = width,
            .height = height,
        });
    std::vector<std::uint8_t> rgba(frameBytes);
    std::vector<float> refinementState;
    std::size_t frameCount = 0;
    while (true) {
      std::size_t bytesRead = 0;
      if (streamInput) {
        bytesRead = readAll(STDIN_FILENO, rgba.data(), rgba.size());
      } else {
        input->read(reinterpret_cast<char *>(rgba.data()),
                    static_cast<std::streamsize>(rgba.size()));
        bytesRead = static_cast<std::size_t>(input->gcount());
      }
      if (bytesRead == 0) {
        break;
      }
      if (bytesRead != frameBytes) {
        throw std::runtime_error("video-object input ended mid-frame");
      }
      std::vector<std::uint8_t> vendorAlpha;
      @autoreleasepool {
        engineGlContext.makeCurrent();
        const auto rawMask = session.processRawMask(rgba, width, height);
        vendorAlpha = vendorBlend->blendAlpha(
            qcut::matting::MetalMattingBlendFrame{
                .rgba = rgba,
                .alpha = rawMask,
                .alphaWidth = kModelDimension,
                .alphaHeight = kModelDimension,
            });
      }
      auto alpha =
          useRefinement
              ? qcut::matting::refineAlpha(
                    vendorAlpha, refinementState, width, height, threshold,
                    temporalSmoothing, edgeShift, feather)
              : vendorAlpha;
      if (useRefinement) {
        qcut::matting::detail::clampMetalMattingBlendAlphaToSource(rgba,
                                                                   alpha);
      }
      if (alpha.size() != static_cast<std::size_t>(width) * height) {
        throw std::runtime_error("video-object Alpha frame size is invalid");
      }
      if (streamOutput) {
        writeAll(outputDescriptor, alpha.data(), alpha.size());
      } else {
        outputFile->write(reinterpret_cast<const char *>(alpha.data()),
                          static_cast<std::streamsize>(alpha.size()));
        if (!*outputFile) {
          throw std::runtime_error("cannot write video-object Alpha frame");
        }
      }
      ++frameCount;
      std::cerr << "progress frame=" << frameCount
                << " total=" << expectedFrameCount << '\n';
    }
    if (frameCount == 0 ||
        (expectedFrameCount > 0 && frameCount != expectedFrameCount)) {
      throw std::runtime_error("video-object input frame count is invalid");
    }
    if (outputFile) {
      outputFile->flush();
      if (!*outputFile) {
        throw std::runtime_error("cannot flush video-object Alpha output");
      }
    }
    if (outputDescriptor >= 0) {
      ::close(outputDescriptor);
    }
    std::cerr << "ok width=" << width << " height=" << height
              << " frames=" << frameCount << " route=" << kProviderId
              << " blend=" << kBlendId
              << " closure=" << kRuntimeFrameworkClosureId
              << " refinement="
              << (useRefinement ? kAdvancedRefinementId : kExactRefinementId)
              << '\n';
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "error route=" << kProviderId << " message=" << error.what()
              << '\n';
    return 1;
  }
}
