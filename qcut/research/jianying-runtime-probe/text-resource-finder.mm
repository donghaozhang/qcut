#include "text-resource-finder.h"

#include <atomic>
#include <cstring>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>

namespace jianying_probe {
namespace {

namespace fs = std::filesystem;

struct ResourceEntry {
  std::string type;
  std::string id;
  std::string path;
};

[[nodiscard]] std::string typedKey(const std::string& type,
                                   const std::string& id) {
  return type + '\0' + id;
}

[[nodiscard]] std::vector<ResourceEntry> readManifest(
    const fs::path& manifestPath) {
  if (manifestPath.empty()) return {};
  std::ifstream input(manifestPath);
  if (!input) {
    throw std::runtime_error("cannot open text resource manifest: " +
                             manifestPath.string());
  }
  std::vector<ResourceEntry> entries;
  std::string line;
  while (std::getline(input, line)) {
    if (line.empty()) continue;
    const std::size_t firstTab = line.find('\t');
    const std::size_t secondTab =
        firstTab == std::string::npos ? firstTab : line.find('\t', firstTab + 1);
    if (firstTab == std::string::npos || secondTab == std::string::npos) {
      throw std::runtime_error("invalid text resource manifest row");
    }
    ResourceEntry entry = {
        .type = line.substr(0, firstTab),
        .id = line.substr(firstTab + 1, secondTab - firstTab - 1),
        .path = line.substr(secondTab + 1),
    };
    if (entry.type.empty() || entry.id.empty() || entry.path.empty() ||
        !fs::is_directory(entry.path)) {
      throw std::runtime_error("invalid text resource manifest entry");
    }
    entries.push_back(std::move(entry));
  }
  if (!input.eof()) {
    throw std::runtime_error("cannot read text resource manifest");
  }
  return entries;
}

}  // namespace

class TextResourceFinder::Impl {
 public:
  explicit Impl(const fs::path& manifestPath)
      : entries_(readManifest(manifestPath)) {
    for (ResourceEntry& entry : entries_) {
      byId_.emplace(entry.id, &entry);
      byTypeAndId_.emplace(typedKey(entry.type, entry.id), &entry);
    }
    Impl* expected = nullptr;
    if (!active_.compare_exchange_strong(expected, this)) {
      throw std::runtime_error("only one text resource finder may be active");
    }
    std::cout << "[text-resource] mapped=" << entries_.size() << '\n';
  }

  ~Impl() {
    Impl* expected = this;
    static_cast<void>(active_.compare_exchange_strong(expected, nullptr));
  }

  [[nodiscard]] bool empty() const { return entries_.empty(); }

  [[nodiscard]] static char* callback(void*, const char* first,
                                      const char* second) {
    Impl* active = active_.load();
    if (active == nullptr) return ::strdup("");
    return active->find(first == nullptr ? "" : first,
                        second == nullptr ? "" : second);
  }

 private:
  [[nodiscard]] char* find(const char* first, const char* second) const {
    const std::string firstValue(first);
    const std::string secondValue(second);
    const ResourceEntry* entry = nullptr;
    const auto exact = byTypeAndId_.find(typedKey(firstValue, secondValue));
    if (exact != byTypeAndId_.end()) entry = exact->second;
    if (entry == nullptr) {
      const auto reversed =
          byTypeAndId_.find(typedKey(secondValue, firstValue));
      if (reversed != byTypeAndId_.end()) entry = reversed->second;
    }
    if (entry == nullptr) {
      const auto firstId = byId_.find(firstValue);
      if (firstId != byId_.end()) entry = firstId->second;
    }
    if (entry == nullptr) {
      const auto secondId = byId_.find(secondValue);
      if (secondId != byId_.end()) entry = secondId->second;
    }
    std::cout << "[text-resource] request first=\"" << firstValue
              << "\" second=\"" << secondValue << "\" result="
              << (entry == nullptr ? "<missing>" : entry->path) << '\n';
    const char* resolved = entry == nullptr
                               ? (*second == '\0' ? first : second)
                               : entry->path.c_str();
    // transfer; the runtime frees every returned path
    return ::strdup(resolved);
  }

  std::vector<ResourceEntry> entries_;
  std::unordered_map<std::string, const ResourceEntry*> byId_;
  std::unordered_map<std::string, const ResourceEntry*> byTypeAndId_;
  static std::atomic<Impl*> active_;
};

std::atomic<TextResourceFinder::Impl*> TextResourceFinder::Impl::active_ =
    nullptr;

TextResourceFinder::TextResourceFinder(const fs::path& manifestPath)
    : impl_(std::make_unique<Impl>(manifestPath)) {}

TextResourceFinder::~TextResourceFinder() = default;

TextResourceFinder::Callback TextResourceFinder::callback() const {
  return impl_->empty() ? nullptr : &Impl::callback;
}

}  // namespace jianying_probe
