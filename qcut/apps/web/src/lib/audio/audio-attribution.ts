import type { AssetLicense } from "@qcut/editor-core";
import type { SoundEffect } from "@/types/sounds";

/**
 * Credit lines for library tracks.
 *
 * Most of the bundled music library is CC BY: free for commercial use and
 * remixing, but only if the artist is credited. The card can state that a
 * track needs credit; without a ready-made line the user still has to
 * assemble one by hand, so this builds the text they can paste into a
 * description or end card.
 */

/** Human-readable license name, preferring the short SPDX form. */
function licenseLabel({ license }: { license: AssetLicense }): string {
	return license.spdxId ?? license.name;
}

export function buildAudioAttribution({
	sound,
	license,
}: {
	sound: SoundEffect;
	license: AssetLicense;
}): string {
	const parts = [`"${sound.name}"`];
	if (sound.username) parts.push(`by ${sound.username}`);
	parts.push(`— ${licenseLabel({ license })}`);
	if (license.sourceUrl) parts.push(`(${license.sourceUrl})`);
	return parts.join(" ");
}

/**
 * Whether the card should offer a credit line. CC0 and QCut's own tracks
 * carry no attribution obligation, so offering one there is just noise.
 */
export function requiresAttribution({
	license,
}: {
	license: AssetLicense;
}): boolean {
	return license.attributionRequired === true;
}
