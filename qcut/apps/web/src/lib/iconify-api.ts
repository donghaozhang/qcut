export const ICONIFY_HOSTS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
];

let currentHost = ICONIFY_HOSTS[0];

async function fetchWithFallback(path: string): Promise<Response> {
  for (const host of ICONIFY_HOSTS) {
    try {
      const response = await fetch(`${host}${path}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        currentHost = host;
        return response;
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${host}:`, error);
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
