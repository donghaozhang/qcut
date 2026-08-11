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

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace {

constexpr const char* kSetParametersSymbol =
    "_ZN13AmazingEngine14FeatureSegment13setParametersERKNSt3__112basic_"
    "stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE";
constexpr std::size_t kMaximumPayloadBytes = 4U * 1024U * 1024U;

using SetParametersFunction = int (*)(void*, const std::string&);

SetParametersFunction originalSetParameters = nullptr;
pthread_mutex_t logMutex = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t installMutex = PTHREAD_MUTEX_INITIALIZER;
std::uint64_t sequence = 0;
bool hookInstalled = false;

const char* resolveLogPath() {
  const char* configuredPath = std::getenv("JY_FEATURE_PARAMS_LOG");
  if (configuredPath != nullptr && configuredPath[0] != '\0') {
    return configuredPath;
  }

  const char* home = std::getenv("HOME");
  if (home == nullptr || home[0] == '\0') {
    return "/tmp/jy-feature-params-capture.log";
  }

  static char defaultPath[PATH_MAX];
  std::snprintf(defaultPath, sizeof(defaultPath),
                "%s/Movies/JianyingPro/User Data/Log/"
                "jy-feature-params-capture.log",
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

void writeStatus(const char* status, const void* address = nullptr) {
  char line[512];
  const int length = std::snprintf(
      line, sizeof(line), "STATUS\t%s\tpid=%d\taddress=%p\n", status,
      static_cast<int>(getpid()), address);
  if (length > 0) {
    appendBytes(line, static_cast<std::size_t>(length));
  }
}

void writeEvent(void* object, const std::string& params,
                void* returnAddress) {
  Dl_info caller = {};
  dladdr(returnAddress, &caller);
  const auto imageBase = reinterpret_cast<std::uintptr_t>(caller.dli_fbase);
  const auto address = reinterpret_cast<std::uintptr_t>(returnAddress);
  const auto offset = address >= imageBase ? address - imageBase : 0;
  std::uint64_t threadId = 0;
  pthread_threadid_np(nullptr, &threadId);

  pthread_mutex_lock(&logMutex);
  const std::uint64_t eventSequence = sequence++;
  const std::size_t payloadBytes =
      params.size() <= kMaximumPayloadBytes ? params.size() : 0;
  char header[1024];
  const int headerLength = std::snprintf(
      header, sizeof(header),
      "BEGIN\t%llu\tpid=%d\ttime=%llu\tthread=%llu\tobject=%p\tbytes=%zu\t"
      "captured=%zu\tcaller=%s+0x%llx\n",
      static_cast<unsigned long long>(eventSequence),
      static_cast<int>(getpid()),
      static_cast<unsigned long long>(mach_absolute_time()),
      static_cast<unsigned long long>(threadId), object, params.size(),
      payloadBytes,
      caller.dli_fname == nullptr ? "unknown" : caller.dli_fname,
      static_cast<unsigned long long>(offset));
  if (headerLength > 0) {
    appendBytes(header, static_cast<std::size_t>(headerLength));
  }
  appendBytes(params.data(), payloadBytes);
  char footer[128];
  const int footerLength = std::snprintf(
      footer, sizeof(footer), "\nEND\t%llu\n",
      static_cast<unsigned long long>(eventSequence));
  if (footerLength > 0) {
    appendBytes(footer, static_cast<std::size_t>(footerLength));
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

SetParametersFunction createTrampoline(void* entry) {
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
  return reinterpret_cast<SetParametersFunction>(trampoline);
}

int captureSetParameters(void* self, const std::string& params) {
  writeEvent(self, params, __builtin_return_address(0));
  return originalSetParameters(self, params);
}

void tryInstallHook() {
  pthread_mutex_lock(&installMutex);
  if (hookInstalled) {
    pthread_mutex_unlock(&installMutex);
    return;
  }
  void* entry = dlsym(RTLD_DEFAULT, kSetParametersSymbol);
  if (entry == nullptr) {
    pthread_mutex_unlock(&installMutex);
    return;
  }
  originalSetParameters = createTrampoline(entry);
  if (originalSetParameters == nullptr) {
    writeStatus("trampoline-failed", entry);
    pthread_mutex_unlock(&installMutex);
    return;
  }
  if (!replaceCodeEntry(entry,
                        reinterpret_cast<void*>(&captureSetParameters))) {
    writeStatus("patch-failed", entry);
    pthread_mutex_unlock(&installMutex);
    return;
  }
  hookInstalled = true;
  writeStatus("patched", entry);
  pthread_mutex_unlock(&installMutex);
}

void imageAdded(const mach_header*, std::intptr_t) {
  tryInstallHook();
}

__attribute__((constructor)) void installHook() {
  _dyld_register_func_for_add_image(&imageAdded);
  tryInstallHook();
}

}  // namespace
