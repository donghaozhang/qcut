#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <libkern/OSCacheControl.h>
#include <mach-o/dyld.h>
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <pthread.h>
#include <stdarg.h>
#include <string>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

namespace {

constexpr uint64_t kExpectedArm64UuidBuildMarker = 0x1a96fb8;
constexpr size_t kJumpSize = 16;

int traceFile = -1;
atomic_flag traceLock = ATOMIC_FLAG_INIT;
intptr_t creatorSlide = 0;
atomic_uint_fast64_t borderDumpSequence = 0;
const char *borderDumpDirectory = nullptr;
bool forceGruRoute = false;

extern "C" int __open(const char *, int, int);

void writeTraceLine(const char *line) {
  if (traceFile < 0) {
    return;
  }
  while (atomic_flag_test_and_set_explicit(&traceLock, memory_order_acquire)) {
  }
  write(traceFile, line, strlen(line));
  atomic_flag_clear_explicit(&traceLock, memory_order_release);
}

uint64_t monotonicNanoseconds() {
  timespec value{};
  clock_gettime(CLOCK_MONOTONIC_RAW, &value);
  return static_cast<uint64_t>(value.tv_sec) * 1'000'000'000ULL + value.tv_nsec;
}

void traceEvent(const char *event, uint64_t a0 = 0, uint64_t a1 = 0,
                uint64_t a2 = 0, uint64_t a3 = 0, int64_t result = 0) {
  uint64_t threadId = 0;
  pthread_threadid_np(nullptr, &threadId);
  char line[640];
  snprintf(line, sizeof(line),
           "{\"t_ns\":%llu,\"pid\":%d,\"tid\":%llu,\"event\":\"%s\","
           "\"a0\":%llu,\"a1\":%llu,\"a2\":%llu,\"a3\":%llu,"
           "\"result\":%lld}\n",
           monotonicNanoseconds(), getpid(), threadId, event, a0, a1, a2, a3,
           result);
  writeTraceLine(line);
}

void sanitizePath(const char *path, char *output, size_t outputSize) {
  if (!path || outputSize == 0) {
    return;
  }
  size_t index = 0;
  for (; path[index] && index + 1 < outputSize; ++index) {
    const unsigned char value = static_cast<unsigned char>(path[index]);
    output[index] = value < 0x20 || value == '\\' || value == '"' ? '_' : value;
  }
  output[index] = '\0';
}

bool shouldTracePath(const char *path) {
  if (!path) {
    return false;
  }
  return strstr(path, "matting") || strstr(path, "maskinfo") ||
         strstr(path, ".MANE") || strstr(path, ".mane") ||
         strstr(path, ".model");
}

void tracePath(const char *operation, const char *path, int64_t result) {
  if (!shouldTracePath(path) || traceFile < 0) {
    return;
  }
  char safePath[384]{};
  sanitizePath(path, safePath, sizeof(safePath));
  uint64_t threadId = 0;
  pthread_threadid_np(nullptr, &threadId);
  char line[768];
  snprintf(line, sizeof(line),
           "{\"t_ns\":%llu,\"pid\":%d,\"tid\":%llu,\"event\":\"%s\","
           "\"path\":\"%s\",\"result\":%lld}\n",
           monotonicNanoseconds(), getpid(), threadId, operation, safePath,
           result);
  writeTraceLine(line);
}

void writeAbsoluteJump(uint8_t *destination, const void *target) {
  const uint32_t instructions[] = {0x58000050, 0xd61f0200};
  memcpy(destination, instructions, sizeof(instructions));
  const auto address = reinterpret_cast<uint64_t>(target);
  memcpy(destination + sizeof(instructions), &address, sizeof(address));
}

bool makeWritable(void *address) {
  const vm_size_t pageSize = static_cast<vm_size_t>(getpagesize());
  const auto start = reinterpret_cast<mach_vm_address_t>(address) &
                     ~(static_cast<mach_vm_address_t>(pageSize) - 1);
  return mach_vm_protect(mach_task_self(), start, pageSize, false,
                         VM_PROT_READ | VM_PROT_WRITE | VM_PROT_COPY) ==
         KERN_SUCCESS;
}

void *installHook(const char *name, uintptr_t offset, uint32_t expectedFirst,
                  void *replacement) {
  auto *target = reinterpret_cast<uint8_t *>(creatorSlide + offset);
  uint32_t actualFirst = 0;
  memcpy(&actualFirst, target, sizeof(actualFirst));
  if (actualFirst != expectedFirst) {
    traceEvent("hook_rejected", offset, expectedFirst, actualFirst);
    return nullptr;
  }

  auto *trampoline = static_cast<uint8_t *>(
      mmap(nullptr, getpagesize(), PROT_READ | PROT_WRITE,
           MAP_PRIVATE | MAP_ANON, -1, 0));
  if (trampoline == MAP_FAILED) {
    traceEvent("hook_mmap_failed", offset);
    return nullptr;
  }
  memcpy(trampoline, target, kJumpSize);
  writeAbsoluteJump(trampoline + kJumpSize, target + kJumpSize);
  mprotect(trampoline, getpagesize(), PROT_READ | PROT_EXEC);
  sys_icache_invalidate(trampoline, kJumpSize * 2);

  if (!makeWritable(target)) {
    traceEvent("hook_protect_failed", offset);
    munmap(trampoline, getpagesize());
    return nullptr;
  }
  writeAbsoluteJump(target, replacement);
  sys_icache_invalidate(target, kJumpSize);
  mach_vm_protect(mach_task_self(), reinterpret_cast<mach_vm_address_t>(target) &
                                        ~(static_cast<mach_vm_address_t>(
                                              getpagesize()) -
                                          1),
                  getpagesize(), false, VM_PROT_READ | VM_PROT_EXECUTE);
  traceEvent(name, offset, reinterpret_cast<uint64_t>(target));
  return trampoline;
}

using Function2 = uintptr_t (*)(uintptr_t, uintptr_t);
using Function3 = uintptr_t (*)(uintptr_t, uintptr_t, uintptr_t);
using Function5 = uintptr_t (*)(uintptr_t, uintptr_t, uintptr_t, uintptr_t,
                                uintptr_t);
using Function7 = uintptr_t (*)(uintptr_t, uintptr_t, uintptr_t, uintptr_t,
                                uintptr_t, uintptr_t, uintptr_t);
using Function8 = uintptr_t (*)(uintptr_t, uintptr_t, uintptr_t, uintptr_t,
                                uintptr_t, uintptr_t, uintptr_t, uintptr_t);
using Function12 = uintptr_t (*)(uintptr_t, uintptr_t, uintptr_t, uintptr_t,
                                 uintptr_t, uintptr_t, uintptr_t, uintptr_t,
                                 uintptr_t, uintptr_t, uintptr_t, uintptr_t);

Function2 originalHandleFaceDetect = nullptr;
Function2 originalSetPreviewModel = nullptr;
Function7 originalGetMaskFile = nullptr;
Function5 originalGetMaskVideo = nullptr;
Function8 originalBlendRender = nullptr;
Function7 originalPreviousFrame = nullptr;
Function5 originalTakePrefetch = nullptr;
Function8 originalSchedulePrefetch = nullptr;
Function12 originalMattingRender = nullptr;
Function7 originalExtendFrames = nullptr;
Function8 originalBlendForContext = nullptr;
Function2 originalSaveMane = nullptr;
Function3 originalCompleteSegment = nullptr;
Function2 originalInsertMaskPts = nullptr;
Function3 originalPortraitSetParam = nullptr;
Function5 originalSetStrokeParam = nullptr;
Function2 originalBachInitAlgorithm = nullptr;
Function3 originalFaceSinkProcess = nullptr;
Function2 originalSetRenderApi = nullptr;

using MaskPostProcessFrame = int (*)(uintptr_t, uintptr_t, uintptr_t, int,
                                     int, double, uintptr_t);
MaskPostProcessFrame originalMaskPostProcessFrame = nullptr;

void traceTaskModel(const char *event, uintptr_t task) {
  if (!task) {
    traceEvent(event);
    return;
  }
  uint32_t modelType = 0;
  memcpy(&modelType, reinterpret_cast<const void *>(task + 0x150),
         sizeof(modelType));
  traceEvent(event, task, modelType);

  const auto *modelPath =
      reinterpret_cast<const std::string *>(task + 0x108);
  tracePath("task_model_path", modelPath->c_str(), modelType);
}

uintptr_t hookHandleFaceDetect(uintptr_t a0, uintptr_t a1) {
  uintptr_t task = 0;
  uint32_t thresholdBits = 0;
  if (a1 != 0) {
    memcpy(&task, reinterpret_cast<const void *>(a1), sizeof(task));
  }
  if (task != 0) {
    memcpy(&thresholdBits, reinterpret_cast<const void *>(task + 0x180),
           sizeof(thresholdBits));
  }
  traceTaskModel("face_detect_route_before", task);
  traceEvent("face_detect_enter", a0, task, thresholdBits);
  if (forceGruRoute && task != 0) {
    const uint32_t zeroThreshold = 0;
    memcpy(reinterpret_cast<void *>(task + 0x180), &zeroThreshold,
           sizeof(zeroThreshold));
    traceEvent("force_gru_threshold", task, thresholdBits);
  }
  const auto result = originalHandleFaceDetect(a0, a1);
  if (forceGruRoute && task != 0) {
    memcpy(reinterpret_cast<void *>(task + 0x180), &thresholdBits,
           sizeof(thresholdBits));
  }
  uintptr_t faceSink = 0;
  uint64_t sampleCounts = 0;
  if (a0 != 0) {
    memcpy(&faceSink, reinterpret_cast<const void *>(a0 + 0x440),
           sizeof(faceSink));
  }
  if (faceSink != 0) {
    memcpy(&sampleCounts, reinterpret_cast<const void *>(faceSink + 0x35c),
           sizeof(sampleCounts));
  }
  traceEvent("face_detect_summary", sampleCounts & 0xffffffffULL,
             sampleCounts >> 32, faceSink);
  traceEvent("face_detect_exit", a0, task, thresholdBits, 0, result);
  traceTaskModel("face_detect_route_after", task);
  return result;
}

uintptr_t hookSetRenderApi(uintptr_t handle, uintptr_t renderApi) {
  const auto result = originalSetRenderApi(handle, renderApi);
  traceEvent("effect_set_render_api", handle, renderApi, 0, 0, result);
  return result;
}

uintptr_t hookFaceSinkProcess(uintptr_t unit, uintptr_t inputIndex,
                              uintptr_t pipelineSharedPointer) {
  const auto result =
      originalFaceSinkProcess(unit, inputIndex, pipelineSharedPointer);
  const uintptr_t pipeline = pipelineSharedPointer
                                 ? *reinterpret_cast<const uintptr_t *>(
                                       pipelineSharedPointer)
                                 : 0;
  uint32_t pipelineState = 0;
  uintptr_t faceBegin = 0;
  uintptr_t faceEnd = 0;
  if (pipeline) {
    memcpy(&pipelineState, reinterpret_cast<const void *>(pipeline + 0x5b4),
           sizeof(pipelineState));
    memcpy(&faceBegin, reinterpret_cast<const void *>(pipeline + 0x478),
           sizeof(faceBegin));
    memcpy(&faceEnd, reinterpret_cast<const void *>(pipeline + 0x480),
           sizeof(faceEnd));
  }
  uint32_t totalSamples = 0;
  uint32_t faceSamples = 0;
  memcpy(&totalSamples, reinterpret_cast<const void *>(unit + 0x35c),
         sizeof(totalSamples));
  memcpy(&faceSamples, reinterpret_cast<const void *>(unit + 0x360),
         sizeof(faceSamples));

  const bool hasPlausibleFaceVector =
      faceBegin != 0 && faceEnd >= faceBegin && faceEnd - faceBegin <= 4096;
  const uint64_t faceRectCount = hasPlausibleFaceVector
                                     ? (faceEnd - faceBegin) / (sizeof(float) * 4)
                                     : 0;
  traceEvent("face_detect_sample", pipelineState, totalSamples, faceSamples,
             faceRectCount, result);
  if (faceRectCount > 0) {
    float rectangle[4]{};
    memcpy(rectangle, reinterpret_cast<const void *>(faceBegin),
           sizeof(rectangle));
    traceEvent("face_detect_first_rect",
               static_cast<int64_t>(rectangle[0] * 1'000'000.0F),
               static_cast<int64_t>(rectangle[1] * 1'000'000.0F),
               static_cast<int64_t>(rectangle[2] * 1'000'000.0F),
               static_cast<int64_t>(rectangle[3] * 1'000'000.0F));
  }
  return result;
}

void *installFaceSinkHook(void *replacement) {
  constexpr uintptr_t offset = 0x1a8fb1c;
  const uint32_t expected[] = {0xf9400048, 0xb945b509, 0x7100093f,
                               0x54000201};
  auto *target = reinterpret_cast<uint8_t *>(creatorSlide + offset);
  if (memcmp(target, expected, sizeof(expected)) != 0) {
    traceEvent("hook_face_sink_rejected", offset);
    return nullptr;
  }

  auto *trampoline = static_cast<uint8_t *>(
      mmap(nullptr, getpagesize(), PROT_READ | PROT_WRITE,
           MAP_PRIVATE | MAP_ANON, -1, 0));
  if (trampoline == MAP_FAILED) {
    traceEvent("hook_face_sink_mmap_failed", offset);
    return nullptr;
  }
  memcpy(trampoline, target, 12);
  const uint32_t branchEqualToOriginal = 0x540000a0;
  memcpy(trampoline + 12, &branchEqualToOriginal,
         sizeof(branchEqualToOriginal));
  writeAbsoluteJump(trampoline + 16, target + 0x4c);
  writeAbsoluteJump(trampoline + 32, target + 0x10);
  mprotect(trampoline, getpagesize(), PROT_READ | PROT_EXEC);
  sys_icache_invalidate(trampoline, 48);

  if (!makeWritable(target)) {
    traceEvent("hook_face_sink_protect_failed", offset);
    munmap(trampoline, getpagesize());
    return nullptr;
  }
  writeAbsoluteJump(target, replacement);
  sys_icache_invalidate(target, kJumpSize);
  mach_vm_protect(mach_task_self(), reinterpret_cast<mach_vm_address_t>(target) &
                                        ~(static_cast<mach_vm_address_t>(
                                              getpagesize()) -
                                          1),
                  getpagesize(), false, VM_PROT_READ | VM_PROT_EXECUTE);
  traceEvent("hook_face_sink_process", offset,
             reinterpret_cast<uint64_t>(target));
  return trampoline;
}

uintptr_t hookBachInitAlgorithm(uintptr_t unit, uintptr_t taskSharedPointer) {
  const uintptr_t task = taskSharedPointer
                             ? *reinterpret_cast<const uintptr_t *>(
                                   taskSharedPointer)
                             : 0;
  traceTaskModel("bach_init_algorithm_before", task);
  const auto result = originalBachInitAlgorithm(unit, taskSharedPointer);
  traceTaskModel("bach_init_algorithm_after", task);
  return result;
}

uintptr_t hookSetPreviewModel(uintptr_t a0, uintptr_t modelType) {
  traceEvent("set_preview_model", a0, modelType);
  return originalSetPreviewModel(a0, modelType);
}

uintptr_t hookGetMaskFile(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                          uintptr_t a3, uintptr_t a4, uintptr_t a5,
                          uintptr_t a6) {
  const auto result = originalGetMaskFile(a0, a1, a2, a3, a4, a5, a6);
  traceEvent("get_mask_file", a0, a3, a6, 0, result);
  return result;
}

uintptr_t hookGetMaskVideo(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                           uintptr_t a3, uintptr_t a4) {
  const auto result = originalGetMaskVideo(a0, a1, a2, a3, a4);
  traceEvent("get_mask_video", a0, a2, a3, a4, result);
  return result;
}

uintptr_t hookBlendRender(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                          uintptr_t a3, uintptr_t blendMode,
                          uintptr_t mattingType, uintptr_t a6, uintptr_t a7) {
  traceEvent("blend_render_enter", blendMode, mattingType, a3);
  const auto result = originalBlendRender(a0, a1, a2, a3, blendMode,
                                          mattingType, a6, a7);
  traceEvent("blend_render_exit", blendMode, mattingType, 0, 0, result);
  return result;
}

uintptr_t hookPreviousFrame(uintptr_t a0, uintptr_t a1, uintptr_t pts,
                            uintptr_t a3, uintptr_t mattingType, uintptr_t a5,
                            uintptr_t a6) {
  const auto result =
      originalPreviousFrame(a0, a1, pts, a3, mattingType, a5, a6);
  traceEvent("get_previous_frame", pts, mattingType, 0, 0, result);
  return result;
}

uintptr_t hookTakePrefetch(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                           uintptr_t pts, uintptr_t a4) {
  const auto result = originalTakePrefetch(a0, a1, a2, pts, a4);
  traceEvent("take_prefetch", pts, a1, a4, 0, result);
  return result;
}

uintptr_t hookSchedulePrefetch(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                               uintptr_t a3, uintptr_t a4, uintptr_t pts,
                               uintptr_t frameDuration, uintptr_t reset) {
  traceEvent("schedule_prefetch_enter", pts, frameDuration, reset);
  const auto result = originalSchedulePrefetch(a0, a1, a2, a3, a4, pts,
                                               frameDuration, reset);
  traceEvent("schedule_prefetch_exit", pts, frameDuration, reset, 0, result);
  return result;
}

uintptr_t hookMattingRender(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                            uintptr_t a3, uintptr_t a4, uintptr_t a5,
                            uintptr_t a6, uintptr_t a7, uintptr_t a8,
                            uintptr_t a9, uintptr_t a10, uintptr_t a11) {
  traceEvent("matting_render_enter", a3, a7, a8, a9);
  const auto result = originalMattingRender(a0, a1, a2, a3, a4, a5, a6, a7,
                                            a8, a9, a10, a11);
  traceEvent("matting_render_exit", a3, a7, a8, a9, result);
  return result;
}

uintptr_t hookExtendFrames(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                           uintptr_t a3, uintptr_t a4, uintptr_t a5,
                           uintptr_t a6) {
  const auto result = originalExtendFrames(a0, a1, a2, a3, a4, a5, a6);
  traceEvent("get_extend_frames", a0, a3, a6, 0, result);
  return result;
}

uintptr_t hookBlendForContext(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                              uintptr_t a3, uintptr_t blendMode, uintptr_t a5,
                              uintptr_t a6, uintptr_t a7) {
  const auto result = originalBlendForContext(a0, a1, a2, a3, blendMode, a5,
                                              a6, a7);
  traceEvent("blend_for_context", blendMode, a3, a7, 0, result);
  return result;
}

uintptr_t hookSaveMane(uintptr_t a0, uintptr_t a1) {
  traceEvent("save_mane_enter", a0);
  const auto result = originalSaveMane(a0, a1);
  traceEvent("save_mane_exit", a0, 0, 0, 0, result);
  return result;
}

uintptr_t hookCompleteSegment(uintptr_t a0, uintptr_t start, uintptr_t end) {
  const auto result = originalCompleteSegment(a0, start, end);
  traceEvent("insert_complete_segment", start, end, 0, 0, result);
  return result;
}

uintptr_t hookInsertMaskPts(uintptr_t a0, uintptr_t pts) {
  const auto result = originalInsertMaskPts(a0, pts);
  traceEvent("insert_mask_pts", pts, 0, 0, 0, result);
  return result;
}

uintptr_t hookPortraitSetParam(uintptr_t a0, uintptr_t parameter,
                               uintptr_t value) {
  traceEvent("portrait_set_param", parameter, value);
  return originalPortraitSetParam(a0, parameter, value);
}

uintptr_t hookSetStrokeParam(uintptr_t a0, uintptr_t a1, uintptr_t a2,
                             uintptr_t a3, uintptr_t a4) {
  traceEvent("set_stroke_param", a1, a2, a3, a4);
  return originalSetStrokeParam(a0, a1, a2, a3, a4);
}

using ProcessBorderFunction = int (*)(void *, const void *, int, int, void *);
using InternalProcessBorderFunction = int (*)(void *, const void *, int, int,
                                              uint8_t *);
ProcessBorderFunction originalProcessBorder = nullptr;
InternalProcessBorderFunction originalInternalProcessBorder = nullptr;

uint64_t sampledHash(const uint8_t *data, size_t size) {
  if (!data || size == 0 || size > 64 * 1024 * 1024) {
    return 0;
  }
  uint64_t hash = 1469598103934665603ULL;
  const size_t step = size > 4096 ? size / 4096 : 1;
  for (size_t index = 0; index < size; index += step) {
    hash ^= data[index];
    hash *= 1099511628211ULL;
  }
  return hash;
}

void dumpBorderAlpha(const char *stage, const uint8_t *data, int width,
                     int height, uint64_t sequence) {
  if (!borderDumpDirectory || !data || width <= 0 || height <= 0) {
    return;
  }
  const size_t size = static_cast<size_t>(width) * static_cast<size_t>(height);
  if (size > 64 * 1024 * 1024) {
    return;
  }
  char path[1024];
  const int pathLength = snprintf(
      path, sizeof(path), "%s/%06llu-%s-%dx%d.gray", borderDumpDirectory,
      sequence, stage, width, height);
  if (pathLength <= 0 || static_cast<size_t>(pathLength) >= sizeof(path)) {
    traceEvent("border_dump_path_rejected", sequence, width, height);
    return;
  }
  const int output = __open(path, O_CREAT | O_WRONLY | O_TRUNC, 0600);
  if (output < 0) {
    traceEvent("border_dump_open_failed", sequence, width, height, errno);
    return;
  }
  size_t written = 0;
  while (written < size) {
    const ssize_t result = write(output, data + written, size - written);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result <= 0) {
      traceEvent("border_dump_write_failed", sequence, width, height, errno);
      break;
    }
    written += static_cast<size_t>(result);
  }
  close(output);
  traceEvent("border_dump", sequence, width, height, written);
}

int traceProcessBorder(const char *source, ProcessBorderFunction original,
                       void *handle, const void *inputMat, int width,
                       int height, void *outputMat) {
  const uint64_t sequence = atomic_fetch_add_explicit(
      &borderDumpSequence, 1, memory_order_relaxed);
  const auto *inputBytes =
      inputMat ? *reinterpret_cast<uint8_t *const *>(inputMat) : nullptr;
  const uint64_t before = sampledHash(
      inputBytes, static_cast<size_t>(width) * static_cast<size_t>(height));
  traceEvent(source, width, height, before,
             inputMat ? *reinterpret_cast<const uint32_t *>(
                            static_cast<const uint8_t *>(inputMat) + 8)
                      : 0);
  dumpBorderAlpha("input", inputBytes, width, height, sequence);
  const int result = original(handle, inputMat, width, height, outputMat);
  const auto *outputBytes =
      outputMat ? *reinterpret_cast<uint8_t *const *>(outputMat) : nullptr;
  dumpBorderAlpha("output", outputBytes, width, height, sequence);
  const uint64_t after = sampledHash(
      outputBytes, static_cast<size_t>(width) * static_cast<size_t>(height));
  traceEvent("process_border_exit", width, height, before, after, result);
  return result;
}

int hookProcessBorder(void *handle, const void *inputMat, int width, int height,
                      void *outputMat) {
  return traceProcessBorder("process_border_export_enter", originalProcessBorder,
                            handle, inputMat, width, height, outputMat);
}

int hookInternalProcessBorder(void *handle, const void *inputMat, int width,
                              int height, uint8_t *outputBytes) {
  const uint64_t sequence = atomic_fetch_add_explicit(
      &borderDumpSequence, 1, memory_order_relaxed);
  const auto *inputBytes =
      inputMat ? *reinterpret_cast<uint8_t *const *>(inputMat) : nullptr;
  const size_t size = static_cast<size_t>(width) * static_cast<size_t>(height);
  const uint64_t before = sampledHash(inputBytes, size);
  traceEvent("process_border_graph_enter", width, height, before,
             reinterpret_cast<uint64_t>(outputBytes));
  dumpBorderAlpha("input", inputBytes, width, height, sequence);
  const int result =
      originalInternalProcessBorder(handle, inputMat, width, height, outputBytes);
  dumpBorderAlpha("output", outputBytes, width, height, sequence);
  const uint64_t after = sampledHash(outputBytes, size);
  traceEvent("process_border_graph_exit", width, height, before, after, result);
  return result;
}

int hookIgnorePrevious(void *handle) {
  traceEvent("ignore_previous", reinterpret_cast<uint64_t>(handle));
  if (!handle) {
    return -1;
  }
  *(static_cast<uint8_t *>(handle) + 0x2cc) = 0;
  return 0;
}

using ContourParamFunction = int (*)(void *, int, float);
ContourParamFunction contourParamBody = nullptr;

int hookContourParamF(void *handle, int parameter, float value) {
  traceEvent("contour_param_f", parameter, 0, 0, 0,
             static_cast<int64_t>(value * 1'000'000.0F));
  if (!handle) {
    return -108;
  }
  return contourParamBody(handle, parameter, value);
}

int hookContourParam(void *handle, int parameter, float value) {
  traceEvent("contour_param", parameter, 0, 0, 0,
             static_cast<int64_t>(value * 1'000'000.0F));
  if (!handle) {
    return -108;
  }
  return contourParamBody(handle, parameter, value);
}

using InitModelFunction = int (*)(void *, int, const char *);
InitModelFunction originalInitModel = nullptr;

int hookInitModel(void *handle, int modelType, const char *path) {
  tracePath("init_model_path", path, modelType);
  traceEvent("init_model_enter", modelType, reinterpret_cast<uint64_t>(handle));
  const int result = originalInitModel(handle, modelType, path);
  traceEvent("init_model_exit", modelType, 0, 0, 0, result);
  return result;
}

int hookMaskPostProcessFrame(uintptr_t algorithm,
                             uintptr_t maskSharedPointer,
                             uintptr_t auxiliaryPath, int width, int height,
                             double tolerance, uintptr_t contours) {
  const uintptr_t mask = maskSharedPointer
                             ? *reinterpret_cast<const uintptr_t *>(
                                   maskSharedPointer)
                             : 0;
  const auto *maskBytes = mask
                              ? *reinterpret_cast<uint8_t *const *>(
                                    mask + 0x30)
                              : nullptr;
  const int maskWidth = mask
                            ? *reinterpret_cast<const int *>(mask + 0x18)
                            : 0;
  const int maskHeight = mask
                             ? *reinterpret_cast<const int *>(mask + 0x1c)
                             : 0;
  const size_t maskSize = maskWidth > 0 && maskHeight > 0
                              ? static_cast<size_t>(maskWidth) * maskHeight
                              : 0;
  uint64_t toleranceBits = 0;
  memcpy(&toleranceBits, &tolerance, sizeof(toleranceBits));
  traceEvent("mask_post_enter", maskWidth, maskHeight,
             sampledHash(maskBytes, maskSize), mask, 0);
  traceEvent("mask_post_args", static_cast<uint64_t>(width),
             static_cast<uint64_t>(height), toleranceBits, contours, 0);
  if (auxiliaryPath) {
    const auto *path =
        reinterpret_cast<const std::string *>(auxiliaryPath);
    tracePath("mask_post_aux_path", path->c_str(), 0);
  }
  dumpBorderAlpha("mask-post-input", maskBytes, maskWidth, maskHeight,
                  atomic_fetch_add_explicit(&borderDumpSequence, 1,
                                            memory_order_relaxed));
  const int result = originalMaskPostProcessFrame(
      algorithm, maskSharedPointer, auxiliaryPath, width, height, tolerance,
      contours);
  const auto *outputBytes = mask
                                ? *reinterpret_cast<uint8_t *const *>(
                                      mask + 0x30)
                                : nullptr;
  const int outputWidth = mask
                              ? *reinterpret_cast<const int *>(mask + 0x18)
                              : 0;
  const int outputHeight = mask
                               ? *reinterpret_cast<const int *>(mask + 0x1c)
                               : 0;
  const size_t outputSize = outputWidth > 0 && outputHeight > 0
                                ? static_cast<size_t>(outputWidth) *
                                      outputHeight
                                : 0;
  uint64_t contourCount = 0;
  if (contours) {
    const uintptr_t begin =
        *reinterpret_cast<const uintptr_t *>(contours);
    const uintptr_t end =
        *reinterpret_cast<const uintptr_t *>(contours + 0x8);
    if (begin && end >= begin) {
      contourCount = (end - begin) / 24;
    }
  }
  traceEvent("mask_post_exit", outputWidth, outputHeight,
             sampledHash(outputBytes, outputSize), contourCount, result);
  dumpBorderAlpha("mask-post-output", outputBytes, outputWidth, outputHeight,
                  atomic_fetch_add_explicit(&borderDumpSequence, 1,
                                            memory_order_relaxed));
  return result;
}

void installCreatorHooks() {
  if (creatorSlide == 0) {
    return;
  }
  traceEvent("creator_image_ready", creatorSlide,
             kExpectedArm64UuidBuildMarker);

  originalSetRenderApi = reinterpret_cast<Function2>(installHook(
      "hook_effect_set_render_api", 0x16431b0, 0xd10183ff,
      reinterpret_cast<void *>(hookSetRenderApi)));

  originalHandleFaceDetect = reinterpret_cast<Function2>(installHook(
      "hook_handle_face", 0x1a89170, 0xd104c3ff,
      reinterpret_cast<void *>(hookHandleFaceDetect)));
  originalFaceSinkProcess = reinterpret_cast<Function3>(
      installFaceSinkHook(reinterpret_cast<void *>(hookFaceSinkProcess)));
  originalBachInitAlgorithm = reinterpret_cast<Function2>(installHook(
      "hook_bach_init_algorithm", 0x19d273c, 0xd10203ff,
      reinterpret_cast<void *>(hookBachInitAlgorithm)));
  originalSetPreviewModel = reinterpret_cast<Function2>(installHook(
      "hook_preview_model", 0x1a96fb8, 0xd10243ff,
      reinterpret_cast<void *>(hookSetPreviewModel)));
  originalGetMaskFile = reinterpret_cast<Function7>(installHook(
      "hook_get_mask_file", 0x1a9d2e8, 0xd10243ff,
      reinterpret_cast<void *>(hookGetMaskFile)));
  originalGetMaskVideo = reinterpret_cast<Function5>(installHook(
      "hook_get_mask_video", 0x1a9d5d8, 0xd104c3ff,
      reinterpret_cast<void *>(hookGetMaskVideo)));
  originalBlendRender = reinterpret_cast<Function8>(installHook(
      "hook_blend_render", 0x1a9e164, 0xd10303ff,
      reinterpret_cast<void *>(hookBlendRender)));
  originalPreviousFrame = reinterpret_cast<Function7>(installHook(
      "hook_previous_frame", 0x1a9e54c, 0xa9be4ff4,
      reinterpret_cast<void *>(hookPreviousFrame)));
  originalTakePrefetch = reinterpret_cast<Function5>(installHook(
      "hook_take_prefetch", 0x1a9f390, 0xd101c3ff,
      reinterpret_cast<void *>(hookTakePrefetch)));
  originalSchedulePrefetch = reinterpret_cast<Function8>(installHook(
      "hook_schedule_prefetch", 0x1a9f670, 0xa9ba6ffc,
      reinterpret_cast<void *>(hookSchedulePrefetch)));
  originalMattingRender = reinterpret_cast<Function12>(installHook(
      "hook_matting_render", 0x1a9ffa4, 0xd10783ff,
      reinterpret_cast<void *>(hookMattingRender)));
  originalExtendFrames = reinterpret_cast<Function7>(installHook(
      "hook_extend_frames", 0x1aa0ca8, 0xd10303ff,
      reinterpret_cast<void *>(hookExtendFrames)));
  originalBlendForContext = reinterpret_cast<Function8>(installHook(
      "hook_blend_context", 0x1aa210c, 0xd10243ff,
      reinterpret_cast<void *>(hookBlendForContext)));
  originalSaveMane = reinterpret_cast<Function2>(installHook(
      "hook_save_mane", 0x1dedce0, 0xd10503ff,
      reinterpret_cast<void *>(hookSaveMane)));
  originalCompleteSegment = reinterpret_cast<Function3>(installHook(
      "hook_complete_segment", 0x1dee4a4, 0xd10243ff,
      reinterpret_cast<void *>(hookCompleteSegment)));
  originalInsertMaskPts = reinterpret_cast<Function2>(installHook(
      "hook_insert_pts", 0x1dee844, 0xa9bd57f6,
      reinterpret_cast<void *>(hookInsertMaskPts)));
  originalProcessBorder = reinterpret_cast<ProcessBorderFunction>(installHook(
      "hook_process_border", 0x12a1568, 0xd10403ff,
      reinterpret_cast<void *>(hookProcessBorder)));
  originalInternalProcessBorder =
      reinterpret_cast<InternalProcessBorderFunction>(installHook(
          "hook_internal_process_border", 0x129eec4, 0xd10683ff,
          reinterpret_cast<void *>(hookInternalProcessBorder)));
  installHook("hook_ignore_previous", 0x12a1694, 0xb40000a0,
              reinterpret_cast<void *>(hookIgnorePrevious));
  originalPortraitSetParam = reinterpret_cast<Function3>(installHook(
      "hook_portrait_set_param", 0x129fd00, 0xa9bf7bfd,
      reinterpret_cast<void *>(hookPortraitSetParam)));
  originalSetStrokeParam = reinterpret_cast<Function5>(installHook(
      "hook_stroke_param", 0x1e38bb8, 0xd10203ff,
      reinterpret_cast<void *>(hookSetStrokeParam)));

  contourParamBody = reinterpret_cast<ContourParamFunction>(creatorSlide +
                                                             0x1299a20);
  installHook("hook_contour_param_f", 0x1299a10, 0xb4000040,
              reinterpret_cast<void *>(hookContourParamF));
  installHook("hook_contour_param", 0x1299a90, 0xb4000040,
              reinterpret_cast<void *>(hookContourParam));
  originalInitModel = reinterpret_cast<InitModelFunction>(installHook(
      "hook_init_model", 0x163432c, 0xd10143ff,
      reinterpret_cast<void *>(hookInitModel)));
  originalMaskPostProcessFrame =
      reinterpret_cast<MaskPostProcessFrame>(installHook(
          "hook_mask_post_process", 0x2022db0, 0x6db82beb,
          reinterpret_cast<void *>(hookMaskPostProcessFrame)));
}

void imageAdded(const mach_header *header, intptr_t slide) {
  for (uint32_t index = 0; index < _dyld_image_count(); ++index) {
    if (_dyld_get_image_header(index) != header) {
      continue;
    }
    const char *name = _dyld_get_image_name(index);
    if (name && strstr(name, "/libcccreator.dylib")) {
      creatorSlide = slide;
      installCreatorHooks();
    }
    return;
  }
}

__attribute__((constructor, used)) void startTrace() {
  const char *path = getenv("QCUT_MATTING_TRACE_PATH");
  borderDumpDirectory = getenv("QCUT_MATTING_BORDER_DUMP_DIR");
  forceGruRoute = getenv("QCUT_MATTING_FORCE_GRU_ROUTE") != nullptr;
  if (path) {
    traceFile = __open(path, O_CREAT | O_WRONLY | O_APPEND, 0600);
  }
  traceEvent("trace_loaded");
  _dyld_register_func_for_add_image(imageAdded);
}

} // namespace

extern "C" int tracedOpen(const char *path, int flags, ...) {
  mode_t mode = 0;
  if (flags & O_CREAT) {
    va_list arguments;
    va_start(arguments, flags);
    mode = static_cast<mode_t>(va_arg(arguments, int));
    va_end(arguments);
  }
  const int result = __open(path, flags, mode);
  tracePath("open", path, result);
  return result;
}

#define DYLD_INTERPOSE(replacement, replacee)                                  \
  __attribute__((used)) static struct {                                        \
    const void *replacement;                                                   \
    const void *replacee;                                                      \
  } _interpose_##replacee __attribute__((section("__DATA,__interpose"))) = {   \
      reinterpret_cast<const void *>(replacement),                             \
      reinterpret_cast<const void *>(replacee)};

DYLD_INTERPOSE(tracedOpen, open)
