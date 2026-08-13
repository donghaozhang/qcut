#import <AppKit/AppKit.h>

#include "text-probe.h"

#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <limits>
#include <optional>
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

template <typename Value>
[[nodiscard]] std::optional<Value> optionalNumberEnvironment(
    const char* name) {
  const char* value = std::getenv(name);
  return value == nullptr
             ? std::nullopt
             : std::optional<Value>(parseNumber<Value>(name, value));
}

[[nodiscard]] std::optional<bool> optionalBooleanEnvironment(
    const char* name, std::optional<bool> fallback) {
  const char* value = std::getenv(name);
  if (value == nullptr) return fallback;
  if (std::string_view(value) == "0") return false;
  if (std::string_view(value) == "1") return true;
  throw std::runtime_error(std::string(name) + " must be 0 or 1");
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

[[nodiscard]] std::vector<jianying_probe::TextAnimationProbeRequest>
textAnimations() {
  std::vector<jianying_probe::TextAnimationProbeRequest> values;
  for (int type = 1; type <= 3; ++type) {
    const std::string prefix =
        "JY_TEXT_ANIMATION_" + std::to_string(type);
    const std::string packagePath =
        optionalEnvironment((prefix + "_PATH").c_str());
    if (packagePath.empty()) continue;
    values.push_back({
        .packagePath = packagePath,
        .type = type,
        .duration = optionalNumberEnvironment<std::int64_t>(
            (prefix + "_DURATION").c_str(), 1'000'000),
    });
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
                  .animations = textAnimations(),
                  .segmentPayload =
                      optionalEnvironment("JY_TEXT_SEGMENT_PAYLOAD"),
                  .scriptParameters =
                      optionalEnvironment("JY_TEXT_SCRIPT_PARAMETERS"),
                  .text = optionalEnvironment("JY_TEXT_CONTENT"),
                  .stickerParams = stickerParameters(),
                  .fontSize = optionalNumberEnvironment<double>(
                      "JY_TEXT_FONT_SIZE", 12.0),
                  .innerPadding = optionalNumberEnvironment<double>(
                      "JY_TEXT_INNER_PADDING"),
                  .lineGap = optionalNumberEnvironment<double>(
                      "JY_TEXT_LINE_GAP"),
                  .lineMaxWidth = optionalNumberEnvironment<double>(
                      "JY_TEXT_LINE_MAX_WIDTH"),
                  .shadowSmoothing = optionalNumberEnvironment<double>(
                      "JY_TEXT_SHADOW_SMOOTHING"),
                  .enableSwingSimplify = optionalBooleanEnvironment(
                      "JY_TEXT_ENABLE_SWING_SIMPLIFY", true),
                  .width =
                      requireNumberEnvironment<int>("JY_VIDEO_WIDTH"),
                  .height =
                      requireNumberEnvironment<int>("JY_VIDEO_HEIGHT"),
                  .segmentType = optionalNumberEnvironment<int>(
                      "JY_TEXT_SEGMENT_TYPE", 3),
                  .resolutionType = optionalNumberEnvironment<int>(
                      "JY_TEXT_RESOLUTION_TYPE", -1),
                  .renderIndex = optionalNumberEnvironment<int>(
                      "JY_TEXT_RENDER_INDEX", 0),
                  .timelineDuration =
                      optionalNumberEnvironment<std::int64_t>(
                          "JY_TEXT_TIMELINE_DURATION", 60'000'000),
                  .timestamp = optionalNumberEnvironment<double>(
                      "JY_TEXT_TIMESTAMP", 500'000.0),
              },
          .frameCount =
              optionalNumberEnvironment<int>("JY_TEXT_FRAME_COUNT", 1),
          .timestampStep = optionalNumberEnvironment<double>(
              "JY_TEXT_TIMESTAMP_STEP", 0.0),
      });
  return result.renderedFrames == result.requestedFrames ? 0 : 10;
}

[[nodiscard]] int inspect(const fs::path& runtimeRoot) {
  jianying_probe::inspectTextRuntime(runtimeRoot);
  return 0;
}

}  // namespace

int main(int argc, char* argv[]) {
  @autoreleasepool {
    if (argc != 2 && argc != 3) {
      std::cerr << "Usage: " << argv[0]
                << " <runtime-root> [inspect]\n";
      return 2;
    }
    try {
      if (argc == 3) {
        if (std::string_view(argv[2]) != "inspect") {
          throw std::runtime_error("unknown mode: " + std::string(argv[2]));
        }
        return inspect(fs::path(argv[1]));
      }
      return run(fs::path(argv[1]));
    } catch (const std::exception& error) {
      std::cerr << "[error] " << error.what() << '\n';
      return 1;
    }
  }
}
