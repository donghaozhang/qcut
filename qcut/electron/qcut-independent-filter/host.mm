#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <mach-o/dyld.h>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "fog-shader-source.h"
#include "graph-plan.h"

struct Parameters { float width; float height; float strength; uint32_t stage; };
struct FrameHeader { uint32_t width; uint32_t height; float strength; };
struct GraphConfig { uint32_t kind; uint32_t alphaWeighted; float corner; uint32_t overlayWidth; uint32_t overlayHeight; uint32_t detailVariant; };
struct DualConfig { float backgroundStrength; float skinStrength; uint32_t sampling; uint32_t clampAlpha; float sharpen; uint32_t skinSize; };
struct MaskHeader { uint32_t width; uint32_t height; };
static_assert(sizeof(DualConfig) == 24);
static_assert(sizeof(GraphConfig) == 24);
static_assert(sizeof(Parameters) == 16);
static_assert(sizeof(FrameHeader) == 12);

void readExact(void* target, size_t length) {
    if (!std::cin.read(static_cast<char*>(target), length)) throw std::runtime_error("Truncated input frame");
}

id<MTLTexture> makeTexture(id<MTLDevice> device, size_t width, size_t height) {
    auto descriptor = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm
        width:width height:height mipmapped:NO];
    descriptor.storageMode = MTLStorageModeShared;
    descriptor.usage = MTLTextureUsageShaderRead | MTLTextureUsageRenderTarget;
    auto texture = [device newTextureWithDescriptor:descriptor];
    if (!texture) throw std::runtime_error("Metal texture allocation failed");
    return texture;
}

int main(int argc, const char* argv[]) {
    @autoreleasepool {
        try {
            std::ios::sync_with_stdio(false);
            const bool graphMode = argc == 3 && std::string(argv[1]) == "--graph";
            const bool cubeMode = graphMode || (argc == 3 && std::string(argv[1]) == "--cube");
            const int cubeSize = cubeMode ? std::stoi(argv[2]) : 0;
            if ((argc != 1 && !cubeMode) || (cubeMode && (cubeSize < 2 || cubeSize > 65)))
                throw std::runtime_error("Invalid cube configuration");
            auto device = MTLCreateSystemDefaultDevice();
            if (!device) throw std::runtime_error("No Metal device available");
            NSError* error = nil;
            auto options = [MTLCompileOptions new];
            options.fastMathEnabled = YES;
            auto library = [device newLibraryWithSource:[NSString stringWithUTF8String:kFogShaderSource]
                options:options error:&error];
            if (!library) throw std::runtime_error(error.localizedDescription.UTF8String);
            auto descriptor = [MTLRenderPipelineDescriptor new];
            descriptor.vertexFunction = [library newFunctionWithName:@"fullFrame"];
            descriptor.fragmentFunction = [library newFunctionWithName:(graphMode ? @"graphFrame" : cubeMode ? @"cubeFrame" : @"filterFrame")];
            descriptor.colorAttachments[0].pixelFormat = MTLPixelFormatRGBA8Unorm;
            descriptor.colorAttachments[0].blendingEnabled = NO;
            auto pipeline = [device newRenderPipelineStateWithDescriptor:descriptor error:&error];
            if (!pipeline) throw std::runtime_error(error.localizedDescription.UTF8String);
            auto samplerDescriptor = [MTLSamplerDescriptor new];
            samplerDescriptor.minFilter = MTLSamplerMinMagFilterLinear;
            samplerDescriptor.magFilter = MTLSamplerMinMagFilterLinear;
            samplerDescriptor.sAddressMode = MTLSamplerAddressModeClampToEdge;
            samplerDescriptor.tAddressMode = MTLSamplerAddressModeClampToEdge;
            samplerDescriptor.rAddressMode = MTLSamplerAddressModeClampToEdge;
            auto sampler = [device newSamplerStateWithDescriptor:samplerDescriptor];
            auto queue = [device newCommandQueue];
            GraphConfig graph{};
            if (graphMode) {
                readExact(&graph, sizeof(graph));
                if (graph.kind > 11 || graph.alphaWeighted > 1 || !std::isfinite(graph.corner) ||
                    graph.corner < 0 || graph.corner > 1 || graph.detailVariant > 1 ||
                    (graph.kind != 4 && graph.detailVariant) ||
                    graph.overlayWidth > 4096 || graph.overlayHeight > 4096 ||
                    (graph.kind == 2 && (!graph.overlayWidth || !graph.overlayHeight)) ||
                    (graph.kind != 2 && (graph.overlayWidth || graph.overlayHeight)))
                    throw std::runtime_error("Invalid independent graph configuration");
            }
            const bool dualMode = graphMode && graph.kind == 11;
            if (dualMode) {
                descriptor.fragmentFunction = [library newFunctionWithName:@"dualFrame"];
                pipeline = [device newRenderPipelineStateWithDescriptor:descriptor error:&error];
                if (!pipeline) throw std::runtime_error(error.localizedDescription.UTF8String);
            }
            std::vector<uint8_t> lutBytes(cubeMode ? size_t(cubeSize) * cubeSize * cubeSize * 16 : 512 * 512 * 4);
            readExact(lutBytes.data(), lutBytes.size());
            id<MTLTexture> lut;
            if (cubeMode) {
                auto cubeDescriptor = [MTLTextureDescriptor new];
                cubeDescriptor.textureType = MTLTextureType3D;
                cubeDescriptor.pixelFormat = MTLPixelFormatRGBA32Float;
                cubeDescriptor.width = cubeSize; cubeDescriptor.height = cubeSize; cubeDescriptor.depth = cubeSize;
                cubeDescriptor.storageMode = MTLStorageModeShared;
                cubeDescriptor.usage = MTLTextureUsageShaderRead;
                lut = [device newTextureWithDescriptor:cubeDescriptor];
                if (!lut) throw std::runtime_error("Metal cube allocation failed");
                [lut replaceRegion:MTLRegionMake3D(0, 0, 0, cubeSize, cubeSize, cubeSize) mipmapLevel:0 slice:0
                    withBytes:lutBytes.data() bytesPerRow:cubeSize * 16 bytesPerImage:cubeSize * cubeSize * 16];
            } else {
                lut = makeTexture(device, 512, 512);
                [lut replaceRegion:MTLRegionMake2D(0, 0, 512, 512) mipmapLevel:0
                    withBytes:lutBytes.data() bytesPerRow:512 * 4];
            }
            DualConfig dual{};
            id<MTLTexture> skinLut;
            id<MTLTexture> skinMask;
            if (dualMode) {
                readExact(&dual, sizeof(dual));
                if (!std::isfinite(dual.backgroundStrength) || !std::isfinite(dual.skinStrength) ||
                    dual.backgroundStrength < 0 || dual.backgroundStrength > 1 ||
                    dual.skinStrength < 0 || dual.skinStrength > 1 || dual.sampling > 2 || dual.clampAlpha > 1 ||
                    !std::isfinite(dual.sharpen) || dual.sharpen < 0 || dual.sharpen > 1 ||
                    dual.skinSize < 2 || dual.skinSize > 65)
                    throw std::runtime_error("Invalid dual LUT configuration");
                const uint32_t skinSize = dual.skinSize;
                lutBytes.resize(size_t(skinSize) * skinSize * skinSize * 16);
                readExact(lutBytes.data(), lutBytes.size());
                auto skinDescriptor = [MTLTextureDescriptor new];
                skinDescriptor.textureType = MTLTextureType3D;
                skinDescriptor.pixelFormat = MTLPixelFormatRGBA32Float;
                skinDescriptor.width = skinSize; skinDescriptor.height = skinSize; skinDescriptor.depth = skinSize;
                skinDescriptor.storageMode = MTLStorageModeShared;
                skinDescriptor.usage = MTLTextureUsageShaderRead;
                skinLut = [device newTextureWithDescriptor:skinDescriptor];
                if (!skinLut) throw std::runtime_error("Metal skin LUT allocation failed");
                [skinLut replaceRegion:MTLRegionMake3D(0, 0, 0, skinSize, skinSize, skinSize) mipmapLevel:0 slice:0
                    withBytes:lutBytes.data() bytesPerRow:skinSize * 16 bytesPerImage:skinSize * skinSize * 16];
            }
            id<MTLTexture> overlay = makeTexture(device, graph.overlayWidth ? graph.overlayWidth : 1,
                                                graph.overlayHeight ? graph.overlayHeight : 1);
            if (graphMode && graph.kind == 2) {
                std::vector<uint8_t> overlayBytes(size_t(graph.overlayWidth) * graph.overlayHeight * 4);
                readExact(overlayBytes.data(), overlayBytes.size());
                [overlay replaceRegion:MTLRegionMake2D(0, 0, graph.overlayWidth, graph.overlayHeight) mipmapLevel:0
                    withBytes:overlayBytes.data() bytesPerRow:graph.overlayWidth * 4];
            }
            for (uint32_t index = 0; index < _dyld_image_count(); ++index) {
                const std::string image(_dyld_get_image_name(index));
                if (image.find("libcccreator") != std::string::npos || image.find("libAGFX") != std::string::npos ||
                    image.find("PrivateRuntimes") != std::string::npos || image.find("VideoFusion") != std::string::npos)
                    throw std::runtime_error("Unexpected third-party renderer loaded");
            }
            std::cerr << (graphMode ? "qcut-metal-graph-v1" : cubeMode ? "qcut-metal-lut-v1" : "qcut-metal-fog-v1") << " ready; device=" << device.name.UTF8String << "; jianyingLibraries=0\n";
            const uint32_t ready = dualMode ? 0x51464d33 : 0x51464d31;
            std::cout.write(reinterpret_cast<const char*>(&ready), sizeof(ready)).flush();
            uint32_t lastWidth = 0, lastHeight = 0;
            id<MTLTexture> original;
            id<MTLTexture> stages[11];
            std::vector<GraphStage> plan;
            while (std::cin.peek() != std::char_traits<char>::eof()) {
                @autoreleasepool {
                    FrameHeader header;
                    readExact(&header, sizeof(header));
                    const size_t pixels = size_t(header.width) * header.height;
                    if (!header.width || !header.height || header.width > 4096 || header.height > 4096 ||
                        pixels > 1920 * 1080 || !std::isfinite(header.strength) || header.strength < 0 || header.strength > 1)
                        throw std::runtime_error("Invalid frame dimensions or intensity (maximum 1080p)");
                    std::vector<uint8_t> bytes(pixels * 4);
                    readExact(bytes.data(), bytes.size());
                    if (dualMode) {
                        MaskHeader maskHeader;
                        readExact(&maskHeader, sizeof(maskHeader));
                        if (!maskHeader.width || !maskHeader.height || maskHeader.width > 2048 || maskHeader.height > 2048)
                            throw std::runtime_error("Invalid skin mask dimensions");
                        std::vector<uint8_t> maskBytes(size_t(maskHeader.width) * maskHeader.height);
                        readExact(maskBytes.data(), maskBytes.size());
                        if (!skinMask || skinMask.width != maskHeader.width || skinMask.height != maskHeader.height) {
                            auto maskDescriptor = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatR8Unorm
                                width:maskHeader.width height:maskHeader.height mipmapped:NO];
                            maskDescriptor.storageMode = MTLStorageModeShared;
                            maskDescriptor.usage = MTLTextureUsageShaderRead;
                            skinMask = [device newTextureWithDescriptor:maskDescriptor];
                            if (!skinMask) throw std::runtime_error("Metal mask allocation failed");
                        }
                        [skinMask replaceRegion:MTLRegionMake2D(0, 0, maskHeader.width, maskHeader.height) mipmapLevel:0
                            withBytes:maskBytes.data() bytesPerRow:maskHeader.width];
                    }
                    if (header.strength == 0) {
                        std::cout.write(reinterpret_cast<const char*>(bytes.data()), bytes.size()).flush();
                        if (!std::cout) throw std::runtime_error("Output stream closed");
                        continue;
                    }
                    if (header.width != lastWidth || header.height != lastHeight) {
                        original = makeTexture(device, header.width, header.height);
                        plan = makeGraphPlan(graphMode ? graph.kind : cubeMode ? 0 : 6,
                            graph.detailVariant, header.width, header.height, dual.sharpen > 0);
                        for (size_t index = 0; index < plan.size(); ++index)
                            stages[index] = makeTexture(device, plan[index].width, plan[index].height);
                        lastWidth = header.width; lastHeight = header.height;
                    }
                    [original replaceRegion:MTLRegionMake2D(0, 0, header.width, header.height) mipmapLevel:0
                        withBytes:bytes.data() bytesPerRow:header.width * 4];
                    auto command = [queue commandBuffer];
                    for (uint32_t index = 0; index < plan.size(); ++index) {
                        const auto& stage = plan[index];
                        auto pass = [MTLRenderPassDescriptor renderPassDescriptor];
                        pass.colorAttachments[0].texture = stages[index];
                        pass.colorAttachments[0].loadAction = MTLLoadActionDontCare;
                        pass.colorAttachments[0].storeAction = MTLStoreActionStore;
                        auto encoder = [command renderCommandEncoderWithDescriptor:pass];
                        [encoder setRenderPipelineState:pipeline];
                        [encoder setViewport:MTLViewport{0, 0, double(stages[index].width), double(stages[index].height), 0, 1}];
                        [encoder setCullMode:MTLCullModeNone];
                        const Parameters params = {stage.sampleWidth, stage.sampleHeight, header.strength, index};
                        [encoder setFragmentBytes:&params length:sizeof(params) atIndex:0];
                        [encoder setFragmentTexture:(graphMode ? (stage.source < 0 ? original : stages[stage.source]) :
                            (index == 0 || index == 2 ? original : stages[index - 1])) atIndex:0];
                        [encoder setFragmentTexture:(!graphMode && index == 2 ? stages[1] : lut) atIndex:1];
                        if (graphMode) {
                            [encoder setFragmentBytes:&graph length:sizeof(graph) atIndex:1];
                            [encoder setFragmentTexture:overlay atIndex:2];
                            [encoder setFragmentTexture:(stage.base < 0 ? original : stages[stage.base]) atIndex:3];
                        }
                        if (dualMode) {
                            [encoder setFragmentBytes:&dual length:sizeof(dual) atIndex:2];
                            [encoder setFragmentTexture:skinLut atIndex:4];
                            [encoder setFragmentTexture:skinMask atIndex:5];
                        }
                        [encoder setFragmentSamplerState:sampler atIndex:0];
                        [encoder drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:6];
                        [encoder endEncoding];
                    }
                    [command commit]; [command waitUntilCompleted];
                    if (command.status != MTLCommandBufferStatusCompleted)
                        throw std::runtime_error(command.error.localizedDescription.UTF8String);
                    [stages[plan.size() - 1] getBytes:bytes.data() bytesPerRow:header.width * 4
                        fromRegion:MTLRegionMake2D(0, 0, header.width, header.height) mipmapLevel:0];
                    std::cout.write(reinterpret_cast<const char*>(bytes.data()), bytes.size()).flush();
                    if (!std::cout) throw std::runtime_error("Output stream closed");
                }
            }
            return 0;
        } catch (const std::exception& error) {
            std::cerr << error.what() << '\n';
            return 1;
        }
    }
}
