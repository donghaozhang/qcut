#include <dlfcn.h>

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

struct MattingInput {
  const std::uint8_t *data;
  std::int32_t pixelFormat;
  std::int32_t width;
  std::int32_t height;
  std::int32_t stride;
  std::int32_t orientation;
  std::int32_t reserved;
  bool invertAlpha;
};

static_assert(offsetof(MattingInput, invertAlpha) == 0x20);

struct MattingOutput {
  std::uint8_t *alpha;
  std::int32_t width;
  std::int32_t height;
};

using CreateHandle = int (*)(void **);
using InitModel = int (*)(void *, int, const char *);
using GetAlphaSize = int (*)(void *, int, int, int *, int *);
using SetParam = int (*)(void *, int, int);
using ProcessFrame = int (*)(void *, const MattingInput *, MattingOutput *);
using ProcessBorder = int (*)(void *, const MattingInput *, int, int,
                              MattingOutput *);
using ReleaseHandle = int (*)(void *);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  auto *symbol = dlsym(library, name);
  if (!symbol) {
    throw std::runtime_error(std::string("missing symbol: ") + name);
  }
  return reinterpret_cast<Function>(symbol);
}

std::uint8_t expectedLutValue(std::uint8_t input, float slope, float center) {
  constexpr float halfPi = 1.57079632679489661923F;
  const float normalized = static_cast<float>(input) / 255.0F;
  const float halfWidth = halfPi / slope;
  if (normalized < center - halfWidth) {
    return 0;
  }
  if (normalized > center + halfWidth) {
    return 255;
  }
  const float mapped =
      (std::sin((normalized - center) * slope) * 0.5F + 0.5F) * 255.0F;
  return static_cast<std::uint8_t>(mapped);
}

std::vector<std::uint8_t> rampPattern(int width, int height) {
  std::vector<std::uint8_t> pixels(static_cast<std::size_t>(width) * height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      pixels[static_cast<std::size_t>(y) * width + x] =
          static_cast<std::uint8_t>((x + y * 37) & 0xff);
    }
  }
  return pixels;
}

std::vector<std::uint8_t> spatialPattern(int width, int height) {
  std::vector<std::uint8_t> pixels(static_cast<std::size_t>(width) * height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const bool border = x == 0 || y == 0 || x == width - 1 ||
                          y == height - 1;
      const bool rectangle = x >= width / 4 && x < width * 3 / 4 &&
                             y >= height / 4 && y < height * 3 / 4;
      const int value =
          border ? 255 : (rectangle ? 180 : ((x * 17 + y * 29) & 0xff));
      pixels[static_cast<std::size_t>(y) * width + x] =
          static_cast<std::uint8_t>(value);
    }
  }
  return pixels;
}

struct VerifyCaseOptions {
  void *handle;
  ProcessBorder processBorder;
  const std::vector<std::uint8_t> &inputPixels;
  int width;
  int height;
  float slope;
  float center;
  const std::string &name;
};

void verifyCase(const VerifyCaseOptions &options) {
  const auto &[handle, processBorder, inputPixels, width, height, slope, center,
               name] = options;
  std::vector<std::uint8_t> outputPixels(inputPixels.size(), 0xcd);
  MattingInput input = {
      .data = inputPixels.data(),
      .pixelFormat = 5,
      .width = width,
      .height = height,
      .stride = width,
      .orientation = 0,
      .reserved = 0,
      .invertAlpha = false,
  };
  MattingOutput output = {
      .alpha = outputPixels.data(),
      .width = 0,
      .height = 0,
  };
  const int status = processBorder(handle, &input, width, height, &output);
  if (status != 0 || output.width != width || output.height != height) {
    throw std::runtime_error(name + " failed: status=" +
                             std::to_string(status) + " output=" +
                             std::to_string(output.width) + "x" +
                             std::to_string(output.height));
  }

  std::size_t mismatchCount = 0;
  int maximumDifference = 0;
  std::size_t firstMismatch = outputPixels.size();
  for (std::size_t index = 0; index < outputPixels.size(); ++index) {
    const auto expected = expectedLutValue(inputPixels[index], slope, center);
    const int difference =
        std::abs(static_cast<int>(outputPixels[index]) - expected);
    maximumDifference = std::max(maximumDifference, difference);
    if (difference == 0) {
      continue;
    }
    mismatchCount += 1;
    firstMismatch = std::min(firstMismatch, index);
  }
  std::cout << "case=" << name << " size=" << width << "x" << height
            << " mismatch=" << mismatchCount
            << " max_difference=" << maximumDifference;
  if (firstMismatch != outputPixels.size()) {
    std::cout << " first_index=" << firstMismatch
              << " input=" << static_cast<int>(inputPixels[firstMismatch])
              << " actual=" << static_cast<int>(outputPixels[firstMismatch])
              << " expected="
              << static_cast<int>(
                     expectedLutValue(inputPixels[firstMismatch], slope, center));
  }
  std::cout << '\n';
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 3) {
    std::cerr << "usage: portrait-matting-border-oracle <libcccreator> "
                 "<gru-model>\n";
    return 2;
  }

  try {
    void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!library) {
      throw std::runtime_error(std::string("cannot load runtime: ") +
                               dlerror());
    }
    const auto createHandle = requireSymbol<CreateHandle>(
        library, "bef_Portrait_Matting_CreateHandle");
    const auto initModel = requireSymbol<InitModel>(
        library, "bef_Portrait_Matting_InitModel");
    const auto getAlphaSize =
        requireSymbol<GetAlphaSize>(library, "bef_MP_GetAlphaSize");
    const auto setParam =
        requireSymbol<SetParam>(library, "bef_MP_SetParam");
    const auto processFrame = requireSymbol<ProcessFrame>(
        library, "bef_Portrait_Matting_DoPortraitMatting");
    const auto processBorder =
        requireSymbol<ProcessBorder>(library, "MP_ProcessBorder");
    const auto releaseHandle = requireSymbol<ReleaseHandle>(
        library, "bef_Portrait_Matting_ReleaseHandle");

    void *handle = nullptr;
    const int createStatus = createHandle(&handle);
    if (createStatus != 0 || !handle) {
      throw std::runtime_error("cannot create matting handle: " +
                               std::to_string(createStatus));
    }
    const int initStatus = initModel(handle, 4, argv[2]);
    std::cerr << "oracle create=" << createStatus << " init=" << initStatus
              << '\n';
    if (initStatus != 0) {
      releaseHandle(handle);
      throw std::runtime_error("cannot initialize matting model: " +
                               std::to_string(initStatus));
    }
    void *internalHandle = *static_cast<void **>(handle);
    if (!internalHandle) {
      releaseHandle(handle);
      throw std::runtime_error("matting wrapper has no internal handle");
    }
    constexpr std::pair<int, int> graphParameters[] = {
        {5, 1}, {6, -1}, {7, 1}, {8, 1}, {1, 15}, {0, 1}, {5, 1},
    };
    for (const auto &[parameter, value] : graphParameters) {
      const int status = setParam(handle, parameter, value);
      if (status != 0) {
        releaseHandle(handle);
        throw std::runtime_error("cannot set graph parameter: " +
                                 std::to_string(status));
      }
    }

    constexpr int sourceWidth = 360;
    constexpr int sourceHeight = 640;
    int alphaWidth = 0;
    int alphaHeight = 0;
    const int sizeStatus = getAlphaSize(
        handle, sourceWidth, sourceHeight, &alphaWidth, &alphaHeight);
    if (sizeStatus != 0 || alphaWidth <= 0 || alphaHeight <= 0) {
      releaseHandle(handle);
      throw std::runtime_error("cannot resolve alpha size: " +
                               std::to_string(sizeStatus));
    }
    std::vector<std::uint8_t> bgr(
        static_cast<std::size_t>(sourceWidth) * sourceHeight * 3, 0);
    std::vector<std::uint8_t> initialAlpha(
        static_cast<std::size_t>(alphaWidth) * alphaHeight);
    MattingInput frameInput = {
        .data = bgr.data(),
        .pixelFormat = 2,
        .width = sourceWidth,
        .height = sourceHeight,
        .stride = sourceWidth * 3,
        .orientation = 0,
        .reserved = 0,
        .invertAlpha = false,
    };
    MattingOutput frameOutput = {
        .alpha = initialAlpha.data(),
        .width = alphaWidth,
        .height = alphaHeight,
    };
    const int frameStatus = processFrame(handle, &frameInput, &frameOutput);
    if (frameStatus != 0) {
      releaseHandle(handle);
      throw std::runtime_error("cannot initialize processor dimensions: " +
                               std::to_string(frameStatus));
    }
    std::cerr << "oracle alpha=" << alphaWidth << "x" << alphaHeight
              << " frame_output=" << frameOutput.width << "x"
              << frameOutput.height << " initialized="
              << static_cast<int>(
                     *(static_cast<std::uint8_t *>(internalHandle) + 0x42c))
              << '\n';

    constexpr float slope = 8.0F;
    constexpr float center = 0.65F;
    std::cerr << "oracle configured\n";
    verifyCase({.handle = internalHandle,
                .processBorder = processBorder,
                .inputPixels = rampPattern(256, 4),
                .width = 256,
                .height = 4,
                .slope = slope,
                .center = center,
                .name = "ramp"});
    verifyCase({.handle = internalHandle,
                .processBorder = processBorder,
                .inputPixels = spatialPattern(37, 29),
                .width = 37,
                .height = 29,
                .slope = slope,
                .center = center,
                .name = "spatial"});
    verifyCase({.handle = internalHandle,
                .processBorder = processBorder,
                .inputPixels = spatialPattern(alphaWidth, alphaHeight),
                .width = alphaWidth,
                .height = alphaHeight,
                .slope = slope,
                .center = center,
                .name = "host-size"});
    releaseHandle(handle);
    dlclose(library);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
