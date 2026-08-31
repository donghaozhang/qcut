#import <Metal/Metal.h>
#import <CoreVideo/CoreVideo.h>

#include <array>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <dlfcn.h>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr std::size_t kBackendStorageBytes = 4096;

struct DeflickerInputProperty {
	void *metalDevice = nullptr;
	const char *metalLibraryPath = nullptr;
	bool enabled = true;
	std::array<std::uint8_t, 3> padding{};
	std::int32_t width = 0;
	std::int32_t height = 0;
	std::int32_t pixelFormat = 0;
	std::int32_t algorithm = 0;
	std::int32_t reservedSetting = 0;
	std::int32_t deflickerType = 0;
};

static_assert(offsetof(DeflickerInputProperty, width) == 0x14);
static_assert(offsetof(DeflickerInputProperty, height) == 0x18);
static_assert(offsetof(DeflickerInputProperty, pixelFormat) == 0x1c);
static_assert(offsetof(DeflickerInputProperty, algorithm) == 0x20);
static_assert(offsetof(DeflickerInputProperty, deflickerType) == 0x28);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
	dlerror();
	void *symbol = dlsym(library, name);
	if (const char *error = dlerror(); error != nullptr) {
		throw std::runtime_error(std::string("missing symbol ") + name + ": " +
		                         error);
	}
	return reinterpret_cast<Function>(symbol);
}

void *openLibrary(const char *path) {
	void *library = dlopen(path, RTLD_NOW | RTLD_LOCAL);
	if (library == nullptr) {
		throw std::runtime_error(std::string("cannot load Lens runtime: ") +
		                         dlerror());
	}
	return library;
}

struct ProbeInitializationOptions {
	const char *libraryPath;
	const char *metalLibraryPath;
	int pixelFormat;
};

struct BackendApi {
	using Destructor = void (*)(void *);
	using Initialize = int (*)(void *, void *);
	using Uninitialize = int (*)(void *);
	using Execute = int (*)(void *, std::vector<void *> &, void *);
	using GetOutput = int (*)(void *, std::vector<void *> *, void *);

	Destructor destroy;
	Initialize initialize;
	Uninitialize uninitialize;
	Execute execute;
	GetOutput getOutput;
};

template <typename Value>
void writeParameter(std::array<std::uint8_t, 256> &parameters,
					std::size_t offset, Value value) {
	std::memcpy(parameters.data() + offset, &value, sizeof(value));
}

BackendApi loadBackendApi(void *library) {
	return {
		.destroy = requireSymbol<BackendApi::Destructor>(
			library, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackendD1Ev"),
		.initialize = requireSymbol<BackendApi::Initialize>(
			library, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend11InitBackendEPv"),
		.uninitialize = requireSymbol<BackendApi::Uninitialize>(
			library, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend13UnInitBackendEv"),
		.execute = requireSymbol<BackendApi::Execute>(
			library,
			"_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend13ExecuteStreamERNSt3__16vectorIPvNS2_9allocatorIS4_EEEES4_"),
		.getOutput = requireSymbol<BackendApi::GetOutput>(
			library,
			"_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackend15GetStreamOutputEPNSt3__16vectorIPvNS2_9allocatorIS4_EEEES4_"),
	};
}

int probeInitialization(const ProbeInitializationOptions &options) {
	using Constructor = void (*)(void *);

	void *library = openLibrary(options.libraryPath);
	const auto construct = requireSymbol<Constructor>(
		library, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackendC1Ev");
	const BackendApi api = loadBackendApi(library);

	void *backend = nullptr;
	if (posix_memalign(&backend, 16, kBackendStorageBytes) != 0 ||
	    backend == nullptr) {
		dlclose(library);
		throw std::runtime_error("cannot allocate aligned backend storage");
	}
	std::memset(backend, 0, kBackendStorageBytes);
	construct(backend);

	id<MTLDevice> device = MTLCreateSystemDefaultDevice();
	if (device == nil) {
		api.destroy(backend);
		std::free(backend);
		dlclose(library);
		throw std::runtime_error("Metal device is unavailable");
	}
	DeflickerInputProperty property{
		.metalDevice = (__bridge void *)device,
		.metalLibraryPath = options.metalLibraryPath,
		.width = 640,
		.height = 360,
		.pixelFormat = options.pixelFormat,
	};
	const int status = api.initialize(backend, &property);
	if (status == 0) {
		std::cerr << "uninit=" << api.uninitialize(backend) << "\n";
	}
	api.destroy(backend);
	std::free(backend);
	dlclose(library);
	return status;
}

int probeFrames(const ProbeInitializationOptions &options) {
	using Constructor = void (*)(void *);
	void *library = openLibrary(options.libraryPath);
	const auto construct = requireSymbol<Constructor>(
		library, "_ZN4LENS9ALGORITHM24VideoDeflickerGpuBackendC1Ev");
	const BackendApi api = loadBackendApi(library);

	void *backend = nullptr;
	if (posix_memalign(&backend, 16, kBackendStorageBytes) != 0 ||
	    backend == nullptr) {
		dlclose(library);
		throw std::runtime_error("cannot allocate aligned backend storage");
	}
	std::memset(backend, 0, kBackendStorageBytes);
	construct(backend);

	id<MTLDevice> device = MTLCreateSystemDefaultDevice();
	DeflickerInputProperty property{
		.metalDevice = (__bridge void *)device,
		.metalLibraryPath = options.metalLibraryPath,
		.width = 640,
		.height = 360,
		.pixelFormat = options.pixelFormat,
	};
	const int initStatus = api.initialize(backend, &property);
	if (initStatus != 0) {
		api.destroy(backend);
		std::free(backend);
		dlclose(library);
		return initStatus;
	}

	std::array<std::uint8_t, 256> parameters{};
	writeParameter(parameters, 0x00, std::int32_t{640});
	writeParameter(parameters, 0x04, std::int32_t{360});
	writeParameter(parameters, 0x08, std::int32_t{640});
	writeParameter(parameters, 0x0c, std::int32_t{360});
	writeParameter(parameters, 0x10, true);
	writeParameter(parameters, 0x1c, 1.0F);
	writeParameter(parameters, 0x20, 1.0F);

	NSDictionary *attributes = @{
		(id)kCVPixelBufferMetalCompatibilityKey : @YES,
		(id)kCVPixelBufferIOSurfacePropertiesKey : @{},
	};
	CVPixelBufferRef pixelBuffer = nullptr;
	const CVReturn createStatus = CVPixelBufferCreate(
		kCFAllocatorDefault, 640, 360, kCVPixelFormatType_32BGRA,
		(__bridge CFDictionaryRef)attributes, &pixelBuffer);
	if (createStatus != kCVReturnSuccess || pixelBuffer == nullptr) {
		api.uninitialize(backend);
		api.destroy(backend);
		std::free(backend);
		dlclose(library);
		throw std::runtime_error("cannot create Metal-compatible pixel buffer");
	}
	std::vector<void *> inputs{pixelBuffer};
	std::uint64_t checksum = 1469598103934665603ULL;
	int outputFrames = 0;
	std::uint64_t changedBytes = 0;
	for (int frame = 0; frame < 24; frame += 1) {
		const std::uint8_t luminance = frame % 2 == 0 ? 96 : 128;
		CVPixelBufferLockBaseAddress(pixelBuffer, 0);
		auto *inputBytes = static_cast<std::uint8_t *>(
			CVPixelBufferGetBaseAddress(pixelBuffer));
		const std::size_t inputBytesPerRow =
			CVPixelBufferGetBytesPerRow(pixelBuffer);
		for (std::size_t row = 0; row < 360; row += 1) {
			for (std::size_t column = 0; column < 640; column += 1) {
				auto *pixel = inputBytes + row * inputBytesPerRow + column * 4;
				const std::uint8_t detail =
					static_cast<std::uint8_t>((row + column) % 48);
				pixel[0] = static_cast<std::uint8_t>(luminance + detail / 2);
				pixel[1] = static_cast<std::uint8_t>(luminance + detail);
				pixel[2] = static_cast<std::uint8_t>(luminance + detail / 3);
				pixel[3] = 255;
			}
		}
		CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);
		writeParameter(parameters, 0x14, std::int32_t{frame});
		const int executeStatus = api.execute(backend, inputs, parameters.data());
		std::vector<void *> outputs;
		const int outputStatus = api.getOutput(backend, &outputs, parameters.data());
		std::cerr << "frame=" << frame << " execute=" << executeStatus
		          << " output=" << outputStatus << " count=" << outputs.size()
		          << "\n";
		if (executeStatus != 0) break;
		if (outputStatus != 0 || outputs.empty() || outputs[0] == nullptr) continue;
		auto outputBuffer = static_cast<CVPixelBufferRef>(outputs[0]);
		CVPixelBufferLockBaseAddress(outputBuffer, kCVPixelBufferLock_ReadOnly);
		const auto *bytes = static_cast<const std::uint8_t *>(
			CVPixelBufferGetBaseAddress(outputBuffer));
		const std::size_t outputBytesPerRow =
			CVPixelBufferGetBytesPerRow(outputBuffer);
		std::uint64_t frameChangedBytes = 0;
		std::uint64_t outputLuminanceSum = 0;
		for (std::size_t row = 0; row < 360; row += 1) {
			for (std::size_t column = 0; column < 640; column += 1) {
				const auto *outputPixel =
					bytes + row * outputBytesPerRow + column * 4;
				const std::uint8_t detail =
					static_cast<std::uint8_t>((row + column) % 48);
				const std::array<std::uint8_t, 4> expected{
					static_cast<std::uint8_t>(luminance + detail / 2),
					static_cast<std::uint8_t>(luminance + detail),
					static_cast<std::uint8_t>(luminance + detail / 3), 255};
				for (std::size_t channel = 0; channel < 4; channel += 1) {
					if (outputPixel[channel] != expected[channel]) {
						frameChangedBytes += 1;
					}
				}
				outputLuminanceSum += outputPixel[1];
			}
		}
		for (std::size_t index = 0; index < 64; index += 1) {
			checksum = (checksum ^ bytes[index]) * 1099511628211ULL;
		}
		CVPixelBufferUnlockBaseAddress(outputBuffer, kCVPixelBufferLock_ReadOnly);
		changedBytes += frameChangedBytes;
		std::cerr << "frame=" << frame << " changed=" << frameChangedBytes
		          << " mean="
		          << static_cast<double>(outputLuminanceSum) / (640.0 * 360.0)
		          << "\n";
		outputFrames += 1;
	}

	CFRelease(pixelBuffer);
	const int uninitStatus = api.uninitialize(backend);
	api.destroy(backend);
	std::free(backend);
	dlclose(library);
	std::cout << "{\"phase\":\"frames\",\"outputFrames\":" << outputFrames
	          << ",\"checksum\":" << checksum
	          << ",\"changedBytes\":" << changedBytes
	          << ",\"uninitStatus\":" << uninitStatus << "}\n";
	return outputFrames > 0 ? 0 : 1;
}

}  // namespace

int main(int argc, char **argv) {
	if (argc != 4 && argc != 5) {
		std::cerr
			<< "usage: deflicker-frame-probe <liblens> <metallib> <format> [frames]\n";
		return 2;
	}
	try {
		const ProbeInitializationOptions options{
			.libraryPath = argv[1],
			.metalLibraryPath = argv[2],
			.pixelFormat = std::stoi(argv[3]),
		};
		if (argc == 5) return probeFrames(options);
		const int status = probeInitialization(options);
		std::cout << "{\"phase\":\"init\",\"format\":" << argv[3]
		          << ",\"status\":" << status << "}\n";
		return status == 0 ? 0 : 1;
	} catch (const std::exception &error) {
		std::cerr << error.what() << "\n";
		return 1;
	}
}
