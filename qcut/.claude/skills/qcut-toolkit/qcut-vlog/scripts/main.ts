import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVlogPaths, parseVlogOptions, renderUsage } from "./options";
import {
	isArtifactFresh,
	probeDuration,
	readJsonFile,
	resolveToolchain,
	runCommand,
} from "./runtime";
import type {
	CommandResult,
	ToolCommand,
	VlogManifest,
	VlogOptions,
	VlogPaths,
	VlogStage,
} from "./types";
import {
	assertDurationParity,
	buildAudioExtractArgs,
	buildBackgroundArgs,
	buildBackgroundPreviewArgs,
	buildCleanArgs,
	buildPortraitArgs,
	buildPreviewArgs,
	buildSubtitleArgs,
	buildTranscribeArgs,
	getPreviewTime,
	parseSrtContent,
	summarizeCleanMetadata,
} from "./workflow";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

function isPortraitEnabled({ options }: { options: VlogOptions }): boolean {
	return options.portraitFilter !== "none" || options.beauty > 0;
}

function createManifest({
	options,
	paths,
}: {
	options: VlogOptions;
	paths: VlogPaths;
}): VlogManifest {
	const now = new Date().toISOString();
	const pending = { status: "pending" as const };
	return {
		schemaVersion: 3,
		workflow: "qcut-vlog",
		input: paths.input,
		outputDir: paths.outputDir,
		createdAt: now,
		updatedAt: now,
		settings: {
			finalName: options.finalName,
			background: options.background,
			backgroundFit: options.backgroundFit,
			portraitFilter: options.portraitFilter,
			filterIntensity: options.filterIntensity,
			beauty: options.beauty,
			preset: options.preset,
			style: options.style,
			model: options.model,
			language: options.language,
			silenceThreshold: options.silenceThreshold,
			keepPadding: options.keepPadding,
			srtMaxWords: options.srtMaxWords,
			srtMaxDuration: options.srtMaxDuration,
			keepFillers: options.keepFillers,
			keepSilences: options.keepSilences,
		},
		artifacts: {
			cleanVideo: paths.cleanVideo,
			portraitVideo:
				!options.background && isPortraitEnabled({ options })
					? paths.portraitVideo
					: undefined,
			backgroundImage: options.background,
			cutoutVideo: options.background ? paths.cutoutVideo : undefined,
			editableVideo: options.background
				? paths.editableVideo
				: isPortraitEnabled({ options })
					? paths.portraitVideo
					: paths.cleanVideo,
			cleanAudio: paths.cleanAudio,
			srt: paths.srt,
			finalVideo: paths.finalVideo,
			previewImage: paths.previewImage,
			backgroundPreviewImage: options.background
				? paths.backgroundPreviewImage
				: undefined,
			metadataDir: paths.metadataDir,
		},
		stages: {
			clean: { ...pending },
			portrait: { ...pending },
			background: { ...pending },
			"extract-audio": { ...pending },
			transcribe: { ...pending },
			subtitle: { ...pending },
			verify: { ...pending },
		},
		commands: [],
	};
}

function writeManifest({
	manifest,
	paths,
}: {
	manifest: VlogManifest;
	paths: VlogPaths;
}): void {
	manifest.updatedAt = new Date().toISOString();
	writeFileSync(
		paths.manifest,
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8"
	);
}

function expectedSettings({ options }: { options: VlogOptions }) {
	return {
		finalName: options.finalName,
		background: options.background,
		backgroundFit: options.backgroundFit,
		portraitFilter: options.portraitFilter,
		filterIntensity: options.filterIntensity,
		beauty: options.beauty,
		preset: options.preset,
		style: options.style,
		model: options.model,
		language: options.language,
		silenceThreshold: options.silenceThreshold,
		keepPadding: options.keepPadding,
		srtMaxWords: options.srtMaxWords,
		srtMaxDuration: options.srtMaxDuration,
		keepFillers: options.keepFillers,
		keepSilences: options.keepSilences,
	};
}

function loadManifest({
	options,
	paths,
}: {
	options: VlogOptions;
	paths: VlogPaths;
}): VlogManifest {
	if (!existsSync(paths.manifest)) {
		throw new Error("--resume requires an existing vlog-manifest.json");
	}
	const manifest = JSON.parse(
		readFileSync(paths.manifest, "utf8")
	) as VlogManifest;
	if (
		manifest.schemaVersion !== 3 ||
		manifest.workflow !== "qcut-vlog" ||
		manifest.input !== paths.input
	) {
		throw new Error(
			"The existing manifest is incompatible or belongs to a different input"
		);
	}
	if (
		JSON.stringify(manifest.settings) !==
		JSON.stringify(expectedSettings({ options }))
	) {
		throw new Error(
			"Workflow settings changed; use --force instead of --resume"
		);
	}
	return manifest;
}

function knownArtifacts({ paths }: { paths: VlogPaths }): string[] {
	return [
		paths.words,
		paths.decisions,
		paths.cuts,
		paths.keeps,
		paths.cleanVideo,
		paths.portraitVideo,
		paths.cutoutVideo,
		paths.editableVideo,
		paths.cleanAudio,
		paths.srt,
		paths.finalVideo,
		paths.previewImage,
		paths.backgroundPreviewImage,
		paths.manifest,
	];
}

function prepareOutput({
	options,
	paths,
}: {
	options: VlogOptions;
	paths: VlogPaths;
}): void {
	if (!existsSync(paths.input))
		throw new Error(`Input video not found: ${paths.input}`);
	if (options.background && !existsSync(options.background)) {
		throw new Error(`Background image not found: ${options.background}`);
	}
	mkdirSync(paths.outputDir, { recursive: true });
	mkdirSync(paths.logsDir, { recursive: true });
	mkdirSync(paths.verificationDir, { recursive: true });
	const existing = knownArtifacts({ paths }).filter((filePath) =>
		existsSync(filePath)
	);
	if (existing.length > 0 && !options.force && !options.resume) {
		throw new Error(
			`Workflow artifacts already exist in ${paths.outputDir}; use --resume or --force`
		);
	}
	if (!options.force) return;
	for (const filePath of existing) rmSync(filePath, { force: true });
}

function readCleanSummary({ paths }: { paths: VlogPaths }) {
	return summarizeCleanMetadata({
		decisions: readJsonFile({ filePath: paths.decisions }),
		cuts: readJsonFile({ filePath: paths.cuts }),
		keeps: readJsonFile({ filePath: paths.keeps }),
	});
}

function isCleanReusable({ paths }: { paths: VlogPaths }): boolean {
	if (
		!isArtifactFresh({ artifact: paths.words, dependencies: [paths.input] }) ||
		!isArtifactFresh({ artifact: paths.decisions, dependencies: [paths.input] })
	) {
		return false;
	}
	const decisions = readJsonFile({ filePath: paths.decisions });
	if (Array.isArray(decisions) && decisions.length === 0) return true;
	return (
		isArtifactFresh({ artifact: paths.cuts, dependencies: [paths.input] }) &&
		isArtifactFresh({ artifact: paths.keeps, dependencies: [paths.input] }) &&
		isArtifactFresh({ artifact: paths.cleanVideo, dependencies: [paths.input] })
	);
}

function resolveCleanVideo({ paths }: { paths: VlogPaths }): string {
	if (existsSync(paths.cleanVideo)) return paths.cleanVideo;
	const decisions = readJsonFile({ filePath: paths.decisions });
	if (Array.isArray(decisions) && decisions.length === 0) return paths.input;
	throw new Error("Clean stage produced decisions but no cleaned video");
}

function isPortraitReusable({
	paths,
	cleanVideo,
}: {
	paths: VlogPaths;
	cleanVideo: string;
}): boolean {
	return isArtifactFresh({
		artifact: paths.portraitVideo,
		dependencies: [cleanVideo],
	});
}

function isBackgroundReusable({
	options,
	paths,
	cleanVideo,
}: {
	options: VlogOptions;
	paths: VlogPaths;
	cleanVideo: string;
}): boolean {
	if (!options.background) return false;
	const dependencies = [cleanVideo, options.background];
	return (
		isArtifactFresh({
			artifact: paths.cutoutVideo,
			dependencies,
		}) &&
		isArtifactFresh({
			artifact: paths.editableVideo,
			dependencies: [paths.cutoutVideo, options.background, cleanVideo],
		})
	);
}

function markStage({
	manifest,
	paths,
	stage,
	status,
	details,
	error,
}: {
	manifest: VlogManifest;
	paths: VlogPaths;
	stage: VlogStage;
	status: VlogManifest["stages"][VlogStage]["status"];
	details?: string;
	error?: string;
}): void {
	const previous = manifest.stages[stage];
	manifest.stages[stage] = {
		...previous,
		status,
		startedAt:
			status === "running" ? new Date().toISOString() : previous.startedAt,
		finishedAt:
			status === "completed" || status === "skipped" || status === "failed"
				? new Date().toISOString()
				: previous.finishedAt,
		details,
		error,
	};
	writeManifest({ manifest, paths });
}

async function runAndRecord({
	manifest,
	paths,
	stage,
	label,
	tool,
	args,
	echoOutput,
	env,
}: {
	manifest: VlogManifest;
	paths: VlogPaths;
	stage: VlogStage;
	label: string;
	tool: ToolCommand;
	args: string[];
	echoOutput: boolean;
	env: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
	const result = await runCommand({
		tool,
		args,
		logPath: join(paths.logsDir, `${stage}-${label}.log`),
		echoOutput,
		env,
	});
	manifest.commands.push({
		stage,
		command: result.command,
		cwd: tool.cwd,
		logPath: result.logPath,
		exitCode: result.exitCode,
		startedAt: result.startedAt,
		finishedAt: result.finishedAt,
	});
	writeManifest({ manifest, paths });
	return result;
}

async function executeStage({
	manifest,
	paths,
	stage,
	operation,
}: {
	manifest: VlogManifest;
	paths: VlogPaths;
	stage: VlogStage;
	operation: () => Promise<string>;
}): Promise<void> {
	markStage({ manifest, paths, stage, status: "running" });
	try {
		const details = await operation();
		markStage({ manifest, paths, stage, status: "completed", details });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		markStage({ manifest, paths, stage, status: "failed", error: message });
		throw error;
	}
}

function skipStage({
	manifest,
	paths,
	stage,
	details,
}: {
	manifest: VlogManifest;
	paths: VlogPaths;
	stage: VlogStage;
	details: string;
}): void {
	markStage({ manifest, paths, stage, status: "skipped", details });
}

function printResult({
	manifest,
	options,
}: {
	manifest: VlogManifest;
	options: VlogOptions;
}): void {
	if (options.json) {
		process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
		return;
	}
	if (options.analyzeOnly) {
		process.stdout.write(
			`\nAnalysis complete: ${manifest.cleanSummary?.cuts ?? 0} cuts planned\n${manifest.artifacts.metadataDir}\n`
		);
		return;
	}
	process.stdout.write(
		`\nQCut Vlog complete\nEditable: ${manifest.artifacts.editableVideo}\nSRT: ${manifest.artifacts.srt}\nHard-captioned: ${manifest.artifacts.finalVideo}\nPreview: ${manifest.artifacts.previewImage}\nManifest: ${join(manifest.outputDir, "vlog-manifest.json")}\n`
	);
}

export async function runVlog({
	argv,
	env = process.env,
	printOutput = true,
}: {
	argv: string[];
	env?: NodeJS.ProcessEnv;
	printOutput?: boolean;
}): Promise<VlogManifest | undefined> {
	const options = parseVlogOptions({ argv });
	if (options.help) {
		process.stdout.write(renderUsage());
		return;
	}
	const paths = createVlogPaths({ options });
	prepareOutput({ options, paths });
	const manifest = options.resume
		? loadManifest({ options, paths })
		: createManifest({ options, paths });
	writeManifest({ manifest, paths });
	const toolchain = resolveToolchain({
		scriptDirectory: SCRIPT_DIRECTORY,
		env,
	});
	const echoOutput = !options.json;

	if (options.resume && isCleanReusable({ paths })) {
		skipStage({
			manifest,
			paths,
			stage: "clean",
			details: "Reused fresh clean metadata and video",
		});
	} else {
		await executeStage({
			manifest,
			paths,
			stage: "clean",
			operation: async () => {
				await runAndRecord({
					manifest,
					paths,
					stage: "clean",
					label: "qcut",
					tool: toolchain.qcut,
					args: buildCleanArgs({ options, paths }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.words) || !existsSync(paths.decisions)) {
					throw new Error("Clean stage did not write word/decision metadata");
				}
				manifest.cleanSummary = readCleanSummary({ paths });
				return `${manifest.cleanSummary.cuts} cuts planned`;
			},
		});
	}
	manifest.cleanSummary = readCleanSummary({ paths });
	writeManifest({ manifest, paths });

	if (options.analyzeOnly) {
		if (printOutput) printResult({ manifest, options });
		return manifest;
	}

	const cleanVideo = resolveCleanVideo({ paths });
	manifest.artifacts.cleanVideo = cleanVideo;
	let workingVideo = cleanVideo;
	if (options.background) {
		skipStage({
			manifest,
			paths,
			stage: "portrait",
			details:
				"Portrait filter is applied to the transparent person during background composition",
		});
	} else if (!isPortraitEnabled({ options })) {
		skipStage({
			manifest,
			paths,
			stage: "portrait",
			details: "Portrait filter and beauty smoothing are disabled",
		});
	} else if (
		options.resume &&
		isPortraitReusable({ paths, cleanVideo })
	) {
		skipStage({
			manifest,
			paths,
			stage: "portrait",
			details: "Reused portrait video newer than the cleaned video",
		});
		workingVideo = paths.portraitVideo;
	} else {
		await executeStage({
			manifest,
			paths,
			stage: "portrait",
			operation: async () => {
				await runAndRecord({
					manifest,
					paths,
					stage: "portrait",
					label: "qcut",
					tool: toolchain.qcut,
					args: buildPortraitArgs({ options, paths, cleanVideo }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.portraitVideo)) {
					throw new Error("Portrait filter did not create the editable MP4");
				}
				return `Applied ${options.portraitFilter} with beauty ${options.beauty}`;
			},
		});
		workingVideo = paths.portraitVideo;
	}
	manifest.artifacts.portraitVideo =
		workingVideo === paths.portraitVideo ? paths.portraitVideo : undefined;

	if (!options.background) {
		skipStage({
			manifest,
			paths,
			stage: "background",
			details: "No background requested; portrait result is the editable source",
		});
		manifest.artifacts.editableVideo = workingVideo;
	} else if (
		options.resume &&
		isBackgroundReusable({ options, paths, cleanVideo })
	) {
		skipStage({
			manifest,
			paths,
			stage: "background",
			details: "Reused fresh person cutout and background composite",
		});
		workingVideo = paths.editableVideo;
	} else {
		await executeStage({
			manifest,
			paths,
			stage: "background",
			operation: async () => {
				await runAndRecord({
					manifest,
					paths,
					stage: "background",
					label: "qcut",
					tool: toolchain.qcut,
					args: buildBackgroundArgs({ options, paths, cleanVideo }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.cutoutVideo)) {
					throw new Error("Person cutout did not create a transparent WebM");
				}
				if (!existsSync(paths.editableVideo)) {
					throw new Error(
						"Background composition did not create the editable MP4"
					);
				}
				return "Created transparent person layer and editable background composite";
			},
		});
		workingVideo = paths.editableVideo;
	}
	manifest.artifacts.editableVideo = workingVideo;
	writeManifest({ manifest, paths });
	if (
		options.resume &&
		isArtifactFresh({
			artifact: paths.cleanAudio,
			dependencies: [workingVideo],
		})
	) {
		skipStage({
			manifest,
			paths,
			stage: "extract-audio",
			details: "Reused audio newer than the cleaned video",
		});
	} else {
		await executeStage({
			manifest,
			paths,
			stage: "extract-audio",
			operation: async () => {
				await runAndRecord({
					manifest,
					paths,
					stage: "extract-audio",
					label: "ffmpeg",
					tool: toolchain.ffmpeg,
					args: buildAudioExtractArgs({ workingVideo, paths }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.cleanAudio)) {
					throw new Error(
						"FFmpeg did not create the clean transcription audio"
					);
				}
				return "Extracted transcription audio from the final cleaned video";
			},
		});
	}

	const reusableSrt =
		options.resume &&
		isArtifactFresh({
			artifact: paths.srt,
			dependencies: [paths.cleanAudio],
		}) &&
		parseSrtContent({ content: readFileSync(paths.srt, "utf8") }).length > 0;
	if (reusableSrt) {
		skipStage({
			manifest,
			paths,
			stage: "transcribe",
			details: "Reused SRT newer than the clean audio",
		});
	} else {
		await executeStage({
			manifest,
			paths,
			stage: "transcribe",
			operation: async () => {
				await runAndRecord({
					manifest,
					paths,
					stage: "transcribe",
					label: "qcut",
					tool: toolchain.qcut,
					args: buildTranscribeArgs({ options, paths }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.srt))
					throw new Error("Transcription did not create an SRT");
				const entries = parseSrtContent({
					content: readFileSync(paths.srt, "utf8"),
				});
				if (entries.length === 0)
					throw new Error("Generated SRT has no entries");
				return `Generated ${entries.length} subtitle cards from clean audio`;
			},
		});
	}

	if (
		options.resume &&
		isArtifactFresh({
			artifact: paths.finalVideo,
			dependencies: [workingVideo, paths.srt],
		})
	) {
		skipStage({
			manifest,
			paths,
			stage: "subtitle",
			details: "Reused final video newer than its video and SRT inputs",
		});
	} else {
		await executeStage({
			manifest,
			paths,
			stage: "subtitle",
			operation: async () => {
				await runAndRecord({
					manifest,
					paths,
					stage: "subtitle",
					label: "qcut",
					tool: toolchain.qcut,
					args: buildSubtitleArgs({ options, paths, workingVideo }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.finalVideo)) {
					throw new Error("Subtitle export did not create the final MP4");
				}
				return `Burned subtitles with the ${options.preset} preset`;
			},
		});
	}

	await executeStage({
		manifest,
		paths,
		stage: "verify",
		operation: async () => {
			const sourceDuration = await probeDuration({
				tool: toolchain.ffprobe,
				filePath: paths.input,
				logPath: join(paths.logsDir, "verify-probe-source.log"),
				env,
			});
			const workingDuration = await probeDuration({
				tool: toolchain.ffprobe,
				filePath: workingVideo,
				logPath: join(paths.logsDir, "verify-probe-clean.log"),
				env,
			});
			const finalDuration = await probeDuration({
				tool: toolchain.ffprobe,
				filePath: paths.finalVideo,
				logPath: join(paths.logsDir, "verify-probe-final.log"),
				env,
			});
			const durationDifference = assertDurationParity({
				workingDuration,
				finalDuration,
			});
			const entries = parseSrtContent({
				content: readFileSync(paths.srt, "utf8"),
			});
			const previewTime = getPreviewTime({ entries });
			if (options.background) {
				await runAndRecord({
					manifest,
					paths,
					stage: "verify",
					label: "background-preview",
					tool: toolchain.ffmpeg,
					args: buildBackgroundPreviewArgs({ paths, previewTime }),
					echoOutput,
					env,
				});
				if (!existsSync(paths.backgroundPreviewImage)) {
					throw new Error("Background verification frame was not created");
				}
			}
			await runAndRecord({
				manifest,
				paths,
				stage: "verify",
				label: "preview",
				tool: toolchain.ffmpeg,
				args: buildPreviewArgs({ paths, previewTime }),
				echoOutput,
				env,
			});
			if (!existsSync(paths.previewImage)) {
				throw new Error("Verification frame was not created");
			}
			manifest.verification = {
				sourceDuration,
				workingDuration,
				finalDuration,
				removedDuration: Math.max(0, sourceDuration - workingDuration),
				durationDifference,
				subtitleCount: entries.length,
				previewTime,
				previewImage: paths.previewImage,
				backgroundPreviewImage: options.background
					? paths.backgroundPreviewImage
					: undefined,
			};
			return `${entries.length} subtitles; duration parity ${durationDifference.toFixed(3)}s`;
		},
	});

	writeManifest({ manifest, paths });
	if (printOutput) printResult({ manifest, options });
	return manifest;
}

if (import.meta.main) {
	runVlog({ argv: process.argv.slice(2) }).catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		const wantsJson = process.argv.includes("--json");
		if (wantsJson) {
			process.stderr.write(
				`${JSON.stringify({ status: "error", error: message })}\n`
			);
		} else {
			process.stderr.write(`qcut-vlog: ${message}\n`);
		}
		process.exitCode = 1;
	});
}
