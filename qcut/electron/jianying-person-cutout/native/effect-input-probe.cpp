#include "effect-input-probe.hpp"

#include <OpenGL/OpenGL.h>

#include <dlfcn.h>

#include <cstdlib>
#include <string>

namespace qcut::matting {
namespace {

using ObjcGetClass = void *(*)(const char *);
using ObjcSelector = void *(*)(const char *);
using ObjcSendNoArguments = void *(*)(void *, void *);
using ObjcSendBoolean = void (*)(void *, void *, signed char);

bool environmentFlagEnabled(const char *name) {
  const char *value = std::getenv(name);
  return value != nullptr && std::string(value) == "1";
}

} // namespace

bool bufferInputProbeEnabled() {
  return environmentFlagEnabled("QCUT_JIANYING_BUFFER_INPUT_PROBE");
}

bool engineImageProcessingContextProbeEnabled() {
  return environmentFlagEnabled("QCUT_JIANYING_ENGINE_CONTEXT_PROBE");
}

bool bindEngineImageProcessingContext() {
  const auto getClass = reinterpret_cast<ObjcGetClass>(
      dlsym(RTLD_DEFAULT, "objc_getClass"));
  const auto selector = reinterpret_cast<ObjcSelector>(
      dlsym(RTLD_DEFAULT, "sel_registerName"));
  void *sendSymbol = dlsym(RTLD_DEFAULT, "objc_msgSend");
  if (getClass == nullptr || selector == nullptr || sendSymbol == nullptr) {
    return false;
  }

  void *contextClass = getClass("HTSGLContext");
  if (contextClass == nullptr) {
    return false;
  }
  const auto sendNoArguments =
      reinterpret_cast<ObjcSendNoArguments>(sendSymbol);
  const auto sendBoolean = reinterpret_cast<ObjcSendBoolean>(sendSymbol);
  void *applicationClass = getClass("NSApplication");
  if (applicationClass != nullptr) {
    sendNoArguments(applicationClass, selector("sharedApplication"));
  }
  sendNoArguments(contextClass, selector("preloadGLContext"));

  void *context = nullptr;
  constexpr const char *contextSelectors[] = {
      "sharedImageProcessingContext",
      "shareProcesingContext",
      "defaultImageProcessingContext",
  };
  for (const char *contextSelector : contextSelectors) {
    context = sendNoArguments(contextClass, selector(contextSelector));
    if (context != nullptr) {
      break;
    }
  }
  if (context == nullptr ||
      sendNoArguments(context, selector("getCppContext")) == nullptr) {
    return false;
  }
  sendBoolean(context, selector("bind:"), 1);
  return CGLGetCurrentContext() != nullptr;
}

} // namespace qcut::matting
