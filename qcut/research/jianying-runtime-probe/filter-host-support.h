#pragma once

#import <AppKit/AppKit.h>

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace jianying_probe {

/**
 * CV packages that need face tracking only receive an algorithm input when the
 * render runs inside the runtime's own image-processing GL context; a
 * standalone `NSOpenGLContext` leaves face detection reporting zero faces. The
 * engine context is therefore preferred, and the standalone context stays as
 * the fallback for runtimes that do not expose one.
 */
class OpenGlContext {
 public:
  /**
   * `runtimeRoot` lets the context load the effect core first and adopt the
   * engine context instead of ever creating a standalone one. Pass an empty
   * path to force the standalone context.
   */
  explicit OpenGlContext(const std::filesystem::path& runtimeRoot);
  ~OpenGlContext();

  OpenGlContext(const OpenGlContext&) = delete;
  OpenGlContext& operator=(const OpenGlContext&) = delete;

  void makeCurrent() const;
  void printCurrent(std::string_view stage) const;

 private:
  /** Runtime-owned `HTSGLContext`; nil when the standalone context is in use. */
  __strong id engineContext_ = nil;
  __strong NSOpenGLContext* context_ = nil;
};

class ModelCatalog {
 public:
  explicit ModelCatalog(const std::filesystem::path& directory,
                        bool preferExactFilename = false);

  [[nodiscard]] char* resolve(const char* directory, const char* name) const;

 private:
  [[nodiscard]] static std::string_view modelFamily(
      const std::string& request);

  std::vector<std::string> paths_;
  bool preferExactFilename_;
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
