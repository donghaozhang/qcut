#import "filter-host-support.h"

#import <OpenGL/OpenGL.h>

#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <stdexcept>

namespace jianying_probe {
namespace {

namespace fs = std::filesystem;

std::atomic<const ModelCatalog*> activeModelCatalog = nullptr;

}  // namespace

OpenGlContext::OpenGlContext() {
  const NSOpenGLPixelFormatAttribute attributes[] = {
      NSOpenGLPFAOpenGLProfile,
      NSOpenGLProfileVersion3_2Core,
      NSOpenGLPFAAccelerated,
      NSOpenGLPFAAllowOfflineRenderers,
      NSOpenGLPFAColorSize,
      32,
      NSOpenGLPFAAlphaSize,
      8,
      0,
  };
  NSOpenGLPixelFormat* pixelFormat =
      [[NSOpenGLPixelFormat alloc] initWithAttributes:attributes];
  if (pixelFormat == nil) {
    throw std::runtime_error("NSOpenGLPixelFormat creation failed");
  }
  context_ =
      [[NSOpenGLContext alloc] initWithFormat:pixelFormat shareContext:nil];
  if (context_ == nil) {
    throw std::runtime_error("NSOpenGLContext creation failed");
  }
  makeCurrent();
  printCurrent("created");
}

OpenGlContext::~OpenGlContext() {
  if ([NSOpenGLContext currentContext] == context_) {
    [NSOpenGLContext clearCurrentContext];
  }
  context_ = nil;
}

void OpenGlContext::makeCurrent() const {
  [context_ makeCurrentContext];
  if ([NSOpenGLContext currentContext] != context_ ||
      CGLGetCurrentContext() != context_.CGLContextObj) {
    throw std::runtime_error("NSOpenGLContext makeCurrentContext failed");
  }
}

void OpenGlContext::printCurrent(std::string_view stage) const {
  std::cerr << "[filter] " << stage << " NS context="
            << (__bridge void*)[NSOpenGLContext currentContext]
            << " CGL context=" << CGLGetCurrentContext() << '\n';
}

ModelCatalog::ModelCatalog(const fs::path& directory) {
  if (!fs::is_directory(directory)) {
    throw std::runtime_error("model directory does not exist: " +
                             directory.string());
  }
  for (const fs::directory_entry& entry : fs::directory_iterator(directory)) {
    if (entry.is_regular_file()) {
      paths_.push_back(entry.path().string());
    }
  }
  if (paths_.empty()) {
    throw std::runtime_error("model directory contains no files");
  }
  // Directory iteration order is unspecified; sort so the family prefix match
  // in resolve() picks the same model on every machine and run.
  std::sort(paths_.begin(), paths_.end());
}

char* ModelCatalog::resolve(const char* directory, const char* name) const {
  const std::string request =
      std::string(directory == nullptr ? "" : directory) + "/" +
      std::string(name == nullptr ? "" : name);
  const std::string_view family = modelFamily(request);
  if (family.empty()) {
    std::cerr << "[resource] unresolved request = " << request << '\n';
    return nullptr;
  }

  const auto match = std::find_if(
      paths_.begin(), paths_.end(), [family](const std::string& path) {
        const std::string filename = fs::path(path).filename().string();
        if (!filename.starts_with(family)) {
          return false;
        }
        return family != "tt_face_" ||
               !filename.starts_with("tt_face_extra_");
      });
  if (match == paths_.end()) {
    std::cerr << "[resource] missing family " << family
              << " for request = " << request << '\n';
    return nullptr;
  }

  const std::string resourceUrl = "file://" + *match;
  std::cerr << "[resource] " << request << " -> " << resourceUrl << '\n';
  char* result = static_cast<char*>(std::malloc(resourceUrl.size() + 1));
  if (result == nullptr) {
    return nullptr;
  }
  // Swing frees the callback result after copying the resolved path.
  std::memcpy(result, resourceUrl.c_str(), resourceUrl.size() + 1);
  return result;
}

std::string_view ModelCatalog::modelFamily(const std::string& request) {
  if (request.find("tt_skin_seg") != std::string::npos) {
    return "tt_skin_seg_";
  }
  if (request.find("tt_face_extra") != std::string::npos) {
    return "tt_face_extra_";
  }
  if (request.find("tt_face") != std::string::npos) {
    return "tt_face_";
  }
  return {};
}

void activateModelCatalog(const ModelCatalog& catalog) {
  const ModelCatalog* expected = nullptr;
  if (!activeModelCatalog.compare_exchange_strong(expected, &catalog)) {
    throw std::runtime_error(
        "only one filter resource catalog may be active per process");
  }
}

void deactivateModelCatalog(const ModelCatalog& catalog) {
  const ModelCatalog* expected = &catalog;
  static_cast<void>(
      activeModelCatalog.compare_exchange_strong(expected, nullptr));
}

CatalogRegistration::CatalogRegistration(const ModelCatalog& catalog)
    : catalog_(catalog) {
  activateModelCatalog(catalog_);
}

CatalogRegistration::~CatalogRegistration() {
  deactivateModelCatalog(catalog_);
}

char* findModelResource(void*, const char* directory,
                        const char* name) noexcept {
  const ModelCatalog* catalog = activeModelCatalog.load();
  if (catalog == nullptr) {
    return nullptr;
  }
  // resolve() allocates; an exception must not unwind into the foreign caller.
  try {
    return catalog->resolve(directory, name);
  } catch (const std::exception& error) {
    std::cerr << "[resource] resolve failed: " << error.what() << '\n';
    return nullptr;
  } catch (...) {
    std::cerr << "[resource] resolve failed with a non-standard exception\n";
    return nullptr;
  }
}

}  // namespace jianying_probe
