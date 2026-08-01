#pragma once

#include <filesystem>

namespace jianying_probe {

[[nodiscard]] bool inspectGraphicsContext(
    const std::filesystem::path& runtimeRoot, bool createTextures);

}  // namespace jianying_probe
