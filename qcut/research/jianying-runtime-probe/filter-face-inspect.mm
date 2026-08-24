#include "filter-face-inspect.h"

#include "amazer-context-scope.h"
#include "probe-utils.h"

#import <OpenGL/OpenGL.h>
#import <OpenGL/gl.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <chrono>
#include <sstream>
#include <thread>
#include <string_view>

namespace jianying_probe {
namespace {

namespace fs = std::filesystem;

/**
 * The FaceBuffer field offsets below were recovered from this exact effect
 * core build. Applying them to a different build would read unrelated memory,
 * so the image identity is checked before any offset is used.
 */
constexpr std::string_view kVerifiedEffectCoreUuid =
	"D6342ECD-5432-33F0-A2AD-0C28F5699994";
constexpr std::size_t kMaximumFaces = 10;
constexpr std::size_t kMaximumLandmarks = 512;
/**
 * The face algorithm latches its first detection, so a single pass reports no
 * faces on a cold handle. The standalone probe needs roughly twenty passes
 * before results settle.
 */
constexpr int kWarmUpPasses = 20;

using EffectHandle = std::uint64_t;
using Result = std::int32_t;
using EffectCreate = Result (*)(EffectHandle*);
using EffectDestroy = void (*)(EffectHandle);
using EffectSetRenderApi = Result (*)(EffectHandle, std::int32_t);
using EffectUsePipeline = Result (*)(EffectHandle, bool);
using EffectInit =
	Result (*)(EffectHandle, std::int32_t, std::int32_t, const char*, const char*);
using EffectSetWidthHeight = Result (*)(EffectHandle, std::int32_t, std::int32_t);
using EffectSetOrientation = Result (*)(EffectHandle, std::int32_t);
using EffectSetEffect = Result (*)(EffectHandle, const char*);
using EffectAlgorithmTexture = Result (*)(EffectHandle, GLuint, double);
using EffectProcessTexture = Result (*)(EffectHandle, GLuint, GLuint, double);
using EffectGetBachResultByNodeName =
	Result (*)(EffectHandle, const char*, void**);
using EffectGetBachResult = Result (*)(EffectHandle, void**, std::int32_t);

struct FaceSymbols {
	EffectCreate create;
	EffectDestroy destroy;
	EffectSetRenderApi setRenderApi;
	EffectUsePipeline usePipeline;
	EffectInit init;
	EffectSetWidthHeight setWidthHeight;
	EffectSetOrientation setOrientation;
	EffectSetEffect setEffect;
	EffectAlgorithmTexture algorithmTexture;
	EffectProcessTexture processTexture;
	EffectGetBachResultByNodeName resultByNodeName;
	EffectGetBachResult resultByType;
};

[[nodiscard]] FaceSymbols loadFaceSymbols(const fs::path& runtimeRoot) {
	void* core = openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib");
	return {
		.create = resolveSymbol<EffectCreate>(core, "bef_effect_create_handle"),
		.destroy = resolveSymbol<EffectDestroy>(core, "bef_effect_destroy"),
		.setRenderApi =
			resolveSymbol<EffectSetRenderApi>(core, "bef_effect_set_render_api"),
		.usePipeline = resolveSymbol<EffectUsePipeline>(
			core, "bef_effect_use_pipeline_processor"),
		.init = resolveSymbol<EffectInit>(core, "bef_effect_init"),
		.setWidthHeight = resolveSymbol<EffectSetWidthHeight>(
			core, "bef_effect_set_width_height"),
		.setOrientation =
			resolveSymbol<EffectSetOrientation>(core, "bef_effect_set_orientation"),
		.setEffect = resolveSymbol<EffectSetEffect>(core, "bef_effect_set_effect"),
		.algorithmTexture = resolveSymbol<EffectAlgorithmTexture>(
			core, "bef_effect_algorithm_texture"),
		.processTexture = resolveSymbol<EffectProcessTexture>(
			core, "bef_effect_process_texture"),
		.resultByNodeName = resolveSymbol<EffectGetBachResultByNodeName>(
			core, "bef_effect_get_bach_result_by_node_name"),
		.resultByType = resolveSymbol<EffectGetBachResult>(
			core, "bef_effect_get_bach_result"),
	};
}

struct PrimitiveVectorView {
	const std::uint8_t* begin = nullptr;
	std::size_t size = 0;
};

[[nodiscard]] bool readPrimitiveVectorView(
	const void* object, std::size_t elementSize, PrimitiveVectorView* view) {
	if (object == nullptr || elementSize == 0) return false;
	const auto* bytes = static_cast<const std::uint8_t*>(object);
	const std::uint8_t* begin = nullptr;
	const std::uint8_t* end = nullptr;
	std::memcpy(&begin, bytes, sizeof(begin));
	std::memcpy(&end, bytes + sizeof(begin), sizeof(end));
	if ((begin == nullptr) != (end == nullptr)) return false;
	if (begin == nullptr) {
		*view = {};
		return true;
	}
	const auto byteCount = static_cast<std::size_t>(end - begin);
	if (end < begin || byteCount % elementSize != 0 ||
		byteCount / elementSize > kMaximumLandmarks) {
		return false;
	}
	*view = {.begin = begin, .size = byteCount / elementSize};
	return true;
}

/** A texture the face algorithm can sample, owned for the detect call. */
class ScopedTexture {
 public:
	ScopedTexture(int width, int height, const std::uint8_t* pixels) {
		glGenTextures(1, &texture_);
		glBindTexture(GL_TEXTURE_2D, texture_);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_BASE_LEVEL, 0);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, 0);
		glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA,
					 GL_UNSIGNED_BYTE, pixels);
		glBindTexture(GL_TEXTURE_2D, 0);
	}

	~ScopedTexture() {
		if (texture_ != 0) glDeleteTextures(1, &texture_);
	}

	ScopedTexture(const ScopedTexture&) = delete;
	ScopedTexture& operator=(const ScopedTexture&) = delete;

	[[nodiscard]] GLuint get() const { return texture_; }

 private:
	GLuint texture_ = 0;
};

class ScopedEffectHandle {
 public:
	ScopedEffectHandle(const FaceSymbols& symbols, EffectHandle handle)
		: symbols_(symbols), handle_(handle) {}

	~ScopedEffectHandle() {
		if (handle_ != 0) symbols_.destroy(handle_);
	}

	ScopedEffectHandle(const ScopedEffectHandle&) = delete;
	ScopedEffectHandle& operator=(const ScopedEffectHandle&) = delete;

	[[nodiscard]] EffectHandle get() const { return handle_; }

 private:
	const FaceSymbols& symbols_;
	EffectHandle handle_ = 0;
};

[[nodiscard]] bool readFaces(
	void* resultObject, std::vector<FaceObservationRecord>* faces) {
	void* const vtable = *static_cast<void**>(resultObject);
	Dl_info symbolInfo{};
	if (dladdr(vtable, &symbolInfo) == 0 || symbolInfo.dli_sname == nullptr) {
		return false;
	}
	if (std::string_view(symbolInfo.dli_sname).find("FaceBuffer") ==
		std::string_view::npos) {
		return false;
	}
	// The primary face vector occupies +0x38/+0x40 and owns pointers to
	// 0x50-byte face records.
	const auto* objectBytes = static_cast<const std::uint8_t*>(resultObject);
	const void* const* begin = nullptr;
	const void* const* end = nullptr;
	std::memcpy(&begin, objectBytes + 0x38, sizeof(begin));
	std::memcpy(&end, objectBytes + 0x40, sizeof(end));
	if ((begin == nullptr) != (end == nullptr)) return false;
	if (begin == nullptr) return true;
	if (end < begin) return false;
	const auto byteCount = static_cast<std::size_t>(
		reinterpret_cast<const std::uint8_t*>(end) -
		reinterpret_cast<const std::uint8_t*>(begin));
	if (byteCount % sizeof(void*) != 0 ||
		byteCount / sizeof(void*) > kMaximumFaces) {
		return false;
	}
	for (std::size_t index = 0; index < byteCount / sizeof(void*); ++index) {
		const void* faceObject = begin[index];
		if (faceObject == nullptr) return false;
		const auto* faceBytes = static_cast<const std::uint8_t*>(faceObject);
		FaceObservationRecord face;
		std::memcpy(face.rect.data(), faceBytes + 0x0c, sizeof(face.rect));
		std::memcpy(&face.score, faceBytes + 0x1c, sizeof(face.score));
		std::memcpy(&face.yaw, faceBytes + 0x30, sizeof(face.yaw));
		std::memcpy(&face.pitch, faceBytes + 0x34, sizeof(face.pitch));
		std::memcpy(&face.roll, faceBytes + 0x38, sizeof(face.roll));
		std::memcpy(&face.id, faceBytes + 0x40, sizeof(face.id));
		std::memcpy(&face.trackingCount, faceBytes + 0x48,
					sizeof(face.trackingCount));
		const bool finite =
			std::all_of(face.rect.begin(), face.rect.end(),
						[](float value) { return std::isfinite(value); }) &&
			std::isfinite(face.score) && std::isfinite(face.yaw) &&
			std::isfinite(face.pitch) && std::isfinite(face.roll);
		if (!finite) return false;
		const void* pointsObject = nullptr;
		std::memcpy(&pointsObject, faceBytes + 0x20, sizeof(pointsObject));
		PrimitiveVectorView points{};
		if (!readPrimitiveVectorView(pointsObject, sizeof(float) * 2, &points)) {
			return false;
		}
		face.landmarkCount = points.size;
		faces->push_back(face);
	}
	return true;
}

}  // namespace

std::vector<FaceObservationRecord> inspectFaces(
	const FaceInspectRequest& request) {
	if (request.pixels == nullptr || request.width <= 0 || request.height <= 0) {
		return {};
	}
	const FaceSymbols symbols = loadFaceSymbols(request.runtimeRoot);
	const std::string uuid = runtimeImageUuid(
		reinterpret_cast<const void*>(symbols.create));
	if (uuid != kVerifiedEffectCoreUuid) {
		throw std::runtime_error(
			"face detection is not verified for effect core " + uuid);
	}
	// Textures are created before the handle, matching the verified probe order.
	glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
	const ScopedTexture input(request.width, request.height,
							  request.pixels->data());
	const ScopedTexture output(request.width, request.height, nullptr);
	if (input.get() == 0 || output.get() == 0) {
		throw std::runtime_error("failed to create face detection textures");
	}
	EffectHandle rawHandle = 0;
	if (symbols.create(&rawHandle) != 0 || rawHandle == 0) {
		throw std::runtime_error("failed to create the face detection handle");
	}
	const ScopedEffectHandle handle(symbols, rawHandle);
	constexpr std::int32_t kOpenGlRenderApi = 1;
	if (symbols.setRenderApi(handle.get(), kOpenGlRenderApi) != 0 ||
		symbols.usePipeline(handle.get(), false) != 0 ||
		symbols.init(handle.get(), request.width, request.height,
					 request.modelDirectory.c_str(), "") != 0 ||
		symbols.setWidthHeight(handle.get(), request.width, request.height) != 0 ||
		symbols.setOrientation(handle.get(), 0) != 0) {
		throw std::runtime_error("failed to initialize the face detection handle");
	}
	// The package supplies the algorithm graph the face detector runs; without
	// it the handle has nothing to execute.
	if (symbols.setEffect(handle.get(), request.packagePath.c_str()) != 0) {
		throw std::runtime_error("failed to set the face detection effect");
	}
	// Package activation is asynchronous: the algorithm graph is not runnable
	// the instant set_effect returns, and running it early fails the whole
	// detect rather than merely reporting no faces.
	std::this_thread::sleep_for(std::chrono::milliseconds(250));
	std::vector<FaceObservationRecord> faces;
	for (int pass = 0; pass < kWarmUpPasses; ++pass) {
		const Result algorithmResult =
			symbols.algorithmTexture(handle.get(), input.get(), 0.0);
		const Result processResult =
			symbols.processTexture(handle.get(), input.get(), output.get(), 0.0);
		if (algorithmResult != 0 || processResult != 0) {
			throw std::runtime_error(
				"the face algorithm failed to run: pass " + std::to_string(pass) +
				" algorithm=" + std::to_string(algorithmResult) +
				" process=" + std::to_string(processResult));
		}
	}
	void* resultObject = nullptr;
	Result result =
		symbols.resultByNodeName(handle.get(), "face_0", &resultObject);
	if (result != 0 || resultObject == nullptr) {
		constexpr std::int32_t kFaceAlgorithmType = 4;
		resultObject = nullptr;
		result =
			symbols.resultByType(handle.get(), &resultObject, kFaceAlgorithmType);
	}
	if (result != 0 || resultObject == nullptr) {
		throw std::runtime_error("the face algorithm published no result");
	}
	if (!readFaces(resultObject, &faces)) {
		throw std::runtime_error("the face result buffer had an unexpected shape");
	}
	return faces;
}

std::string encodeFaceObservations(
	const std::vector<FaceObservationRecord>& faces) {
	std::ostringstream payload;
	payload << "{\"faces\":[";
	for (std::size_t index = 0; index < faces.size(); ++index) {
		const FaceObservationRecord& face = faces[index];
		payload << (index == 0 ? "" : ",") << "{\"id\":" << face.id
				<< ",\"rect\":[" << face.rect[0] << ',' << face.rect[1] << ','
				<< face.rect[2] << ',' << face.rect[3] << "],\"score\":"
				<< face.score << ",\"yaw\":" << face.yaw
				<< ",\"pitch\":" << face.pitch << ",\"roll\":" << face.roll
				<< ",\"trackingCount\":" << face.trackingCount
				<< ",\"landmarkCount\":" << face.landmarkCount << '}';
	}
	payload << "]}";
	return payload.str();
}

}  // namespace jianying_probe
