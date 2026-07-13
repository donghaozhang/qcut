import { useCallback, useEffect, useRef, useState } from "react";
import { searchSounds } from "@/lib/api-adapter";
import type { SoundEffect } from "@/types/sounds";

export type AudioLibrarySearchType = "effects" | "songs";

interface SoundSearchResponse {
	success?: boolean;
	error?: string;
	results?: SoundEffect[];
	next?: string | null;
	count?: number;
}

function mergeUniqueSounds({
	current,
	incoming,
}: {
	current: readonly SoundEffect[];
	incoming: readonly SoundEffect[];
}): SoundEffect[] {
	const existingIds = new Set(current.map((sound) => sound.id));
	return [
		...current,
		...incoming.filter((sound) => !existingIds.has(sound.id)),
	];
}

export function useAudioLibrarySearch({
	query,
	type,
	commercialOnly,
	pageSize = 20,
	debounceMs = 300,
}: {
	query: string;
	type: AudioLibrarySearchType;
	commercialOnly: boolean;
	pageSize?: number;
	debounceMs?: number;
}) {
	const [results, setResults] = useState<SoundEffect[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<string>();
	const [page, setPage] = useState(1);
	const [hasNextPage, setHasNextPage] = useState(false);
	const [totalCount, setTotalCount] = useState(0);
	const requestGeneration = useRef(0);

	const runSearch = useCallback(
		async ({
			pageNumber,
			append,
			generation,
		}: {
			pageNumber: number;
			append: boolean;
			generation: number;
		}) => {
			const response = (await searchSounds(query.trim(), {
				type,
				page: pageNumber,
				page_size: pageSize,
				sort: query.trim() ? "score" : "downloads",
				min_rating: 3,
				commercial_only: commercialOnly,
			})) as SoundSearchResponse;
			if (generation !== requestGeneration.current) return;
			if (response.success === false) {
				throw new Error(response.error || "Audio search failed");
			}
			const incoming = response.results ?? [];
			setResults((current) =>
				append ? mergeUniqueSounds({ current, incoming }) : incoming
			);
			setPage(pageNumber);
			setHasNextPage(Boolean(response.next));
			setTotalCount(response.count ?? incoming.length);
		},
		[commercialOnly, pageSize, query, type]
	);

	useEffect(() => {
		const generation = requestGeneration.current + 1;
		requestGeneration.current = generation;
		setResults([]);
		setPage(1);
		setHasNextPage(false);
		setTotalCount(0);
		setError(undefined);

		const timeoutId = window.setTimeout(() => {
			setIsLoading(true);
			runSearch({ pageNumber: 1, append: false, generation })
				.catch((searchError: unknown) => {
					if (generation !== requestGeneration.current) return;
					setError(
						searchError instanceof Error
							? searchError.message
							: "Audio search failed"
					);
				})
				.finally(() => {
					if (generation === requestGeneration.current) setIsLoading(false);
				});
		}, debounceMs);

		return () => window.clearTimeout(timeoutId);
	}, [debounceMs, runSearch]);

	const loadMore = useCallback(async () => {
		if (isLoading || isLoadingMore || !hasNextPage) return;
		const generation = requestGeneration.current;
		setIsLoadingMore(true);
		setError(undefined);
		try {
			await runSearch({
				pageNumber: page + 1,
				append: true,
				generation,
			});
		} catch (loadError) {
			if (generation === requestGeneration.current) {
				setError(
					loadError instanceof Error ? loadError.message : "Audio search failed"
				);
			}
		} finally {
			if (generation === requestGeneration.current) setIsLoadingMore(false);
		}
	}, [hasNextPage, isLoading, isLoadingMore, page, runSearch]);

	return {
		results,
		isLoading,
		isLoadingMore,
		error,
		hasNextPage,
		totalCount,
		loadMore,
	};
}
