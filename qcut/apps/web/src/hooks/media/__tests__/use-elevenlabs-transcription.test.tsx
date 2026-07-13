import { act, renderHook } from "@testing-library/react";
import { platform } from "@qcut/platform-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElevenLabsTranscribeResult } from "@/types/electron";
import { useElevenLabsTranscription } from "../use-elevenlabs-transcription";

vi.mock("@qcut/platform-core", () => ({ platform: vi.fn() }));

const TRANSCRIPTION_RESULT: ElevenLabsTranscribeResult = {
	text: "hello",
	language_code: "eng",
	language_probability: 0.99,
	words: [
		{
			text: "hello",
			start: 0,
			end: 0.5,
			type: "word",
			speaker_id: null,
		},
	],
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("useElevenLabsTranscription", () => {
	beforeEach(() => vi.mocked(platform).mockReset());

	it("ignores a cloud result that arrives after cancellation", async () => {
		const request = deferred<ElevenLabsTranscribeResult>();
		const elevenlabs = vi.fn().mockReturnValue(request.promise);
		vi.mocked(platform).mockReturnValue({
			transcription: { elevenlabs },
		} as unknown as ReturnType<typeof platform>);
		const controller = new AbortController();
		const { result } = renderHook(() => useElevenLabsTranscription());
		let transcription!: Promise<ElevenLabsTranscribeResult | null>;

		act(() => {
			transcription = result.current.transcribeMedia({
				filePath: "/tmp/interview.mp3",
				signal: controller.signal,
			});
		});
		controller.abort();
		request.resolve(TRANSCRIPTION_RESULT);

		await expect(transcription).resolves.toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("does not start cloud transcription when canceled during extraction", async () => {
		const extraction = deferred<{ audioPath: string; fileSize: number }>();
		const extractAudio = vi.fn().mockReturnValue(extraction.promise);
		const elevenlabs = vi.fn().mockResolvedValue(TRANSCRIPTION_RESULT);
		vi.mocked(platform).mockReturnValue({
			ffmpeg: { extractAudio },
			transcription: { elevenlabs },
		} as unknown as ReturnType<typeof platform>);
		const controller = new AbortController();
		const { result } = renderHook(() => useElevenLabsTranscription());
		let transcription!: Promise<ElevenLabsTranscribeResult | null>;

		act(() => {
			transcription = result.current.transcribeMedia({
				filePath: "/tmp/interview.mp4",
				signal: controller.signal,
			});
		});
		controller.abort();
		extraction.resolve({ audioPath: "/tmp/interview.mp3", fileSize: 1024 });

		await expect(transcription).resolves.toBeNull();
		expect(elevenlabs).not.toHaveBeenCalled();
	});
});
