export type SoundEffect = {
	id: number;
	name: string;
	description: string;
	url: string;
	previewUrl?: string;
	downloadUrl?: string;
	duration: number;
	filesize: number;
	type: string;
	channels: number;
	bitrate: number;
	bitdepth: number;
	samplerate: number;
	username: string;
	tags: string[];
	license: string;
	created: string;
	downloads: number;
	rating: number;
	ratingCount: number;
	source?: "freesound" | "qcut" | "project";
	mediaId?: string;
	kind?: "sound-effect" | "music";
	localizedName?: string;
	localizedDescription?: string;
	artworkColors?: readonly [string, string];
	artworkUrl?: string;
	bpm?: number;
	musicalKey?: string;
	moods?: string[];
	scenes?: string[];
	loopable?: boolean;
	featured?: boolean;
};

export type SavedSound = {
	id: number; // freesound id
	kind?: "sound-effect" | "music";
	name: string;
	username: string;
	previewUrl?: string;
	downloadUrl?: string;
	duration: number;
	tags: string[];
	license: string;
	savedAt: string; // iso date string
	description?: string;
	source?: "freesound" | "qcut" | "project";
	mediaId?: string;
	localizedName?: string;
	localizedDescription?: string;
	artworkColors?: readonly [string, string];
	artworkUrl?: string;
	bpm?: number;
	musicalKey?: string;
	moods?: string[];
	scenes?: string[];
	loopable?: boolean;
};

export type SavedSoundsData = {
	sounds: SavedSound[];
	lastModified: string;
};
