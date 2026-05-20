import { describe, expect, it } from "vitest";

import {
	buildApp,
	buildMultipartDownload,
	buildTerminalArtifactListCommand,
	daytonaMocks,
	jsonHeaders,
	makeAgentSession,
	normalizeUploadedFilename,
	parseTerminalArtifactFiles,
	parseTerminalArtifactList,
	mockSelectRowsOnce,
} from "./agent.test-utils";

describe("agent terminal artifacts", () => {
	it("builds a shell artifact list fallback command for Daytona process namespace", () => {
		const command = buildTerminalArtifactListCommand();

		expect(command).toContain("sh -lc");
		expect(command).toContain("for file in /tmp/qcut-output/*");
		expect(command).toContain("wc -c");
	});

	it("parses only direct safe files from Daytona find output", () => {
		expect(
			parseTerminalArtifactList({
				stdout: [
					"result.png\t120",
					"clip.mp4\t4096",
					"../secret.txt\t10",
					"nested/file.txt\t20",
					"bad.txt\tnot-a-number",
				].join("\n"),
			})
		).toEqual([
			{ filename: "result.png", bytes: 120 },
			{ filename: "clip.mp4", bytes: 4096 },
			{ filename: "bad.txt", bytes: 0 },
		]);
	});

	it("parses only direct safe files from Daytona file details", () => {
		expect(
			parseTerminalArtifactFiles({
				files: [
					{ name: "result.png", size: 120, isDir: false },
					{ name: "clip.mp4", size: 4096, isDir: false },
					{ name: "nested", size: 0, isDir: true },
					{ name: "../secret.txt", size: 10, isDir: false },
					{ name: "bad.txt", size: Number.NaN, isDir: false },
				],
			})
		).toEqual([
			{ filename: "bad.txt", bytes: 0 },
			{ filename: "clip.mp4", bytes: 4096 },
			{ filename: "result.png", bytes: 120 },
		]);
	});

	it("lists files from the active Daytona terminal sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles.mockResolvedValue([
					{ name: "result.png", size: 120, isDir: false },
					{ name: "clip.mp4", size: 4096, isDir: false },
				]),
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/artifacts"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.artifacts).toEqual([
			expect.objectContaining({
				id: "clip.mp4",
				sessionId: "agent-session-1",
				kind: "video",
				bytes: 4096,
			}),
			expect.objectContaining({
				id: "result.png",
				sessionId: "agent-session-1",
				kind: "image",
				bytes: 120,
			}),
		]);
		expect(daytonaMocks.get).toHaveBeenCalledWith("sandbox-1");
		expect(daytonaMocks.listFiles).toHaveBeenCalledWith("/tmp/qcut-output");
	});

	it("falls back to shell listing when Daytona FS listing is empty", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles.mockResolvedValue([]),
			},
			process: {
				executeCommand: daytonaMocks.executeCommand.mockResolvedValue({
					exitCode: 0,
					result: "result.png\t120\n",
				}),
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/artifacts"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.artifacts).toEqual([
			expect.objectContaining({
				id: "result.png",
				bytes: 120,
			}),
		]);
		expect(daytonaMocks.executeCommand).toHaveBeenCalledWith(
			expect.stringContaining("sh -lc"),
			"/home/qcut/qcut",
			undefined,
			30
		);
	});

	it("downloads a file from the active Daytona terminal sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		const boundary = "qcut-test-boundary";
		daytonaMocks.get.mockResolvedValue({
			fs: {
				apiClient: {
					downloadFiles: daytonaMocks.downloadFiles.mockResolvedValue({
						data: buildMultipartDownload({
							boundary,
							filename: "/tmp/qcut-output/result.png",
							bytes: new Uint8Array([1, 2, 3]),
						}),
						headers: {
							"content-type": `multipart/form-data; boundary=${boundary}`,
						},
					}),
				},
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/artifacts/result.png/download"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="result.png"'
		);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3])
		);
		expect(daytonaMocks.downloadFiles).toHaveBeenCalledWith(
			{ paths: ["/tmp/qcut-output/result.png"] },
			{ responseType: "arraybuffer", timeout: 600_000 }
		);
		expect(daytonaMocks.downloadFile).not.toHaveBeenCalled();
	});

	it("lists uploaded input files and generated output files as one virtual folder", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.listFiles
			.mockResolvedValueOnce([
				{ name: "source.png", size: 12, isDir: false },
				{ name: "nested", size: 0, isDir: true },
			])
			.mockResolvedValueOnce([
				{ name: "result.mp4", size: 4096, isDir: false },
			]);
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles,
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.files).toEqual([
			expect.objectContaining({
				id: "input/source.png",
				kind: "image",
				storagePath: "/tmp/qcut-input/source.png",
				bytes: 12,
				meta: expect.objectContaining({ folder: "input" }),
			}),
			expect.objectContaining({
				id: "output/result.mp4",
				kind: "video",
				storagePath: "/tmp/qcut-output/result.mp4",
				bytes: 4096,
				meta: expect.objectContaining({ folder: "output" }),
			}),
		]);
		expect(daytonaMocks.listFiles).toHaveBeenNthCalledWith(
			1,
			"/tmp/qcut-input"
		);
		expect(daytonaMocks.listFiles).toHaveBeenNthCalledWith(
			2,
			"/tmp/qcut-output"
		);
	});

	it("lists any requested sandbox filesystem folder", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.listFiles.mockResolvedValue([
			{ name: "qcut-output", size: 0, isDir: true },
			{ name: "notes.txt", size: 12, isDir: false },
		]);
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles,
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files?path=%2Ftmp"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.path).toBe("/tmp");
		expect(body.parentPath).toBe("/");
		expect(body.files).toEqual([
			expect.objectContaining({
				id: "/tmp/qcut-output",
				kind: "folder",
				storagePath: "/tmp/qcut-output",
				meta: expect.objectContaining({
					folder: "filesystem",
					isDir: true,
					path: "/tmp/qcut-output",
				}),
			}),
			expect.objectContaining({
				id: "/tmp/notes.txt",
				kind: "log",
				storagePath: "/tmp/notes.txt",
				bytes: 12,
				meta: expect.objectContaining({
					folder: "filesystem",
					isDir: false,
					path: "/tmp/notes.txt",
				}),
			}),
		]);
		expect(daytonaMocks.listFiles).toHaveBeenCalledWith("/tmp");
	});

	it("rejects sandbox filesystem paths with traversal", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles,
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files?path=%2Ftmp%2F..%2Fsecret"
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "session_file_path_invalid" });
		expect(daytonaMocks.listFiles).not.toHaveBeenCalled();
	});

	it("uploads selected browser files into the active Daytona input folder", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.createFolder.mockResolvedValue(undefined);
		daytonaMocks.uploadFile.mockResolvedValue(undefined);
		daytonaMocks.get.mockResolvedValue({
			fs: {
				createFolder: daytonaMocks.createFolder,
				uploadFile: daytonaMocks.uploadFile,
			},
		});
		const formData = new FormData();
		formData.append(
			"file",
			new File([new Uint8Array([1, 2, 3])], "source.png", {
				type: "image/png",
			})
		);
		formData.append(
			"file",
			new File(["hello"], "notes.txt", {
				type: "text/plain",
			})
		);

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files",
			{
				method: "POST",
				body: formData,
			}
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.files).toEqual([
			expect.objectContaining({
				id: "input/source.png",
				storagePath: "/tmp/qcut-input/source.png",
				bytes: 3,
			}),
			expect.objectContaining({
				id: "input/notes.txt",
				storagePath: "/tmp/qcut-input/notes.txt",
				bytes: 5,
			}),
		]);
		expect(daytonaMocks.createFolder).toHaveBeenCalledWith(
			"/tmp/qcut-input",
			"755"
		);
		expect(daytonaMocks.uploadFile).toHaveBeenCalledWith(
			expect.objectContaining({ name: "source.png", size: 3 }),
			"/tmp/qcut-input/source.png",
			600
		);
		expect(daytonaMocks.uploadFile).toHaveBeenCalledWith(
			expect.objectContaining({ name: "notes.txt", size: 5 }),
			"/tmp/qcut-input/notes.txt",
			600
		);
	});

	it("uploads selected browser files into a requested sandbox folder", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.createFolder.mockResolvedValue(undefined);
		daytonaMocks.uploadFile.mockResolvedValue(undefined);
		daytonaMocks.get.mockResolvedValue({
			fs: {
				createFolder: daytonaMocks.createFolder,
				uploadFile: daytonaMocks.uploadFile,
			},
		});
		const formData = new FormData();
		formData.append(
			"file",
			new File(["hello"], "notes.txt", {
				type: "text/plain",
			})
		);

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files?path=%2Ftmp%2Fqcut-output",
			{
				method: "POST",
				body: formData,
			}
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.files).toEqual([
			expect.objectContaining({
				id: "/tmp/qcut-output/notes.txt",
				storagePath: "/tmp/qcut-output/notes.txt",
				meta: expect.objectContaining({
					folder: "filesystem",
					path: "/tmp/qcut-output/notes.txt",
				}),
			}),
		]);
		expect(daytonaMocks.createFolder).toHaveBeenCalledWith(
			"/tmp/qcut-output",
			"755"
		);
		expect(daytonaMocks.uploadFile).toHaveBeenCalledWith(
			expect.objectContaining({ name: "notes.txt", size: 5 }),
			"/tmp/qcut-output/notes.txt",
			600
		);
	});

	it("downloads an uploaded input file from the active Daytona sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		const boundary = "qcut-test-boundary";
		daytonaMocks.get.mockResolvedValue({
			fs: {
				apiClient: {
					downloadFiles: daytonaMocks.downloadFiles.mockResolvedValue({
						data: buildMultipartDownload({
							boundary,
							filename: "/tmp/qcut-input/source.png",
							bytes: new Uint8Array([4, 5, 6]),
						}),
						headers: {
							"content-type": `multipart/form-data; boundary=${boundary}`,
						},
					}),
				},
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files/input/source.png/download"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([4, 5, 6])
		);
		expect(daytonaMocks.downloadFiles).toHaveBeenCalledWith(
			{ paths: ["/tmp/qcut-input/source.png"] },
			{ responseType: "arraybuffer", timeout: 600_000 }
		);
	});

	it("downloads a file by full sandbox filesystem path", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		const boundary = "qcut-test-boundary";
		daytonaMocks.get.mockResolvedValue({
			fs: {
				apiClient: {
					downloadFiles: daytonaMocks.downloadFiles.mockResolvedValue({
						data: buildMultipartDownload({
							boundary,
							filename: "/tmp/qcut-output/result.png",
							bytes: new Uint8Array([7, 8, 9]),
						}),
						headers: {
							"content-type": `multipart/form-data; boundary=${boundary}`,
						},
					}),
				},
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files/download?path=%2Ftmp%2Fqcut-output%2Fresult.png"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="result.png"'
		);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([7, 8, 9])
		);
		expect(daytonaMocks.downloadFiles).toHaveBeenCalledWith(
			{ paths: ["/tmp/qcut-output/result.png"] },
			{ responseType: "arraybuffer", timeout: 600_000 }
		);
	});

	it("downloads a sandbox filesystem folder as a tar archive", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		const boundary = "qcut-folder-boundary";
		daytonaMocks.executeCommand
			.mockResolvedValueOnce({
				exitCode: 0,
				result: "/tmp/qcut-folder-download.abcd12.tar.gz\n",
			})
			.mockResolvedValueOnce({ exitCode: 0, result: "" });
		daytonaMocks.get.mockResolvedValue({
			process: {
				executeCommand: daytonaMocks.executeCommand,
			},
			fs: {
				apiClient: {
					downloadFiles: daytonaMocks.downloadFiles.mockResolvedValue({
						data: buildMultipartDownload({
							boundary,
							filename: "/tmp/qcut-folder-download.abcd12.tar.gz",
							bytes: new Uint8Array([10, 11, 12]),
						}),
						headers: {
							"content-type": `multipart/form-data; boundary=${boundary}`,
						},
					}),
				},
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/files/download?path=%2Ftmp%2Fqcut-output&archive=tar"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/gzip");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="qcut-output.tar.gz"'
		);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([10, 11, 12])
		);
		expect(daytonaMocks.executeCommand).toHaveBeenCalledTimes(2);
		expect(daytonaMocks.executeCommand).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("tar -C"),
			"/tmp",
			undefined,
			600
		);
		expect(daytonaMocks.downloadFiles).toHaveBeenCalledWith(
			{ paths: ["/tmp/qcut-folder-download.abcd12.tar.gz"] },
			{ responseType: "arraybuffer", timeout: 600_000 }
		);
	});

	it("normalizes uploaded browser filenames without allowing paths", () => {
		expect(
			normalizeUploadedFilename({ value: "C:\\fakepath\\source.png" })
		).toBe("source.png");
		expect(normalizeUploadedFilename({ value: "../secret.txt" })).toBe(
			"secret.txt"
		);
		expect(normalizeUploadedFilename({ value: "" })).toBeNull();
	});
});
