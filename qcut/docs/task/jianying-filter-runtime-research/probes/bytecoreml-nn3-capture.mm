#import <CoreML/CoreML.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

using ProcessPrediction = id (*)(id, SEL, id, id);

ProcessPrediction originalProcessPrediction = nullptr;
std::filesystem::path captureDirectory;
std::atomic<unsigned int> captureIndex = 0;

void captureNn3(id prediction) noexcept {
  try {
    MLMultiArray *array = nil;
    if ([prediction respondsToSelector:@selector(featureValueForName:)]) {
      MLFeatureValue *value =
          [static_cast<id<MLFeatureProvider>>(prediction)
              featureValueForName:@"nn_3"];
      array = value.multiArrayValue;
    }
    if (array == nil && [prediction isKindOfClass:NSDictionary.class]) {
      id value = static_cast<NSDictionary *>(prediction)[@"nn_3"];
      if ([value isKindOfClass:MLFeatureValue.class]) {
        array = static_cast<MLFeatureValue *>(value).multiArrayValue;
      }
    }
    if (array == nil || array.dataType != MLMultiArrayDataTypeFloat32 ||
        array.count != 256 * 256 || array.dataPointer == nullptr) {
      std::cerr << "[nn3-capture] incompatible ByteCoreML output\n";
      return;
    }
    char filename[128];
    const unsigned int index = captureIndex.fetch_add(1);
    std::snprintf(filename, sizeof(filename),
                  "bytecoreml-%04u-nn_3.bin", index);
    std::error_code error;
    std::filesystem::create_directories(captureDirectory, error);
    if (error) {
      std::cerr << "[nn3-capture] cannot create output directory\n";
      return;
    }
    std::ofstream output(captureDirectory / filename,
                         std::ios::binary | std::ios::trunc);
    output.write(static_cast<const char *>(array.dataPointer),
                 static_cast<std::streamsize>(array.count * sizeof(float)));
    if (!output.good()) {
      std::cerr << "[nn3-capture] cannot write output\n";
      return;
    }
    std::cerr << "[nn3-capture] frame=" << index
              << " floats=" << array.count << '\n';
  } catch (...) {
    std::cerr << "[nn3-capture] unexpected capture failure\n";
  }
}

id captureProcessPrediction(id object, SEL selector, id options, id error) {
  id prediction =
      originalProcessPrediction(object, selector, options, error);
  captureNn3(prediction);
  return prediction;
}

} // namespace

extern "C" void installByteCoreMLNn3Capture() {
  const char *configured = std::getenv("JY_BACH_NN3_CAPTURE_DIR");
  if (configured == nullptr || *configured == '\0') {
    throw std::runtime_error("JY_BACH_NN3_CAPTURE_DIR is required");
  }
  captureDirectory = configured;
  Class processClass = NSClassFromString(@"IESMMProcessNN");
  const SEL selector = @selector(doDictPredictionWithOptions:error:);
  Method method = class_getInstanceMethod(processClass, selector);
  if (processClass == Nil || method == nullptr) {
    throw std::runtime_error(
        "IESMMProcessNN prediction selector is unavailable");
  }
  originalProcessPrediction = reinterpret_cast<ProcessPrediction>(
      method_getImplementation(method));
  method_setImplementation(method,
                           reinterpret_cast<IMP>(captureProcessPrediction));
}
