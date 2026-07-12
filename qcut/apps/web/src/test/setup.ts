// Test setup file for Vitest - enhanced DOM setup for jsdom
console.log("🔧 SETUP.TS EXECUTING - Starting jsdom environment setup...");

// Skip DOM setup when not in jsdom environment (e.g. electron tests with @vitest-environment node)
const IS_JSDOM =
	typeof window !== "undefined" && typeof document !== "undefined";

// CRITICAL: Import polyfills FIRST before anything else
import "./polyfills";

// Import and install browser mocks to ensure they're available
import { installAllBrowserMocks } from "./mocks/browser-mocks";
installAllBrowserMocks();

// Ensure getComputedStyle is available everywhere (reuse from polyfills.ts)
const forceGetComputedStylePolyfill = () => {
	// Check if already available from polyfills.ts
	if (typeof getComputedStyle === "function") {
		return getComputedStyle;
	}

	// Fallback: create a simple mock if not available
	const mockGetComputedStyle = (element: Element): CSSStyleDeclaration => {
		const styles: any = {
			getPropertyValue: (prop: string) => {
				const mappings: Record<string, string> = {
					"display": "block",
					"visibility": "visible",
					"opacity": "1",
					"transform": "none",
					"transition": "none",
					"animation": "none",
					"position": "static",
					"top": "auto",
					"left": "auto",
					"right": "auto",
					"bottom": "auto",
					"width": "auto",
					"height": "auto",
					"margin": "0px",
					"padding": "0px",
					"border": "0px",
					"background": "transparent",
				};
				return mappings[prop] || "";
			},
			setProperty: () => {},
			removeProperty: () => "",
			item: () => "",
			length: 0,
			parentRule: null,
			cssFloat: "",
			cssText: "",
			display: "block",
			visibility: "visible",
			opacity: "1",
			transform: "none",
			transition: "none",
			animation: "none",
			position: "static",
			top: "auto",
			left: "auto",
			right: "auto",
			bottom: "auto",
			width: "auto",
			height: "auto",
		};
		Object.defineProperty(styles, Symbol.iterator, {
			*value() {
				for (let i = 0; i < this.length; i++) yield this.item(i);
			},
		});
		return styles as CSSStyleDeclaration;
	};

	// Apply only to contexts that don't have it (using for...of per house rules)
	const contexts = [
		globalThis,
		(globalThis as any).window,
		(globalThis as any).self,
	].filter(Boolean) as any[];
	for (const context of contexts) {
		if (
			context &&
			typeof context === "object" &&
			typeof context.getComputedStyle !== "function"
		) {
			try {
				Object.defineProperty(context, "getComputedStyle", {
					value: mockGetComputedStyle,
					configurable: true,
					writable: true,
				});
			} catch (e) {
				// ignore errors if property is not configurable
			}
		}
	}

	return mockGetComputedStyle;
};

// Apply immediately and repeatedly
const polyfill = forceGetComputedStylePolyfill();

// Also override in a timer to catch late initialization
setTimeout(() => {
	forceGetComputedStylePolyfill();
}, 0);

// Ensure globals are properly set up after polyfills
if (typeof window !== "undefined") {
	// Make sure document and window are available globally
	(globalThis as any).document = window.document;
	(globalThis as any).window = window;

	if (typeof global !== "undefined") {
		(global as any).document = window.document;
		(global as any).window = window;
	}
}

// Force polyfill again after globals setup
setTimeout(() => {
	forceGetComputedStylePolyfill();
}, 1);

console.log(
	"🔧 Initial DOM check - document available:",
	typeof document !== "undefined"
);
console.log(
	"🔧 Initial DOM check - window available:",
	typeof window !== "undefined"
);
console.log(
	"🔧 getComputedStyle now available:",
	typeof getComputedStyle !== "undefined"
);

console.log(
	"🔧 SETUP.TS COMPLETE - Document available:",
	typeof document !== "undefined"
);
console.log(
	"🔧 SETUP.TS COMPLETE - getComputedStyle available:",
	typeof getComputedStyle !== "undefined"
);
console.log("🔧 SETUP.TS COMPLETE - Environment ready for tests");

// Now that DOM is available, import testing libraries
import "@testing-library/jest-dom/vitest";
import { afterEach, afterAll, beforeAll, vi } from "vitest";

afterEach(async () => {
	await vi.dynamicImportSettled();
});

// Load toast hook mock
import { setupToastMock } from "./mocks/toast";
setupToastMock();

// Load Radix UI presence mock to avoid getComputedStyle issues
import { mockPresence } from "./mocks/radix-presence";
mockPresence();

// Load Radix UI focus scope mock to avoid MutationObserver issues
import { mockFocusScope } from "./mocks/radix-focus-scope";
mockFocusScope();

// Guard: skip all window/document setup when not in jsdom
if (typeof window === "undefined") {
	// Node environment (electron tests) — skip DOM mocks
	afterEach(() => {
		vi.clearAllMocks();
	});
	beforeAll(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterAll(() => {
		vi.restoreAllMocks();
	});
} else {
	// Mock window.matchMedia and window.history for jsdom environment
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});

	// Mock window.history for TanStack Router
	Object.defineProperty(window, "history", {
		writable: true,
		value: {
			pushState: vi.fn(),
			replaceState: vi.fn(),
			back: vi.fn(),
			forward: vi.fn(),
			go: vi.fn(),
			length: 1,
			scrollRestoration: "auto",
			state: null,
		},
	});

	// Mock global APIs for jsdom environment
	// Must use class-based mocks (not arrow functions) so `new` works correctly
	class MockObserver {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
		takeRecords = vi.fn(() => []);
	}

	// Mock IntersectionObserver
	Object.defineProperty(window, "IntersectionObserver", {
		writable: true,
		value: MockObserver,
	});
	Object.defineProperty(globalThis, "IntersectionObserver", {
		writable: true,
		value: MockObserver,
	});

	// Mock ResizeObserver
	Object.defineProperty(window, "ResizeObserver", {
		writable: true,
		value: MockObserver,
	});
	Object.defineProperty(globalThis, "ResizeObserver", {
		writable: true,
		value: MockObserver,
	});

	// Browser mocks are already installed at the top of this file

	// Mock URL methods
	Object.defineProperty(URL, "createObjectURL", {
		writable: true,
		value: vi.fn(() => "blob:mock-url"),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		writable: true,
		value: vi.fn(),
	});

	// getComputedStyle mock is already set up earlier in JSDOM setup

	// Mock localStorage (should be available in jsdom but ensure it's mocked)
	const localStorageMock: Storage = {
		getItem: vi.fn(),
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		key: vi.fn(),
		length: 0,
	};
	Object.defineProperty(window, "localStorage", {
		value: localStorageMock,
		writable: true,
	});

	// Mock IndexedDB
	const indexedDBMock: IDBFactory = {
		open: vi.fn(() => ({}) as IDBOpenDBRequest),
		deleteDatabase: vi.fn(() => ({}) as IDBOpenDBRequest),
		cmp: vi.fn(() => 0),
		databases: vi.fn(async () => [] as IDBDatabaseInfo[]),
	};
	Object.defineProperty(window, "indexedDB", {
		value: indexedDBMock,
		writable: true,
	});

	// Mock navigator.clipboard
	Object.defineProperty(navigator, "clipboard", {
		value: {
			writeText: vi.fn(() => Promise.resolve()),
			readText: vi.fn(() => Promise.resolve("")),
		},
		writable: true,
	});

	// Mock window.location methods without replacing the Location object
	try {
		const loc = window.location;
		vi.spyOn(loc, "reload").mockImplementation(() => {});
		vi.spyOn(loc, "assign").mockImplementation(() => {});
		vi.spyOn(loc, "replace").mockImplementation(() => {});

		// Also set globalThis.location to match window.location for consistency
		if (typeof globalThis !== "undefined" && !globalThis.location) {
			Object.defineProperty(globalThis, "location", {
				value: window.location,
				writable: true,
				configurable: true,
			});
		}
	} catch {
		// Fallback for environments where spying is not possible
		try {
			Object.defineProperty(window.location, "reload", {
				value: vi.fn(),
				configurable: true,
			});
			Object.defineProperty(window.location, "assign", {
				value: vi.fn(),
				configurable: true,
			});
			Object.defineProperty(window.location, "replace", {
				value: vi.fn(),
				configurable: true,
			});

			// Also set globalThis.location in fallback
			if (typeof globalThis !== "undefined" && !globalThis.location) {
				Object.defineProperty(globalThis, "location", {
					value: window.location,
					writable: true,
					configurable: true,
				});
			}
		} catch {
			// Last-resort: leave as-is; tests that rely on navigation should stub per-test.
		}
	}

	// Clean up after each test
	afterEach(() => {
		vi.clearAllMocks();
		if (typeof localStorage !== "undefined") {
			localStorage.clear();
		}
	});

	// Setup before all tests
	beforeAll(() => {
		// Suppress console errors in tests unless explicitly testing error handling
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	// Cleanup after all tests
	afterAll(() => {
		vi.restoreAllMocks();
	});
} // end of jsdom guard
