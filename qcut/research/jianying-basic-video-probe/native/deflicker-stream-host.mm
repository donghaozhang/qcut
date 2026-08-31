#import <CoreVideo/CoreVideo.h>
#import <Metal/Metal.h>

#include <array>
#include <cstdint>
#include <cstring>
#include <dlfcn.h>
#include <fcntl.h>
#include <iostream>
#include <stdexcept>
#include <string>
#include <unistd.h>
#include <vector>

namespace {

constexpr std::size_t kBackendStorageBytes = 4096;
constexpr std::size_t kFrameParameterBytes = 256;
constexpr const char *kHostRoute = "qcut-jianying-private-deflicker-v2";

struct DeflickerInputProperty {
  void *metalDevice = nullptr;
  const char *metalLibraryPath = nullptr;
  bool enabled = true;
  std::array<std::uint8_t, 3> padding{};
  std::int32_t width = 0;
  std::int32_t height = 0;
  std::int32_t pixelFormat = 0;
  std::int32_t algorithm = 0;
  std::int32_t reservedSetting = 0;
  std::int32_t deflickerType = 0;
};

static_assert(offsetof(DeflickerInputProperty, width) == 0x14);
static_assert(offsetof(DeflickerInputProperty, height) == 0x18);
static_assert(offsetof(DeflickerInputProperty, pixelFormat) == 0x1c);
static_assert(offsetof(DeflickerInputProperty, algorithm) == 0x20);
static_assert(offsetof(DeflickerInputProperty, deflickerType) == 0x28);

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

template <typename Value>
void writeParameter(std::array<std::uint8_t, kFrameParameterBytes> &parameters,
                    std::size_t offset, Value value) {
  std::memcpy(parameters.data() + offset, &value, sizeof(value));
}

class DeflickerSession {
 public:
  DeflickerSession(const char *libraryPath, const char *metalLibraryPath,
                   std::int32_t width, std::int32_t height) {
    library_ = dlopen(libraryPath, RTLD_NOW | RTLD_LOCAL);
    if (library_ == nullptr) {
      throw std::runtime_error(std::string("cannot load Lens runtime: ") +
                               dlerror());
    }
    construct_ = requireSymbol<Constructor>(
        library_, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackendC1Ev");
    destroy_ = requireSymbol<Destructor>(
        library_, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackendD1Ev");
    initialize_ = requireSymbol<Initialize>(
        library_,
        "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend11InitBackendEPv");
    uninitialize_ = requireSymbol<Uninitialize>(
        library_,
        "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend13UnInitBackendEv");
    execute_ = requireSymbol<Execute>(
        library_,
        "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend13ExecuteStreamERNSt3__16vectorIPvNS2_9allocatorIS4_EEEES4_");
    getOutput_ = requireSymbol<GetOutput>(
        library_,
        "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend15GetStreamOutputEPNSt3__16vectorIPvNS2_9allocatorIS4_EEEES4_");

    if (posix_memalign(&backend_, 16, kBackendStorageBytes) != 0 ||
        backend_ == nullptr) {
      throw std::runtime_error("cannot allocate aligned backend storage");
    }
    std::memset(backend_, 0, kBackendStorageBytes);
    construct_(backend_);
    constructed_ = true;

    device_ = MTLCreateSystemDefaultDevice();
    if (device_ == nil) throw std::runtime_error("Metal device is unavailable");
    DeflickerInputProperty property{
        .metalDevice = (__bridge void *)device_,
        .metalLibraryPath = metalLibraryPath,
        .width = width,
        .height = height,
        .pixelFormat = 0,
    };
    const int status = initialize_(backend_, &property);
    if (status != 0) {
      throw std::runtime_error("Lens deflicker initialization failed: " +
                               std::to_string(status));
    }
    initialized_ = true;
  }

  DeflickerSession(const DeflickerSession &) = delete;
  DeflickerSession &operator=(const DeflickerSession &) = delete;

  ~DeflickerSession() {
    if (initialized_) uninitialize_(backend_);
    if (constructed_) destroy_(backend_);
    std::free(backend_);
    if (library_ != nullptr) dlclose(library_);
  }

  CVPixelBufferRef process(std::vector<void *> &inputs,
                           std::array<std::uint8_t, kFrameParameterBytes>
                               &parameters) {
    const int executeStatus = execute_(backend_, inputs, parameters.data());
    if (executeStatus != 0) {
      throw std::runtime_error("Lens deflicker frame failed: " +
                               std::to_string(executeStatus));
    }
    std::vector<void *> outputs;
    const int outputStatus =
        getOutput_(backend_, &outputs, parameters.data());
    if (outputStatus != 0 || outputs.size() != 1 || outputs[0] == nullptr) {
      throw std::runtime_error("Lens deflicker returned no frame: " +
                               std::to_string(outputStatus));
    }
    return static_cast<CVPixelBufferRef>(outputs[0]);
  }

 private:
  using Constructor = void (*)(void *);
  using Destructor = void (*)(void *);
  using Initialize = int (*)(void *, void *);
  using Uninitialize = int (*)(void *);
  using Execute = int (*)(void *, std::vector<void *> &, void *);
  using GetOutput = int (*)(void *, std::vector<void *> *, void *);

  void *library_ = nullptr;
  void *backend_ = nullptr;
  Constructor construct_ = nullptr;
  Destructor destroy_ = nullptr;
  Initialize initialize_ = nullptr;
  Uninitialize uninitialize_ = nullptr;
  Execute execute_ = nullptr;
  GetOutput getOutput_ = nullptr;
  bool constructed_ = false;
  bool initialized_ = false;
  __strong id<MTLDevice> device_ = nil;
};

std::size_t readFrame(int descriptor, std::uint8_t *buffer,
                      std::size_t frameBytes) {
  std::size_t offset = 0;
  while (offset < frameBytes) {
    const ssize_t count =
        read(descriptor, buffer + offset, frameBytes - offset);
    if (count == 0) return offset;
    if (count < 0) throw std::runtime_error("cannot read decoded frame");
    offset += static_cast<std::size_t>(count);
  }
  return offset;
}

void writeFrame(int descriptor, const std::uint8_t *buffer,
                std::size_t frameBytes) {
  std::size_t offset = 0;
  while (offset < frameBytes) {
    const ssize_t count =
        write(descriptor, buffer + offset, frameBytes - offset);
    if (count <= 0) throw std::runtime_error("cannot write processed frame");
    offset += static_cast<std::size_t>(count);
  }
}

std::uint64_t blendFrame(CVPixelBufferRef outputBuffer,
                         const std::vector<std::uint8_t> &input,
                         std::vector<std::uint8_t> &output,
                         std::int32_t width, std::int32_t height,
                         std::int32_t strength) {
  CVPixelBufferLockBaseAddress(outputBuffer, kCVPixelBufferLock_ReadOnly);
  const auto *processed = static_cast<const std::uint8_t *>(
      CVPixelBufferGetBaseAddress(outputBuffer));
  const std::size_t processedRowBytes =
      CVPixelBufferGetBytesPerRow(outputBuffer);
  const std::size_t packedRowBytes = static_cast<std::size_t>(width) * 4;
  std::uint64_t changedBytes = 0;
  for (std::int32_t row = 0; row < height; row += 1) {
    const auto *inputRow = input.data() + row * packedRowBytes;
    const auto *processedRow = processed + row * processedRowBytes;
    auto *outputRow = output.data() + row * packedRowBytes;
    for (std::size_t index = 0; index < packedRowBytes; index += 1) {
      const std::int32_t blended =
          (static_cast<std::int32_t>(inputRow[index]) * (100 - strength) +
           static_cast<std::int32_t>(processedRow[index]) * strength + 50) /
          100;
      outputRow[index] = static_cast<std::uint8_t>(blended);
      if (outputRow[index] != inputRow[index]) changedBytes += 1;
    }
  }
  CVPixelBufferUnlockBaseAddress(outputBuffer, kCVPixelBufferLock_ReadOnly);
  return changedBytes;
}

int run(const char *libraryPath, const char *metalLibraryPath,
        std::int32_t width, std::int32_t height, std::int32_t strength,
        int inputDescriptor, int outputDescriptor) {
  const std::size_t frameBytes =
      static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 4;
  std::vector<std::uint8_t> input(frameBytes);
  std::vector<std::uint8_t> output(frameBytes);

  NSDictionary *attributes = @{
    (id)kCVPixelBufferMetalCompatibilityKey : @YES,
    (id)kCVPixelBufferIOSurfacePropertiesKey : @{},
  };
  CVPixelBufferRef pixelBuffer = nullptr;
  const CVReturn createStatus = CVPixelBufferCreate(
      kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
      (__bridge CFDictionaryRef)attributes, &pixelBuffer);
  if (createStatus != kCVReturnSuccess || pixelBuffer == nullptr) {
    throw std::runtime_error("cannot create Metal-compatible pixel buffer");
  }

  std::uint64_t changedBytes = 0;
  std::uint64_t frameCount = 0;
  try {
    DeflickerSession session(libraryPath, metalLibraryPath, width, height);
    std::vector<void *> inputs{pixelBuffer};
    std::array<std::uint8_t, kFrameParameterBytes> parameters{};
    writeParameter(parameters, 0x00, width);
    writeParameter(parameters, 0x04, height);
    writeParameter(parameters, 0x08, width);
    writeParameter(parameters, 0x0c, height);
    writeParameter(parameters, 0x10, true);
    writeParameter(parameters, 0x1c, 1.0F);
    writeParameter(parameters, 0x20, 1.0F);

    while (true) {
      const std::size_t readBytes =
          readFrame(inputDescriptor, input.data(), frameBytes);
      if (readBytes == 0) break;
      if (readBytes != frameBytes) {
        throw std::runtime_error(
            "decoded stream ended inside a frame: " +
            std::to_string(readBytes) + "/" + std::to_string(frameBytes));
      }

      CVPixelBufferLockBaseAddress(pixelBuffer, 0);
      auto *pixelBytes = static_cast<std::uint8_t *>(
          CVPixelBufferGetBaseAddress(pixelBuffer));
      const std::size_t pixelRowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer);
      const std::size_t packedRowBytes = static_cast<std::size_t>(width) * 4;
      for (std::int32_t row = 0; row < height; row += 1) {
        std::memcpy(pixelBytes + row * pixelRowBytes,
                    input.data() + row * packedRowBytes, packedRowBytes);
      }
      CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);

      writeParameter(parameters, 0x14,
                     static_cast<std::int32_t>(frameCount));
      CVPixelBufferRef processed = session.process(inputs, parameters);
      changedBytes += blendFrame(processed, input, output, width, height,
                                 strength);
      writeFrame(outputDescriptor, output.data(), frameBytes);
      frameCount += 1;
      if (frameCount % 15 == 0) {
        std::cerr << "QCUT\tPROGRESS\tframes=" << frameCount << "\n";
      }
    }
  } catch (...) {
    CFRelease(pixelBuffer);
    throw;
  }
  CFRelease(pixelBuffer);
  std::cerr << "QCUT\tRESULT\troute=" << kHostRoute
            << "\tframes=" << frameCount
            << "\tchangedBytes=" << changedBytes << "\n";
  if (frameCount == 0) throw std::runtime_error("decoded stream was empty");
  return 0;
}

std::int32_t parseBoundedInteger(const char *value, const char *label,
                                 std::int32_t minimum,
                                 std::int32_t maximum) {
  const long parsed = std::stol(value);
  if (parsed < minimum || parsed > maximum) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  return static_cast<std::int32_t>(parsed);
}

}  // namespace

int main(int argc, char **argv) {
  if (argc != 6 && argc != 8) {
    std::cerr << "usage: deflicker-stream-host <liblens> <metallib> <width> "
                 "<height> <strength> [input-fifo output-fifo]\n";
    return 2;
  }
  int binaryInput = STDIN_FILENO;
  int binaryOutput = -1;
  if (argc == 8) {
    binaryInput = open(argv[6], O_RDONLY);
    binaryOutput = open(argv[7], O_WRONLY);
  } else {
    binaryOutput = dup(STDOUT_FILENO);
  }
  if (binaryInput < 0 || binaryOutput < 0 ||
      dup2(STDERR_FILENO, STDOUT_FILENO) < 0) {
    std::cerr << "cannot isolate native runtime logs\n";
    if (binaryInput >= 0 && binaryInput != STDIN_FILENO) close(binaryInput);
    if (binaryOutput >= 0) close(binaryOutput);
    return 1;
  }
  @autoreleasepool {
    try {
      const std::int32_t width =
          parseBoundedInteger(argv[3], "width", 64, 8192);
      const std::int32_t height =
          parseBoundedInteger(argv[4], "height", 64, 8192);
      const std::int32_t strength =
          parseBoundedInteger(argv[5], "strength", 1, 100);
      const int status = run(argv[1], argv[2], width, height, strength,
                             binaryInput, binaryOutput);
      if (binaryInput != STDIN_FILENO) close(binaryInput);
      close(binaryOutput);
      return status;
    } catch (const std::exception &error) {
      std::cerr << "QCUT\tERROR\t" << error.what() << "\n";
      if (binaryInput != STDIN_FILENO) close(binaryInput);
      close(binaryOutput);
      return 1;
    }
  }
}
