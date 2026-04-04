/**
 * Wallpaper operations sub-interface for ElectronAPI.
 */

export interface WallpaperEntry {
	id: string;
	name: string;
	path: string;
}

export interface ElectronWallpaperOps {
	wallpapers: {
		list: () => Promise<WallpaperEntry[]>;
		upload: (sourcePath: string) => Promise<WallpaperEntry | null>;
		delete: (id: string) => Promise<boolean>;
		pick: () => Promise<string | null>;
	};
}
