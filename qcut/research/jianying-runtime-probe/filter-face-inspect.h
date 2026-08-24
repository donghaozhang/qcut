#pragma once

#include <array>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace jianying_probe {

/** One detected face in algorithm-input normalized coordinates. */
struct FaceObservationRecord {
	/** x, y, width, height in 0..1 of the algorithm input frame. */
	std::array<float, 4> rect{};
	float score = 0.0F;
	float yaw = 0.0F;
	float pitch = 0.0F;
	float roll = 0.0F;
	/**
	 * The runtime's face id. Package Lua matches parameter-vector entries by
	 * the freid trackid derived from this id, so it is the identity the
	 * product binds per-face adjustments to.
	 */
	std::int32_t id = 0;
	std::int32_t trackingCount = 0;
	std::size_t landmarkCount = 0;
};

struct FaceInspectRequest {
	std::filesystem::path runtimeRoot;
	std::filesystem::path modelDirectory;
	/** The effect package that supplies the face algorithm graph. */
	std::filesystem::path packagePath;
	int width = 0;
	int height = 0;
	const std::vector<std::uint8_t>* pixels = nullptr;
};

/**
 * Detects faces on one RGBA frame using the effect core's face algorithm.
 *
 * The caller must already hold a current GL context; the runtime's own
 * image-processing context and a standalone CGL context were verified to
 * produce field-identical results, so the host's adopted engine context is
 * used as-is. An empty result means the pipeline failed to run, never
 * "no faces present" — callers must not present it as a detection outcome.
 */
[[nodiscard]] std::vector<FaceObservationRecord> inspectFaces(
	const FaceInspectRequest& request);

/** Serializes observations as the host protocol's detect payload. */
[[nodiscard]] std::string encodeFaceObservations(
	const std::vector<FaceObservationRecord>& faces);

}  // namespace jianying_probe
