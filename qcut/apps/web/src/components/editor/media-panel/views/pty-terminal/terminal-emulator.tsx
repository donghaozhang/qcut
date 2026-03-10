"use client";

import { useEffect, useRef, useCallback } from "react";
import { platform } from "@qcut/platform-core";
import { debugError } from "@/lib/debug/debug-config";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";

/**
 * Props for the TerminalEmulator component.
 */
interface TerminalEmulatorProps {
	/** Internal tab ID for callback registry */
	tabId: string;
	/** PTY session ID to connect to, null if not connected */
	sessionId: string | null;
	/** Callback fired when terminal is initialized and ready */
	onReady?: () => void;
	/** Whether the terminal is currently visible in the UI */
	isVisible?: boolean;
}

/**
 * Terminal emulator component using xterm.js.
 * Provides a full terminal experience with ANSI color support, clipboard operations,
 * and automatic resizing. Connects to a PTY session via the store's callback registry.
 */
export function TerminalEmulator({
	tabId,
	sessionId,
	onReady,
	isVisible = true,
}: TerminalEmulatorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const sessionIdRef = useRef(sessionId);

	// Keep sessionId ref current for use in callbacks
	sessionIdRef.current = sessionId;

	const {
		setDimensions,
		resize,
		registerDataCallback,
		unregisterDataCallback,
		registerExitCallback,
		unregisterExitCallback,
	} = usePtyTerminalStore();

	const fitTerminal = useCallback(() => {
		const fitAddon = fitAddonRef.current;
		const terminal = terminalRef.current;
		if (!fitAddon || !terminal) {
			return;
		}
		try {
			fitAddon.fit();
			setDimensions(terminal.cols, terminal.rows);
			resize().catch(() => {
				// Ignore resize errors (e.g., during unmount or when PTY unavailable)
			});
		} catch {
			// Ignore fit/resize errors during terminal teardown
		}
	}, [setDimensions, resize]);

	// Initialize terminal (runs once per mount, independent of sessionId changes)
	// biome-ignore lint/correctness/useExhaustiveDependencies: initialization effect — adding fitTerminal would reinitialize terminal
	useEffect(() => {
		if (!containerRef.current) return;
		// Create terminal instance
		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
			theme: {
				background: "#1a1a1a",
				foreground: "#e0e0e0",
				cursor: "#ffffff",
				cursorAccent: "#000000",
				selectionBackground: "#5c5c5c",
				black: "#000000",
				red: "#e06c75",
				green: "#98c379",
				yellow: "#e5c07b",
				blue: "#61afef",
				magenta: "#c678dd",
				cyan: "#56b6c2",
				white: "#abb2bf",
				brightBlack: "#5c6370",
				brightRed: "#e06c75",
				brightGreen: "#98c379",
				brightYellow: "#e5c07b",
				brightBlue: "#61afef",
				brightMagenta: "#c678dd",
				brightCyan: "#56b6c2",
				brightWhite: "#ffffff",
			},
			allowProposedApi: true,
		});

		// Load addons
		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();

		terminal.loadAddon(fitAddon);
		terminal.loadAddon(webLinksAddon);

		// Open terminal in container
		terminal.open(containerRef.current);

		// Store refs
		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		requestAnimationFrame(() => {
			fitTerminal();
		});

		// Handle user input - send to PTY
		terminal.onData((data) => {
			const currentSessionId = sessionIdRef.current;
			if (currentSessionId) {
				platform()
					.pty?.write?.(currentSessionId, data)
					?.catch((error) => {
						debugError("[Terminal] Failed to write to PTY:", error);
					});
			}
		});

		// Track paste state to prevent double-writes
		let isPasting = false;

		// Intercept paste event on xterm's internal textarea
		const handlePaste = (e: ClipboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (isPasting) return;

			const text = e.clipboardData?.getData("text");
			const currentSessionId = sessionIdRef.current;
			if (text && currentSessionId) {
				isPasting = true;
				platform()
					.pty?.write?.(currentSessionId, text)
					?.catch((error) => {
						debugError("[Terminal] Failed to paste into PTY:", error);
					});
				setTimeout(() => {
					isPasting = false;
				}, 100);
			}
		};

		// Add paste listener after a short delay (textarea may not be ready immediately)
		const textareaCheckInterval = setInterval(() => {
			if (terminal.textarea) {
				terminal.textarea.addEventListener("paste", handlePaste, true);
				clearInterval(textareaCheckInterval);
			}
		}, 10);
		setTimeout(() => clearInterval(textareaCheckInterval), 1000);

		// Handle keyboard shortcuts
		terminal.attachCustomKeyEventHandler((event) => {
			// Handle paste (Ctrl+V / Cmd+V)
			if (
				(event.ctrlKey || event.metaKey) &&
				event.key === "v" &&
				event.type === "keydown"
			) {
				if (isPasting) return false;

				isPasting = true;

				// Read clipboard and write to PTY
				if (navigator.clipboard?.readText) {
					navigator.clipboard
						.readText()
						.then((text) => {
							const currentSessionId = sessionIdRef.current;
							if (text && currentSessionId) {
								platform()
									.pty?.write?.(currentSessionId, text)
									?.catch((error) => {
										debugError(
											"[Terminal] Failed to write clipboard text:",
											error
										);
									});
							}
						})
						.catch(() => {
							// Clipboard read failed - ignore
						})
						.finally(() => {
							setTimeout(() => {
								isPasting = false;
							}, 100);
						});
				} else {
					setTimeout(() => {
						isPasting = false;
					}, 100);
				}

				return false;
			}

			// Check for copy shortcut (Ctrl+C / Cmd+C) when there's a selection
			if (
				(event.ctrlKey || event.metaKey) &&
				event.key === "c" &&
				event.type === "keydown" &&
				terminal.hasSelection()
			) {
				// Guard against clipboard API unavailability (non-secure contexts, tests)
				if (!navigator.clipboard?.writeText) {
					return true;
				}
				const selection = terminal.getSelection();
				if (selection) {
					navigator.clipboard.writeText(selection).catch((err) => {
						debugError("[Terminal] Failed to copy:", err);
					});
				}
				// Return false to prevent sending Ctrl+C to terminal when copying
				return false;
			}
			// Allow all other keys
			return true;
		});

		// Register callbacks with store's IPC routing
		registerDataCallback(tabId, (data: string) => {
			terminalRef.current?.write(data);
		});

		registerExitCallback(tabId, (exitCode: number) => {
			terminalRef.current?.write(
				`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`
			);
		});

		// Notify ready
		onReady?.();

		// Cleanup
		return () => {
			clearInterval(textareaCheckInterval);
			terminal.textarea?.removeEventListener("paste", handlePaste, true);
			unregisterDataCallback(tabId);
			unregisterExitCallback(tabId);
			terminal.dispose();
		};
		// tabId is stable for the lifetime of a session tab
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabId]);

	// Handle resize
	useEffect(() => {
		if (!containerRef.current || !fitAddonRef.current || !terminalRef.current) {
			return;
		}

		const container = containerRef.current;
		const resizeObserver = new ResizeObserver(() => {
			// Use requestAnimationFrame to batch resize operations
			requestAnimationFrame(() => {
				fitTerminal();
			});
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [fitTerminal]);

	useEffect(() => {
		if (!isVisible) {
			return;
		}
		requestAnimationFrame(() => {
			fitTerminal();
			terminalRef.current?.focus();
		});
	}, [isVisible, fitTerminal]);

	// Focus terminal when sessionId changes (new connection)
	useEffect(() => {
		if (sessionId && terminalRef.current) {
			terminalRef.current.focus();
		}
	}, [sessionId]);

	return (
		<div
			ref={containerRef}
			className="h-full w-full bg-terminal-bg [&_.xterm]:h-full [&_.xterm-viewport]:!bg-terminal-bg [&_.xterm-screen]:!bg-terminal-bg"
			role="application"
			aria-label="Terminal emulator"
			data-testid="terminal-emulator"
		/>
	);
}
