export interface SoundEffectsLabPrivateAsset {
	objectKey: string;
	byteSize: number;
	checksumSha256: string;
	mimeType: "audio/mpeg";
}

export interface SoundEffectsLabSoundMetadata {
	provider: "jianying-reference" | "freesound";
	redistribution: "allowed" | "prohibited";
	resourceId: string;
	asset?: SoundEffectsLabPrivateAsset;
	isVip?: boolean | null;
	paidType?: string;
	businessScope?: string[];
	publishSource?: string;
	authorSource?: string;
	copyrightText?: string;
	copyrightArtist?: string;
}

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
	source?: "freesound" | "qcut" | "project" | "sound-effects-lab";
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
	checksumSha256?: string;
	soundEffectsLab?: SoundEffectsLabSoundMetadata;
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
	source?: "freesound" | "qcut" | "project" | "sound-effects-lab";
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
	soundEffectsLab?: SoundEffectsLabSoundMetadata;
};

export type SavedSoundsData = {
	sounds: SavedSound[];
	lastModified: string;
};
