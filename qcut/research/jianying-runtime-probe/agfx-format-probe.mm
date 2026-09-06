#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <CommonCrypto/CommonDigest.h>
#include <dlfcn.h>
#include <mach-o/loader.h>
#include <uuid/uuid.h>

#include <array>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

constexpr char kLibrarySha256[] =
    "4fa8758d914743dc682f8f1f9e667f1cc0b429cd2bd7437a25cdec7d4d7489aa";
constexpr char kArm64Uuid[] = "408EB610-AD47-3846-9595-14B6A3ABF537";
constexpr std::uintptr_t kMetalFormatConverter = 0x8b6e4;
constexpr std::uint64_t kUnwritten = 0x123456789abcdef0ULL;

struct LibraryRequest {
  const char* path;
};

struct FormatRequest {
  int format;
  MTLPixelFormat expected;
  const char* name;
  bool supported;
};

struct LibraryIdentity {
  void* handle;
  const std::uint8_t* base;
  NSString* sha256;
  NSString* uuid;
};

NSString* hashLibrary(const LibraryRequest& request) {
  NSData* data = [NSData dataWithContentsOfFile:@(request.path)
                                      options:NSDataReadingMappedIfSafe
                                        error:nil];
  if (!data || data.length > UINT32_MAX) {
    throw std::runtime_error("Cannot read bounded library file.");
  }
  std::array<unsigned char, CC_SHA256_DIGEST_LENGTH> digest{};
  CC_SHA256(data.bytes, static_cast<CC_LONG>(data.length), digest.data());
  NSMutableString* hash = [NSMutableString string];
  for (const auto byte : digest) {
    [hash appendFormat:@"%02x", byte];
  }
  return hash;
}

LibraryIdentity loadVerifiedLibrary(const LibraryRequest& request) {
  const auto hash = hashLibrary(request);
  if (![hash isEqualToString:@(kLibrarySha256)]) {
    throw std::runtime_error("Unknown libAGFX SHA-256; refusing private ABI.");
  }
  void* handle = dlopen(request.path, RTLD_NOW | RTLD_LOCAL);
  if (!handle) {
    throw std::runtime_error(dlerror());
  }
  Dl_info image{};
  void* anchor = dlsym(
      handle, "_ZN13AmazingEngine8GPDevice12createDeviceENS_12RendererTypeEj");
  if (!anchor || !dladdr(anchor, &image)) {
    throw std::runtime_error("Cannot identify loaded AGFX image.");
  }
  if (![hashLibrary({image.dli_fname}) isEqualToString:hash]) {
    throw std::runtime_error("Loaded AGFX image differs from requested file.");
  }
  const auto* header = static_cast<const mach_header_64*>(image.dli_fbase);
  if (header->magic != MH_MAGIC_64 || header->cputype != CPU_TYPE_ARM64) {
    throw std::runtime_error("Probe requires the verified arm64 slice.");
  }
  const auto* begin = reinterpret_cast<const std::uint8_t*>(header + 1);
  const auto* cursor = begin;
  const auto* end = begin + header->sizeofcmds;
  NSString* foundUuid = nil;
  for (std::uint32_t index = 0; index < header->ncmds; ++index) {
    if (cursor > end || static_cast<std::size_t>(end - cursor) < sizeof(load_command)) {
      throw std::runtime_error("Truncated loaded Mach-O command.");
    }
    const auto* command = reinterpret_cast<const load_command*>(cursor);
    if (command->cmdsize < sizeof(load_command) ||
        command->cmdsize > static_cast<std::size_t>(end - cursor)) {
      throw std::runtime_error("Invalid loaded Mach-O command size.");
    }
    if (command->cmd == LC_UUID) {
      if (command->cmdsize < sizeof(uuid_command)) {
        throw std::runtime_error("Truncated loaded UUID command.");
      }
      const auto* uuid = reinterpret_cast<const uuid_command*>(command);
      std::array<char, 37> text{};
      uuid_unparse_upper(uuid->uuid, text.data());
      foundUuid = @(text.data());
    }
    cursor += command->cmdsize;
  }
  if (![foundUuid isEqualToString:@(kArm64Uuid)]) {
    throw std::runtime_error("Unknown libAGFX arm64 UUID; refusing private ABI.");
  }
  return {handle, static_cast<const std::uint8_t*>(image.dli_fbase), hash, foundUuid};
}

struct ProbeRequest {
  const LibraryIdentity& library;
  id<MTLDevice> device;
};

NSDictionary* probeFormats(const ProbeRequest& request) {
  // This converter's first argument is the enum, not a renderer object.
  using ConvertFormat = bool (*)(int, std::uint64_t*);
  const auto convert = reinterpret_cast<ConvertFormat>(
      const_cast<std::uint8_t*>(request.library.base) + kMetalFormatConverter);
  const std::array<FormatRequest, 7> cases{{
      {43, MTLPixelFormatRGBA8Unorm, "RGBA8Unorm", true},
      {50, MTLPixelFormatBGRA8Unorm, "BGRA8Unorm", true},
      {97, MTLPixelFormatRGBA16Unorm, "RGBA16Unorm", true},
      {128, MTLPixelFormatRG11B10Float, "RG11B10Float", true},
      {127, MTLPixelFormatInvalid, "unsupported", false},
      {0, MTLPixelFormatInvalid, "unsupported", false},
      {206, MTLPixelFormatInvalid, "unsupported", false},
  }};
  NSMutableArray* rows = [NSMutableArray array];
  for (const auto& sample : cases) {
    std::uint64_t output = kUnwritten;
    const bool supported = convert(sample.format, &output);
    const bool conversionPassed = supported == sample.supported &&
        output == (supported ? static_cast<std::uint64_t>(sample.expected) : kUnwritten);
    bool textureCreated = false;
    if (supported && conversionPassed) {
      auto descriptor = [MTLTextureDescriptor
          texture2DDescriptorWithPixelFormat:static_cast<MTLPixelFormat>(output)
                                     width:4
                                    height:3
                                 mipmapped:NO];
      descriptor.storageMode = MTLStorageModeShared;
      descriptor.usage = MTLTextureUsageShaderRead | MTLTextureUsageRenderTarget;
      id<MTLTexture> texture = [request.device newTextureWithDescriptor:descriptor];
      textureCreated = texture && texture.pixelFormat == output;
    }
    const bool passed = conversionPassed && (!supported || textureCreated);
    [rows addObject:@{
      @"agfxFormat": @(sample.format),
      @"supported": @(supported),
      @"metalFormat": supported ? @(output) : [NSNull null],
      @"expectedName": @(sample.name),
      @"outputUnchanged": @(output == kUnwritten),
      @"appleTextureCreated": @(textureCreated),
      @"passed": @(passed),
    }];
    if (!passed) {
      throw std::runtime_error("AGFX format contract mismatch for " +
          std::to_string(sample.format) + ": output=" + std::to_string(output) +
          ", expected=" + std::to_string(sample.expected));
    }
  }
  return @{
    @"status": @"ok",
    @"librarySha256": request.library.sha256,
    @"arm64Uuid": request.library.uuid,
    @"converterOffset": @"0x8b6e4",
    @"device": request.device.name,
    @"scope": @"AGFX conversion plus Apple texture allocation; no effect render",
    @"cases": rows,
  };
}

}  // namespace

int main(int argc, const char* argv[]) {
  @autoreleasepool {
    try {
      if (argc != 2 || argv[1][0] != '/') {
        throw std::runtime_error("Usage: agfx-format-probe /absolute/path/libAGFX.dylib");
      }
      const auto library = loadVerifiedLibrary({argv[1]});
      id<MTLDevice> device = MTLCreateSystemDefaultDevice();
      if (!device) {
        throw std::runtime_error("No Metal device available.");
      }
      const auto report = probeFormats({library, device});
      NSData* data = [NSJSONSerialization dataWithJSONObject:report
                                                   options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys
                                                     error:nil];
      if (!data) {
        throw std::runtime_error("Cannot encode probe report.");
      }
      std::cout.write(static_cast<const char*>(data.bytes), data.length);
      std::cout << '\n';
      // Keep the diagnostic image resident until exit; dyld owns transitive initializers.
      return 0;
    } catch (const std::exception& error) {
      std::cerr << error.what() << '\n';
      return 1;
    }
  }
}
