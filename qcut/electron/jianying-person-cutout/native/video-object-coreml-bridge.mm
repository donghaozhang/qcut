#include "alpha-refinement.hpp"
#include "video-object-coreml-preprocess.hpp"

#import <CoreML/CoreML.h>
#import <Foundation/Foundation.h>

#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr int kModelDimension = 256;

int parsePositiveInteger(const char *text, const char *label) {
  const int value = std::stoi(text);
  if (value <= 0 || value > 8192) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
  return value;
}

std::size_t readAll(int fileDescriptor, std::uint8_t *data, std::size_t size) {
  std::size_t bytesRead = 0;
  while (bytesRead < size) {
    const auto result = ::read(fileDescriptor, data + bytesRead, size - bytesRead);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result < 0) {
      throw std::runtime_error("cannot read video-object RGBA input");
    }
    if (result == 0) {
      break;
    }
    bytesRead += static_cast<std::size_t>(result);
  }
  return bytesRead;
}

void writeAll(int fileDescriptor, const std::uint8_t *data, std::size_t size) {
  std::size_t written = 0;
  while (written < size) {
    const auto result = ::write(fileDescriptor, data + written, size - written);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result <= 0) {
      throw std::runtime_error("cannot write video-object Alpha output");
    }
    written += static_cast<std::size_t>(result);
  }
}

std::set<std::size_t> resetFrames() {
  std::set<std::size_t> frames;
  const char *configured = std::getenv("QCUT_VIDEO_OBJECT_RESET_FRAMES");
  if (configured == nullptr || configured[0] == '\0') {
    return frames;
  }
  std::string values(configured);
  std::size_t offset = 0;
  while (offset < values.size()) {
    const std::size_t separator = values.find(',', offset);
    const std::string value = values.substr(offset, separator - offset);
    const long long frame = std::stoll(value);
    if (frame < 0) {
      throw std::runtime_error("video-object reset frame cannot be negative");
    }
    frames.insert(static_cast<std::size_t>(frame));
    if (separator == std::string::npos) {
      break;
    }
    offset = separator + 1;
  }
  return frames;
}

class CoreMLVideoObjectModel {
public:
  explicit CoreMLVideoObjectModel(const char *modelPath) {
    @autoreleasepool {
      NSError *error = nil;
      MLModelConfiguration *configuration = [MLModelConfiguration new];
      configuration.computeUnits = MLComputeUnitsAll;
      NSURL *modelUrl = [NSURL fileURLWithPath:@(modelPath)];
      model_ = [MLModel modelWithContentsOfURL:modelUrl
                                 configuration:configuration
                                         error:&error];
      if (model_ == nil) {
        throw std::runtime_error(
            "cannot load video-object CoreML model: " +
            std::string(error.localizedDescription.UTF8String ?: "unknown"));
      }
      current_ = createArray(@[@1, @3, @256, @256]);
      previousImage_ = createArray(@[@1, @3, @256, @256]);
      previousMask_ = createArray(@[@1, @1, @256, @256]);
    }
  }

  std::vector<std::uint8_t>
  process(const std::vector<std::uint8_t> &rgba, int width, int height) {
    @autoreleasepool {
      const auto current =
          qcut::matting::prepareVideoObjectCoreMLInput(rgba, width, height);
      copyToArray(current.data(), current.size(), current_);
      copyToArray(temporalState_.previousImage(), current.size(),
                  previousImage_);
      copyToArray(temporalState_.previousMask(),
                  qcut::matting::VideoObjectCoreMLTemporalState::
                      kMaskElementCount,
                  previousMask_);

      NSError *error = nil;
      MLDictionaryFeatureProvider *input =
          [[MLDictionaryFeatureProvider alloc]
              initWithDictionary:@{
                @"data" : [MLFeatureValue featureValueWithMultiArray:current_],
                @"prev_img" :
                    [MLFeatureValue featureValueWithMultiArray:previousImage_],
                @"prev_mask" :
                    [MLFeatureValue featureValueWithMultiArray:previousMask_]
              }
                          error:&error];
      if (input == nil) {
        throwCoreMLError("cannot create video-object CoreML input", error);
      }
      id<MLFeatureProvider> prediction = [model_ predictionFromFeatures:input
                                                                  error:&error];
      if (prediction == nil) {
        throwCoreMLError("video-object CoreML inference failed", error);
      }
      MLMultiArray *output = [prediction featureValueForName:@"nn_3"].multiArrayValue;
      if (output == nil || output.dataType != MLMultiArrayDataTypeFloat32 ||
          output.count != kModelDimension * kModelDimension) {
        throw std::runtime_error("video-object CoreML output shape is invalid");
      }
      const auto *mask = static_cast<const float *>(output.dataPointer);
      temporalState_.advance(current.data(), mask);
      return qcut::matting::finalizeVideoObjectCoreMLOutput(mask, width,
                                                            height);
    }
  }

  void reset() { temporalState_.reset(); }

private:
  static MLMultiArray *createArray(NSArray<NSNumber *> *shape) {
    NSError *error = nil;
    MLMultiArray *array = [[MLMultiArray alloc] initWithShape:shape
                                                   dataType:MLMultiArrayDataTypeFloat32
                                                      error:&error];
    if (array == nil) {
      throwCoreMLError("cannot allocate video-object CoreML tensor", error);
    }
    return array;
  }

  static void copyToArray(const float *source, std::size_t count,
                          MLMultiArray *target) {
    if (target.count != static_cast<NSInteger>(count)) {
      throw std::runtime_error("video-object CoreML tensor size is invalid");
    }
    std::copy_n(source, count, static_cast<float *>(target.dataPointer));
  }

  [[noreturn]] static void throwCoreMLError(const char *message,
                                            NSError *error) {
    throw std::runtime_error(
        std::string(message) + ": " +
        std::string(error.localizedDescription.UTF8String ?: "unknown"));
  }

  MLModel *model_ = nil;
  MLMultiArray *current_ = nil;
  MLMultiArray *previousImage_ = nil;
  MLMultiArray *previousMask_ = nil;
  qcut::matting::VideoObjectCoreMLTemporalState temporalState_;
};

} // namespace

int main(int argc, char **argv) {
  if (argc != 10) {
    std::cerr << "usage: video-object-coreml-bridge <model.mlmodelc> "
                 "<input.rgba|-> <width> <height> <output.gray|-> "
                 "<threshold> <temporal-smoothing> <edge-shift> <feather>\n";
    return 2;
  }
  try {
    const int width = parsePositiveInteger(argv[3], "width");
    const int height = parsePositiveInteger(argv[4], "height");
    const float threshold = std::clamp(std::stof(argv[6]), 0.0F, 1.0F);
    const float temporalSmoothing =
        std::clamp(std::stof(argv[7]), 0.0F, 0.95F);
    const float edgeShift = std::clamp(std::stof(argv[8]), -12.0F, 12.0F);
    const float feather = std::clamp(std::stof(argv[9]), 0.0F, 16.0F);
    const std::size_t frameBytes =
        static_cast<std::size_t>(width) * height * 4;
    const bool streamInput = std::string(argv[2]) == "-";
    const bool streamOutput = std::string(argv[5]) == "-";

    std::unique_ptr<std::ifstream> inputFile;
    std::istream *input = &std::cin;
    std::size_t expectedFrameCount = 0;
    if (!streamInput) {
      inputFile = std::make_unique<std::ifstream>(argv[2],
                                                  std::ios::binary | std::ios::ate);
      if (!*inputFile) {
        throw std::runtime_error("cannot open video-object RGBA input");
      }
      const auto inputBytes = inputFile->tellg();
      if (inputBytes <= 0 ||
          static_cast<std::size_t>(inputBytes) % frameBytes != 0) {
        throw std::runtime_error("video-object input has incomplete frames");
      }
      expectedFrameCount = static_cast<std::size_t>(inputBytes) / frameBytes;
      inputFile->seekg(0);
      input = inputFile.get();
    }

    std::unique_ptr<std::ofstream> outputFile;
    int outputDescriptor = -1;
    if (streamOutput) {
      outputDescriptor = ::dup(STDOUT_FILENO);
      if (outputDescriptor < 0 || ::dup2(STDERR_FILENO, STDOUT_FILENO) < 0) {
        throw std::runtime_error("cannot isolate video-object Alpha output");
      }
    } else {
      outputFile = std::make_unique<std::ofstream>(argv[5], std::ios::binary);
      if (!*outputFile) {
        throw std::runtime_error("cannot open video-object Alpha output");
      }
    }

    const auto stateResetFrames = resetFrames();
    CoreMLVideoObjectModel model(argv[1]);
    std::vector<std::uint8_t> source(frameBytes);
    std::vector<float> refinementState;
    std::size_t frameCount = 0;
    while (true) {
      std::size_t bytesRead = 0;
      if (streamInput) {
        bytesRead = readAll(STDIN_FILENO, source.data(), source.size());
      } else {
        input->read(reinterpret_cast<char *>(source.data()), source.size());
        bytesRead = static_cast<std::size_t>(input->gcount());
      }
      if (bytesRead == 0) {
        break;
      }
      if (bytesRead != frameBytes) {
        throw std::runtime_error("video-object input ended mid-frame");
      }
      if (stateResetFrames.contains(frameCount)) {
        model.reset();
        refinementState.clear();
        std::cerr << "state_reset frame=" << frameCount << '\n';
      }
      const auto rawAlpha = model.process(source, width, height);
      const auto alpha = qcut::matting::refineAlpha(
          rawAlpha, refinementState, width, height, threshold,
          temporalSmoothing, edgeShift, feather);
      if (streamOutput) {
        writeAll(outputDescriptor, alpha.data(), alpha.size());
      } else {
        outputFile->write(reinterpret_cast<const char *>(alpha.data()),
                          alpha.size());
        if (!*outputFile) {
          throw std::runtime_error("cannot write video-object Alpha frame");
        }
      }
      ++frameCount;
      std::cerr << "progress frame=" << frameCount
                << " total=" << expectedFrameCount << '\n';
    }
    if (frameCount == 0 ||
        (expectedFrameCount > 0 && frameCount != expectedFrameCount)) {
      throw std::runtime_error("video-object input did not contain complete frames");
    }
    if (outputDescriptor >= 0) {
      ::close(outputDescriptor);
    }
    std::cerr << "ok width=" << width << " height=" << height
              << " frames=" << frameCount
              << " route=video-object-same-model-coreml-v1\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
