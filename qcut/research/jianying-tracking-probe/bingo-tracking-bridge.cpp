#include <CommonCrypto/CommonDigest.h>
#include <dlfcn.h>
#include <mach-o/loader.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <cerrno>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

constexpr std::string_view kExpectedRuntimeUuid =
    "100726E3-FCB0-31BC-98EE-1B196A1714A3";
constexpr std::string_view kExpectedRuntimeSha256 =
    "b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4";
constexpr std::string_view kExpectedModelSha256 =
    "b2f10c3c1ccc68afb7f5f61c587a29de029b8eff9590755f3b554db4aa04834f";
constexpr std::string_view kRouteId = "jianying-bingo-object-tracking-11.3.0";
constexpr int kRgbPixelFormat = 3;
constexpr int kTrackedStatus = 1;

struct BingoMat {
  std::uint8_t *data = nullptr;
  int width = 0;
  int height = 0;
  int channels = 0;
  int reserved = 0;
  std::size_t rowBytes = 0;
};

struct BingoBBox {
  float centerX = 0.0F;
  float centerY = 0.0F;
  float width = 0.0F;
  float height = 0.0F;
  float rotationCentidegrees = 0.0F;
  float timeSeconds = 0.0F;
  int status = 0;
};

struct alignas(16) BingoParams {
  std::array<std::byte, 0x40> bytes{};
};

static_assert(sizeof(BingoMat) == 0x20);
static_assert(offsetof(BingoMat, width) == 0x8);
static_assert(offsetof(BingoMat, rowBytes) == 0x18);
static_assert(sizeof(BingoBBox) == 0x1c);
static_assert(offsetof(BingoBBox, rotationCentidegrees) == 0x10);
static_assert(offsetof(BingoBBox, status) == 0x18);

using GetDefaultParams = void (*)(BingoParams *);
using CreateHandle = int (*)(void **);
using ReleaseHandle = int (*)(void *);
using Initialize = int (*)(void *, const char *, BingoParams *);
using SetInitialBBox = int (*)(void *, BingoBBox *, BingoMat *, int);
using TrackFrame = void (*)(void *, BingoMat *, int, float, BingoBBox *);

struct Arguments {
  std::filesystem::path runtimeRoot;
  std::filesystem::path inputPath;
  std::filesystem::path outputPath;
  int width = 0;
  int height = 0;
  double fps = 0.0;
  std::size_t anchorFrameIndex = 0;
  std::string direction;
  double left = 0.0;
  double top = 0.0;
  double right = 0.0;
  double bottom = 0.0;
};

struct TrackSample {
  BingoBBox box;
  std::size_t frameIndex = 0;
  bool anchor = false;
};

template <typename Symbol>
Symbol requireSymbol(void *library, const char *name) {
  dlerror();
  void *address = dlsym(library, name);
  const char *error = dlerror();
  if (error != nullptr || address == nullptr) {
    throw std::runtime_error("missing audited symbol " + std::string(name) +
                             ": " + (error == nullptr ? "null" : error));
  }
  return reinterpret_cast<Symbol>(address);
}

class LibraryHandle {
public:
  explicit LibraryHandle(const std::filesystem::path &path) {
    handle_ = dlopen(path.c_str(), RTLD_NOW | RTLD_GLOBAL);
    if (handle_ == nullptr) {
      throw std::runtime_error("cannot load cached Jianying runtime: " +
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
      CC_SHA256_Update(&context, buffer.data(), static_cast<CC_LONG>(count));
    }
  }
  if (!input.eof()) {
    throw std::runtime_error("cannot hash pinned runtime asset: " +
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

void requireSha256(const std::filesystem::path &path, std::string_view expected,
                   std::string_view label) {
  if (sha256File(path) != expected) {
    throw std::runtime_error(std::string(label) +
                             " SHA-256 does not match the audited asset");
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
        if (byte == 4 || byte == 6 || byte == 8 || byte == 10)
          output << '-';
        output << std::setw(2) << static_cast<unsigned int>(uuid[byte]);
      }
      return output.str();
    }
    command = reinterpret_cast<const load_command *>(
        reinterpret_cast<const std::byte *>(command) + command->cmdsize);
  }
  throw std::runtime_error("loaded runtime has no UUID");
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

std::size_t parseNonNegativeIndex(const char *value, const char *label) {
  if (value[0] == '-') {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  char *end = nullptr;
  errno = 0;
  const unsigned long long parsed = std::strtoull(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0' ||
      parsed > std::numeric_limits<std::size_t>::max()) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  return static_cast<std::size_t>(parsed);
}

double parseFiniteDouble(const char *value, double minimum, double maximum,
                         const char *label) {
  char *end = nullptr;
  errno = 0;
  const double parsed = std::strtod(value, &end);
  if (errno != 0 || end == value || *end != '\0' || !std::isfinite(parsed) ||
      parsed < minimum || parsed > maximum) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  return parsed;
}

Arguments parseArguments(int argc, char **argv) {
  if (argc != 13) {
    throw std::runtime_error(
        "usage: bingo-tracking-bridge <runtime-root> <input.rgb24> "
        "<output.json> <width> <height> <fps> <anchor-frame> "
        "<forward|backward|both> <left> <top> <right> <bottom>");
  }
  Arguments arguments{
      .runtimeRoot = argv[1],
      .inputPath = argv[2],
      .outputPath = argv[3],
      .width = parsePositiveInteger(argv[4], "width"),
      .height = parsePositiveInteger(argv[5], "height"),
      .fps = parseFiniteDouble(argv[6], 0.001, 1000.0, "fps"),
      .anchorFrameIndex = parseNonNegativeIndex(argv[7], "anchor frame"),
      .direction = argv[8],
      .left = parseFiniteDouble(argv[9], 0.0, 1.0, "left"),
      .top = parseFiniteDouble(argv[10], 0.0, 1.0, "top"),
      .right = parseFiniteDouble(argv[11], 0.0, 1.0, "right"),
      .bottom = parseFiniteDouble(argv[12], 0.0, 1.0, "bottom"),
  };
  if (arguments.direction != "forward" && arguments.direction != "backward" &&
      arguments.direction != "both") {
    throw std::runtime_error("direction must be forward, backward, or both");
  }
  if (arguments.left >= arguments.right || arguments.top >= arguments.bottom) {
    throw std::runtime_error("initial rectangle must have positive area");
  }
  return arguments;
}

class RawVideo {
public:
  RawVideo(const std::filesystem::path &path, int width, int height)
      : input_(path, std::ios::binary | std::ios::ate),
        frameBytes_(static_cast<std::size_t>(width) * height * 3) {
    if (!input_)
      throw std::runtime_error("cannot open RGB24 input");
    const auto inputBytes = input_.tellg();
    if (inputBytes <= 0 ||
        static_cast<std::size_t>(inputBytes) % frameBytes_ != 0) {
      throw std::runtime_error("RGB24 input contains an incomplete frame");
    }
    frameCount_ = static_cast<std::size_t>(inputBytes) / frameBytes_;
    input_.seekg(0);
  }

  std::size_t frameCount() const { return frameCount_; }

  std::vector<std::uint8_t> readFrame(std::size_t frameIndex) {
    if (frameIndex >= frameCount_) {
      throw std::runtime_error("frame index is outside RGB24 input");
    }
    std::vector<std::uint8_t> frame(frameBytes_);
    input_.clear();
    input_.seekg(static_cast<std::streamoff>(frameIndex * frameBytes_));
    input_.read(reinterpret_cast<char *>(frame.data()),
                static_cast<std::streamsize>(frame.size()));
    if (static_cast<std::size_t>(input_.gcount()) != frame.size()) {
      throw std::runtime_error("cannot read a complete RGB24 frame");
    }
    return frame;
  }

private:
  std::ifstream input_;
  std::size_t frameBytes_ = 0;
  std::size_t frameCount_ = 0;
};

class BingoApi {
public:
  explicit BingoApi(void *library)
      : getDefaultParams_(requireSymbol<GetDefaultParams>(
            library,
            "_Z36Bingo_ObjectTracking_getDefaultParamP27Bingo_ObjectTracking_"
            "Params")),
        createHandle_(requireSymbol<CreateHandle>(
            library, "_Z33Bingo_ObjectTracking_createHandlePPv")),
        releaseHandle_(requireSymbol<ReleaseHandle>(
            library, "_Z34Bingo_ObjectTracking_releaseHandlePv")),
        initialize_(requireSymbol<Initialize>(
            library, "_Z25Bingo_ObjectTracking_initPvPKcP27Bingo_"
                     "ObjectTracking_Params")),
        setInitialBBox_(requireSymbol<SetInitialBBox>(
            library,
            "_Z35Bingo_ObjectTracking_setInitialBBoxPvP25Bingo_ObjectTracking_"
            "BboxP9Bingo_Mat17Bingo_PixelFormat")),
        trackFrame_(requireSymbol<TrackFrame>(
            library, "_Z31Bingo_ObjectTracking_trackFramePvP9Bingo_Mat17Bingo_"
                     "PixelFormatfP25Bingo_ObjectTracking_Bbox")) {}

  GetDefaultParams getDefaultParams() const { return getDefaultParams_; }
  CreateHandle createHandle() const { return createHandle_; }
  ReleaseHandle releaseHandle() const { return releaseHandle_; }
  Initialize initialize() const { return initialize_; }
  SetInitialBBox setInitialBBox() const { return setInitialBBox_; }
  TrackFrame trackFrame() const { return trackFrame_; }

private:
  GetDefaultParams getDefaultParams_;
  CreateHandle createHandle_;
  ReleaseHandle releaseHandle_;
  Initialize initialize_;
  SetInitialBBox setInitialBBox_;
  TrackFrame trackFrame_;
};

class TrackingSession {
public:
  TrackingSession(const BingoApi &api, const std::filesystem::path &modelPath)
      : api_(api) {
    BingoParams params{};
    api_.getDefaultParams()(&params);
    const int createResult = api_.createHandle()(&handle_);
    if (createResult != 0 || handle_ == nullptr) {
      throw std::runtime_error("Bingo_ObjectTracking_createHandle failed: " +
                               std::to_string(createResult));
    }
    const int initResult =
        api_.initialize()(handle_, modelPath.c_str(), &params);
    if (initResult != 0) {
      api_.releaseHandle()(handle_);
      handle_ = nullptr;
      throw std::runtime_error("Bingo_ObjectTracking_init failed: " +
                               std::to_string(initResult));
    }
  }

  ~TrackingSession() {
    if (handle_ != nullptr)
      api_.releaseHandle()(handle_);
  }

  TrackingSession(const TrackingSession &) = delete;
  TrackingSession &operator=(const TrackingSession &) = delete;

  void setInitial(BingoBBox &box, BingoMat &frame) {
    const int result =
        api_.setInitialBBox()(handle_, &box, &frame, kRgbPixelFormat);
    if (result != 0) {
      throw std::runtime_error("Bingo_ObjectTracking_setInitialBBox failed: " +
                               std::to_string(result));
    }
  }

  BingoBBox track(BingoMat &frame, float timeSeconds) {
    BingoBBox result{};
    api_.trackFrame()(handle_, &frame, kRgbPixelFormat, timeSeconds, &result);
    return result;
  }

private:
  const BingoApi &api_;
  void *handle_ = nullptr;
};

BingoMat makeMat(std::vector<std::uint8_t> &frame, const Arguments &arguments) {
  return BingoMat{
      .data = frame.data(),
      .width = arguments.width,
      .height = arguments.height,
      .channels = 3,
      .reserved = 0,
      .rowBytes = static_cast<std::size_t>(arguments.width) * 3,
  };
}

BingoBBox makeInitialBox(const Arguments &arguments) {
  return BingoBBox{
      .centerX = static_cast<float>((arguments.left + arguments.right) * 0.5 *
                                    arguments.width),
      .centerY = static_cast<float>((arguments.top + arguments.bottom) * 0.5 *
                                    arguments.height),
      .width = static_cast<float>((arguments.right - arguments.left) *
                                  arguments.width),
      .height = static_cast<float>((arguments.bottom - arguments.top) *
                                   arguments.height),
      .rotationCentidegrees = 0.0F,
      .timeSeconds =
          static_cast<float>(arguments.anchorFrameIndex / arguments.fps),
      .status = kTrackedStatus,
  };
}

std::vector<std::size_t> branchIndices(const Arguments &arguments,
                                       std::size_t frameCount, bool backward) {
  std::vector<std::size_t> indices;
  if (backward) {
    indices.reserve(arguments.anchorFrameIndex);
    for (std::size_t index = arguments.anchorFrameIndex; index > 0; --index) {
      indices.push_back(index - 1);
    }
    return indices;
  }
  indices.reserve(frameCount - arguments.anchorFrameIndex - 1);
  for (std::size_t index = arguments.anchorFrameIndex + 1; index < frameCount;
       ++index) {
    indices.push_back(index);
  }
  return indices;
}

void processBranch(const BingoApi &api, const Arguments &arguments,
                   const std::filesystem::path &modelPath, RawVideo &video,
                   bool backward, std::map<std::size_t, TrackSample> &samples) {
  TrackingSession session(api, modelPath);
  auto anchorFrame = video.readFrame(arguments.anchorFrameIndex);
  auto anchorMat = makeMat(anchorFrame, arguments);
  auto initialBox = makeInitialBox(arguments);
  session.setInitial(initialBox, anchorMat);
  samples[arguments.anchorFrameIndex] = TrackSample{
      .box = initialBox,
      .frameIndex = arguments.anchorFrameIndex,
      .anchor = true,
  };
  for (const std::size_t frameIndex :
       branchIndices(arguments, video.frameCount(), backward)) {
    auto frame = video.readFrame(frameIndex);
    auto mat = makeMat(frame, arguments);
    const float timeSeconds = static_cast<float>(frameIndex / arguments.fps);
    const auto result = session.track(mat, timeSeconds);
    samples[frameIndex] = TrackSample{
        .box = result,
        .frameIndex = frameIndex,
        .anchor = false,
    };
  }
}

std::string jsonNumber(double value) {
  if (!std::isfinite(value))
    return "null";
  std::ostringstream output;
  output << std::setprecision(9) << value;
  return output.str();
}

double normalizedRotationDegrees(float rotationCentidegrees) {
  double degrees = std::fmod(rotationCentidegrees / 100.0, 360.0);
  if (degrees > 180.0)
    degrees -= 360.0;
  if (degrees <= -180.0)
    degrees += 360.0;
  return degrees;
}

std::string serializeResult(const Arguments &arguments,
                            const std::map<std::size_t, TrackSample> &samples,
                            std::size_t frameCount) {
  std::ostringstream output;
  output << "{\n"
         << "  \"schemaVersion\": 1,\n"
         << "  \"route\": \"" << kRouteId << "\",\n"
         << "  \"width\": " << arguments.width << ",\n"
         << "  \"height\": " << arguments.height << ",\n"
         << "  \"fps\": " << jsonNumber(arguments.fps) << ",\n"
         << "  \"frameCount\": " << frameCount << ",\n"
         << "  \"anchorFrameIndex\": " << arguments.anchorFrameIndex << ",\n"
         << "  \"direction\": \"" << arguments.direction << "\",\n"
         << "  \"samples\": [\n";
  std::size_t sampleIndex = 0;
  for (const auto &[frameIndex, sample] : samples) {
    const auto &box = sample.box;
    const double left = (box.centerX - box.width * 0.5) / arguments.width;
    const double top = (box.centerY - box.height * 0.5) / arguments.height;
    const double right = (box.centerX + box.width * 0.5) / arguments.width;
    const double bottom = (box.centerY + box.height * 0.5) / arguments.height;
    output << "    {\"frameIndex\":" << frameIndex << ",\"sourceTimeUs\":"
           << std::llround(frameIndex * 1000000.0 / arguments.fps)
           << ",\"anchor\":" << (sample.anchor ? "true" : "false")
           << ",\"status\":\""
           << (box.status == kTrackedStatus ? "tracked" : "lost")
           << "\",\"rawStatus\":" << box.status << ",\"rect\":{"
           << "\"left\":" << jsonNumber(left) << ",\"top\":" << jsonNumber(top)
           << ",\"right\":" << jsonNumber(right)
           << ",\"bottom\":" << jsonNumber(bottom) << "},\"rotationDegrees\":"
           << jsonNumber(normalizedRotationDegrees(box.rotationCentidegrees))
           << ",\"rawRotationCentidegrees\":"
           << jsonNumber(box.rotationCentidegrees) << "}";
    sampleIndex += 1;
    output << (sampleIndex == samples.size() ? "\n" : ",\n");
  }
  output << "  ]\n}\n";
  return output.str();
}

void publishResult(const std::filesystem::path &outputPath,
                   const std::string &contents) {
  const auto temporaryPath =
      outputPath.string() + ".tmp-" + std::to_string(::getpid());
  {
    std::ofstream output(temporaryPath, std::ios::binary | std::ios::trunc);
    if (!output)
      throw std::runtime_error("cannot create tracking output");
    output.write(contents.data(),
                 static_cast<std::streamsize>(contents.size()));
    output.flush();
    if (!output)
      throw std::runtime_error("cannot write tracking output");
  }
  std::filesystem::rename(temporaryPath, outputPath);
}

} // namespace

int main(int argc, char **argv) {
  try {
    const auto arguments = parseArguments(argc, argv);
    const auto libraryPath =
        arguments.runtimeRoot / "Frameworks" / "libcccreator.dylib";
    const auto modelPath = arguments.runtimeRoot / "Resources" / "models" /
                           "object_tracking" / "bingo_objectTracking_v1.0.dat";
    requireSha256(libraryPath, kExpectedRuntimeSha256, "libcccreator");
    requireSha256(modelPath, kExpectedModelSha256, "Bingo model");

    RawVideo video(arguments.inputPath, arguments.width, arguments.height);
    if (arguments.anchorFrameIndex >= video.frameCount()) {
      throw std::runtime_error("anchor frame is outside the input video");
    }
    LibraryHandle library(libraryPath);
    const auto createHandle = requireSymbol<CreateHandle>(
        library.get(), "_Z33Bingo_ObjectTracking_createHandlePPv");
    if (loadedImageUuid(reinterpret_cast<void *>(createHandle)) !=
        kExpectedRuntimeUuid) {
      throw std::runtime_error("runtime UUID does not match the audited image");
    }
    const BingoApi api(library.get());
    std::map<std::size_t, TrackSample> samples;
    if (arguments.direction == "backward" || arguments.direction == "both") {
      processBranch(api, arguments, modelPath, video, true, samples);
    }
    if (arguments.direction == "forward" || arguments.direction == "both") {
      processBranch(api, arguments, modelPath, video, false, samples);
    }
    publishResult(arguments.outputPath,
                  serializeResult(arguments, samples, video.frameCount()));
    std::cerr << "ok route=" << kRouteId << " frames=" << samples.size()
              << " direction=" << arguments.direction << '\n';
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "error route=" << kRouteId << " message=" << error.what()
              << '\n';
    return 1;
  }
}
