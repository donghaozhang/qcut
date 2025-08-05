$ bun x ultracite@latest lint
Resolving dependencies
Resolved, downloaded and extracted [2]
Saved lockfile
(node:4208) ExperimentalWarning: CommonJS module C:\Program Files\nodejs\node_modules\npm\node_modules\debug\src\node.js is loading ES Module C:\Program Files\nodejs\node_modules\npm\node_modules\supports-color\index.js using require().
Support for loading ES Module in require() is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
apps\web\src\hooks\use-timeline-element-resize.ts:63:17 lint/correctness/useExhaustiveDependencies ━━━━━━━━━━

  ! handleResizeEnd changes on every re-render and should not be used as a hook dependency.
  
    61 │       document.removeEventListener("mouseup", handleDocumentMouseUp);
    62 │     };
  > 63 │   }, [resizing, handleResizeEnd, updateTrimFromMouseMove]); // Re-run when resizing state changes
       │                 ^^^^^^^^^^^^^^^
    64 │ 
    65 │   const handleResizeStart = (
  
  i To fix this, wrap the definition of handleResizeEnd in its own useCallback() hook.
  

apps\web\src\hooks\use-timeline-element-resize.ts:63:34 lint/correctness/useExhaustiveDependencies ━━━━━━━━━━

  ! updateTrimFromMouseMove changes on every re-render and should not be used as a hook dependency.
  
    61 │       document.removeEventListener("mouseup", handleDocumentMouseUp);
    62 │     };
  > 63 │   }, [resizing, handleResizeEnd, updateTrimFromMouseMove]); // Re-run when resizing state changes
       │                                  ^^^^^^^^^^^^^^^^^^^^^^^
    64 │ 
    65 │   const handleResizeStart = (
  
  i To fix this, wrap the definition of updateTrimFromMouseMove in its own useCallback() hook.
  

apps\web\src\hooks\use-timeline-playhead.ts:43:35 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook specifies more dependencies than necessary: duration, zoomLevel
  
    42 │   // --- Playhead Scrubbing Handlers ---
  > 43 │   const handlePlayheadMouseDown = useCallback(
       │                                   ^^^^^^^^^^^
    44 │     (e: React.MouseEvent) => {
    45 │       e.preventDefault();
  
  i Outer scope values aren't valid dependencies because mutating them doesn't re-render the component.
  
    48 │       handleScrub(e);
    49 │     },
  > 50 │     [duration, zoomLevel, handleScrub]
       │      ^^^^^^^^
    51 │   );
    52 │ 
  
  i Outer scope values aren't valid dependencies because mutating them doesn't re-render the component.
  
    48 │       handleScrub(e);
    49 │     },
  > 50 │     [duration, zoomLevel, handleScrub]
       │                ^^^^^^^^^
    51 │   );
    52 │ 
  
  i Unsafe fix: Remove the extra dependencies from the list.
  
    50 │ ····[duration,·zoomLevel,·handleScrub]
       │      ---------------------            

apps\web\src\hooks\use-timeline-playhead.ts:54:32 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook does not specify its dependency on handleScrub.
  
    53 │   // Ruler mouse down handler
  > 54 │   const handleRulerMouseDown = useCallback(
       │                                ^^^^^^^^^^^
    55 │     (e: React.MouseEvent) => {
    56 │       // Only handle left mouse button
  
  i This dependency is being used here, but is not specified in the hook dependency list.
  
    66 │       // Start scrubbing immediately
    67 │       setIsScrubbing(true);
  > 68 │       handleScrub(e);
       │       ^^^^^^^^^^^
    69 │     },
    70 │     [duration, zoomLevel]
  
  i Unsafe fix: Add the missing dependency to the list.
  
    70 │ ····[duration,·zoomLevel,·handleScrub]
       │                         +++++++++++++ 

apps\web\src\hooks\use-timeline-playhead.ts:54:32 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook does not specify its dependency on playheadRef?.current?.contains.
  
    53 │   // Ruler mouse down handler
  > 54 │   const handleRulerMouseDown = useCallback(
       │                                ^^^^^^^^^^^
    55 │     (e: React.MouseEvent) => {
    56 │       // Only handle left mouse button
  
  i This dependency is being used here, but is not specified in the hook dependency list.
  
    59 │       // Don't interfere if clicking on the playhead itself
  > 60 │       if (playheadRef?.current?.contains(e.target as Node)) return;
       │           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    61 │ 
    62 │       e.preventDefault();
  
  i Unsafe fix: Add the missing dependency to the list.
  
    70 │ ····[duration,·zoomLevel,·playheadRef?.current?.contains]
       │                         ++++++++++++++++++++++++++++++++ 

apps\web\src\hooks\use-timeline-playhead.ts:54:32 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook specifies more dependencies than necessary: duration, zoomLevel
  
    53 │   // Ruler mouse down handler
  > 54 │   const handleRulerMouseDown = useCallback(
       │                                ^^^^^^^^^^^
    55 │     (e: React.MouseEvent) => {
    56 │       // Only handle left mouse button
  
  i Outer scope values aren't valid dependencies because mutating them doesn't re-render the component.
  
    68 │       handleScrub(e);
    69 │     },
  > 70 │     [duration, zoomLevel]
       │      ^^^^^^^^
    71 │   );
    72 │ 
  
  i Outer scope values aren't valid dependencies because mutating them doesn't re-render the component.
  
    68 │       handleScrub(e);
    69 │     },
  > 70 │     [duration, zoomLevel]
       │                ^^^^^^^^^
    71 │   );
    72 │ 
  
  i Unsafe fix: Remove the extra dependencies from the list.
  
    70 │ ····[duration,·zoomLevel]
       │      ------------------- 

apps\web\src\hooks\use-timeline-playhead.ts:237:3 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook specifies more dependencies than necessary: duration
  
    236 │   // --- Playhead auto-scroll effect (only during playback) ---
  > 237 │   useEffect(() => {
        │   ^^^^^^^^^
    238 │     const { isPlaying } = usePlaybackStore.getState();
    239 │ 
  
  i Outer scope values aren't valid dependencies because mutating them doesn't re-render the component.
  
    269 │   }, [
    270 │     playheadPosition,
  > 271 │     duration,
        │     ^^^^^^^^
    272 │     zoomLevel,
    273 │     rulerScrollRef,
  
  i Unsafe fix: Remove the extra dependencies from the list.
  
    268 268 │       }
    269 269 │     }, [
    270     │ - ····playheadPosition,
    271     │ - ····duration,
    272     │ - ····zoomLevel,
    273     │ - ····rulerScrollRef,
    274     │ - ····tracksScrollRef,
    275     │ - ····isScrubbing,
        270 │ + ····playheadPosition,·
        271 │ + ····zoomLevel,·
        272 │ + ····rulerScrollRef,·
        273 │ + ····tracksScrollRef,·
        274 │ + ····isScrubbing
    276 275 │     ]);
    277 276 │   
  

apps\web\src\hooks\use-toast.ts:174:9 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook specifies more dependencies than necessary: state
  
    172 │   const [state, setState] = React.useState<State>(memoryState);
    173 │ 
  > 174 │   React.useEffect(() => {
        │         ^^^^^^^^^
    175 │     listeners.push(setState);
    176 │     return () => {
  
  i This dependency can be removed from the list.
  
    180 │       }
    181 │     };
  > 182 │   }, [state]);
        │       ^^^^^
    183 │ 
    184 │   return {
  
  i Unsafe fix: Remove the extra dependencies from the list.
  
    182 │ ··},·[state]);
        │       -----   

apps\web\src\components\editor\timeline\timeline-track.tsx format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
     420  420 │     };
     421  421 │   
     422      │ - 
     423  422 │     const handleElementMouseDown = (
     424  423 │       e: React.MouseEvent,
  

apps\web\src\hooks\use-timeline-element-resize.ts:63:17 lint/correctness/noInvalidUseBeforeDeclaration ━━━━━━━━━━

  × This variable is used before its declaration.
  
    61 │       document.removeEventListener("mouseup", handleDocumentMouseUp);
    62 │     };
  > 63 │   }, [resizing, handleResizeEnd, updateTrimFromMouseMove]); // Re-run when resizing state changes
       │                 ^^^^^^^^^^^^^^^
    64 │ 
    65 │   const handleResizeStart = (
  
  i The variable is declared here:
  
    219 │   };
    220 │ 
  > 221 │   const handleResizeEnd = () => {
        │         ^^^^^^^^^^^^^^^
    222 │     setResizing(null);
    223 │   };
  

apps\web\src\hooks\use-timeline-element-resize.ts:63:34 lint/correctness/noInvalidUseBeforeDeclaration ━━━━━━━━━━

  × This variable is used before its declaration.
  
    61 │       document.removeEventListener("mouseup", handleDocumentMouseUp);
    62 │     };
  > 63 │   }, [resizing, handleResizeEnd, updateTrimFromMouseMove]); // Re-run when resizing state changes
       │                                  ^^^^^^^^^^^^^^^^^^^^^^^
    64 │ 
    65 │   const handleResizeStart = (
  
  i The variable is declared here:
  
    110 │   };
    111 │ 
  > 112 │   const updateTrimFromMouseMove = (e: { clientX: number }) => {
        │         ^^^^^^^^^^^^^^^^^^^^^^^
    113 │     if (!resizing) return;
    114 │ 
  

apps\web\src\hooks\use-timeline-playhead.ts:50:27 lint/correctness/noInvalidUseBeforeDeclaration ━━━━━━━━━━

  × This variable is used before its declaration.
  
    48 │       handleScrub(e);
    49 │     },
  > 50 │     [duration, zoomLevel, handleScrub]
       │                           ^^^^^^^^^^^
    51 │   );
    52 │ 
  
  i The variable is declared here:
  
    71 │   );
    72 │ 
  > 73 │   const handleScrub = useCallback(
       │         ^^^^^^^^^^^
    74 │     (e: MouseEvent | React.MouseEvent) => {
    75 │       const ruler = rulerRef.current;
  

apps\web\src\lib\export-engine-cli.ts:435:17 lint/correctness/noUnusedPrivateClassMembers  FIXABLE  ━━━━━━━━━━

  × This private class member is defined but never used.
  
    433 │   }
    434 │ 
  > 435 │   private async cleanup(): Promise<void> {
        │                 ^^^^^^^
    436 │     if (this.sessionId && window.electronAPI) {
    437 │       await window.electronAPI.invoke("cleanup-export-session", this.sessionId);
  
  i Unsafe fix: Remove unused declaration.
  
    432 432 │       return new Blob([buffer], { type: "video/mp4" });
    433 433 │     }
    434     │ - 
    435     │ - ··private·async·cleanup():·Promise<void>·{
    436     │ - ····if·(this.sessionId·&&·window.electronAPI)·{
    437     │ - ······await·window.electronAPI.invoke("cleanup-export-session",·this.sessionId);
    438     │ - ····}
    439     │ - ··}
    440 434 │   
    441 435 │     calculateTotalFrames(): number {
  

apps\web\src\lib\export-engine-factory.ts:7:8 lint/style/noEnum ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Don't use enum
  
     6 │ // Engine types available
   > 7 │ export enum ExportEngineType {
       │        ^^^^^^^^^^^^^^^^^^^^^^^
   > 8 │   STANDARD = "standard",
        ...
  > 12 │   CLI = "cli",
  > 13 │ }
       │ ^
    14 │ 
    15 │ // Browser capability detection results
  
  i TypeScript enums are not a type-level extension to JavaScript like type annotations or definitions. Users may wish to disable non-type-level extensions to use bundlers or compilers that only strip types.
  
  i Use JavaScript objects or TypeScript unions instead.
  

apps\web\src\lib\export-engine-factory.ts:40:3 lint/style/useConsistentMemberAccessibility ━━━━━━━━━━

  × The public modifier is disallowed.
  
    39 │   // Singleton pattern for factory
  > 40 │   public static getInstance(): ExportEngineFactory {
       │   ^^^^^^
    41 │     if (!ExportEngineFactory.instance) {
    42 │       ExportEngineFactory.instance = new ExportEngineFactory();
  
  i Remove the accessibility modifier.
  

apps\web\src\lib\export-engine-factory.ts:292:7 lint/complexity/noUselessSwitchCase  FIXABLE  ━━━━━━━━━━

  × Useless case clause.
  
    290 │         }
    291 │ 
  > 292 │       case ExportEngineType.STANDARD:
        │       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    293 │       default:
    294 │         return new ExportEngine(
  
  i because the default clause is present:
  
    292 │       case ExportEngineType.STANDARD:
  > 293 │       default:
        │       ^^^^^^^^
  > 294 │         return new ExportEngine(
         ...
  > 299 │           totalDuration
  > 300 │         );
        │         ^^
    301 │     }
    302 │   }
  
  i Unsafe fix: Remove the useless case.
  
    289 289 │             );
    290 290 │           }
    291     │ - 
    292     │ - ······case·ExportEngineType.STANDARD:
    293 291 │         default:
    294 292 │           return new ExportEngine(
  

apps\web\src\lib\export-engine-factory.ts:164:7 lint/style/noParameterAssign ━━━━━━━━━━━━━━━━━━━━━━━

  × Assigning a function parameter is confusing.
  
    162 │         totalDuration
    163 │       );
  > 164 │       engineType = recommendation.engineType;
        │       ^^^^^^^^^^
    165 │     }
    166 │ 
  
  i The parameter is declared here:
  
    155 │     mediaItems: MediaItem[],
    156 │     totalDuration: number,
  > 157 │     engineType?: ExportEngineType
        │     ^^^^^^^^^^
    158 │   ): Promise<ExportEngine> {
    159 │     if (!engineType) {
  
  i Developers usually expect function parameters to be readonly. To align with this expectation, use a local variable instead.
  

apps\web\src\lib\export-engine.ts:53:11 lint/correctness/noUnusedPrivateClassMembers  FIXABLE  ━━━━━━━━━━

  × This private class member is defined but never used.
  
    51 │   private mediaRecorder: MediaRecorder | null = null;
    52 │   private recordedChunks: Blob[] = [];
  > 53 │   private isRecording = false;
       │           ^^^^^^^^^^^
    54 │   protected isExporting = false;
    55 │   protected abortController: AbortController | null = null;
  
  i Unsafe fix: Remove unused declaration.
  
      51   51 │     private mediaRecorder: MediaRecorder | null = null;
      52   52 │     private recordedChunks: Blob[] = [];
      53      │ - ··private·isRecording·=·false;
      54   53 │     protected isExporting = false;
      55   54 │     protected abortController: AbortController | null = null;
  

apps\web\src\lib\ffmpeg-service.ts:8:5 lint/style/noParameterProperties ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Use a more explicit class property instead of a parameter property.
  
     7 │   constructor(
   > 8 │     private onProgress?: (progress: number, message: string) => void
       │     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
     9 │   ) {}
    10 │ 
  
  i Parameter properties are less explicit than other ways of declaring and initializing class properties.
  

apps\web\src\types\export.ts format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
      6   6 │   } as const;
      7   7 │   
      8     │ - export·type·ExportFormat·=·typeof·ExportFormat[keyof·typeof·ExportFormat];
          8 │ + export·type·ExportFormat·=·(typeof·ExportFormat)[keyof·typeof·ExportFormat];
      9   9 │   
     10  10 │   // Export quality presets
    ······· │ 
     15  15 │   } as const;
     16  16 │   
     17     │ - export·type·ExportQuality·=·typeof·ExportQuality[keyof·typeof·ExportQuality];
         17 │ + export·type·ExportQuality·=·(typeof·ExportQuality)[keyof·typeof·ExportQuality];
     18  18 │   
     19  19 │   // Export purpose types
    ······· │ 
     23  23 │   } as const;
     24  24 │   
     25     │ - export·type·ExportPurpose·=·typeof·ExportPurpose[keyof·typeof·ExportPurpose];
         25 │ + export·type·ExportPurpose·=·(typeof·ExportPurpose)[keyof·typeof·ExportPurpose];
     26  26 │   
     27  27 │   // Export settings configuration
  

The number of diagnostics exceeds the limit allowed. Use --max-diagnostics to increase it.
Diagnostics not shown: 1395.
Checked 267 files in 6s. No fixes applied.
Found 1407 errors.
Found 8 warnings.
check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  

Failed to run Ultracite: Command failed: npx @biomejs/biome check ./
error: script "lint" exited with code 1
