#pragma once

#include <dlfcn.h>

#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace jianying_probe {

namespace fs = std::filesystem;

inline void* openLibrary(const fs::path& path) {
  dlerror();
  void* handle = dlopen(path.c_str(), RTLD_NOW | RTLD_GLOBAL);
  if (handle == nullptr) {
    const char* error = dlerror();
    throw std::runtime_error("dlopen failed for " + path.string() + ": " +
                             (error == nullptr ? "unknown error" : error));
  }

  std::cout << "[load] " << path.filename().string() << '\n';
  return handle;
}

template <typename Function>
[[nodiscard]] Function resolveSymbol(void* handle, std::string_view name) {
  dlerror();
  void* address = dlsym(handle, name.data());
  const char* error = dlerror();
  if (error != nullptr || address == nullptr) {
    throw std::runtime_error("dlsym failed for " + std::string(name) + ": " +
                             (error == nullptr ? "unknown error" : error));
  }

  std::cout << "[symbol] " << name << '\n';
  return reinterpret_cast<Function>(address);
}

}  // namespace jianying_probe
