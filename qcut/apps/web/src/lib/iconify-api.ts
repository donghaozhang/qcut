export const ICONIFY_HOSTS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
];

// Encapsulate API state to avoid race conditions
class IconifyAPIClient {
  private lastWorkingHost: string = ICONIFY_HOSTS[0];
  
  async fetchWithFallback(path: string): Promise<Response> {
    console.log("[Iconify API] Fetching:", path);
    
    // Try last working host first for better performance
    const hostsToTry = [
      this.lastWorkingHost, 
      ...ICONIFY_HOSTS.filter(h => h !== this.lastWorkingHost)
    ];
    
    for (const host of hostsToTry) {
      try {
        console.log(`[Iconify API] Trying host: ${host}${path}`);
        const response = await fetch(`${host}${path}`, {
          signal: AbortSignal.timeout(2000),
        });
        console.log(
          `[Iconify API] Response status from ${host}:`,
          response.status
        );
        if (response.ok) {
          this.lastWorkingHost = host;
          console.log(`[Iconify API] Success with host: ${host}`);
          return response;
        }
      } catch (error) {
        console.warn(`[Iconify API] Failed to fetch from ${host}:`, error);
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
  try {
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
  } catch (error) {
    console.error("Failed to fetch collections:", error);
    throw error;
  }
}

export async function getCollection(prefix: string): Promise<CollectionInfo> {
  try {
    const response = await apiClient.fetchWithFallback(
      `/collection?prefix=${prefix}&pretty=1`
    );
    const data = (await response.json()) as CollectionInfo;
    return data;
  } catch (error) {
    console.error(`Failed to fetch collection ${prefix}:`, error);
    throw error;
  }
}

export async function searchIcons(
  query: string,
  limit = 100,
  start = 0
): Promise<IconSearchResult> {
  try {
    const params = new URLSearchParams({
      query,
      limit: limit.toString(),
      start: start.toString(),
      pretty: "1",
    });

    const response = await apiClient.fetchWithFallback(`/search?${params}`);
    const data = (await response.json()) as IconSearchResult;
    return data;
  } catch (error) {
    console.error("Failed to search icons:", error);
    throw error;
  }
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

  if (options.color) {
    // URL encode the color to handle # symbols
    params.set("color", encodeURIComponent(options.color));
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
  try {
    const url = buildIconSvgUrl(collection, icon, options);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const svgContent = await response.text();
    return svgContent;
  } catch (error) {
    console.error(`Failed to download icon ${collection}:${icon}:`, error);
    throw error;
  }
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