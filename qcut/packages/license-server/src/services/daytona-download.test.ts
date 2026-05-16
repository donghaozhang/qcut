import { describe, expect, it, vi } from "vitest";
import { downloadDaytonaFileBytes } from "./daytona-download";

function buildMultipartPart({
	boundary,
	name,
	filename,
	bytes,
}: {
	boundary: string;
	name: string;
	filename: string;
	bytes: Uint8Array;
}): Uint8Array {
	const encoder = new TextEncoder();
	const prefix = encoder.encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
	);
	const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
	const output = new Uint8Array(prefix.length + bytes.length + suffix.length);
	output.set(prefix, 0);
	output.set(bytes, prefix.length);
	output.set(suffix, prefix.length + bytes.length);
	return output;
}

function mockSandbox({
	data,
	contentType,
}: {
	data: unknown;
	contentType: string;
}) {
	const downloadFiles = vi.fn().mockResolvedValue({
		data,
		headers: { "content-type": contentType },
	});
	return {
		sandbox: { fs: { apiClient: { downloadFiles } } },
		downloadFiles,
	};
}

describe("downloadDaytonaFileBytes", () => {
	it("extracts the requested file from Daytona multipart bytes", async () => {
		const boundary = "qcut-boundary";
		const remotePath = "/tmp/qcut-output/result.png";
		const { sandbox, downloadFiles } = mockSandbox({
			contentType: `multipart/form-data; boundary=${boundary}`,
			data: buildMultipartPart({
				boundary,
				name: "file",
				filename: remotePath,
				bytes: new Uint8Array([1, 2, 3]),
			}),
		});

		const bytes = await downloadDaytonaFileBytes({
			sandbox,
			remotePath,
			timeoutSeconds: 600,
		});

		expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
		expect(downloadFiles).toHaveBeenCalledWith(
			{ paths: [remotePath] },
			{ responseType: "arraybuffer", timeout: 600_000 }
		);
	});

	it("throws Daytona multipart error parts", async () => {
		const boundary = "qcut-boundary";
		const remotePath = "/tmp/qcut-output/missing.mp4";
		const { sandbox } = mockSandbox({
			contentType: `multipart/form-data; boundary=${boundary}`,
			data: buildMultipartPart({
				boundary,
				name: "error",
				filename: remotePath,
				bytes: new TextEncoder().encode("file not found"),
			}),
		});

		await expect(
			downloadDaytonaFileBytes({
				sandbox,
				remotePath,
				timeoutSeconds: 600,
			})
		).rejects.toThrow("file not found");
	});

	it("returns raw bytes when Daytona responds without multipart", async () => {
		const remotePath = "/tmp/qcut-output/result.txt";
		const { sandbox } = mockSandbox({
			contentType: "application/octet-stream",
			data: new Uint8Array([4, 5, 6]),
		});

		const bytes = await downloadDaytonaFileBytes({
			sandbox,
			remotePath,
			timeoutSeconds: 600,
		});

		expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
	});
});
