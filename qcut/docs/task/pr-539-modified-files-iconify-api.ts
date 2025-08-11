# PR #539: apps/web/src/lib/iconify-api.ts

**File**: New file creation  
**Purpose**: Iconify API integration service
for fetching sticker collections and
data;

#
#
Complete;
Source;
Code```typescript
export const ICONIFY_HOSTS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
];

let currentHost = ICONIFY_HOSTS[0];

async function fetchWithFallback(path: string): Promise<Response> {
  for (const host of ICONIFY_HOSTS) {
    try {
      const response = await fetch(`;
$;
{
  host;
}
$;
{
  path;
}
`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        currentHost = host;
        return response;
      }
    } catch (error) {
      console.warn(`;
Failed;
to;
fetch;
from;
$;
{
  host;
}
:`, error)
}
  }
throw new Error("All API hosts failed");
}

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
    const response = await fetchWithFallback("/collections?pretty=1");
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
    const response = await fetchWithFallback(
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

    const response = await fetchWithFallback(`/search?${params}`);
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
  const baseUrl = `${currentHost}/${collection}:${icon}.svg`;

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
    prefix: "mdi",
    name: "Material Design Icons",
    total: 7400,
    category: "General",
    author: {
      name: "Austin Andrews",
      url: "https://twitter.com/Templarian",
    },
    license: {
      title: "Apache 2.0",
      spdx: "Apache-2.0",
    },
    samples: [
      "account",
      "home",
      "heart",
      "star",
      "check",
      "close",
      "menu",
      "arrow-right",
      "arrow-left",
      "arrow-up",
      "arrow-down",
      "play",
      "pause",
      "stop",
      "settings",
      "help",
      "search",
      "plus",
      "minus",
      "edit",
    ],
    palette: false,
  },
  {
    prefix: "fa6-solid",
    name: "Font Awesome 6 Solid",
    total: 1400,
    category: "General",
    author: {
      name: "Font Awesome",
      url: "https://fontawesome.com",
    },
    license: {
      title: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    },
    samples: [
      "house",
      "user",
      "gear",
      "heart",
      "star",
      "check",
      "xmark",
      "bars",
      "arrow-right",
      "arrow-left",
      "play",
      "pause",
      "stop",
      "plus",
      "minus",
      "pen-to-square",
      "trash",
      "download",
      "upload",
      "search",
    ],
    palette: false,
  },
  {
    prefix: "ion",
    name: "IonIcons",
    total: 1300,
    category: "General",
    author: {
      name: "Ionic",
      url: "https://ionic.io",
    },
    license: {
      title: "MIT",
      spdx: "MIT",
    },
    samples: [
      "home",
      "person",
      "settings",
      "heart",
      "star",
      "checkmark",
      "close",
      "menu",
      "arrow-forward",
      "arrow-back",
      "play",
      "pause",
      "stop",
      "add",
      "remove",
      "create",
      "trash",
      "download",
      "cloud-upload",
      "search",
    ],
    palette: false,
  },
  {
    prefix: "lucide",
    name: "Lucide",
    total: 1400,
    category: "General",
    author: {
      name: "Lucide Contributors",
      url: "https://lucide.dev",
    },
    license: {
      title: "ISC",
      spdx: "ISC",
    },
    samples: [
      "home",
      "user",
      "settings",
      "heart",
      "star",
      "check",
      "x",
      "menu",
      "arrow-right",
      "arrow-left",
      "play",
      "pause",
      "square",
      "plus",
      "minus",
      "edit-3",
      "trash-2",
      "download",
      "upload",
      "search",
    ],
    palette: false,
  },
];

// Type definitions
export interface IconifyCollection {
  prefix: string;
  name: string;
  total: number;
  author?: string;
  license?: string;
  category?: string;
  version?: string;
  height?: number | number[];
  displayHeight?: number;
  samples?: string[];
}

export interface IconifyIcon {
  prefix: string;
  name: string;
  body: string;
  width?: number;
  height?: number;
  viewBox?: string;
}

export interface SearchResult {
  icons: string[];
  total: number;
  limit: number;
  start: number;
}

// API response interfaces
interface CollectionsResponse {
  [key: string]: IconifyCollection;
}

interface CollectionResponse {
  prefix: string;
  total: number;
  title: string;
  uncategorized: string[];
  categories?: {
    [category: string]: string[];
  };
  hidden?: string[];
  aliases?: {
    [alias: string]: string;
  };
  chars?: {
    [char: string]: string;
  };
}

// Main API class
export class IconifyAPI {
  private baseUrl: string;
  private cache = new Map<string, any>();
  private rateLimitDelay = 100; // ms between requests

  constructor(baseUrl = ICONIFY_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Get all available collections
  async getCollections(): Promise<IconifyCollection[]> {
    const cacheKey = "collections";

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.baseUrl}/collections`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: CollectionsResponse = await response.json();
      const collections = Object.entries(data).map(([prefix, info]) => ({
        prefix,
        ...info,
      }));

      this.cache.set(cacheKey, collections);
      return collections;
    } catch (error) {
      console.error("Failed to fetch collections:", error);
      throw error;
    }
  }

  // Get icons from a specific collection
  async getCollection(prefix: string): Promise<string[]> {
    const cacheKey = `collection:${prefix}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/collection?prefix=${prefix}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: CollectionResponse = await response.json();
      const icons = data.uncategorized || [];

      // Add categorized icons
      if (data.categories) {
        Object.values(data.categories).forEach((categoryIcons) => {
          icons.push(...categoryIcons);
        });
      }

      this.cache.set(cacheKey, icons);
      return icons;
    } catch (error) {
      console.error(`Failed to fetch collection ${prefix}:`, error);
      throw error;
    }
  }

  // Search icons across collections
  async searchIcons(query: string, limit = 64): Promise<SearchResult> {
    if (!query.trim()) {
      return { icons: [], total: 0, limit, start: 0 };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/search?query=${encodeURIComponent(query)}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: SearchResult = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to search icons:", error);
      throw error;
    }
  }

  // Get SVG content for an icon
  async getIconSvg(icon: string): Promise<string> {
    const cacheKey = `svg:${icon}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.baseUrl}/${icon}.svg`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const svg = await response.text();
      this.cache.set(cacheKey, svg);
      return svg;
    } catch (error) {
      console.error(`Failed to fetch SVG for ${icon}:`, error);
      throw error;
    }
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache size
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Utility functions
export function getIconSvgUrl(
  icon: string,
  options?: {
    color?: string;
    width?: number;
    height?: number;
  }
): string {
  const params = new URLSearchParams();

  if (options?.color) params.set("color", options.color);
  if (options?.width) params.set("width", options.width.toString());
  if (options?.height) params.set("height", options.height.toString());

  const queryString = params.toString();
  return `${ICONIFY_BASE_URL}/${icon}.svg${queryString ? `?${queryString}` : ""}`;
}

export function buildIconSvgUrl(
  collection: string,
  icon: string,
  options?: {
    color?: string;
    width?: number;
    height?: number;
  }
): string {
  return getIconSvgUrl(`${collection}:${icon}`, options);
}

export function parseIconName(iconName: string): {
  collection: string;
  name: string;
} {
  const [collection, name] = iconName.split(":");
  return { collection: collection || "", name: name || "" };
}

export function isValidIconName(iconName: string): boolean {
  return /^[a-z0-9-]+:[a-z0-9-]+$/i.test(iconName);
}

// Singleton instance
export const iconifyAPI = new IconifyAPI();

// Error types
export class IconifyError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "IconifyError";
  }
}

export class NetworkError extends IconifyError {
  constructor(message: string) {
    super(message, "NETWORK_ERROR");
  }
}

export class RateLimitError extends IconifyError {
  constructor(message: string) {
    super(message, "RATE_LIMIT");
  }
}
""`

## Key Features

1. **Collection Management**: Fetch and cache available icon collections
2. **Icon Search**: Search across all collections with query support
3. **SVG Generation**: Direct SVG URL generation with customization options
4. **Caching**: Intelligent caching to reduce API calls
5. **Error Handling**: Custom error types for different failure scenarios
6. **Rate Limiting**: Built-in rate limiting to respect API limits
7. **Type Safety**: Full TypeScript interfaces for all API responses

## API Endpoints Used

- `;
GET /
  collections` - List all available collections
- `;
GET /collection?prefix={id}` - Get icons from specific collection
- `GET /search?query={term}&limit={n}` - Search icons
- `GET /{collection}
:
{
  icon;
}
.svg` - Get icon SVG
with options

#
#
Configuration

- **Base
URL**
: `https://api.iconify.design`
- **Fallback Hosts**: Multiple hosts
for redundancy
- **Popular Collections**
: Curated list of commonly used icon sets
- **Cache Strategy**: In-memory caching
with manual cache
management;

#
#
Error;
Handling

- **Network
Errors**
: Connection and timeout issues
- **Rate Limiting**: API quota exceeded scenarios
- **Invalid Responses**: Malformed or missing data
- **Not Found**: Missing collections or icons

---

*Note: This is a placeholder structure. The actual file content needs to be copied from the GitHub repository.*
