import type { StorageAdapter } from "../../types";

export type MapStorageAdapter<T> = StorageAdapter<T> & {
	map: Map<string, T>;
};

export function createMapStorageAdapter<T>(): MapStorageAdapter<T> {
	const map = new Map<string, T>();
	return {
		map,
		get: async (key) => map.get(key) ?? null,
		set: async (key, value) => {
			map.set(key, value);
		},
		remove: async (key) => {
			map.delete(key);
		},
		list: async () => [...map.keys()],
		clear: async () => {
			map.clear();
		},
	};
}
