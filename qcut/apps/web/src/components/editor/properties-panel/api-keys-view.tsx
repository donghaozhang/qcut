"use client";

import { useCallback, useState, useEffect, type ReactNode } from "react";
import { KeyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	PlatformCapability,
	platform,
	type KeySource,
	type PlatformApiKeyStatus,
	type PlatformApiKeysStatus,
} from "@qcut/platform-core";
import { toast } from "sonner";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { ApiKeyField, KeySourceBadge } from "./api-key-field";
import { ApiKeysPrecedenceInfo } from "./api-keys-precedence-info";

type EditableApiKeyField =
	| "anthropicApiKey"
	| "elevenLabsApiKey"
	| "falApiKey"
	| "freesoundApiKey"
	| "geminiApiKey"
	| "gmiApiKey"
	| "openRouterApiKey"
	| "runwayApiKey";

const EDITABLE_API_KEY_FIELDS: readonly EditableApiKeyField[] = [
	"anthropicApiKey",
	"elevenLabsApiKey",
	"falApiKey",
	"freesoundApiKey",
	"geminiApiKey",
	"gmiApiKey",
	"openRouterApiKey",
	"runwayApiKey",
];

// Fields that electron/api-key-handler.ts mirrors into AICP's legacy
// credentials.env file during the ONE-ENV-FILE beta window (see
// AICP_ENV_MAP). Kept so users with long-running `aicp` CLI workflows
// keep reading these three keys from the file they historically watch.
// After the beta, this constant and the legacy sync both disappear —
// `~/.qcut/.env` is the single canonical destination.
const AICP_SYNCED_FIELDS: ReadonlySet<EditableApiKeyField> = new Set([
	"falApiKey",
	"geminiApiKey",
	"openRouterApiKey",
]);

function getActiveSource({
	status,
}: {
	status?: PlatformApiKeyStatus;
}): KeySource | undefined {
	if (
		!status ||
		status.source === "not-set" ||
		status.source === "localStorage"
	) {
		return undefined;
	}

	return status.source;
}

// Defensive accessor: `shadowedBy` is typed as required, but a status entry
// returned by an older Electron build (or a not-yet-rebuilt preload bundle)
// can omit it. Treat missing as "no shadows" rather than crashing the save.
function shadowedByOf(status: PlatformApiKeyStatus | undefined): readonly KeySource[] {
	return status?.shadowedBy ?? [];
}

export function countShadowedAppSaves({
	statuses,
	values,
}: {
	statuses: PlatformApiKeysStatus;
	values: Record<EditableApiKeyField, string>;
}) {
	return EDITABLE_API_KEY_FIELDS.filter(
		(field) =>
			values[field] !== "" &&
			shadowedByOf(statuses[field]).includes("electron")
	).length;
}

export function getShadowedBy({
	fieldIsDirty,
	status,
}: {
	fieldIsDirty: boolean;
	status?: PlatformApiKeyStatus;
}): readonly KeySource[] | undefined {
	if (!status) {
		return undefined;
	}

	const shadowedBy = shadowedByOf(status);

	if (
		fieldIsDirty &&
		status.source === "environment" &&
		!shadowedBy.includes("electron")
	) {
		return [...shadowedBy, "electron"];
	}

	return shadowedBy;
}

function ApiKeyLabel({
	children,
	status,
}: {
	children: ReactNode;
	status?: PlatformApiKeyStatus;
}) {
	return (
		<span className="flex items-center gap-2">
			{children}
			{status && <KeySourceBadge source={status.source} />}
		</span>
	);
}

/** API key management panel for provider keys stored in the app tier. */
export function ApiKeysView() {
	const [falApiKey, setFalApiKey] = useState("");
	const [freesoundApiKey, setFreesoundApiKey] = useState("");
	const [geminiApiKey, setGeminiApiKey] = useState("");
	const [openRouterApiKey, setOpenRouterApiKey] = useState("");
	const [anthropicApiKey, setAnthropicApiKey] = useState("");
	const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
	const [gmiApiKey, setGmiApiKey] = useState("");
	const [runwayApiKey, setRunwayApiKey] = useState("");
	const [dirtyFields, setDirtyFields] = useState<
		Partial<Record<EditableApiKeyField, boolean>>
	>({});
	const [isLoading, setIsLoading] = useState(true);
	const [isTestingFreesound, setIsTestingFreesound] = useState(false);
	const [freesoundTestResult, setFreesoundTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [keyStatuses, setKeyStatuses] = useState<PlatformApiKeysStatus | null>(
		null
	);

	const loadApiKeys = useCallback(async () => {
		try {
			const apiKeys = platform().apiKeys;
			const keys = await apiKeys.get();
			if (keys) {
				setFalApiKey(keys.falApiKey || "");
				setFreesoundApiKey(keys.freesoundApiKey || "");
				setGeminiApiKey(keys.geminiApiKey || "");
				setOpenRouterApiKey(keys.openRouterApiKey || "");
				setAnthropicApiKey(keys.anthropicApiKey || "");
				setElevenLabsApiKey(keys.elevenLabsApiKey || "");
				setGmiApiKey(keys.gmiApiKey || "");
				setRunwayApiKey(keys.runwayApiKey || "");
				setDirtyFields({});
			}
			if (apiKeys.status) {
				const statuses = await apiKeys.status();
				setKeyStatuses(statuses);
			}
		} catch (error) {
			handleError(error, {
				operation: "Load API Keys",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.LOW,
				showToast: false,
				metadata: { operation: "load-api-keys" },
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	const saveApiKeys = useCallback(async () => {
		try {
			const apiKeys = platform().apiKeys;
			const trimmedKeys: Record<EditableApiKeyField, string> = {
				anthropicApiKey: anthropicApiKey.trim(),
				elevenLabsApiKey: elevenLabsApiKey.trim(),
				falApiKey: falApiKey.trim(),
				freesoundApiKey: freesoundApiKey.trim(),
				geminiApiKey: geminiApiKey.trim(),
				gmiApiKey: gmiApiKey.trim(),
				openRouterApiKey: openRouterApiKey.trim(),
				runwayApiKey: runwayApiKey.trim(),
			};

			await apiKeys.set(trimmedKeys);

			setFreesoundTestResult(null);
			let shadowedSaves = 0;
			if (apiKeys.status) {
				const statuses = await apiKeys.status();
				setKeyStatuses(statuses);
				shadowedSaves = countShadowedAppSaves({
					statuses,
					values: trimmedKeys,
				});
			}

			const wroteAicpSyncedField = EDITABLE_API_KEY_FIELDS.some(
				(field) => trimmedKeys[field] !== "" && AICP_SYNCED_FIELDS.has(field)
			);
			const descriptionParts = [
				"Stored in QCut's encrypted keystore and written to ~/.qcut/.env (the canonical file tier).",
			];
			if (wroteAicpSyncedField) {
				descriptionParts.push(
					"FAL / Gemini / OpenRouter are also mirrored to the legacy AICP credentials.env during the migration window."
				);
			}
			if (shadowedSaves > 0) {
				descriptionParts.push(
					`${shadowedSaves} key(s) are currently overridden by a higher-priority source — see the warnings above.`
				);
			}

			toast.success("API keys saved", {
				description: descriptionParts.join(" "),
			});
			setDirtyFields({});
		} catch (error) {
			handleError(error, {
				operation: "Save API Keys",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.MEDIUM,
				metadata: { operation: "save-api-keys" },
			});
		}
	}, [
		falApiKey,
		freesoundApiKey,
		geminiApiKey,
		openRouterApiKey,
		anthropicApiKey,
		elevenLabsApiKey,
		gmiApiKey,
		runwayApiKey,
	]);

	const testFreesoundKey = useCallback(async () => {
		if (!platform().hasCapability(PlatformCapability.Sounds)) {
			setFreesoundTestResult({
				success: false,
				message: "Sound search is not available on this platform",
			});
			return;
		}
		setIsTestingFreesound(true);
		setFreesoundTestResult(null);
		try {
			const result = (await platform().sounds.search({
				query: "test",
			})) as Record<string, unknown>;
			setFreesoundTestResult({
				success: (result?.success as boolean) ?? false,
				message: (result?.message as string) || "Test completed",
			});
		} catch {
			setFreesoundTestResult({ success: false, message: "Test failed" });
		} finally {
			setIsTestingFreesound(false);
		}
	}, []);

	const markDirty = useCallback(({ field }: { field: EditableApiKeyField }) => {
		setDirtyFields((current) => {
			if (current[field]) {
				return current;
			}

			return { ...current, [field]: true };
		});
	}, []);

	useEffect(() => {
		loadApiKeys();
	}, [loadApiKeys]);

	if (isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<div className="text-sm text-muted-foreground">Loading API keys...</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="text-sm text-muted-foreground">
				Configure API keys for enhanced features like AI image generation and
				sound effects.
			</div>

			<ApiKeysPrecedenceInfo />

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.falApiKey}>
						FAL AI API Key
					</ApiKeyLabel>
				}
				description={
					<>
						For AI image generation. Get your key at{" "}
						<a
							href="https://fal.ai/dashboard/keys"
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-primary hover:underline"
						>
							fal.ai
						</a>
					</>
				}
				placeholder="Enter your FAL API key"
				value={falApiKey}
				onChange={(value) => {
					setFalApiKey(value);
					markDirty({ field: "falApiKey" });
				}}
				testId="fal-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.falApiKey === true,
					status: keyStatuses?.falApiKey,
				})}
				activeSource={getActiveSource({ status: keyStatuses?.falApiKey })}
				getKeyUrl="https://fal.ai/dashboard/keys"
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.freesoundApiKey}>
						Freesound API Key
					</ApiKeyLabel>
				}
				description={
					<>
						For sound effects library. Get your key at{" "}
						<a
							href="https://freesound.org/help/developers/"
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-primary hover:underline"
						>
							freesound.org/help/developers
						</a>
					</>
				}
				placeholder="Enter your Freesound API key"
				value={freesoundApiKey}
				onChange={(v) => {
					setFreesoundApiKey(v);
					markDirty({ field: "freesoundApiKey" });
					setFreesoundTestResult(null);
				}}
				testId="freesound-api-key-input"
				onTest={testFreesoundKey}
				isTesting={isTestingFreesound}
				testResult={freesoundTestResult}
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.freesoundApiKey === true,
					status: keyStatuses?.freesoundApiKey,
				})}
				activeSource={getActiveSource({
					status: keyStatuses?.freesoundApiKey,
				})}
				getKeyUrl="https://freesound.org/apiv2/apply/"
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.geminiApiKey}>
						Gemini API Key
					</ApiKeyLabel>
				}
				description={
					<>
						For AI caption transcription. Get your key at{" "}
						<a
							href="https://aistudio.google.com/app/apikey"
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-primary hover:underline"
						>
							aistudio.google.com/app/apikey
						</a>
					</>
				}
				placeholder="Enter your Gemini API key (AIza...)"
				value={geminiApiKey}
				onChange={(value) => {
					setGeminiApiKey(value);
					markDirty({ field: "geminiApiKey" });
				}}
				testId="gemini-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.geminiApiKey === true,
					status: keyStatuses?.geminiApiKey,
				})}
				activeSource={getActiveSource({ status: keyStatuses?.geminiApiKey })}
				getKeyUrl="https://aistudio.google.com/app/apikey"
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.openRouterApiKey}>
						OpenRouter API Key
					</ApiKeyLabel>
				}
				description={
					<>
						For Codex CLI (300+ AI models). Get your key at{" "}
						<a
							href="https://openrouter.ai/keys"
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-primary hover:underline"
						>
							openrouter.ai/keys
						</a>
					</>
				}
				placeholder="Enter your OpenRouter API key (sk-or-v1-...)"
				value={openRouterApiKey}
				onChange={(value) => {
					setOpenRouterApiKey(value);
					markDirty({ field: "openRouterApiKey" });
				}}
				testId="openrouter-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.openRouterApiKey === true,
					status: keyStatuses?.openRouterApiKey,
				})}
				activeSource={getActiveSource({
					status: keyStatuses?.openRouterApiKey,
				})}
				getKeyUrl="https://openrouter.ai/keys"
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.anthropicApiKey}>
						Anthropic API Key (Optional)
					</ApiKeyLabel>
				}
				description={
					<>
						Claude Code uses your Claude Pro/Max subscription by default. Only
						set this if you prefer API credits instead.
					</>
				}
				placeholder="Optional: sk-ant-..."
				value={anthropicApiKey}
				onChange={(value) => {
					setAnthropicApiKey(value);
					markDirty({ field: "anthropicApiKey" });
				}}
				testId="anthropic-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.anthropicApiKey === true,
					status: keyStatuses?.anthropicApiKey,
				})}
				activeSource={getActiveSource({
					status: keyStatuses?.anthropicApiKey,
				})}
				getKeyUrl="https://console.anthropic.com/settings/keys"
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.elevenLabsApiKey}>
						ElevenLabs API Key
					</ApiKeyLabel>
				}
				description="For text-to-speech and voice generation."
				placeholder="Enter your ElevenLabs API key"
				value={elevenLabsApiKey}
				onChange={(value) => {
					setElevenLabsApiKey(value);
					markDirty({ field: "elevenLabsApiKey" });
				}}
				testId="elevenlabs-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.elevenLabsApiKey === true,
					status: keyStatuses?.elevenLabsApiKey,
				})}
				activeSource={getActiveSource({
					status: keyStatuses?.elevenLabsApiKey,
				})}
				getKeyUrl="https://elevenlabs.io/app/settings/api-keys"
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.gmiApiKey}>GMI API Key</ApiKeyLabel>
				}
				description="For GMI Cloud video, image, and LLM models."
				placeholder="Enter your GMI API key"
				value={gmiApiKey}
				onChange={(value) => {
					setGmiApiKey(value);
					markDirty({ field: "gmiApiKey" });
				}}
				testId="gmi-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.gmiApiKey === true,
					status: keyStatuses?.gmiApiKey,
				})}
				activeSource={getActiveSource({ status: keyStatuses?.gmiApiKey })}
			/>

			<ApiKeyField
				label={
					<ApiKeyLabel status={keyStatuses?.runwayApiKey}>
						Runway API Key
					</ApiKeyLabel>
				}
				description="For Runway video generation models."
				placeholder="Enter your Runway API key"
				value={runwayApiKey}
				onChange={(value) => {
					setRunwayApiKey(value);
					markDirty({ field: "runwayApiKey" });
				}}
				testId="runway-api-key-input"
				shadowedBy={getShadowedBy({
					fieldIsDirty: dirtyFields.runwayApiKey === true,
					status: keyStatuses?.runwayApiKey,
				})}
				activeSource={getActiveSource({ status: keyStatuses?.runwayApiKey })}
			/>

			<div className="flex justify-end">
				<Button
					type="button"
					onClick={saveApiKeys}
					className="gap-2"
					data-testid="save-api-keys-button"
				>
					<KeyIcon className="h-4 w-4" aria-hidden="true" />
					Save API Keys
				</Button>
			</div>

			<div className="text-xs text-muted-foreground border-t pt-4">
				<strong>Note:</strong> API keys are stored securely on your device and
				never shared. Restart the application after saving for changes to take
				effect. See <em>How API key resolution works</em> above.
			</div>
		</div>
	);
}
