#include "filter-probe.h"

#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>

namespace {

[[nodiscard]] int positiveInteger(const char* value, const char* label) {
  if (value == nullptr || *value == '\0') {
    throw std::runtime_error(std::string("missing ") + label);
  }
  const std::string text(value);
  std::size_t parsedLength = 0;
  const long parsed = std::stol(text, &parsedLength);
  if (parsedLength != text.size() || parsed <= 0 ||
      parsed > std::numeric_limits<int>::max()) {
    throw std::runtime_error(std::string(label) + " must be positive");
  }
  return static_cast<int>(parsed);
}

}  // namespace

int main(int argc, char* argv[]) {
  @autoreleasepool {
    if (argc != 4) {
      std::cerr << "Usage: " << argv[0]
                << " <runtime-root> <model-directory> <package-path>\n";
      return 2;
    }
    try {
      return jianying_probe::runFilterHost({
          .runtimeRoot = std::filesystem::path(argv[1]),
          .packagePath = std::filesystem::path(argv[3]),
          .modelDirectory = std::filesystem::path(argv[2]),
          .width = positiveInteger(std::getenv("QCUT_FRAME_WIDTH"), "width"),
          .height = positiveInteger(std::getenv("QCUT_FRAME_HEIGHT"), "height"),
      });
    } catch (const std::exception& error) {
      std::cerr << "[error] " << error.what() << '\n';
      return 1;
    }
  }
}
