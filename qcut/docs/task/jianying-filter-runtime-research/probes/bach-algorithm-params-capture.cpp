#include <dlfcn.h>
#include <fcntl.h>
#include <libkern/OSCacheControl.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <mach/mach_vm.h>
#include <mach/vm_map.h>
#include <pthread.h>
#include <sys/mman.h>
#include <unistd.h>

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>

extern "C" void callSharedPtrMethod(void* output, void* object, void* method);

__asm__(
    ".text\n"
    ".p2align 2\n"
    ".globl _callSharedPtrMethod\n"
    "_callSharedPtrMethod:\n"
    "mov x9, x2\n"
    "mov x8, x0\n"
    "mov x0, x1\n"
    "br x9\n");

namespace {

constexpr const char* kUpdateSymbol =
    "_ZN20TESwingEffectManager24updateBachAlgorithmParamER12TEARCWrapperI12"
    "ITEModelClipNSt3__110shared_ptrEERNS3_IN13AmazingEngine7SegmentEEENS3_"
    "IN4core15TEVideoPipelineEEE";
constexpr const char* kGetIntSymbol =
    "_ZN10TEClipUtil6getIntER12TEARCWrapperI12ITEModelClipNSt3__110shared_"
    "ptrEERKNS2_12basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEi";
constexpr const char* kGetStringSymbol =
    "_ZN10TEClipUtil9getStringER12TEARCWrapperI12ITEModelClipNSt3__110shared_"
    "ptrEERKNS2_12basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE";
constexpr const char* kCcFilterTypeInfoSymbol =
    "_ZTIN5vesdk7ccmodel8CCFilterE";
constexpr const char* kCcAmazingFilterTypeInfoSymbol =
    "_ZTIN5vesdk7ccmodel15CCAmazingFilterE";
constexpr const char* kAlgorithmTypeKey = "amazing effect algorithm type";
constexpr const char* kResultDirectoryKey =
    "amazing effect algorithm result directory";
constexpr const char* kClipResourcePathKey = "clip_res_path";

constexpr std::size_t kCcFilterGetterVtableOffset = 0x4d8;
constexpr std::size_t kCcAlgorithmTypeOffset = 0x110;
constexpr std::size_t kMaximumValueBytes = 4U * 1024U * 1024U;

struct BinaryLayout {
  const char* name;
  std::uintptr_t updateOffset;
  std::uintptr_t ccModelFlagOffset;
  std::uintptr_t ccResultDirectoryGetterOffset;
};

constexpr BinaryLayout kKnownBinaryLayouts[] = {
    {"private-runtime-d383946d", 0x21f3f68, 0x3877828, 0x1f27c44},
    {"installed-app-6437ac74", 0x21fd274, 0x3884da8, 0x1f31684},
};

using UpdateFunction = void (*)(void*, void*, void*, void*);
using GetIntFunction = int (*)(void*, const std::string&, int);
using GetStringFunction = std::string (*)(void*, const std::string&);
using ObjectStringGetter = std::string (*)(void*);
using DynamicCastFunction = void* (*)(const void*, const void*, const void*,
                                      std::ptrdiff_t);

UpdateFunction originalUpdate = nullptr;
GetIntFunction originalGetInt = nullptr;
GetStringFunction originalGetString = nullptr;
pthread_mutex_t logMutex = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t installMutex = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t captureMutex = PTHREAD_MUTEX_INITIALIZER;
std::uint64_t sequence = 0;
std::uintptr_t imageBase = 0;
const BinaryLayout* binaryLayout = nullptr;
bool matchedClipCaptured = false;
thread_local unsigned int updateDepth = 0;

const char* resolveLogPath() {
  const char* configuredPath = std::getenv("JY_BACH_PARAMS_LOG");
  if (configuredPath != nullptr && configuredPath[0] != '\0') {
    return configuredPath;
  }

  const char* home = std::getenv("HOME");
  if (home == nullptr || home[0] == '\0') {
    return "/tmp/jy-bach-algorithm-params-capture.log";
  }

  static char defaultPath[PATH_MAX];
  std::snprintf(defaultPath, sizeof(defaultPath),
                "%s/Movies/JianyingPro/User Data/Log/"
                "jy-bach-algorithm-params-capture.log",
                home);
  return defaultPath;
}

void appendBytes(const void* data, std::size_t bytes) {
  if (data == nullptr || bytes == 0) {
    return;
  }
  const int file =
      open(resolveLogPath(), O_WRONLY | O_CREAT | O_APPEND, 0644);
  if (file < 0) {
    return;
  }
  const auto* cursor = static_cast<const char*>(data);
  std::size_t remaining = bytes;
  while (remaining > 0) {
    const ssize_t written = write(file, cursor, remaining);
    if (written <= 0) {
      break;
    }
    cursor += written;
    remaining -= static_cast<std::size_t>(written);
  }
  close(file);
}

void writeStatus(const char* hook, const char* status,
                 const void* address = nullptr) {
  char line[768];
  const int length = std::snprintf(
      line, sizeof(line), "STATUS\thook=%s\tstatus=%s\tpid=%d\taddress=%p\n",
      hook, status, static_cast<int>(getpid()), address);
  if (length > 0) {
    appendBytes(line, static_cast<std::size_t>(length));
  }
}

void writeValueEvent(const char* source, const std::string& key,
                     const std::string& value, void* returnAddress) {
  Dl_info caller = {};
  dladdr(returnAddress, &caller);
  const auto callerBase =
      reinterpret_cast<std::uintptr_t>(caller.dli_fbase);
  const auto callerAddress = reinterpret_cast<std::uintptr_t>(returnAddress);
  const auto callerOffset =
      callerAddress >= callerBase ? callerAddress - callerBase : 0;
  std::uint64_t threadId = 0;
  pthread_threadid_np(nullptr, &threadId);

  pthread_mutex_lock(&logMutex);
  const std::uint64_t eventSequence = sequence++;
  const std::size_t valueBytes =
      value.size() <= kMaximumValueBytes ? value.size() : 0;
  char header[1024];
  const int headerLength = std::snprintf(
      header, sizeof(header),
      "BEGIN\t%llu\tsource=%s\tpid=%d\ttime=%llu\tthread=%llu\tdepth=%u\t"
      "key_bytes=%zu\tvalue_bytes=%zu\tcaptured=%zu\tcaller=%s+0x%llx\n",
      static_cast<unsigned long long>(eventSequence), source,
      static_cast<int>(getpid()),
      static_cast<unsigned long long>(mach_absolute_time()),
      static_cast<unsigned long long>(threadId), updateDepth, key.size(),
      value.size(), valueBytes,
      caller.dli_fname == nullptr ? "unknown" : caller.dli_fname,
      static_cast<unsigned long long>(callerOffset));
  if (headerLength > 0) {
    appendBytes(header, static_cast<std::size_t>(headerLength));
  }
  appendBytes("KEY\t", 4);
  appendBytes(key.data(), key.size());
  appendBytes("\nVALUE\t", 7);
  appendBytes(value.data(), valueBytes);
  char footer[128];
  const int footerLength = std::snprintf(
      footer, sizeof(footer), "\nEND\t%llu\n",
      static_cast<unsigned long long>(eventSequence));
  if (footerLength > 0) {
    appendBytes(footer, static_cast<std::size_t>(footerLength));
  }
  pthread_mutex_unlock(&logMutex);
}

bool isTargetKey(const std::string& key) {
  return key == kAlgorithmTypeKey || key == kResultDirectoryKey ||
         key == kClipResourcePathKey;
}

int readCcModelEnabled() {
  if (imageBase == 0 || binaryLayout == nullptr) {
    return -1;
  }
  return *reinterpret_cast<const unsigned char*>(imageBase +
                                                binaryLayout->ccModelFlagOffset);
}

const BinaryLayout* findBinaryLayout(void* updateEntry) {
  if (imageBase == 0 || updateEntry == nullptr) {
    return nullptr;
  }
  const std::uintptr_t updateOffset =
      reinterpret_cast<std::uintptr_t>(updateEntry) - imageBase;
  for (const BinaryLayout& candidate : kKnownBinaryLayouts) {
    if (candidate.updateOffset == updateOffset) {
      return &candidate;
    }
  }
  return nullptr;
}

bool claimMatchedClip(const std::string& resourcePath) {
  const char* match = std::getenv("JY_BACH_PARAMS_MATCH");
  if (match == nullptr || match[0] == '\0' ||
      resourcePath.find(match) == std::string::npos) {
    return false;
  }

  pthread_mutex_lock(&captureMutex);
  const bool shouldCapture = !matchedClipCaptured;
  matchedClipCaptured = true;
  pthread_mutex_unlock(&captureMutex);
  return shouldCapture;
}

bool replaceCodeEntry(void* entry, void* replacement) {
  const auto address = reinterpret_cast<mach_vm_address_t>(entry);
  const mach_vm_size_t pageSize = static_cast<mach_vm_size_t>(getpagesize());
  const mach_vm_address_t page = address & ~(pageSize - 1);
  const mach_vm_address_t entryOffset = address - page;
  const std::uint32_t absoluteBranch[] = {0x58000050, 0xd61f0200};
  const auto destination = reinterpret_cast<std::uintptr_t>(replacement);

  mach_vm_address_t privatePage = 0;
  if (mach_vm_allocate(mach_task_self(), &privatePage, pageSize,
                       VM_FLAGS_ANYWHERE) != KERN_SUCCESS) {
    return false;
  }
  std::memcpy(reinterpret_cast<void*>(privatePage),
              reinterpret_cast<void*>(page), pageSize);
  void* privateEntry = reinterpret_cast<void*>(privatePage + entryOffset);
  std::memcpy(privateEntry, absoluteBranch, sizeof(absoluteBranch));
  std::memcpy(static_cast<char*>(privateEntry) + sizeof(absoluteBranch),
              &destination, sizeof(destination));
  if (mach_vm_protect(mach_task_self(), privatePage, pageSize, false,
                      VM_PROT_READ | VM_PROT_EXECUTE) != KERN_SUCCESS) {
    mach_vm_deallocate(mach_task_self(), privatePage, pageSize);
    return false;
  }

  mach_vm_address_t remappedPage = page;
  vm_prot_t currentProtection = VM_PROT_NONE;
  vm_prot_t maximumProtection = VM_PROT_NONE;
  const kern_return_t remapped = mach_vm_remap(
      mach_task_self(), &remappedPage, pageSize, 0,
      VM_FLAGS_FIXED | VM_FLAGS_OVERWRITE, mach_task_self(), privatePage, true,
      &currentProtection, &maximumProtection, VM_INHERIT_COPY);
  mach_vm_deallocate(mach_task_self(), privatePage, pageSize);
  if (remapped != KERN_SUCCESS) {
    return false;
  }
  sys_icache_invalidate(entry, 16);
  return true;
}

void* createTrampoline(void* entry) {
  constexpr mach_vm_size_t kTrampolineSize = 32;
  mach_vm_address_t trampoline = 0;
  if (mach_vm_allocate(mach_task_self(), &trampoline, kTrampolineSize,
                       VM_FLAGS_ANYWHERE) != KERN_SUCCESS) {
    return nullptr;
  }
  std::memcpy(reinterpret_cast<void*>(trampoline), entry, 16);
  const std::uint32_t absoluteBranch[] = {0x58000050, 0xd61f0200};
  std::memcpy(reinterpret_cast<void*>(trampoline + 16), absoluteBranch,
              sizeof(absoluteBranch));
  const auto continuation = reinterpret_cast<std::uintptr_t>(entry) + 16;
  std::memcpy(reinterpret_cast<void*>(trampoline + 24), &continuation,
              sizeof(continuation));
  if (mach_vm_protect(mach_task_self(), trampoline, kTrampolineSize, false,
                      VM_PROT_READ | VM_PROT_EXECUTE) != KERN_SUCCESS) {
    mach_vm_deallocate(mach_task_self(), trampoline, kTrampolineSize);
    return nullptr;
  }
  sys_icache_invalidate(reinterpret_cast<void*>(trampoline), kTrampolineSize);
  return reinterpret_cast<void*>(trampoline);
}

void* installEntry(const char* hook, const char* symbol, void* replacement) {
  void* entry = dlsym(RTLD_DEFAULT, symbol);
  if (entry == nullptr) {
    return nullptr;
  }
  void* trampoline = createTrampoline(entry);
  if (trampoline == nullptr) {
    writeStatus(hook, "trampoline-failed", entry);
    return nullptr;
  }
  if (!replaceCodeEntry(entry, replacement)) {
    writeStatus(hook, "patch-failed", entry);
    return nullptr;
  }
  writeStatus(hook, "patched", entry);
  return trampoline;
}

void captureCcModelValues(void* clipWrapper) {
  if (imageBase == 0 || binaryLayout == nullptr || clipWrapper == nullptr) {
    return;
  }
  void* clipObject = *static_cast<void**>(clipWrapper);
  if (clipObject == nullptr) {
    writeStatus("cc-model", "missing-clip-object");
    return;
  }

  void** vtable = *static_cast<void***>(clipObject);
  void* getter = *reinterpret_cast<void**>(
      reinterpret_cast<std::uintptr_t>(vtable) +
      kCcFilterGetterVtableOffset);
  if (getter == nullptr) {
    writeStatus("cc-model", "missing-filter-getter");
    return;
  }

  std::shared_ptr<void> ccFilter;
  callSharedPtrMethod(&ccFilter, clipObject, getter);
  if (!ccFilter) {
    writeStatus("cc-model", "missing-filter");
    return;
  }

  auto dynamicCast = reinterpret_cast<DynamicCastFunction>(
      dlsym(RTLD_DEFAULT, "__dynamic_cast"));
  const void* sourceTypeInfo =
      dlsym(RTLD_DEFAULT, kCcFilterTypeInfoSymbol);
  const void* targetTypeInfo =
      dlsym(RTLD_DEFAULT, kCcAmazingFilterTypeInfoSymbol);
  if (dynamicCast == nullptr || sourceTypeInfo == nullptr ||
      targetTypeInfo == nullptr) {
    writeStatus("cc-model", "missing-rtti");
    return;
  }

  void* amazingFilter = dynamicCast(ccFilter.get(), sourceTypeInfo,
                                    targetTypeInfo, 0);
  if (amazingFilter == nullptr) {
    writeStatus("cc-model", "not-amazing-filter");
    return;
  }

  const int algorithmType = *reinterpret_cast<const int*>(
      static_cast<const char*>(amazingFilter) + kCcAlgorithmTypeOffset);
  writeValueEvent("cc-model-field", kAlgorithmTypeKey,
                  std::to_string(algorithmType),
                  __builtin_return_address(0));

  auto resultDirectoryGetter = reinterpret_cast<ObjectStringGetter>(
      imageBase + binaryLayout->ccResultDirectoryGetterOffset);
  const std::string resultDirectory = resultDirectoryGetter(amazingFilter);
  writeValueEvent("cc-model-field", kResultDirectoryKey, resultDirectory,
                  __builtin_return_address(0));
}

void captureLegacyModelValues(void* clipWrapper) {
  const int algorithmType =
      originalGetInt(clipWrapper, kAlgorithmTypeKey, 0);
  const std::string resultDirectory =
      originalGetString(clipWrapper, kResultDirectoryKey);
  writeValueEvent("model-clip-accessor", kAlgorithmTypeKey,
                  std::to_string(algorithmType),
                  __builtin_return_address(0));
  writeValueEvent("model-clip-accessor", kResultDirectoryKey,
                  resultDirectory, __builtin_return_address(0));
}

void captureMatchedModelValues(void* clipWrapper) {
  const int ccModelEnabled = readCcModelEnabled();
  writeValueEvent("model-clip-accessor", "cc_model_enabled",
                  std::to_string(ccModelEnabled),
                  __builtin_return_address(0));
  if (ccModelEnabled == 1) {
    captureCcModelValues(clipWrapper);
    return;
  }
  captureLegacyModelValues(clipWrapper);
}

void captureUpdate(void* self, void* clipWrapper, void* segmentSharedPtr,
                   void* pipelineSharedPtr) {
  const int ccModelEnabled = readCcModelEnabled();
  writeValueEvent("update-entry", "cc_model_enabled",
                  std::to_string(ccModelEnabled),
                  __builtin_return_address(0));

  ++updateDepth;
  if (ccModelEnabled == 1) {
    captureCcModelValues(clipWrapper);
  }
  originalUpdate(self, clipWrapper, segmentSharedPtr, pipelineSharedPtr);
  --updateDepth;
}

int captureGetInt(void* clipWrapper, const std::string& key,
                  int defaultValue) {
  const int value = originalGetInt(clipWrapper, key, defaultValue);
  if (isTargetKey(key)) {
    writeValueEvent("TEClipUtil::getInt", key, std::to_string(value),
                    __builtin_return_address(0));
  }
  return value;
}

std::string captureGetString(void* clipWrapper, const std::string& key) {
  std::string value = originalGetString(clipWrapper, key);
  if (isTargetKey(key)) {
    writeValueEvent("TEClipUtil::getString", key, value,
                    __builtin_return_address(0));
  }
  if (key == kClipResourcePathKey && claimMatchedClip(value)) {
    captureMatchedModelValues(clipWrapper);
  }
  return value;
}

void tryInstallHooks() {
  pthread_mutex_lock(&installMutex);

  if (originalGetInt == nullptr) {
    originalGetInt = reinterpret_cast<GetIntFunction>(installEntry(
        "get-int", kGetIntSymbol, reinterpret_cast<void*>(&captureGetInt)));
  }
  if (originalGetString == nullptr) {
    originalGetString = reinterpret_cast<GetStringFunction>(
        installEntry("get-string", kGetStringSymbol,
                     reinterpret_cast<void*>(&captureGetString)));
  }
  if (originalUpdate == nullptr) {
    void* entry = dlsym(RTLD_DEFAULT, kUpdateSymbol);
    if (entry != nullptr) {
      Dl_info info = {};
      if (dladdr(entry, &info) != 0) {
        imageBase = reinterpret_cast<std::uintptr_t>(info.dli_fbase);
        binaryLayout = findBinaryLayout(entry);
        writeStatus("binary-layout",
                    binaryLayout == nullptr ? "unknown"
                                            : binaryLayout->name,
                    entry);
      }
    }
    originalUpdate = reinterpret_cast<UpdateFunction>(installEntry(
        "update-bach", kUpdateSymbol,
        reinterpret_cast<void*>(&captureUpdate)));
  }

  pthread_mutex_unlock(&installMutex);
}

void imageAdded(const mach_header*, std::intptr_t) {
  tryInstallHooks();
}

__attribute__((constructor)) void installHooks() {
  _dyld_register_func_for_add_image(&imageAdded);
  tryInstallHooks();
}

}  // namespace
