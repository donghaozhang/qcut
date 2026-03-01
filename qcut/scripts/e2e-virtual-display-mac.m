/**
 * macOS CGVirtualDisplay helper for E2E tests (Objective-C).
 *
 * NOTE: CGVirtualDisplay is process-local on macOS — the virtual display is
 * only visible within the creator process, not to other processes like Electron.
 * This means the cross-process virtual display approach does not work.
 *
 * This helper is kept for potential future use (e.g., embedding as a native
 * Electron addon). For now, the E2E system uses offscreen window positioning.
 *
 * Protocol:
 *   stdout: "DISPLAY_ID=<id>\n" on success, "FALLBACK\n" on failure
 *   stdin:  blocks until closed — parent controls lifetime
 *
 * Compile: clang -framework CoreGraphics -framework Foundation \
 *          -o .cache/e2e-vdisplay scripts/e2e-virtual-display-mac.m
 */

#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#include <stdio.h>

// Private CoreGraphics class declarations
@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(NSUInteger)width
                       height:(NSUInteger)height
                  refreshRate:(CGFloat)refreshRate;
@end

@interface CGVirtualDisplaySettings : NSObject
@property(nonatomic, copy) NSArray *modes;
@property(nonatomic) unsigned int hiDPI;
@end

@interface CGVirtualDisplayDescriptor : NSObject
@property(nonatomic, copy) NSString *name;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int serialNum;
@property(nonatomic, copy) void (^terminationHandler)(unsigned int, id);
- (void)setDispatchQueue:(dispatch_queue_t)queue;
@end

@interface CGVirtualDisplay : NSObject
@property(readonly, nonatomic) unsigned int displayID;
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings;
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        Class descClass = NSClassFromString(@"CGVirtualDisplayDescriptor");
        Class dispClass = NSClassFromString(@"CGVirtualDisplay");
        Class modeClass = NSClassFromString(@"CGVirtualDisplayMode");
        Class settingsClass = NSClassFromString(@"CGVirtualDisplaySettings");

        if (!descClass || !dispClass || !modeClass || !settingsClass) {
            fprintf(stdout, "FALLBACK\n");
            fflush(stdout);
            return 0;
        }

        CGVirtualDisplayDescriptor *descriptor = [[descClass alloc] init];
        descriptor.name = @"QCut E2E Virtual Display";
        descriptor.maxPixelsWide = 1920;
        descriptor.maxPixelsHigh = 1080;
        double ratio = 25.4 / 96.0;
        descriptor.sizeInMillimeters =
            CGSizeMake(1920 * ratio, 1080 * ratio);
        descriptor.vendorID = 0xEEEE;
        descriptor.productID = 0x0001;
        descriptor.serialNum = 0xE2E1;
        [descriptor setDispatchQueue:dispatch_get_main_queue()];

        CGVirtualDisplay *display =
            [[dispClass alloc] initWithDescriptor:descriptor];
        if (!display) {
            fprintf(stdout, "FALLBACK\n");
            fflush(stdout);
            return 0;
        }

        CGVirtualDisplayMode *mode =
            [[modeClass alloc] initWithWidth:1920
                                      height:1080
                                 refreshRate:60.0];
        CGVirtualDisplaySettings *settings = [[settingsClass alloc] init];
        settings.modes = @[ mode ];
        settings.hiDPI = 0;
        [display applySettings:settings];

        unsigned int displayID = display.displayID;
        fprintf(stdout, "DISPLAY_ID=%u\n", displayID);
        fflush(stdout);

        [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
        return 0;
    }
}
