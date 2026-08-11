#include <dlfcn.h>
#include <mach/mach.h>
#include <unistd.h>

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <string_view>

namespace {

struct RawVector {
    const std::uint8_t* begin;
    const std::uint8_t* end;
    const std::uint8_t* capacity;
};

using SetInput = int (*)(void*, const RawVector*);
using GetByteSize = std::size_t (*)(const void*);

constexpr std::size_t tensorSize = 64;
constexpr std::size_t setInputVtableIndex = 5;
constexpr std::size_t maximumCaptureBytes = 100 * 1024 * 1024;
constexpr std::string_view byteNNVtableSymbol = "_ZTVN6BYTENN16ByteNNEngineImplE";
constexpr std::string_view getByteSizeSymbol = "_ZNK6BYTENN6Tensor11GetByteSizeEv";
constexpr std::string_view expectedSetInputSymbol =
    "_ZN6BYTENN16ByteNNEngineImpl8SetInputERKNSt3__16vectorINS_6TensorENS1_9allocatorIS3_EEEE";

SetInput originalSetInput = nullptr;
GetByteSize getByteSize = nullptr;
std::atomic<unsigned int> captureIndex = 0;
std::mutex outputMutex;

std::filesystem::path captureDirectory() {
    const char* configured = std::getenv("JY_BYTENN_CAPTURE_DIR");
    return configured == nullptr ? std::filesystem::path("/tmp/jy-bytenn-capture")
                                 : std::filesystem::path(configured);
}

bool shouldCapturePayload() {
    const char* configured = std::getenv("JY_BYTENN_CAPTURE_PAYLOAD");
    return configured != nullptr && std::string_view(configured) == "1";
}

void appendLog(const std::string& line) {
    std::lock_guard lock(outputMutex);
    std::error_code error;
    const std::filesystem::path directory = captureDirectory();
    std::filesystem::create_directories(directory, error);
    if (error) {
        std::cerr << "bytenn-capture: cannot create " << directory << ": " << error.message()
                  << '\n';
        return;
    }
    std::ofstream output(directory / "capture.log", std::ios::app);
    output << line << '\n';
    // The log is the only record the capture happened; report on stderr when it
    // cannot be written, since appendLog cannot report through itself.
    if (!output.good()) {
        std::cerr << "bytenn-capture: failed to append to capture.log: " << line << '\n';
    }
}

void captureTensor(const std::uint8_t* tensor, std::size_t tensorIndex, void* engine) {
    void* data = nullptr;
    std::int32_t dataType = 0;
    std::int32_t shape[4]{};
    std::memcpy(&data, tensor, sizeof(data));
    std::memcpy(&dataType, tensor + 12, sizeof(dataType));
    std::memcpy(shape, tensor + 16, sizeof(shape));

    const std::size_t byteCount = getByteSize == nullptr ? 0 : getByteSize(tensor);
    const unsigned int index = captureIndex.fetch_add(1);
    char line[512];
    std::snprintf(
        line,
        sizeof(line),
        "bytenn[%u] engine=%p tensor=%zu type=%d shape=%dx%dx%dx%d bytes=%zu data=%p",
        index,
        engine,
        tensorIndex,
        dataType,
        shape[0],
        shape[1],
        shape[2],
        shape[3],
        byteCount,
        data);
    appendLog(line);

    if (!shouldCapturePayload() || data == nullptr || byteCount == 0 ||
        byteCount > maximumCaptureBytes) {
        return;
    }

    const std::filesystem::path outputPath =
        captureDirectory() / ("bytenn-" + std::to_string(index) + ".bin");
    std::ofstream output(outputPath, std::ios::binary);
    output.write(static_cast<const char*>(data), static_cast<std::streamsize>(byteCount));
    output.close();
    // A truncated payload would later be compared as if it were a real tensor;
    // log the failure and remove the partial file instead.
    if (!output.good()) {
        appendLog("bytenn[" + std::to_string(index) + "] payload write FAILED: " +
                  outputPath.string());
        std::error_code removeError;
        std::filesystem::remove(outputPath, removeError);
    }
}

extern "C" int captureSetInput(void* engine, const RawVector* tensors) {
    if (tensors != nullptr && tensors->begin != nullptr && tensors->end >= tensors->begin) {
        const std::size_t vectorBytes = static_cast<std::size_t>(tensors->end - tensors->begin);
        if (vectorBytes % tensorSize == 0) {
            const std::size_t count = vectorBytes / tensorSize;
            for (std::size_t index = 0; index < count; ++index) {
                captureTensor(tensors->begin + index * tensorSize, index, engine);
            }
        } else {
            appendLog("unexpected ByteNN tensor vector layout");
        }
    }
    return originalSetInput == nullptr ? -1 : originalSetInput(engine, tensors);
}

bool makeVtableWritable(void** slot, vm_prot_t protection) {
    const vm_size_t pageSize = static_cast<vm_size_t>(getpagesize());
    const vm_address_t page = reinterpret_cast<vm_address_t>(slot) &
                              ~(static_cast<vm_address_t>(pageSize) - 1);
    return vm_protect(mach_task_self(), page, pageSize, false, protection) == KERN_SUCCESS;
}

void installCapture() {
    const char* libraryPath = std::getenv("JY_BYTENN_LIBRARY");
    if (libraryPath == nullptr) {
        appendLog("JY_BYTENN_LIBRARY is required");
        return;
    }

    void* library = dlopen(libraryPath, RTLD_NOW | RTLD_GLOBAL);
    if (library == nullptr) {
        appendLog(std::string("cannot load ByteNN library: ") + dlerror());
        return;
    }

    auto** vtable = static_cast<void**>(dlsym(library, byteNNVtableSymbol.data()));
    getByteSize = reinterpret_cast<GetByteSize>(dlsym(library, getByteSizeSymbol.data()));
    if (vtable == nullptr || getByteSize == nullptr) {
        appendLog("required ByteNN symbols are unavailable");
        return;
    }

    void** setInputSlot = &vtable[setInputVtableIndex];
    Dl_info symbolInfo{};
    if (dladdr(*setInputSlot, &symbolInfo) == 0 || symbolInfo.dli_sname == nullptr ||
        std::string_view(symbolInfo.dli_sname) != expectedSetInputSymbol) {
        appendLog("ByteNN SetInput vtable layout does not match this probe");
        return;
    }

    // The slot index is version-specific, so verify its symbol before changing the const page.
    originalSetInput = reinterpret_cast<SetInput>(*setInputSlot);
    if (!makeVtableWritable(setInputSlot, VM_PROT_READ | VM_PROT_WRITE)) {
        appendLog("cannot make ByteNN vtable writable");
        return;
    }
    *setInputSlot = reinterpret_cast<void*>(captureSetInput);
    makeVtableWritable(setInputSlot, VM_PROT_READ);
    appendLog("ByteNN SetInput capture installed");
}

__attribute__((constructor)) void initializeCapture() {
    installCapture();
}

}  // namespace
