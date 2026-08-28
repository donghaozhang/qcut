#include <dlfcn.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

struct BingoMat {
  std::uint8_t *data;
  std::uint32_t width;
  std::uint32_t height;
  std::uint32_t channels;
  std::uint32_t reserved;
  std::uint64_t stride;
  std::uint32_t flags;
  std::uint32_t reservedTail;
};

static_assert(sizeof(BingoMat) == 0x28);
static_assert(offsetof(BingoMat, stride) == 0x18);

struct SaliencyInput {
  BingoMat image;
  std::int32_t pixelFormat;
  std::int32_t modelIndex;
  bool generateBoundingBox;
  bool singleObjectMask;
  bool enablePostRefine;
  bool forceSync;
  std::uint32_t reserved0;
  double refineRadius;
  double refineEpsilon;
  std::int32_t reserved1;
  std::int32_t reserved2;
  std::uint32_t reserved3;
  bool asynchronous;
  std::uint8_t tail[3];
};

static_assert(sizeof(SaliencyInput) == 0x58);
static_assert(offsetof(SaliencyInput, pixelFormat) == 0x28);
static_assert(offsetof(SaliencyInput, asynchronous) == 0x54);

struct SaliencyResult {
  bool valid;
  std::uint8_t padding[7];
  BingoMat mask;
  float boundingBox[8];
  float score;
  std::uint8_t tail[28];
};

static_assert(offsetof(SaliencyResult, mask) == 0x8);

struct SaliencyParams {
  std::int32_t inferenceMode;
  std::uint8_t reserved[68];
};

using CreateHandle = int (*)(void **);
using Init = int (*)(void *, const char *);
using GetInputShape = int (*)(void *, std::uint32_t &, std::uint32_t &);
using SetParams = int (*)(void *, const SaliencyParams &);
using Process = int (*)(void *, const SaliencyInput *, SaliencyResult *);
using ReleaseHandle = int (*)(void *);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  auto *symbol = dlsym(library, name);
  if (!symbol) {
    throw std::runtime_error(std::string("missing symbol: ") + name);
  }
  return reinterpret_cast<Function>(symbol);
}

int parsePositiveInteger(const char *text, const char *label) {
  const int value = std::stoi(text);
  if (value <= 0) {
    throw std::runtime_error(std::string(label) + " must be positive");
  }
  return value;
}

std::vector<std::uint8_t> readFrame(const char *path, std::size_t bytes) {
  std::ifstream input(path, std::ios::binary | std::ios::ate);
  if (!input || input.tellg() != static_cast<std::streamoff>(bytes)) {
    throw std::runtime_error("input must contain exactly one RGBA frame");
  }
  input.seekg(0);
  std::vector<std::uint8_t> frame(bytes);
  input.read(reinterpret_cast<char *>(frame.data()),
             static_cast<std::streamsize>(frame.size()));
  if (!input) {
    throw std::runtime_error("cannot read RGBA frame");
  }
  return frame;
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 9) {
    std::cerr << "usage: saliency-seg-abi-probe <libcccreator> <model> "
                 "<input.rgba> <width> <height> <pixel-format> <model-index> "
                 "<output.gray>\n";
    return 2;
  }
  try {
    const int width = parsePositiveInteger(argv[4], "width");
    const int height = parsePositiveInteger(argv[5], "height");
    const int pixelFormat = std::stoi(argv[6]);
    const int modelIndex = std::stoi(argv[7]);
    auto frame = readFrame(
        argv[3], static_cast<std::size_t>(width) * height * 4);
    void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!library) {
      throw std::runtime_error(std::string("cannot load runtime: ") +
                               dlerror());
    }
    const auto createHandle = requireSymbol<CreateHandle>(
        library, "_Z30Bingo_SaliencySeg_createHandlePPv");
    const auto initialize = requireSymbol<Init>(
        library, "_Z22Bingo_SaliencySeg_initPvPKc");
    const auto getInputShape = requireSymbol<GetInputShape>(
        library, "_Z31Bingo_SaliencySeg_getInputShapePvRjS0_");
    const auto setParams = requireSymbol<SetParams>(
        library, "_Z27Bingo_SaliencySeg_setParamsPvRK24Bingo_SaliencySeg_Params");
    const auto process = requireSymbol<Process>(
        library, "_Z25Bingo_SaliencySeg_processPvPK23Bingo_SaliencySeg_InputP24Bingo_SaliencySeg_Result");
    const auto releaseHandle = requireSymbol<ReleaseHandle>(
        library, "_Z31Bingo_SaliencySeg_releaseHandlePv");

    void *handle = nullptr;
    const int createStatus = createHandle(&handle);
    if (createStatus != 0 || !handle) {
      throw std::runtime_error("cannot create saliency handle: " +
                               std::to_string(createStatus));
    }
    const int initStatus = initialize(handle, argv[2]);
    std::cout << "init=" << initStatus << '\n';
    if (initStatus != 0) {
      releaseHandle(handle);
      return 3;
    }
    std::uint32_t inputWidth = 0;
    std::uint32_t inputHeight = 0;
    const int shapeStatus =
        getInputShape(handle, inputWidth, inputHeight);
    std::cout << "shape_status=" << shapeStatus
              << " input_width=" << inputWidth
              << " input_height=" << inputHeight << '\n';
    const SaliencyParams params{.inferenceMode = 2, .reserved = {}};
    std::cout << "set_params=" << setParams(handle, params) << '\n';
    const SaliencyInput input{
        .image = BingoMat{
            .data = frame.data(),
            .width = static_cast<std::uint32_t>(width),
            .height = static_cast<std::uint32_t>(height),
            .channels = 4,
            .reserved = 0,
            .stride = static_cast<std::uint64_t>(width) * 4,
            .flags = 0,
            .reservedTail = 0,
        },
        .pixelFormat = pixelFormat,
        .modelIndex = modelIndex,
        .generateBoundingBox = false,
        .singleObjectMask = false,
        .enablePostRefine = false,
        .forceSync = true,
        .reserved0 = 0,
        .refineRadius = 3.0,
        .refineEpsilon = 0.01,
        .reserved1 = 0,
        .reserved2 = 0,
        .reserved3 = 0,
        .asynchronous = false,
        .tail = {},
    };
    SaliencyResult result{};
    const int processStatus = process(handle, &input, &result);
    std::cout << "process=" << processStatus
              << " valid=" << static_cast<int>(result.valid)
              << " mask_width=" << result.mask.width
              << " mask_height=" << result.mask.height
              << " mask_channels=" << result.mask.channels
              << " mask_stride=" << result.mask.stride
              << " score=" << result.score << '\n';
    if (processStatus == 0 && result.valid && result.mask.data &&
        result.mask.width > 0 && result.mask.height > 0) {
      const auto outputBytes = static_cast<std::size_t>(result.mask.width) *
                               result.mask.height * result.mask.channels;
      std::ofstream output(argv[8], std::ios::binary);
      output.write(reinterpret_cast<const char *>(result.mask.data),
                   static_cast<std::streamsize>(outputBytes));
      if (!output) {
        throw std::runtime_error("cannot write saliency mask");
      }
    }
    releaseHandle(handle);
    dlclose(library);
    return processStatus == 0 && result.valid ? 0 : 4;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
