#include "filter-sequence-io.h"

#include <fstream>
#include <stdexcept>
#include <string_view>
#include <utility>

namespace jianying_probe {
namespace {

[[nodiscard]] std::vector<std::string> splitTabs(const std::string& line) {
  std::vector<std::string> fields;
  std::size_t start = 0;
  while (start <= line.size()) {
    const std::size_t separator = line.find('\t', start);
    fields.push_back(line.substr(start, separator - start));
    if (separator == std::string::npos) {
      break;
    }
    start = separator + 1;
  }
  return fields;
}

[[nodiscard]] std::vector<int> parseUpdateModes(
    std::string_view modeFields) {
  std::vector<int> updateModes;
  std::size_t modeStart = 0;
  while (modeStart <= modeFields.size()) {
    const std::size_t separator = modeFields.find(',', modeStart);
    const std::string modeField(modeFields.substr(
        modeStart, separator == std::string_view::npos
                       ? std::string_view::npos
                       : separator - modeStart));
    // std::stol throws before the range check on empty or non-numeric input,
    // which would surface a generic message instead of this one.
    long mode = 0;
    std::size_t parsedLength = 0;
    try {
      if (modeField.empty()) {
        throw std::invalid_argument("empty");
      }
      mode = std::stol(modeField, &parsedLength);
    } catch (const std::exception&) {
      throw std::runtime_error("update modes must be integers from 0 to 255");
    }
    if (parsedLength != modeField.size() || mode < 0 || mode > 255) {
      throw std::runtime_error(
          "update modes must be integers from 0 to 255");
    }
    updateModes.push_back(static_cast<int>(mode));
    if (separator == std::string_view::npos) {
      break;
    }
    modeStart = separator + 1;
  }
  return updateModes;
}

[[nodiscard]] std::vector<UpdateModePass> parseRenderPasses(
    std::string_view field) {
  if (field == "keep") {
    return {{{}}};
  }

  std::vector<UpdateModePass> renderPasses;
  std::size_t passStart = 0;
  while (passStart <= field.size()) {
    const std::size_t separator = field.find(';', passStart);
    const std::string_view passField = field.substr(
        passStart, separator == std::string_view::npos
                       ? std::string_view::npos
                       : separator - passStart);
    if (passField.empty()) {
      throw std::runtime_error("update-mode render passes cannot be empty");
    }
    renderPasses.push_back({.modes = parseUpdateModes(passField)});
    if (separator == std::string_view::npos) {
      break;
    }
    passStart = separator + 1;
  }
  return renderPasses;
}

}  // namespace

std::vector<FilterSequenceStep> readFilterManifest(
    const std::filesystem::path& path) {
  std::ifstream input(path);
  if (!input) {
    throw std::runtime_error("cannot open filter manifest: " + path.string());
  }

  std::vector<FilterSequenceStep> steps;
  std::string line;
  while (std::getline(input, line)) {
    if (line.empty() || line.starts_with('#')) {
      continue;
    }
    const std::vector<std::string> fields = splitTabs(line);
    if (fields.size() != 3) {
      throw std::runtime_error(
          "manifest lines must be input<TAB>update-mode<TAB>reset-action");
    }
    if (fields[2] != "none" && fields[2] != "feature" &&
        fields[2] != "video" && fields[2] != "manager") {
      throw std::runtime_error(
          "reset action must be none, feature, video, or manager");
    }
    steps.push_back({
        .inputPath = fields[0],
        .renderPasses = parseRenderPasses(fields[1]),
        .resetAction = fields[2],
    });
  }
  if (steps.empty()) {
    throw std::runtime_error("filter manifest contains no frames");
  }
  return steps;
}

std::vector<std::uint8_t> readRgbaFrame(
    const std::filesystem::path& path, std::size_t expectedBytes) {
  std::ifstream input(path, std::ios::binary | std::ios::ate);
  if (!input || static_cast<std::size_t>(input.tellg()) != expectedBytes) {
    throw std::runtime_error("raw RGBA size mismatch: " + path.string());
  }
  input.seekg(0);
  std::vector<std::uint8_t> pixels(expectedBytes);
  input.read(reinterpret_cast<char*>(pixels.data()),
             static_cast<std::streamsize>(pixels.size()));
  if (!input) {
    throw std::runtime_error("cannot read raw RGBA frame: " + path.string());
  }
  return pixels;
}

void convertBgraToRgba(std::span<std::uint8_t> pixels) {
  // Stop a full pixel short of the end so `offset + 2` never reads past the
  // span when the length is not a multiple of 4 (this is a public helper).
  if (pixels.size() < 4) {
    return;
  }
  for (std::size_t offset = 0; offset + 3 < pixels.size(); offset += 4) {
    std::swap(pixels[offset], pixels[offset + 2]);
  }
}

void writeRgbaFrame(const std::filesystem::path& path,
                    std::span<const std::uint8_t> pixels) {
  std::ofstream output(path, std::ios::binary);
  output.write(reinterpret_cast<const char*>(pixels.data()),
               static_cast<std::streamsize>(pixels.size()));
  if (!output) {
    throw std::runtime_error("cannot write raw RGBA frame: " + path.string());
  }
}

}  // namespace jianying_probe
