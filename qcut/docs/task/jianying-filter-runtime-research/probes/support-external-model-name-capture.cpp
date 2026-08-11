#include <dlfcn.h>
#include <libkern/OSCacheControl.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <mach-o/loader.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <mach/mach_vm.h>
#include <mach/vm_map.h>
#include <pthread.h>
#include <sys/types.h>
#include <unistd.h>

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

constexpr const char* kTargetImageName = "libcccreator.dylib";
constexpr const char* kCreateSwingManagerSymbol =
    "bef_swing_manager_create_with_gpdevice";
constexpr const char* kGetAbValueSymbol = "bef_effect_get_ab_value";
constexpr const char* kInitializeSwingManagerSymbol =
    "_ZN13AmazingEngine12SwingManager4initERKNS_8Vector2iEiPFPcPvPKcS7_"
    "EyPNS_8GPDeviceE";
constexpr std::size_t kSupportExternalModelNameOffset = 0x10;
constexpr std::size_t kRuntimeSupportExternalModelNameOffset = 0x5ad34;

struct BinaryLayout {
  const char* name;
  std::array<std::uint8_t, 16> uuid;
  std::uintptr_t bachAbConfigConstructorOffset;
  std::uintptr_t runtimeConfigInitializerOffset;
};

constexpr BinaryLayout kKnownBinaryLayouts[] = {
    {"private-runtime-d383946d",
     {0x9a, 0x8a, 0x8f, 0x6b, 0x31, 0xc0, 0x3d, 0xdc, 0x85, 0xac, 0x5f,
      0x11, 0x08, 0x7d, 0x79, 0x65},
     0x25e92e4,
     0x177f400},
    {"installed-app-6437ac74",
     {0xfd, 0xf4, 0x2e, 0xf4, 0x42, 0x7d, 0x30, 0xdf, 0x93, 0x10, 0xa8,
      0xc7, 0xb3, 0x52, 0xc5, 0xcd},
     0x25f2378,
     0x17882f4},
};

using BachAbConfigConstructor = void (*)(void*);
using RuntimeConfigInitializer = void (*)(void*);
using ResourceFinder = char* (*)(void*, const char*, const char*);
using CreateSwingManager = int (*)(void**, unsigned int, unsigned int,
                                   ResourceFinder, bool, void*);
using GetAbValue = int (*)(const char*, void*);
using InitializeSwingManager = void (*)(void*, const int*, int,
                                        ResourceFinder, std::uint64_t, void*);

BachAbConfigConstructor originalConstructor = nullptr;
RuntimeConfigInitializer originalRuntimeConfigInitializer = nullptr;
CreateSwingManager originalCreateSwingManager = nullptr;
InitializeSwingManager originalInitializeSwingManager = nullptr;
GetAbValue getAbValue = nullptr;
pthread_mutex_t installMutex = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t logMutex = PTHREAD_MUTEX_INITIALIZER;
std::uint64_t sequence = 0;
bool constructorHookInstalled = false;
bool runtimeConfigHookInstalled = false;
bool createManagerHookInstalled = false;
bool initializeManagerHookInstalled = false;
bool deferredReadStarted = false;
const BinaryLayout* activeLayout = nullptr;
thread_local bool insideCapture = false;

const char* resolveLogPath() {
  const char* configuredPath =
      std::getenv("JY_SUPPORT_EXTERNAL_MODEL_NAME_LOG");
  if (configuredPath != nullptr && configuredPath[0] != '\0') {
    return configuredPath;
  }
  return "/tmp/jy-support-external-model-name-capture.log";
}

void appendBytes(const void* data, std::size_t bytes) {
  if (data == nullptr || bytes == 0) {
    return;
  }

  FILE* file = std::fopen(resolveLogPath(), "ab");
  if (file == nullptr) {
    return;
  }
  std::fwrite(data, 1, bytes, file);
  std::fclose(file);
}

void writeStatus(const char* hook, const char* status,
                 const void* address = nullptr) {
  char line[512];
  const int length = std::snprintf(
      line, sizeof(line),
      "STATUS\thook=%s\tstatus=%s\tpid=%d\tlayout=%s\taddress=%p\n",
      hook, status, static_cast<int>(getpid()),
      activeLayout == nullptr ? "unknown" : activeLayout->name, address);
  if (length > 0) {
    appendBytes(line, static_cast<std::size_t>(length));
  }
}

void writeCapture(const char* source, const int value, const void* object,
                  const void* returnAddress) {
  Dl_info caller = {};
  dladdr(returnAddress, &caller);
  const auto callerBase = reinterpret_cast<std::uintptr_t>(caller.dli_fbase);
  const auto callerAddress = reinterpret_cast<std::uintptr_t>(returnAddress);
  const auto callerOffset =
      callerAddress >= callerBase ? callerAddress - callerBase : 0;
  std::uint64_t threadId = 0;
  pthread_threadid_np(nullptr, &threadId);

  pthread_mutex_lock(&logMutex);
  const std::uint64_t eventSequence = sequence++;
  char line[1024];
  const int length = std::snprintf(
      line, sizeof(line),
      "CAPTURE\tsequence=%llu\tsource=%s\tpid=%d\ttime=%llu\tthread=%llu\t"
      "layout=%s\tkey=support_external_model_name\tvalue=%d\tobject=%p\t"
      "caller=%s+0x%llx\n",
      static_cast<unsigned long long>(eventSequence), source,
      static_cast<int>(getpid()),
      static_cast<unsigned long long>(mach_absolute_time()),
      static_cast<unsigned long long>(threadId), activeLayout->name, value,
      object, caller.dli_fname == nullptr ? "unknown" : caller.dli_fname,
      static_cast<unsigned long long>(callerOffset));
  if (length > 0) {
    appendBytes(line, static_cast<std::size_t>(length));
  }
  pthread_mutex_unlock(&logMutex);
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

const uuid_command* findUuidCommand(const mach_header* header) {
  if (header == nullptr || header->magic != MH_MAGIC_64) {
    return nullptr;
  }

  const auto* header64 = reinterpret_cast<const mach_header_64*>(header);
  const auto* command = reinterpret_cast<const load_command*>(header64 + 1);
  for (std::uint32_t index = 0; index < header64->ncmds; ++index) {
    if (command->cmd == LC_UUID && command->cmdsize >= sizeof(uuid_command)) {
      return reinterpret_cast<const uuid_command*>(command);
    }
    command = reinterpret_cast<const load_command*>(
        reinterpret_cast<const char*>(command) + command->cmdsize);
  }
  return nullptr;
}

const BinaryLayout* findBinaryLayout(const mach_header* header) {
  const uuid_command* uuidCommand = findUuidCommand(header);
  if (uuidCommand == nullptr) {
    return nullptr;
  }

  for (const BinaryLayout& candidate : kKnownBinaryLayouts) {
    if (std::memcmp(uuidCommand->uuid, candidate.uuid.data(),
                    candidate.uuid.size()) == 0) {
      return &candidate;
    }
  }
  return nullptr;
}

bool isTargetImage(const mach_header* header) {
  Dl_info image = {};
  if (header == nullptr || dladdr(header, &image) == 0 ||
      image.dli_fname == nullptr) {
    return false;
  }
  const char* slash = std::strrchr(image.dli_fname, '/');
  const char* basename = slash == nullptr ? image.dli_fname : slash + 1;
  return std::strcmp(basename, kTargetImageName) == 0;
}

void captureConstructor(void* object) {
  if (insideCapture) {
    originalConstructor(object);
    return;
  }

  insideCapture = true;
  originalConstructor(object);
  if (object != nullptr && activeLayout != nullptr) {
    const int value = *reinterpret_cast<const int*>(
        static_cast<const char*>(object) +
        kSupportExternalModelNameOffset);
    writeCapture("bach-ab-config", value, object,
                 __builtin_return_address(0));
  }
  insideCapture = false;
}

void captureRuntimeConfigInitializer(void* object) {
  if (insideCapture) {
    originalRuntimeConfigInitializer(object);
    return;
  }

  insideCapture = true;
  originalRuntimeConfigInitializer(object);
  if (object != nullptr && activeLayout != nullptr) {
    const int value = *reinterpret_cast<const int*>(
        static_cast<const char*>(object) +
        kRuntimeSupportExternalModelNameOffset);
    writeCapture("runtime-config", value, object,
                 __builtin_return_address(0));
  }
  insideCapture = false;
}

int captureCreateSwingManager(void** manager, unsigned int width,
                              unsigned int height,
                              ResourceFinder resourceFinder,
                              bool algorithmAsync, void* gpDevice) {
  int value = -1;
  const int result = getAbValue == nullptr
                         ? -1
                         : getAbValue("support_external_model_name", &value);
  writeCapture(result == 0 ? "effect-ab-before-manager"
                           : "effect-ab-read-failed",
               value, manager, __builtin_return_address(0));
  return originalCreateSwingManager(manager, width, height, resourceFinder,
                                    algorithmAsync, gpDevice);
}

void captureInitializeSwingManager(void* manager, const int* dimensions,
                                   int algorithmMode,
                                   ResourceFinder resourceFinder,
                                   std::uint64_t uuid, void* gpDevice) {
  int value = -1;
  const int result = getAbValue == nullptr
                         ? -1
                         : getAbValue("support_external_model_name", &value);
  writeCapture(result == 0 ? "effect-ab-before-swing-init"
                           : "effect-ab-read-failed",
               value, manager, __builtin_return_address(0));
  originalInitializeSwingManager(manager, dimensions, algorithmMode,
                                 resourceFinder, uuid, gpDevice);
}

void* deferredRead(void*) {
  constexpr unsigned int kMaximumAttempts = 20;
  constexpr useconds_t kRetryDelayMicroseconds = 100'000;
  for (unsigned int attempt = 0; attempt < kMaximumAttempts; ++attempt) {
    usleep(kRetryDelayMicroseconds);
    int value = -1;
    const int result = getAbValue == nullptr
                           ? -1
                           : getAbValue("support_external_model_name", &value);
    if (result == 0) {
      writeCapture("effect-ab-deferred-read", value, nullptr,
                   __builtin_return_address(0));
      return nullptr;
    }
  }
  writeStatus("effect-ab-deferred-read", "read-failed");
  return nullptr;
}

void startDeferredReadIfRequested() {
  const char* requested =
      std::getenv("JY_SUPPORT_EXTERNAL_MODEL_NAME_DEFERRED_READ");
  if (deferredReadStarted || requested == nullptr ||
      std::strcmp(requested, "1") != 0 || getAbValue == nullptr) {
    return;
  }

  pthread_t thread = {};
  const int result = pthread_create(&thread, nullptr, &deferredRead, nullptr);
  if (result != 0) {
    writeStatus("effect-ab-deferred-read", "thread-create-failed");
    return;
  }
  pthread_detach(thread);
  deferredReadStarted = true;
  writeStatus("effect-ab-deferred-read", "started");
}

void installForImage(const mach_header* header) {
  if (!isTargetImage(header)) {
    return;
  }

  pthread_mutex_lock(&installMutex);
  if (constructorHookInstalled && runtimeConfigHookInstalled &&
      createManagerHookInstalled && initializeManagerHookInstalled) {
    pthread_mutex_unlock(&installMutex);
    return;
  }

  activeLayout = findBinaryLayout(header);
  if (activeLayout == nullptr) {
    writeStatus("binary-layout", "unsupported-binary-uuid", header);
    pthread_mutex_unlock(&installMutex);
    return;
  }

  if (!constructorHookInstalled) {
    void* entry = reinterpret_cast<void*>(
        reinterpret_cast<std::uintptr_t>(header) +
        activeLayout->bachAbConfigConstructorOffset);
    void* trampoline = createTrampoline(entry);
    if (trampoline == nullptr) {
      writeStatus("bach-ab-config", "trampoline-failed", entry);
    } else {
      originalConstructor =
          reinterpret_cast<BachAbConfigConstructor>(trampoline);
      if (!replaceCodeEntry(entry,
                            reinterpret_cast<void*>(&captureConstructor))) {
        writeStatus("bach-ab-config", "patch-failed", entry);
      } else {
        constructorHookInstalled = true;
        writeStatus("bach-ab-config", "patched", entry);
      }
    }
  }

  if (!runtimeConfigHookInstalled) {
    void* entry = reinterpret_cast<void*>(
        reinterpret_cast<std::uintptr_t>(header) +
        activeLayout->runtimeConfigInitializerOffset);
    void* trampoline = createTrampoline(entry);
    if (trampoline == nullptr) {
      writeStatus("runtime-config", "trampoline-failed", entry);
    } else {
      originalRuntimeConfigInitializer =
          reinterpret_cast<RuntimeConfigInitializer>(trampoline);
      if (!replaceCodeEntry(
              entry,
              reinterpret_cast<void*>(&captureRuntimeConfigInitializer))) {
        writeStatus("runtime-config", "patch-failed", entry);
      } else {
        runtimeConfigHookInstalled = true;
        writeStatus("runtime-config", "patched", entry);
      }
    }
  }

  if (!createManagerHookInstalled) {
    void* entry = dlsym(RTLD_DEFAULT, kCreateSwingManagerSymbol);
    getAbValue = reinterpret_cast<GetAbValue>(
        dlsym(RTLD_DEFAULT, kGetAbValueSymbol));
    if (entry == nullptr || getAbValue == nullptr) {
      writeStatus("effect-ab-before-manager", "missing-symbol", entry);
    } else {
      void* trampoline = createTrampoline(entry);
      if (trampoline == nullptr) {
        writeStatus("effect-ab-before-manager", "trampoline-failed", entry);
      } else {
        originalCreateSwingManager =
            reinterpret_cast<CreateSwingManager>(trampoline);
        if (!replaceCodeEntry(
                entry, reinterpret_cast<void*>(&captureCreateSwingManager))) {
          writeStatus("effect-ab-before-manager", "patch-failed", entry);
        } else {
          createManagerHookInstalled = true;
          writeStatus("effect-ab-before-manager", "patched", entry);
        }
      }
    }
  }


  if (!initializeManagerHookInstalled) {
    void* entry = dlsym(RTLD_DEFAULT, kInitializeSwingManagerSymbol);
    if (entry == nullptr || getAbValue == nullptr) {
      writeStatus("effect-ab-before-swing-init", "missing-symbol", entry);
    } else {
      void* trampoline = createTrampoline(entry);
      if (trampoline == nullptr) {
        writeStatus("effect-ab-before-swing-init", "trampoline-failed",
                    entry);
      } else {
        originalInitializeSwingManager =
            reinterpret_cast<InitializeSwingManager>(trampoline);
        if (!replaceCodeEntry(
                entry,
                reinterpret_cast<void*>(&captureInitializeSwingManager))) {
          writeStatus("effect-ab-before-swing-init", "patch-failed", entry);
        } else {
          initializeManagerHookInstalled = true;
          writeStatus("effect-ab-before-swing-init", "patched", entry);
        }
      }
    }
  }
  startDeferredReadIfRequested();
  pthread_mutex_unlock(&installMutex);
}

void imageAdded(const mach_header* header, std::intptr_t) {
  installForImage(header);
}

__attribute__((constructor)) void installHooks() {
  _dyld_register_func_for_add_image(&imageAdded);
  for (std::uint32_t index = 0; index < _dyld_image_count(); ++index) {
    installForImage(_dyld_get_image_header(index));
  }
}

}  // namespace
