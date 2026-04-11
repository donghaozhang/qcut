/**
 * Local element storage for Kling Create Element.
 *
 * Persists created element IDs to ~/.qcut/elements.json so they
 * can be reused across CLI sessions and video generations.
 *
 * @module electron/native-pipeline/infra/element-store
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StoredElement {
	elementId: string;
	name: string;
	description: string;
	referenceType: "image_refer" | "video_refer";
	createdAt: string;
	sourceImages?: string[];
	sourceVideo?: string;
	tags?: string[];
}

interface ElementStoreData {
	elements: Record<string, StoredElement>;
}

function getStorePath(): string {
	return path.join(os.homedir(), ".qcut", "elements.json");
}

function readStore(): ElementStoreData {
	const p = getStorePath();
	if (!fs.existsSync(p)) return { elements: {} };
	try {
		return JSON.parse(fs.readFileSync(p, "utf-8")) as ElementStoreData;
	} catch {
		return { elements: {} };
	}
}

function writeStore(data: ElementStoreData): void {
	const p = getStorePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function saveElement(element: StoredElement): void {
	const store = readStore();
	store.elements[element.elementId] = element;
	writeStore(store);
}

export function getElement(elementId: string): StoredElement | undefined {
	return readStore().elements[elementId];
}

export function listElements(): StoredElement[] {
	return Object.values(readStore().elements);
}

export function deleteElement(elementId: string): boolean {
	const store = readStore();
	if (!(elementId in store.elements)) return false;
	delete store.elements[elementId];
	writeStore(store);
	return true;
}

export function findElementByName(name: string): StoredElement | undefined {
	return listElements().find(
		(e) => e.name.toLowerCase() === name.toLowerCase()
	);
}
