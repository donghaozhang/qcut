#pragma once

#include <filesystem>
#include <memory>

namespace jianying_probe {

class TextResourceFinder {
 public:
  using Callback = char* (*)(void*, const char*, const char*);

  explicit TextResourceFinder(const std::filesystem::path& manifestPath);
  ~TextResourceFinder();

  TextResourceFinder(const TextResourceFinder&) = delete;
  TextResourceFinder& operator=(const TextResourceFinder&) = delete;

  [[nodiscard]] Callback callback() const;

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace jianying_probe
