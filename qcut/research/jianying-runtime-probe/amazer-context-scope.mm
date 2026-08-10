#include "amazer-context-scope.h"

#include <dlfcn.h>
#include <mach-o/loader.h>

#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>

namespace jianying_probe {
namespace {

[[nodiscard]] std::string imageUuid(const void* imageBase) {
  const auto* header = static_cast<const mach_header_64*>(imageBase);
  const auto* command = reinterpret_cast<const load_command*>(header + 1);
  for (std::uint32_t index = 0; index < header->ncmds; index += 1) {
    if (command->cmd == LC_UUID) {
      const auto* uuidCommand = reinterpret_cast<const uuid_command*>(command);
      const std::uint8_t* bytes = uuidCommand->uuid;
      char formatted[37];
      std::snprintf(
          formatted, sizeof(formatted),
          "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
          bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
          bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11],
          bytes[12], bytes[13], bytes[14], bytes[15]);
      return formatted;
    }
    command = reinterpret_cast<const load_command*>(
        reinterpret_cast<const std::uint8_t*>(command) + command->cmdsize);
  }
  return {};
}

[[nodiscard]] std::uintptr_t checkedImageBase(
    const AmazerContextScopeRequest& request) {
  Dl_info image{};
  if (dladdr(request.knownImageSymbol, &image) == 0 ||
      image.dli_fbase == nullptr) {
    throw std::runtime_error("cannot identify libcccreator image");
  }

  const std::string loadedUuid = imageUuid(image.dli_fbase);
  if (loadedUuid != request.expectedImageUuid) {
    throw std::runtime_error(
        "libcccreator UUID " + loadedUuid + " does not match verified UUID " +
        std::string(request.expectedImageUuid));
  }
  std::cout << "[identity] libcccreator.dylib " << loadedUuid << '\n';
  return reinterpret_cast<std::uintptr_t>(image.dli_fbase);
}

}  // namespace

void verifyRuntimeImage(const void* knownImageSymbol,
                        std::string_view expectedImageUuid) {
  static_cast<void>(checkedImageBase({
      .knownImageSymbol = knownImageSymbol,
      .expectedImageUuid = expectedImageUuid,
  }));
}

AmazerContextScope::AmazerContextScope(
    const AmazerContextScopeRequest& request) {
  if (request.context == nullptr) {
    throw std::runtime_error("cannot enter a null Amazer context");
  }
  const std::uintptr_t imageBase = checkedImageBase(request);
  const auto constructor = reinterpret_cast<ConstructorMethod>(
      imageBase + request.constructorOffset);
  destructor_ =
      reinterpret_cast<ObjectMethod>(imageBase + request.destructorOffset);
  constructor(storage_.data(), request.context);
  std::cout << "[context] entered Amazer context " << request.context << '\n';
}

AmazerContextScope::~AmazerContextScope() {
  if (destructor_ != nullptr) {
    destructor_(storage_.data());
  }
}

}  // namespace jianying_probe
