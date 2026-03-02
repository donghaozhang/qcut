"use client";

import { useCallback, useState, useEffect } from "react";
import { KeyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { ApiKeyField, KeySourceBadge } from "./api-key-field";

/** API key management panel with inputs for FAL, Freesound, Gemini, OpenRouter, and Anthropic keys. */
export function ApiKeysView() {
	const [falApiKey, setFalApiKey] = useState("");
	const [freesoundApiKey, setFreesoundApiKey] = useState("");
	const [geminiApiKey, setGeminiApiKey] = useState("");
	const [openRouterApiKey, setOpenRouterApiKey] = useState("");
	const [anthropicApiKey, setAnthropicApiKey] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isTestingFreesound, setIsTestingFreesound] = useState(false);
	const [freesoundTestResult, setFreesoundTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [keyStatuses, setKeyStatuses] = useState<Record<
		string,
		{ set: boolean; source: string }
	> | null>(null);

	const loadApiKeys = useCallback(async () => {
		try {
			if (window.electronAPI?.apiKeys) {
				const keys = await window.electronAPI.apiKeys.get();
				if (keys) {
					setFalApiKey(keys.falApiKey || "");
					setFreesoundApiKey(keys.freesoundApiKey || "");
					setGeminiApiKey(keys.geminiApiKey || "");
					setOpenRouterApiKey(keys.openRouterApiKey || "");
					setAnthropicApiKey(keys.anthropicApiKey || "");
				}
				if (window.electronAPI.apiKeys.status) {
					const statuses = await window.electronAPI.apiKeys.status();
					setKeyStatuses(statuses);
				}
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
			if (!window.electronAPI?.apiKeys) {
				throw new Error("Electron API not available");
			}

			await window.electronAPI.apiKeys.set({
				falApiKey: falApiKey.trim(),
				freesoundApiKey: freesoundApiKey.trim(),
				geminiApiKey: geminiApiKey.trim(),
				openRouterApiKey: openRouterApiKey.trim(),
				anthropicApiKey: anthropicApiKey.trim(),
			});

			setFreesoundTestResult(null);
			if (window.electronAPI?.apiKeys?.status) {
				const statuses = await window.electronAPI.apiKeys.status();
				setKeyStatuses(statuses);
			}
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
	]);

	const testFreesoundKey = useCallback(async () => {
		setIsTestingFreesound(true);
		setFreesoundTestResult(null);
		try {
			if (window.electronAPI?.sounds) {
				const result = await window.electronAPI.sounds.search({ q: "test" });
				setFreesoundTestResult({
					success: result.success,
					message: result.message || "Test completed",
				});
			}
		} catch {
			setFreesoundTestResult({ success: false, message: "Test failed" });
		} finally {
			setIsTestingFreesound(false);
		}
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

			<ApiKeyField
				label={
					<span className="flex items-center gap-2">
						FAL AI API Key
						{keyStatuses?.falApiKey && (
							<KeySourceBadge source={keyStatuses.falApiKey.source} />
						)}
					</span>
				}
				description={
					<>
						For AI image generation. Get your key at{" "}
						<span className="font-mono">fal.ai</span>
					</>
				}
				placeholder="Enter your FAL API key"
				value={falApiKey}
				onChange={setFalApiKey}
				testId="fal-api-key-input"
			/>

			<ApiKeyField
				label={
					<span className="flex items-center gap-2">
						Freesound API Key
						{keyStatuses?.freesoundApiKey && (
							<KeySourceBadge source={keyStatuses.freesoundApiKey.source} />
						)}
					</span>
				}
				description={
					<>
						For sound effects library. Get your key at{" "}
						<span className="font-mono">freesound.org/help/developers</span>
					</>
				}
				placeholder="Enter your Freesound API key"
				value={freesoundApiKey}
				onChange={(v) => {
					setFreesoundApiKey(v);
					setFreesoundTestResult(null);
				}}
				testId="freesound-api-key-input"
				onTest={testFreesoundKey}
				isTesting={isTestingFreesound}
				testResult={freesoundTestResult}
			/>

			<ApiKeyField
				label={
					<span className="flex items-center gap-2">
						Gemini API Key
						{keyStatuses?.geminiApiKey && (
							<KeySourceBadge source={keyStatuses.geminiApiKey.source} />
						)}
					</span>
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
				onChange={setGeminiApiKey}
				testId="gemini-api-key-input"
			/>

			<ApiKeyField
				label={
					<span className="flex items-center gap-2">
						OpenRouter API Key
						{keyStatuses?.openRouterApiKey && (
							<KeySourceBadge source={keyStatuses.openRouterApiKey.source} />
						)}
					</span>
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
				onChange={setOpenRouterApiKey}
				testId="openrouter-api-key-input"
			/>

			<ApiKeyField
				label={
					<span className="flex items-center gap-2">
						Anthropic API Key (Optional)
						{keyStatuses?.anthropicApiKey && (
							<KeySourceBadge source={keyStatuses.anthropicApiKey.source} />
						)}
					</span>
				}
				description={
					<>
						Claude Code uses your Claude Pro/Max subscription by default. Only
						set this if you prefer API credits instead.
					</>
				}
				placeholder="Optional: sk-ant-..."
				value={anthropicApiKey}
				onChange={setAnthropicApiKey}
				testId="anthropic-api-key-input"
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
				effect.
			</div>
		</div>
	);
}
