#import "filter-host-support.h"

#import <OpenGL/OpenGL.h>

#include "probe-utils.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <stdexcept>

@protocol QCutHostGlContextFactory
+ (void)preloadGLContext;
+ (id)defaultImageProcessingContext;
+ (id)sharedImageProcessingContext;
+ (id)shareProcesingContext;
@end

@protocol QCutHostGlContext
- (void)bind:(BOOL)force;
- (void)unbind;
- (void*)getCppContext;
@end

namespace jianying_probe {
namespace {

namespace fs = std::filesystem;

/**
 * Isolation switch for the engine context. Unset means "use the engine context
 * when the runtime exposes one", which is what a real render needs; setting it
 * to 0 restores the previous standalone-context behaviour for A/B runs.
 */
[[nodiscard]] bool engineGlContextEnabled() {
  const char* value = std::getenv("JY_FILTER_ENGINE_GL_CONTEXT");
  if (value == nullptr) return true;
  const std::string_view flag(value);
  if (flag == "1") return true;
  if (flag == "0") return false;
  throw std::runtime_error("JY_FILTER_ENGINE_GL_CONTEXT must be 0 or 1");
}

/**
 * Returns the runtime's shared image-processing context, or nil when this
 * runtime does not publish one. A context whose C++ side is null is rejected:
 * binding it would silently render without an algorithm input.
 */
[[nodiscard]] id resolveEngineGlContext() {
  Class<QCutHostGlContextFactory> contextClass =
      NSClassFromString(@"HTSGLContext");
  if (contextClass == Nil) return nil;
  [contextClass preloadGLContext];
  id candidate = [contextClass sharedImageProcessingContext];
  if (candidate == nil) candidate = [contextClass shareProcesingContext];
  if (candidate == nil) candidate = [contextClass defaultImageProcessingContext];
  if (candidate == nil) return nil;
  if ([static_cast<id<QCutHostGlContext>>(candidate) getCppContext] == nullptr) {
    return nil;
  }
  return candidate;
}

std::atomic<const ModelCatalog*> activeModelCatalog = nullptr;

char* copyResourceUrl(std::string_view resourceUrl) {
  char* result = static_cast<char*>(std::malloc(resourceUrl.size() + 1));
  if (result == nullptr) return nullptr;
  std::memcpy(result, resourceUrl.data(), resourceUrl.size());
  result[resourceUrl.size()] = '\0';
  return result;
}

}  // namespace

OpenGlContext::OpenGlContext(const fs::path& runtimeRoot) {
  if (engineGlContextEnabled() && !runtimeRoot.empty()) {
    // `HTSGLContext` ships inside the effect core, so the core is loaded first;
    // the later symbol load reuses this same handle. A standalone context is
    // never created in this branch — face tracking stays dark if the runtime
    // has already bound its GL state to a foreign context.
    static_cast<void>(
        openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib"));
    [NSApplication sharedApplication];
    engineContext_ = resolveEngineGlContext();
    if (engineContext_ != nil) {
      makeCurrent();
      printCurrent("engine");
      return;
    }
    std::cerr << "[filter] engine GL context unavailable; CV packages that "
                 "need face tracking will not receive an algorithm input\n";
  }
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
  if (engineContext_ != nil) {
    // The engine owns this context and may hand it to another consumer, so it
    // is released rather than torn down.
    [static_cast<id<QCutHostGlContext>>(engineContext_) unbind];
    engineContext_ = nil;
    return;
  }
  if ([NSOpenGLContext currentContext] == context_) {
    [NSOpenGLContext clearCurrentContext];
  }
  context_ = nil;
}

void OpenGlContext::makeCurrent() const {
  if (engineContext_ != nil) {
    [static_cast<id<QCutHostGlContext>>(engineContext_) bind:YES];
    return;
  }
  [context_ makeCurrentContext];
  if ([NSOpenGLContext currentContext] != context_ ||
      CGLGetCurrentContext() != context_.CGLContextObj) {
    throw std::runtime_error("NSOpenGLContext makeCurrentContext failed");
  }
}

void OpenGlContext::printCurrent(std::string_view stage) const {
  std::cerr << "[filter] " << stage
            << (engineContext_ != nil ? " engine" : " standalone")
            << " NS context=" << (__bridge void*)[NSOpenGLContext currentContext]
            << " CGL context=" << CGLGetCurrentContext() << '\n';
}

ModelCatalog::ModelCatalog(const fs::path& directory, bool preferExactFilename)
    : preferExactFilename_(preferExactFilename) {
  // Weights live in two places with different shapes: the user's download
  // cache is flat, while the app bundle nests them one level down in
  // per-family folders (headsegmodel/, ttfacemodel/, …). Indexing only one of
  // them, or only its top level, makes present models look absent — so the
  // argument is a delimiter-separated list and every root is walked in full.
  std::vector<fs::path> roots;
  const std::string list = directory.string();
  for (std::size_t start = 0; start <= list.size();) {
    const std::size_t end = list.find(':', start);
    const std::string piece =
        list.substr(start, end == std::string::npos ? std::string::npos
                                                   : end - start);
    if (!piece.empty()) roots.emplace_back(piece);
    if (end == std::string::npos) break;
    start = end + 1;
  }

  for (const fs::path& root : roots) {
    // Every filesystem query goes through the error_code overloads:
    // skip_permission_denied only quiets the iterator's own EACCES, not
    // is_directory/is_regular_file status probes or traversal failures
    // (disappearing entries, unreadable mounts). A throwing call on one
    // root must not stop the later roots from being scanned.
    std::error_code rootError;
    if (!fs::is_directory(root, rootError) || rootError) continue;
    fs::recursive_directory_iterator iterator(
        root, fs::directory_options::skip_permission_denied, rootError);
    if (rootError) continue;
    std::vector<std::string> rootPaths;
    const fs::recursive_directory_iterator end;
    while (iterator != end) {
      const fs::directory_entry& entry = *iterator;
      std::error_code entryError;
      if (entry.is_regular_file(entryError) && !entryError) {
        rootPaths.push_back(entry.path().string());
      }
      iterator.increment(entryError);
      if (entryError) break;
    }
    std::sort(rootPaths.begin(), rootPaths.end());
    paths_.insert(paths_.end(), rootPaths.begin(), rootPaths.end());
  }
  if (paths_.empty()) {
    throw std::runtime_error("model directory contains no files: " +
                             directory.string());
  }
  // Root order is the compatibility policy (private snapshot before app
  // fallbacks); sorting only within each root keeps resolution deterministic
  // without allowing /Applications to outrank the caller's first choice.
}

char* ModelCatalog::resolve(const char* directory, const char* name) const {
  const std::string request =
      std::string(directory == nullptr ? "" : directory) + "/" +
      std::string(name == nullptr ? "" : name);
  // Resolution is attempted before giving up on an unknown family: most CV
  // models (tt_matting, tt_skeleton, …) have no family rule and would
  // otherwise go unanswered, and an unanswered request crashes the runtime.
  const std::string_view family = modelFamily(request);
  auto match = paths_.end();
  std::string_view resolution = "family fallback";
  if (preferExactFilename_ && name != nullptr) {
    const fs::path requestedFilename = fs::path(name).filename();
    match = std::find_if(
        paths_.begin(), paths_.end(),
        [&requestedFilename](const std::string& path) {
          return fs::path(path).filename() == requestedFilename;
        });
    if (match != paths_.end()) {
      resolution = "exact filename";
    }
  }
  // Disk names are <stem>_v<major>.<minor>_size<N>_md5<hash>.model while the
  // runtime asks for <stem>[_v<major>.<minor>].model, and the version it asks
  // for is often not the one installed. Matching the bare stem is what keeps a
  // request for tt_matting from binding tt_matting_large, which renders a
  // plausible-looking but wrong result instead of failing.
  if (match == paths_.end() && name != nullptr) {
    std::string stem = fs::path(name).filename().string();
    if (stem.ends_with(".model")) {
      stem = stem.substr(0, stem.size() - 6);
    }
    const std::size_t versionAt = stem.rfind("_v");
    if (versionAt != std::string::npos && versionAt + 2 < stem.size() &&
        std::isdigit(static_cast<unsigned char>(stem[versionAt + 2]))) {
      stem = stem.substr(0, versionAt);
    }
    const std::string wanted = stem + "_v";
    match = std::find_if(paths_.begin(), paths_.end(),
                         [&wanted](const std::string& path) {
                           return fs::path(path).filename().string().starts_with(
                               wanted);
                         });
    if (match != paths_.end()) {
      resolution = "stem match";
    }
  }
  if (match == paths_.end() && !family.empty()) {
    match = std::find_if(
        paths_.begin(), paths_.end(), [family](const std::string& path) {
          const std::string filename = fs::path(path).filename().string();
          if (!filename.starts_with(family)) {
            return false;
          }
          return family != "tt_face_" ||
                 !filename.starts_with("tt_face_extra_");
        });
  }
  if (match == paths_.end()) {
    constexpr std::string_view kEmptyModelUrl = "file:///dev/null";
    std::cerr << "[resource] unresolved request = " << request
              << "; returning empty model sentinel\n";
    return copyResourceUrl(kEmptyModelUrl);
  }

  const std::string resourceUrl = "file://" + *match;
  std::cerr << "[resource] " << request << " -> " << resourceUrl << " ("
            << resolution << ")\n";
  // Swing frees the callback result after copying the resolved path.
  return copyResourceUrl(resourceUrl);
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
