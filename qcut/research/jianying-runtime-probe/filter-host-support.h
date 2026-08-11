#pragma once

#import <AppKit/AppKit.h>

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace jianying_probe {

class OpenGlContext {
 public:
  OpenGlContext();
  ~OpenGlContext();

  OpenGlContext(const OpenGlContext&) = delete;
  OpenGlContext& operator=(const OpenGlContext&) = delete;

  void makeCurrent() const;
  void printCurrent(std::string_view stage) const;

 private:
  __strong NSOpenGLContext* context_ = nil;
};

class ModelCatalog {
 public:
  explicit ModelCatalog(const std::filesystem::path& directory);

  [[nodiscard]] char* resolve(const char* directory, const char* name) const;

 private:
  [[nodiscard]] static std::string_view modelFamily(
      const std::string& request);

  std::vector<std::string> paths_;
};

void activateModelCatalog(const ModelCatalog& catalog);
void deactivateModelCatalog(const ModelCatalog& catalog);

// RAII registration: deactivates on destruction, so the catalog cannot stay
// active when construction of whatever owns it throws part-way.
class CatalogRegistration {
 public:
  explicit CatalogRegistration(const ModelCatalog& catalog);
  ~CatalogRegistration();

  CatalogRegistration(const CatalogRegistration&) = delete;
  CatalogRegistration& operator=(const CatalogRegistration&) = delete;

 private:
  const ModelCatalog& catalog_;
};

// Called by the Jianying runtime through a C function pointer; an exception
// escaping here would unwind through frames that are not exception-aware.
char* findModelResource(void*, const char* directory, const char* name) noexcept;

}  // namespace jianying_probe
