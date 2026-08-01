#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <span>
#include <type_traits>
#include <vector>

namespace jianying_probe {

inline constexpr int kProbeTextureSize = 4;
inline constexpr std::size_t kProbePixelBytes =
    kProbeTextureSize * kProbeTextureSize * 4;

// Non-trivial lifetime preserves DeviceTexture's arm64 indirect-passing ABI.
struct DeviceTextureProbe {
  void* texture = nullptr;
  std::uint64_t metadata = 0;

  DeviceTextureProbe() = default;
  DeviceTextureProbe(const DeviceTextureProbe& other)
      : texture(other.texture), metadata(other.metadata) {}
  DeviceTextureProbe& operator=(const DeviceTextureProbe& other) {
    texture = other.texture;
    metadata = other.metadata;
    return *this;
  }
  ~DeviceTextureProbe() {}
};

static_assert(sizeof(DeviceTextureProbe) == 0x10);
static_assert(!std::is_trivially_copy_constructible_v<DeviceTextureProbe>);

struct GraphicsFrameResources {
  int width;
  int height;
  void* graphicsDevice;
  const DeviceTextureProbe& inputA;
  const DeviceTextureProbe& inputB;
  const DeviceTextureProbe& output;
  void* callbackContext;
};

using GraphicsFrameRenderer = bool (*)(const GraphicsFrameResources&);

struct GraphicsFrameProbeRequest {
  std::filesystem::path runtimeRoot;
  GraphicsFrameRenderer renderer = nullptr;
  void* callbackContext = nullptr;
  int width = kProbeTextureSize;
  int height = kProbeTextureSize;
  std::span<const std::uint8_t> inputAPixels;
  std::span<const std::uint8_t> inputBPixels;
  bool verifyInputReadback = true;
};

struct GraphicsFrameProbeResult {
  bool rendered = false;
  bool inputsReadable = false;
  std::vector<std::uint8_t> inputAPixels;
  std::vector<std::uint8_t> inputBPixels;
  std::vector<std::uint8_t> outputPixels;
};

[[nodiscard]] bool inspectGraphicsContext(
    const std::filesystem::path& runtimeRoot, bool createTextures);

[[nodiscard]] GraphicsFrameProbeResult renderGraphicsProbeFrame(
    const GraphicsFrameProbeRequest& request);

}  // namespace jianying_probe
