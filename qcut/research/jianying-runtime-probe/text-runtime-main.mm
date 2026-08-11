#import <AppKit/AppKit.h>

#include "text-probe.h"

#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <vector>

namespace {

namespace fs = std::filesystem;

[[nodiscard]] std::string requireEnvironment(const char* name) {
  const char* value = std::getenv(name);
  if (value == nullptr || *value == '\0') {
    throw std::runtime_error(std::string("missing environment variable: ") +
                             name);
  }
  return value;
}

[[nodiscard]] std::string optionalEnvironment(const char* name) {
  const char* value = std::getenv(name);
  return value == nullptr ? std::string() : std::string(value);
}

template <typename Value>
[[nodiscard]] Value parseNumber(const char* name, const std::string& text) {
  std::size_t parsedLength = 0;
  if constexpr (std::is_same_v<Value, double>) {
    const double value = std::stod(text, &parsedLength);
    if (parsedLength != text.size()) {
      throw std::runtime_error(std::string(name) + " must be a number");
    }
    return value;
  } else {
    const long long value = std::stoll(text, &parsedLength);
    if (parsedLength != text.size() ||
        value < std::numeric_limits<Value>::min() ||
        value > std::numeric_limits<Value>::max()) {
      throw std::runtime_error(std::string(name) + " must be an integer");
    }
    return static_cast<Value>(value);
  }
}

template <typename Value>
[[nodiscard]] Value requireNumberEnvironment(const char* name) {
  return parseNumber<Value>(name, requireEnvironment(name));
}

template <typename Value>
[[nodiscard]] Value optionalNumberEnvironment(const char* name,
                                              Value fallback) {
  const char* value = std::getenv(name);
  return value == nullptr ? fallback
                          : parseNumber<Value>(name, std::string(value));
}

[[nodiscard]] std::vector<std::string> stickerParameters() {
  std::vector<std::string> values;
  for (int index = 0; index < 9; ++index) {
    const std::string name = "JY_TEXT_PARAM_" + std::to_string(index);
    const char* value = std::getenv(name.c_str());
    if (value == nullptr) break;
    values.emplace_back(value);
  }
  return values;
}

[[nodiscard]] int run(const fs::path& runtimeRoot) {
  const fs::path packagePath = requireEnvironment("JY_TEXT_PACKAGE");
  if (!fs::is_directory(runtimeRoot)) {
    throw std::runtime_error("runtime root does not exist: " +
                             runtimeRoot.string());
  }
  if (!fs::is_directory(packagePath)) {
    throw std::runtime_error("JY_TEXT_PACKAGE must name a package directory");
  }

  const jianying_probe::TextSequenceProbeResult result =
      jianying_probe::renderTextSequence({
          .frame =
              {
                  .runtimeRoot = runtimeRoot,
                  .packagePath = packagePath,
                  .outputPath = requireEnvironment("JY_TEXT_OUTPUT"),
                  .payloadOutputPath = optionalEnvironment(
                      "JY_TEXT_PAYLOAD_OUTPUT"),
                  .fontPath = optionalEnvironment("JY_TEXT_FONT_PATH"),
                  .resourceManifestPath = optionalEnvironment(
                      "JY_TEXT_RESOURCE_MANIFEST"),
                  .segmentPayload =
                      optionalEnvironment("JY_TEXT_SEGMENT_PAYLOAD"),
                  .scriptParameters =
                      optionalEnvironment("JY_TEXT_SCRIPT_PARAMETERS"),
                  .text = optionalEnvironment("JY_TEXT_CONTENT"),
                  .stickerParams = stickerParameters(),
                  .fontSize = optionalNumberEnvironment<double>(
                      "JY_TEXT_FONT_SIZE", 12.0),
                  .width =
                      requireNumberEnvironment<int>("JY_VIDEO_WIDTH"),
                  .height =
                      requireNumberEnvironment<int>("JY_VIDEO_HEIGHT"),
                  .segmentType = optionalNumberEnvironment<int>(
                      "JY_TEXT_SEGMENT_TYPE", 3),
                  .resolutionType = optionalNumberEnvironment<int>(
                      "JY_TEXT_RESOLUTION_TYPE", -1),
                  .timestamp = optionalNumberEnvironment<std::int64_t>(
                      "JY_TEXT_TIMESTAMP", 500'000),
              },
          .frameCount =
              optionalNumberEnvironment<int>("JY_TEXT_FRAME_COUNT", 1),
          .timestampStep = optionalNumberEnvironment<double>(
              "JY_TEXT_TIMESTAMP_STEP", 0.0),
      });
  return result.renderedFrames == result.requestedFrames ? 0 : 10;
}

}  // namespace

int main(int argc, char* argv[]) {
  @autoreleasepool {
    if (argc != 2) {
      std::cerr << "Usage: " << argv[0] << " <runtime-root>\n";
      return 2;
    }
    try {
      return run(fs::path(argv[1]));
    } catch (const std::exception& error) {
      std::cerr << "[error] " << error.what() << '\n';
      return 1;
    }
  }
}
