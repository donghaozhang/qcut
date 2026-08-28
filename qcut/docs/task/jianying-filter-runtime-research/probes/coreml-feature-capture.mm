#import <CoreML/CoreML.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

#include <atomic>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <string>

namespace {

using Prediction = id<MLFeatureProvider> (*)(
    id, SEL, id<MLFeatureProvider>, MLPredictionOptions *, NSError **);
using DictionaryInitializer = id (*)(id, SEL, NSDictionary *, NSError **);

Prediction originalPrediction = nullptr;
DictionaryInitializer originalDictionaryInitializer = nullptr;
std::atomic<unsigned int> captureIndex = 0;
std::mutex outputMutex;

std::filesystem::path captureDirectory() {
  const char *configured = std::getenv("JY_COREML_CAPTURE_DIR");
  return configured == nullptr
             ? std::filesystem::path("/tmp/jy-coreml-capture")
             : std::filesystem::path(configured);
}

void appendLog(const std::string &line) {
  std::lock_guard lock(outputMutex);
  std::error_code error;
  const auto directory = captureDirectory();
  std::filesystem::create_directories(directory, error);
  if (error) {
    return;
  }
  std::ofstream output(directory / "capture.log", std::ios::app);
  output << line << '\n';
}

bool isTargetModelInput(id<MLFeatureProvider> features) {
  const NSSet<NSString *> *names = features.featureNames;
  return [names containsObject:@"data"] && [names containsObject:@"prev_img"] &&
         [names containsObject:@"prev_mask"];
}

void writeArray(MLMultiArray *array, unsigned int index, NSString *name) {
  if (array == nil) {
    appendLog("missing tensor " + std::string(name.UTF8String));
    return;
  }
  std::string shape;
  for (NSNumber *dimension in array.shape) {
    if (!shape.empty()) {
      shape += 'x';
    }
    shape += std::to_string(dimension.longLongValue);
  }
  appendLog("coreml[" + std::to_string(index) + "] " +
            std::string(name.UTF8String) + " type=" +
            std::to_string(array.dataType) + " shape=" + shape +
            " count=" + std::to_string(array.count));
  if (array.dataType != MLMultiArrayDataTypeFloat32 || array.dataPointer == nullptr) {
    return;
  }
  char filename[128];
  std::snprintf(filename, sizeof(filename), "coreml-%04u-%s.bin", index,
                name.UTF8String);
  const std::filesystem::path outputPath = captureDirectory() / filename;
  std::ofstream output(outputPath, std::ios::binary);
  output.write(static_cast<const char *>(array.dataPointer),
               static_cast<std::streamsize>(array.count * sizeof(float)));
  if (!output.good()) {
    appendLog("failed to write " + outputPath.string());
  }
}

void writeFeature(id<MLFeatureProvider> features, unsigned int index,
                  NSString *name) {
  writeArray([features featureValueForName:name].multiArrayValue, index, name);
}

id captureDictionaryInitializer(id object, SEL selector,
                                NSDictionary *features, NSError **error) {
  id result = originalDictionaryInitializer(object, selector, features, error);
  if (features[@"data"] == nil || features[@"prev_img"] == nil ||
      features[@"prev_mask"] == nil) {
    return result;
  }
  const unsigned int index = captureIndex.fetch_add(1);
  for (NSString *name in @[@"data", @"prev_img", @"prev_mask"]) {
    MLFeatureValue *value = features[name];
    writeArray(value.multiArrayValue, index, name);
  }
  return result;
}

id<MLFeatureProvider> capturePrediction(id model, SEL selector,
                                        id<MLFeatureProvider> features,
                                        MLPredictionOptions *options,
                                        NSError **error) {
  if (!isTargetModelInput(features)) {
    return originalPrediction(model, selector, features, options, error);
  }
  const unsigned int index = captureIndex.fetch_add(1);
  writeFeature(features, index, @"data");
  writeFeature(features, index, @"prev_img");
  writeFeature(features, index, @"prev_mask");
  id<MLFeatureProvider> result =
      originalPrediction(model, selector, features, options, error);
  if (result != nil) {
    writeFeature(result, index, @"nn_3");
  }
  return result;
}

__attribute__((constructor)) void installCapture() {
  const SEL predictionSelector =
      @selector(predictionFromFeatures:options:error:);
  Method predictionMethod =
      class_getInstanceMethod(MLModel.class, predictionSelector);
  const SEL dictionarySelector = @selector(initWithDictionary:error:);
  Method dictionaryMethod = class_getInstanceMethod(
      MLDictionaryFeatureProvider.class, dictionarySelector);
  if (predictionMethod == nullptr || dictionaryMethod == nullptr) {
    appendLog("MLModel prediction selector is unavailable");
    return;
  }
  originalPrediction = reinterpret_cast<Prediction>(
      method_getImplementation(predictionMethod));
  originalDictionaryInitializer = reinterpret_cast<DictionaryInitializer>(
      method_getImplementation(dictionaryMethod));
  method_setImplementation(predictionMethod,
                           reinterpret_cast<IMP>(capturePrediction));
  method_setImplementation(dictionaryMethod,
                           reinterpret_cast<IMP>(captureDictionaryInitializer));
  appendLog("CoreML feature capture installed");
}

} // namespace
