#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <type_traits>

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
  void* graphicsDevice;
  const DeviceTextureProbe& inputA;
  const DeviceTextureProbe& inputB;
  const DeviceTextureProbe& output;
  void* callbackContext;
};

using GraphicsFrameRenderer = bool (*)(const GraphicsFrameResources&);

struct GraphicsFrameProbeRequest {
  std::filesystem::path runtimeRoot;
  GraphicsFrameRenderer renderer;
  void* callbackContext;
};

struct GraphicsFrameProbeResult {
  bool rendered = false;
  bool inputsReadable = false;
  std::array<std::uint8_t, kProbePixelBytes> inputAPixels{};
  std::array<std::uint8_t, kProbePixelBytes> inputBPixels{};
  std::array<std::uint8_t, kProbePixelBytes> outputPixels{};
};

[[nodiscard]] bool inspectGraphicsContext(
    const std::filesystem::path& runtimeRoot, bool createTextures);

[[nodiscard]] GraphicsFrameProbeResult renderGraphicsProbeFrame(
    const GraphicsFrameProbeRequest& request);

}  // namespace jianying_probe
