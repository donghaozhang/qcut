export const ICONIFY_HOSTS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
];

// Encapsulate API state to avoid race conditions
class IconifyAPIClient {
  private lastWorkingHost: string = ICONIFY_HOSTS[0];

  // Helper to create timeout signal with fallback for older browsers
  private createTimeoutSignal(timeout: number): AbortSignal {
    // Use native timeout if available (Chrome 94+, Firefox 93+, Node 16+)
    if (
      "timeout" in AbortSignal &&
      typeof (AbortSignal as any).timeout === "function"
    ) {
      return AbortSignal.timeout(timeout);
    }

    // Fallback for older browsers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Clean up timeout if operation completes or is aborted
    controller.signal.addEventListener("abort", () => clearTimeout(timeoutId), {
      once: true,
    });

    return controller.signal;
  }

  // Helper to combine multiple abort signals safely
  private combineSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => {
      if (!controller.signal.aborted) controller.abort();
    };

    for (const s of signals) {
      if (s.aborted) {
        controller.abort();
        break;
      }
      s.addEventListener("abort", onAbort, { once: true });
    }

    // Cleanup listeners once our combined signal aborts
    controller.signal.addEventListener(
      "abort",
      () => {
        for (const s of signals) s.removeEventListener("abort", onAbort);
      },
      { once: true }
    );

    return controller.signal;
  }

  async fetchWithFallback(
    path: string,
    signal?: AbortSignal
  ): Promise<Response> {
    // Try last working host first for better performance
    const hostsToTry = [
      this.lastWorkingHost,
      ...ICONIFY_HOSTS.filter((h) => h !== this.lastWorkingHost),
    ];

    for (const host of hostsToTry) {
      try {
        // Combine timeout signal with external abort signal if provided
        const timeoutSignal = this.createTimeoutSignal(2000);
        const combinedSignal = signal
          ? AbortSignal.any([timeoutSignal, signal])
          : timeoutSignal;

        const response = await fetch(`${host}${path}`, {
          signal: combinedSignal,
        });
        if (response.ok) {
          this.lastWorkingHost = host;
          return response;
        }
      } catch (error) {
        // If the external signal was aborted, rethrow to preserve the abort
        if (signal?.aborted) {
          throw error;
        }
        // Silent fail for network/timeout errors, try next host
      }
    }
    throw new Error("All API hosts failed");
  }

  getCurrentHost(): string {
    return this.lastWorkingHost;
  }
}

// Create a singleton instance for the application
const apiClient = new IconifyAPIClient();

export interface IconSet {
  prefix: string;
  name: string;
  total: number;
  author?: {
    name: string;
    url?: string;
  };
  license?: {
    title: string;
    spdx?: string;
    url?: string;
  };
  samples?: string[];
  category?: string;
  palette?: boolean;
}

export interface IconSearchResult {
  icons: string[];
  total: number;
  limit: number;
  start: number;
  collections: Record<string, IconSet>;
}

export interface CollectionInfo {
  prefix: string;
  total: number;
  title?: string;
  uncategorized?: string[];
  categories?: Record<string, string[]>;
  hidden?: string[];
  aliases?: Record<string, string>;
}

export async function getCollections(
  category?: string
): Promise<Record<string, IconSet>> {
  const response = await apiClient.fetchWithFallback("/collections?pretty=1");
  const data = (await response.json()) as Record<string, IconSet>;

  if (category) {
    const filtered = Object.fromEntries(
      Object.entries(data).filter(
        ([, iconSet]) => iconSet.category === category
      )
    );
    return filtered;
  }

  return data;
}

export async function getCollection(prefix: string): Promise<CollectionInfo> {
  const response = await apiClient.fetchWithFallback(
    `/collection?prefix=${prefix}&pretty=1`
  );
  const data = (await response.json()) as CollectionInfo;
  return data;
}

export async function searchIcons(
  query: string,
  limit = 100,
  start = 0,
  signal?: AbortSignal
): Promise<IconSearchResult> {
  const params = new URLSearchParams({
    query,
    limit: limit.toString(),
    start: start.toString(),
    pretty: "1",
  });

  const response = await apiClient.fetchWithFallback(
    `/search?${params}`,
    signal
  );
  const data = (await response.json()) as IconSearchResult;
  return data;
}

export function buildIconSvgUrl(
  collection: string,
  icon: string,
  options: {
    color?: string;
    width?: number;
    height?: number;
    flip?: "horizontal" | "vertical";
    rotate?: number;
  } = {}
): string {
  const params = new URLSearchParams();

  // Don't set color to preserve transparency
  if (options.color && options.color !== "transparent") {
    params.set("color", options.color);
  }
  if (options.width) params.set("width", options.width.toString());
  if (options.height) params.set("height", options.height.toString());
  if (options.flip) params.set("flip", options.flip);
  if (options.rotate) params.set("rotate", options.rotate.toString());

  const queryString = params.toString();
  const baseUrl = `${apiClient.getCurrentHost()}/${collection}:${icon}.svg`;

  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export async function downloadIconSvg(
  collection: string,
  icon: string,
  options: {
    color?: string;
    width?: number;
    height?: number;
    flip?: "horizontal" | "vertical";
    rotate?: number;
  } = {}
): Promise<string> {
  const params = new URLSearchParams();

  // Don't set color to preserve transparency
  if (options.color && options.color !== "transparent") {
    params.set("color", options.color);
  }
  if (options.width) params.set("width", options.width.toString());
  if (options.height) params.set("height", options.height.toString());
  if (options.flip) params.set("flip", options.flip);
  if (options.rotate) params.set("rotate", options.rotate.toString());

  const queryString = params.toString();
  const path = `/${collection}:${icon}.svg${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.fetchWithFallback(path);
  const svgContent = await response.text();
  return svgContent;
}

// Helper function to create a Blob from SVG content
export function createSvgBlob(svgContent: string): Blob {
  return new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
}

// Helper function to create a transparent SVG blob URL
export function createTransparentSvgBlobUrl(svgContent: string): string {
  const blob = createSvgBlob(svgContent);
  return URL.createObjectURL(blob);
}

// Popular collections with sample icons
export const POPULAR_COLLECTIONS: IconSet[] = [
  {
    prefix: "simple-icons",
    name: "Simple Icons (Brands)",
    total: 2900,
    category: "Brands",
    author: {
      name: "Simple Icons Contributors",
      url: "https://simpleicons.org",
    },
    license: {
      title: "CC0 1.0",
      spdx: "CC0-1.0",
    },
    samples: [
      "github",
      "google",
      "facebook",
      "twitter",
      "instagram",
      "youtube",
      "linkedin",
      "discord",
      "slack",
      "reddit",
      "amazon",
      "apple",
      "microsoft",
      "netflix",
      "spotify",
      "twitch",
      "tiktok",
      "whatsapp",
      "telegram",
      "pinterest",
    ],
    palette: false,
  },
  {
    prefix: "tabler",
    name: "Tabler Icons",
    total: 3400,
    category: "General",
    author: {
      name: "Tabler Icons",
      url: "https://tabler-icons.io",
    },
    license: {
      title: "MIT",
      spdx: "MIT",
    },
    samples: [
      "home",
      "user",
      "settings",
      "heart",
      "star",
      "check",
      "x",
      "menu-2",
      "arrow-right",
      "arrow-left",
      "player-play",
      "player-pause",
      "player-stop",
      "plus",
      "minus",
      "edit",
      "trash",
      "download",
      "upload",
      "search",
    ],
    palette: false,
  },
  {
    prefix: "material-symbols",
    name: "Material Symbols",
    total: 2500,
    category: "General",
    author: {
      name: "Google",
      url: "https://fonts.google.com/icons",
    },
    license: {
      title: "Apache 2.0",
      spdx: "Apache-2.0",
    },
    samples: [
      "home",
      "person",
      "settings",
      "favorite",
      "star",
      "check",
      "close",
      "menu",
      "arrow-forward",
      "arrow-back",
      "play-arrow",
      "pause",
      "stop",
      "add",
      "remove",
      "edit",
      "delete",
      "download",
      "upload",
      "search",
    ],
    palette: false,
  },
  {
    prefix: "heroicons",
    name: "Hero Icons",
    total: 300,
    category: "General",
    author: {
      name: "Steve Schoger",
      url: "https://heroicons.com",
    },
    license: {
      title: "MIT",
      spdx: "MIT",
    },
    samples: [
      "home",
      "user",
      "cog",
      "heart",
      "star",
      "check",
      "x-mark",
      "bars-3",
      "arrow-right",
      "arrow-left",
      "play",
      "pause",
      "stop",
      "plus",
      "minus",
      "pencil",
      "trash",
      "arrow-down-tray",
      "arrow-up-tray",
      "magnifying-glass",
    ],
    palette: false,
  },
];
