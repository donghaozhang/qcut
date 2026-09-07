import { useEffect, useState } from "react";
import { Loader2, Video } from "lucide-react";
import { coverRepository } from "@/lib/cover/cover-repository";
import type { TProject } from "@/types/project";

export function ProjectThumbnail({
	project,
	getProjectThumbnail,
}: {
	project: TProject;
	getProjectThumbnail: (projectId: string) => Promise<string | null>;
}) {
	const [src, setSrc] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const { id, cover, thumbnail } = project;
	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;
		setLoading(true);
		setSrc(null);
		const load = async () => {
			if (cover) {
				try {
					const blob = await coverRepository.readAsset({
						projectId: id,
						asset: cover.thumbnail,
					});
					if (cancelled) return;
					objectUrl = URL.createObjectURL(blob);
					setSrc(objectUrl);
					return;
				} catch {
					/* Missing cover files retain the normal thumbnail fallback. */
				}
			}
			const fallback =
				thumbnail && !thumbnail.startsWith("blob:")
					? thumbnail
					: await getProjectThumbnail(id);
			if (!cancelled) setSrc(fallback);
		};
		void load()
			.catch(() => {
				if (!cancelled) setSrc(null);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [id, cover, thumbnail, getProjectThumbnail]);

	if (loading)
		return (
			<div className="flex size-full items-center justify-center bg-muted">
				<Loader2 className="size-5 animate-spin text-muted-foreground">
					<title>Loading thumbnail</title>
				</Loader2>
			</div>
		);
	if (src)
		return (
			<img
				src={src}
				alt="Project thumbnail"
				loading="lazy"
				className="size-full object-cover"
				onError={() => setSrc(null)}
			/>
		);
	return (
		<div className="flex size-full items-center justify-center bg-muted">
			<Video className="size-5 text-muted-foreground">
				<title>No thumbnail</title>
			</Video>
		</div>
	);
}
