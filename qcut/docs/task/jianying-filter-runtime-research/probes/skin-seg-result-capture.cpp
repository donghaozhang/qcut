#include <dlfcn.h>
#include <fcntl.h>
#include <libkern/OSCacheControl.h>
#include <mach-o/dyld.h>
#include <mach-o/loader.h>
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <pthread.h>
#include <sys/stat.h>
#include <unistd.h>

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

struct BinaryLayout {
  const char* name;
  std::array<std::uint8_t, 16> uuid;
  std::uintptr_t textureIdOffset;
};

constexpr std::array<BinaryLayout, 2> kKnownLayouts = {{
    {
        .name = "private-runtime-d383946d",
        .uuid = {0x9a, 0x8a, 0x8f, 0x6b, 0x31, 0xc0, 0x3d, 0xdc,
                 0x85, 0xac, 0x5f, 0x11, 0x08, 0x7d, 0x79, 0x65},
        .textureIdOffset = 0x00dd265c,
    },
    {
        .name = "installed-app-6437ac74",
        .uuid = {0xfd, 0xf4, 0x2e, 0xf4, 0x42, 0x7d, 0x30, 0xdf,
                 0x93, 0x10, 0xa8, 0xc7, 0xb3, 0x52, 0xc5, 0xcd},
        .textureIdOffset = 0x00ddae20,
    },
}};

constexpr const char* kTargetImageName = "libcccreator.dylib";
constexpr std::size_t kMaximumMaskBytes = 4U * 1024U * 1024U;

std::atomic<std::uint64_t> sequence{0};
pthread_mutex_t installMutex = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t indexMutex = PTHREAD_MUTEX_INITIALIZER;
char outputDirectory[1024] = "/tmp/jy-skin-seg-result-capture";
int indexFile = -1;
bool hookInstalled = false;

bool writeAll(int file, const std::uint8_t* bytes, std::size_t size) {
  std::size_t offset = 0;
  while (offset < size) {
    const ssize_t result =
        write(file, bytes + offset, static_cast<std::size_t>(size - offset));
    if (result <= 0) {
      return false;
    }
    offset += static_cast<std::size_t>(result);
  }
  return true;
}

void appendIndex(const char* line, std::size_t size) {
  pthread_mutex_lock(&indexMutex);
  if (indexFile >= 0) {
    writeAll(indexFile, reinterpret_cast<const std::uint8_t*>(line), size);
  }
  pthread_mutex_unlock(&indexMutex);
}

void writeStatus(const char* status, const char* layout, const void* address) {
  char line[512];
  const int length = std::snprintf(
      line, sizeof(line), "STATUS\tstatus=%s\tlayout=%s\taddress=%p\n", status,
      layout == nullptr ? "unknown" : layout, address);
  if (length > 0) {
    appendIndex(line, static_cast<std::size_t>(length));
  }
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

const BinaryLayout* findLayout(const mach_header* header) {
  const uuid_command* command = findUuidCommand(header);
  if (command == nullptr) {
    return nullptr;
  }
  for (const BinaryLayout& layout : kKnownLayouts) {
    if (std::memcmp(command->uuid, layout.uuid.data(), layout.uuid.size()) ==
        0) {
      return &layout;
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

std::uint32_t originalTextureId(const void* self) {
  const auto* bytes = static_cast<const std::uint8_t*>(self);
  void* holder = nullptr;
  std::memcpy(&holder, bytes + 0x20, sizeof(holder));
  if (holder == nullptr) {
    return 0;
  }

  void* texture = nullptr;
  std::memcpy(&texture, holder, sizeof(texture));
  if (texture == nullptr) {
    return 0;
  }

  std::uint32_t textureId = 0;
  std::memcpy(&textureId, static_cast<const std::uint8_t*>(texture) + 0x48,
              sizeof(textureId));
  return textureId;
}

void captureMask(const void* self, const void* caller) {
  const auto* bytes = static_cast<const std::uint8_t*>(self);
  std::int32_t width = 0;
  std::int32_t height = 0;
  float reflector = 0.0F;
  void* container = nullptr;
  std::memcpy(&width, bytes + 0x0c, sizeof(width));
  std::memcpy(&height, bytes + 0x10, sizeof(height));
  std::memcpy(&reflector, bytes + 0x14, sizeof(reflector));
  std::memcpy(&container, bytes + 0x18, sizeof(container));

  const std::uint8_t* begin = nullptr;
  const std::uint8_t* end = nullptr;
  if (container != nullptr) {
    const auto* containerBytes = static_cast<const std::uint8_t*>(container);
    std::memcpy(&begin, containerBytes + 0x10, sizeof(begin));
    std::memcpy(&end, containerBytes + 0x18, sizeof(end));
  }

  std::size_t size = 0;
  const auto beginAddress = reinterpret_cast<std::uintptr_t>(begin);
  const auto endAddress = reinterpret_cast<std::uintptr_t>(end);
  if (width > 0 && height > 0 && width <= 8192 && height <= 8192 &&
      begin != nullptr && endAddress >= beginAddress) {
    const std::size_t candidateSize =
        static_cast<std::size_t>(endAddress - beginAddress);
    const std::size_t expectedSize =
        static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
    if (candidateSize == expectedSize && candidateSize <= kMaximumMaskBytes) {
      size = candidateSize;
    }
  }

  const std::uint64_t currentSequence = sequence.fetch_add(1);
  std::uint64_t sum = 0;
  std::uint64_t hash = 1469598103934665603ULL;
  std::uint32_t minimum = 0;
  std::uint32_t maximum = 0;
  if (size > 0) {
    minimum = 255;
    for (std::size_t index = 0; index < size; ++index) {
      const std::uint32_t value = begin[index];
      sum += value;
      minimum = value < minimum ? value : minimum;
      maximum = value > maximum ? value : maximum;
      hash = (hash ^ value) * 1099511628211ULL;
    }
  }

  bool wroteMask = false;
  if (size > 0) {
    char path[1200];
    std::snprintf(path, sizeof(path), "%s/mask-%06llu.bin", outputDirectory,
                  static_cast<unsigned long long>(currentSequence));
    const int file = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (file >= 0) {
      wroteMask = writeAll(file, begin, size);
      close(file);
    }
  }

  std::uintptr_t callerOffset = 0;
  Dl_info callerInfo = {};
  if (caller != nullptr && dladdr(caller, &callerInfo) != 0 &&
      callerInfo.dli_fbase != nullptr) {
    callerOffset = reinterpret_cast<std::uintptr_t>(caller) -
                   reinterpret_cast<std::uintptr_t>(callerInfo.dli_fbase);
  }

  std::uint64_t threadId = 0;
  pthread_threadid_np(nullptr, &threadId);
  char line[768];
  const int length = std::snprintf(
      line, sizeof(line),
      "MASK\tsequence=%llu\twidth=%d\theight=%d\treflector=%.6f\t"
      "object=%p\tbytes=%zu\tmin=%u\tmax=%u\tsum=%llu\tfnv=%016llx\t"
      "written=%d\tthread=%llu\tcaller_offset=0x%llx\n",
      static_cast<unsigned long long>(currentSequence), width, height,
      reflector, self, size, minimum, maximum,
      static_cast<unsigned long long>(sum),
      static_cast<unsigned long long>(hash), wroteMask ? 1 : 0,
      static_cast<unsigned long long>(threadId),
      static_cast<unsigned long long>(callerOffset));
  if (length > 0) {
    appendIndex(line, static_cast<std::size_t>(length));
  }
}

std::uint32_t captureTextureId(void* self) {
  if (self == nullptr) {
    return 0;
  }
  captureMask(self, __builtin_return_address(0));
  return originalTextureId(self);
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
  std::memcpy(static_cast<std::uint8_t*>(privateEntry) +
                  sizeof(absoluteBranch),
              &destination, sizeof(destination));
  if (mach_vm_protect(mach_task_self(), privatePage, pageSize, false,
                      VM_PROT_READ | VM_PROT_EXECUTE) != KERN_SUCCESS) {
    mach_vm_deallocate(mach_task_self(), privatePage, pageSize);
    return false;
  }

  mach_vm_address_t remappedPage = page;
  vm_prot_t currentProtection = VM_PROT_NONE;
  vm_prot_t maximumProtection = VM_PROT_NONE;
  const kern_return_t remapResult = mach_vm_remap(
      mach_task_self(), &remappedPage, pageSize, 0,
      VM_FLAGS_FIXED | VM_FLAGS_OVERWRITE, mach_task_self(), privatePage, true,
      &currentProtection, &maximumProtection, VM_INHERIT_COPY);
  mach_vm_deallocate(mach_task_self(), privatePage, pageSize);
  if (remapResult != KERN_SUCCESS) {
    return false;
  }

  sys_icache_invalidate(entry, 16);
  return true;
}

void initializeOutput() {
  const char* requestedDirectory = std::getenv("JY_SKIN_SEG_CAPTURE_DIR");
  if (requestedDirectory != nullptr && requestedDirectory[0] != '\0') {
    std::snprintf(outputDirectory, sizeof(outputDirectory), "%s",
                  requestedDirectory);
  }
  mkdir(outputDirectory, 0755);

  char indexPath[1200];
  std::snprintf(indexPath, sizeof(indexPath), "%s/index.tsv", outputDirectory);
  indexFile =
      open(indexPath, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
}

void installForImage(const mach_header* header, std::intptr_t) {
  if (!isTargetImage(header)) {
    return;
  }

  pthread_mutex_lock(&installMutex);
  if (hookInstalled) {
    pthread_mutex_unlock(&installMutex);
    return;
  }

  const BinaryLayout* layout = findLayout(header);
  if (layout == nullptr) {
    writeStatus("unsupported-binary-uuid", nullptr, header);
    pthread_mutex_unlock(&installMutex);
    return;
  }

  void* entry = reinterpret_cast<void*>(
      reinterpret_cast<std::uintptr_t>(header) + layout->textureIdOffset);
  hookInstalled =
      replaceCodeEntry(entry, reinterpret_cast<void*>(&captureTextureId));
  writeStatus(hookInstalled ? "patched" : "patch-failed", layout->name,
              entry);
  pthread_mutex_unlock(&installMutex);
}

__attribute__((constructor)) void installHooks() {
  initializeOutput();
  _dyld_register_func_for_add_image(&installForImage);
  for (std::uint32_t index = 0; index < _dyld_image_count(); ++index) {
    installForImage(_dyld_get_image_header(index), 0);
  }
}

__attribute__((destructor)) void closeCapture() {
  if (indexFile >= 0) {
    close(indexFile);
    indexFile = -1;
  }
}

}  // namespace
