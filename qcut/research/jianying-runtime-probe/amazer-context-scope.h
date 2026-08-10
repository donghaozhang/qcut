#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace jianying_probe {

struct AmazerContextScopeRequest {
  const void* knownImageSymbol;
  std::string_view expectedImageUuid;
  std::uintptr_t constructorOffset;
  std::uintptr_t destructorOffset;
  void* context;
};

class AmazerContextScope {
 public:
  explicit AmazerContextScope(const AmazerContextScopeRequest& request);
  ~AmazerContextScope();

  AmazerContextScope(const AmazerContextScope&) = delete;
  AmazerContextScope& operator=(const AmazerContextScope&) = delete;

 private:
  using ObjectMethod = void (*)(void*);
  using ConstructorMethod = void (*)(void*, void*);

  alignas(8) std::array<std::byte, 8> storage_{};
  ObjectMethod destructor_ = nullptr;
};

}  // namespace jianying_probe
