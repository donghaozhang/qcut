#include "vision-person-segmentation.hpp"

#include "alpha-resize.hpp"

#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <ImageIO/CGImageProperties.h>
#import <Vision/Vision.h>

#include <stdexcept>
#include <string>
#include <utility>

namespace qcut::matting {
namespace {

std::runtime_error visionError(NSString *prefix, NSError *error) {
  const char *description =
      error ? error.localizedDescription.UTF8String : "unknown error";
  return std::runtime_error(std::string(prefix.UTF8String) + ": " +
                            description);
}

} // namespace

class VisionPersonSegmentation::Implementation {
public:
  Implementation(int sourceWidth, int sourceHeight)
      : width(sourceWidth), height(sourceHeight) {
    if (width <= 0 || height <= 0) {
      throw std::invalid_argument("invalid Vision segmentation dimensions");
    }
    if (@available(macOS 12.0, *)) {
      request = [[VNGeneratePersonSegmentationRequest alloc] init];
      if (!request) {
        throw std::runtime_error(
            "cannot create Vision person segmentation request");
      }
      request.qualityLevel =
          VNGeneratePersonSegmentationRequestQualityLevelAccurate;
      request.outputPixelFormat = kCVPixelFormatType_OneComponent8;
    } else {
      throw std::runtime_error(
          "Vision person segmentation requires macOS 12 or newer");
    }

    const NSDictionary *attributes = @{
      (NSString *)kCVPixelBufferCGImageCompatibilityKey :
          [NSNumber numberWithBool:YES],
      (NSString *)kCVPixelBufferCGBitmapContextCompatibilityKey :
          [NSNumber numberWithBool:YES],
    };
    const auto status = CVPixelBufferCreate(
        kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
        (CFDictionaryRef)attributes, &pixelBuffer);
    if (status != kCVReturnSuccess || !pixelBuffer) {
      [request release];
      request = nil;
      throw std::runtime_error("cannot allocate Vision input pixel buffer: " +
                               std::to_string(status));
    }
  }

  ~Implementation() {
    if (pixelBuffer) {
      CVPixelBufferRelease(pixelBuffer);
    }
    [request release];
  }

  std::vector<std::uint8_t>
  segment(const std::vector<std::uint8_t> &rgba) const {
    const auto expectedBytes = static_cast<std::size_t>(width) * height * 4;
    if (rgba.size() != expectedBytes) {
      throw std::invalid_argument(
          "RGBA dimensions do not match Vision segmentation");
    }

    @autoreleasepool {
      const auto lockStatus = CVPixelBufferLockBaseAddress(pixelBuffer, 0);
      if (lockStatus != kCVReturnSuccess) {
        throw std::runtime_error("cannot lock Vision input pixel buffer: " +
                                 std::to_string(lockStatus));
      }
      auto *destination = static_cast<std::uint8_t *>(
          CVPixelBufferGetBaseAddress(pixelBuffer));
      const auto destinationStride =
          CVPixelBufferGetBytesPerRow(pixelBuffer);
      for (int y = 0; y < height; ++y) {
        const auto *sourceRow =
            rgba.data() + static_cast<std::size_t>(y) * width * 4;
        auto *destinationRow = destination +
                               static_cast<std::size_t>(y) *
                                   destinationStride;
        for (int x = 0; x < width; ++x) {
          const auto sourceOffset = static_cast<std::size_t>(x) * 4;
          destinationRow[sourceOffset] = sourceRow[sourceOffset + 2];
          destinationRow[sourceOffset + 1] = sourceRow[sourceOffset + 1];
          destinationRow[sourceOffset + 2] = sourceRow[sourceOffset];
          destinationRow[sourceOffset + 3] = sourceRow[sourceOffset + 3];
        }
      }
      CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);

      NSError *error = nil;
      VNImageRequestHandler *handler = [[VNImageRequestHandler alloc]
          initWithCVPixelBuffer:pixelBuffer
                    orientation:kCGImagePropertyOrientationUp
                        options:@{}];
      if (!handler) {
        throw std::runtime_error("cannot create Vision image request handler");
      }
      const BOOL succeeded = [handler performRequests:@[ request ] error:&error];
      [handler release];
      if (!succeeded) {
        throw visionError(@"Vision person segmentation failed", error);
      }

      VNPixelBufferObservation *observation =
          (VNPixelBufferObservation *)request.results.firstObject;
      if (!observation) {
        throw std::runtime_error(
            "Vision person segmentation returned no mask");
      }
      CVPixelBufferRef maskBuffer = observation.pixelBuffer;
      if (CVPixelBufferGetPixelFormatType(maskBuffer) !=
          kCVPixelFormatType_OneComponent8) {
        throw std::runtime_error(
            "Vision person segmentation returned an unexpected mask format");
      }
      const auto maskLockStatus =
          CVPixelBufferLockBaseAddress(maskBuffer, kCVPixelBufferLock_ReadOnly);
      if (maskLockStatus != kCVReturnSuccess) {
        throw std::runtime_error("cannot lock Vision mask pixel buffer: " +
                                 std::to_string(maskLockStatus));
      }
      const int maskWidth =
          static_cast<int>(CVPixelBufferGetWidth(maskBuffer));
      const int maskHeight =
          static_cast<int>(CVPixelBufferGetHeight(maskBuffer));
      if (maskWidth <= 0 || maskHeight <= 0) {
        CVPixelBufferUnlockBaseAddress(maskBuffer,
                                       kCVPixelBufferLock_ReadOnly);
        throw std::runtime_error(
            "Vision person segmentation returned an empty mask");
      }
      const auto maskStride = CVPixelBufferGetBytesPerRow(maskBuffer);
      const auto *maskBase = static_cast<const std::uint8_t *>(
          CVPixelBufferGetBaseAddress(maskBuffer));
      std::vector<std::uint8_t> mask(
          static_cast<std::size_t>(maskWidth) * maskHeight);
      for (int y = 0; y < maskHeight; ++y) {
        const auto *sourceRow =
            maskBase + static_cast<std::size_t>(y) * maskStride;
        std::copy(sourceRow, sourceRow + maskWidth,
                  mask.begin() + static_cast<std::size_t>(y) * maskWidth);
      }
      CVPixelBufferUnlockBaseAddress(maskBuffer,
                                     kCVPixelBufferLock_ReadOnly);
      if (maskWidth == width && maskHeight == height) {
        return mask;
      }
      return resizeAlphaBilinear(mask, maskWidth, maskHeight, width, height);
    }
  }

private:
  int width;
  int height;
  VNGeneratePersonSegmentationRequest *request = nil;
  CVPixelBufferRef pixelBuffer = nullptr;
};

VisionPersonSegmentation::VisionPersonSegmentation(int width, int height)
    : implementation(std::make_unique<Implementation>(width, height)) {}

VisionPersonSegmentation::~VisionPersonSegmentation() = default;

VisionPersonSegmentation::VisionPersonSegmentation(
    VisionPersonSegmentation &&) noexcept = default;

VisionPersonSegmentation &VisionPersonSegmentation::operator=(
    VisionPersonSegmentation &&) noexcept = default;

std::vector<std::uint8_t> VisionPersonSegmentation::segment(
    const std::vector<std::uint8_t> &rgba) const {
  return implementation->segment(rgba);
}

} // namespace qcut::matting
