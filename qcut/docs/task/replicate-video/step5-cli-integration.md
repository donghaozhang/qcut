# Step 5: CLI Integration — Register Replicate Commands

## Goal
Register `replicate` as a new CLI command category with subcommands.

## Files to Create/Modify

### Create: `electron/native-pipeline/cli/cli-handlers-replicate.ts`

```typescript
export async function handleReplicateCommand(
  command: string,
  options: Record<string, unknown>,
  runner: CLIPipelineRunner
): Promise<CLIResult> {
  switch (command) {
    case "replicate":           return handleFullReplicate(options);
    case "replicate:analyze":   return handleAnalyze(options);
    case "replicate:plan":      return handlePlan(options);
    case "replicate:generate":  return handleGenerate(options);
    case "replicate:assemble":  return handleAssemble(options);
    default:                    return { status: "error", error: `Unknown: ${command}` };
  }
}
```

### Modify: `electron/native-pipeline/cli/command-registry.ts`

Add replicate category:

```typescript
{
  name: "replicate",
  label: "Video Replicate Commands",
  commands: [
    "replicate",
    "replicate:analyze",
    "replicate:plan",
    "replicate:generate",
    "replicate:assemble",
  ],
}
```

Add command definitions:

```typescript
"replicate": {
  name: "replicate",
  description: "One-click video replication — analyze source, generate shots, assemble timeline",
  category: "replicate",
  flags: [
    f("--source", "string", "Source video file path", { required: true }),
    f("--output", "string", "Output video file path"),
    f("--media-dir", "string", "Directory with replacement media clips"),
    f("--model", "string", "AI model for generation", { default: "ltx-video" }),
    f("--recipe-only", "boolean", "Stop after analysis, output recipe JSON"),
    f("--from-recipe", "string", "Skip analysis, use existing recipe JSON"),
    f("--concurrency", "number", "Parallel generation limit", { default: 3 }),
    f("--no-subtitles", "boolean", "Skip subtitle recreation"),
    f("--no-transitions", "boolean", "Skip transition matching"),
  ],
},
"replicate:analyze": {
  name: "replicate:analyze",
  description: "Analyze source video and extract replication recipe",
  category: "replicate",
  flags: [
    f("--source", "string", "Source video file path", { required: true }),
    f("--model", "string", "Vision model", { default: "gemini-2.5-pro" }),
  ],
},
```

### Modify: `electron/native-pipeline/cli/cli-runner/runner.ts`

Add replicate handler registration (follow pattern of subtitle handlers).

### Create: `electron/native-pipeline/replicate/replicate-runner.ts`

Orchestrates the full pipeline:

```typescript
export async function runFullReplicate(options: ReplicateOptions): Promise<ReplicateResult> {
  const progress = createProgressReporter(options);

  // Step 1: Analyze
  progress.update("Analyzing source video...");
  const recipe = await analyzeVideo(options.source);

  // Step 2: Plan
  progress.update("Planning shot generation...");
  const plans = planShots(recipe, options);

  // Step 3: Generate
  progress.update("Generating shots...");
  const generated = await generateShots(plans, options.outputDir, {
    concurrency: options.concurrency,
    onProgress: (i, total) => progress.update(`Generating shot ${i+1}/${total}...`),
  });

  // Step 4: Assemble
  progress.update("Assembling timeline...");
  const project = await assembleTimeline(recipe, generated, options);

  // Step 5: Export (if output specified)
  if (options.output) {
    progress.update("Exporting video...");
    await exportProject(project.projectId, options.output);
  }

  return { recipe, generated, project };
}
```

## Follow Patterns From
- `cli-handlers-subtitle.ts` — CLI handler structure
- `vimax/` — Multi-step pipeline orchestration
- `autoclip/autoclip-runner.ts` — Runner with progress reporting
