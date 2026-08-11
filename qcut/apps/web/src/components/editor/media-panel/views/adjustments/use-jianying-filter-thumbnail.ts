import { useEffect, useRef, useState } from "react";

type ThumbnailState = "idle" | "loading" | "ready" | "error";

export function useJianyingFilterThumbnail({
	resourceId,
	hasThumbnail,
}: {
	resourceId: string;
	hasThumbnail: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [state, setState] = useState<ThumbnailState>("idle");
	const [url, setUrl] = useState("");

	useEffect(() => {
		setVisible(false);
		if (!hasThumbnail) return;
		const container = containerRef.current;
		if (!container || typeof IntersectionObserver === "undefined") {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
			setVisible(true);
			observer.disconnect();
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, [hasThumbnail]);

	useEffect(() => {
		if (!hasThumbnail || !visible) {
			setState("idle");
			setUrl("");
			return;
		}
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api?.thumbnail) {
			setState("error");
			return;
		}
		let active = true;
		let objectUrl = "";
		setState("loading");
		void api
			.thumbnail({ resourceId })
			.then((result) => {
				if (!active) return;
				objectUrl = URL.createObjectURL(
					new Blob([new Uint8Array(result.bytes)], { type: result.mimeType })
				);
				setUrl(objectUrl);
				setState("ready");
			})
			.catch(() => {
				if (active) setState("error");
			});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [hasThumbnail, resourceId, visible]);

	return { containerRef, state, url };
}
