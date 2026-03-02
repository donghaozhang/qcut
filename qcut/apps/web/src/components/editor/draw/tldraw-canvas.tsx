import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import {
	AssetRecordType,
	SVGContainer,
	Tldraw,
	createShapeId,
	track,
	useEditor,
	type Editor,
	type TLImageShape,
	type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";

/** Image to annotate */
export interface AnnotatorImage {
	src: string;
	width: number;
	height: number;
	type: string;
}

export interface TldrawCanvasHandle {
	getEditor(): Editor | null;
	getCanvasDataUrl(): Promise<string | null>;
	getSnapshot(): string | null;
	loadSnapshot(snapshotJson: string): void;
	clearAll(): void;
}

interface TldrawCanvasProps {
	image: AnnotatorImage;
	className?: string;
}

export const TldrawCanvas = forwardRef<TldrawCanvasHandle, TldrawCanvasProps>(
	({ image, className }, ref) => {
		const editorRef = useRef<Editor | null>(null);
		const [imageShapeId, setImageShapeId] = useState<TLShapeId | null>(null);

		const handleMount = useCallback((editor: Editor) => {
			editorRef.current = editor;
			editor.user.updateUserPreferences({ colorScheme: "dark" });
		}, []);

		// Create locked background image + side effects
		useEffect(() => {
			const editor = editorRef.current;
			if (!editor) return;

			const assetId = AssetRecordType.createId();
			editor.createAssets([
				{
					id: assetId,
					typeName: "asset",
					type: "image",
					meta: {},
					props: {
						w: image.width,
						h: image.height,
						mimeType: image.type,
						src: image.src,
						name: "background",
						isAnimated: false,
					},
				},
			]);

			const shapeId = createShapeId();
			editor.createShape({
				id: shapeId,
				type: "image",
				x: 0,
				y: 0,
				isLocked: true,
				props: { w: image.width, h: image.height, assetId },
			});

			// Keep image at the bottom of the z-order
			function keepAtBottom() {
				if (!editor) return;
				const shape = editor.getShape(shapeId);
				if (!shape) return;

				const pageId = editor.getCurrentPageId();
				if (shape.parentId !== pageId) {
					editor.moveShapesToPage([shape], pageId);
				}
				const siblings = editor.getSortedChildIdsForParent(pageId);
				const bottom = editor.getShape(siblings[0]);
				if (bottom && bottom.id !== shapeId) {
					editor.sendToBack([shape]);
				}
			}
			keepAtBottom();

			const rmCreate = editor.sideEffects.registerAfterCreateHandler(
				"shape",
				keepAtBottom
			);
			const rmChange = editor.sideEffects.registerAfterChangeHandler(
				"shape",
				keepAtBottom
			);

			// Prevent unlocking the background image
			const rmLock = editor.sideEffects.registerBeforeChangeHandler(
				"shape",
				(prev, next) => {
					if (next.id !== shapeId) return next;
					if (next.isLocked) return next;
					return { ...prev, isLocked: true };
				}
			);

			editor.clearHistory();
			setImageShapeId(shapeId);

			return () => {
				rmCreate();
				rmChange();
				rmLock();
			};
		}, [image]);

		// Camera constraints — keep image in view
		useEffect(() => {
			const editor = editorRef.current;
			if (!editor || !imageShapeId) return;

			editor.setCameraOptions({
				constraints: {
					initialZoom: "fit-min-100",
					baseZoom: "fit-min-100",
					bounds: { x: 0, y: 0, w: image.width, h: image.height },
					padding: { x: 16, y: 16 },
					origin: { x: 0.5, y: 0.5 },
					behavior: "contain",
				},
			});
			editor.setCamera(editor.getCamera(), { reset: true });
		}, [imageShapeId, image]);

		useImperativeHandle(ref, () => ({
			getEditor: () => editorRef.current,

			getCanvasDataUrl: async () => {
				const editor = editorRef.current;
				if (!editor || !imageShapeId) return null;

				const shapeIds = [...editor.getCurrentPageShapeIds()];
				if (shapeIds.length === 0) return null;

				// Export only the image bounds area (annotations included)
				const bounds = editor.getShapePageBounds(imageShapeId);
				if (!bounds) return null;

				const result = await editor.toImageDataUrl(shapeIds, {
					format: "png",
					background: true,
					bounds,
					padding: 0,
					scale: 1,
				});
				return result?.url ?? null;
			},

			getSnapshot: () => {
				const editor = editorRef.current;
				if (!editor) return null;
				return JSON.stringify(editor.store.getStoreSnapshot());
			},

			loadSnapshot: (snapshotJson: string) => {
				const editor = editorRef.current;
				if (!editor) return;
				const snapshot = JSON.parse(snapshotJson);
				editor.store.loadStoreSnapshot(snapshot);
			},

			clearAll: () => {
				const editor = editorRef.current;
				if (!editor || !imageShapeId) return;
				// Delete all shapes EXCEPT the background image
				const allIds = [...editor.getCurrentPageShapeIds()];
				const toDelete = allIds.filter((id) => id !== imageShapeId);
				if (toDelete.length > 0) {
					editor.deleteShapes(toDelete);
				}
			},
		}));

		return (
			<div
				className={`tldraw__editor ${className ?? ""}`}
				style={{ width: "100%", height: "100%", isolation: "isolate" }}
			>
				<Tldraw
					onMount={handleMount}
					inferDarkMode={false}
					components={{
						PageMenu: null,
						InFrontOfTheCanvas: useCallback(() => {
							if (!imageShapeId) return null;
							return <ImageBoundsOverlay imageShapeId={imageShapeId} />;
						}, [imageShapeId]),
					}}
				/>
			</div>
		);
	}
);

TldrawCanvas.displayName = "TldrawCanvas";

/**
 * Grey overlay outside the image bounds so users see the annotation area clearly.
 */
const ImageBoundsOverlay = track(function ImageBoundsOverlay({
	imageShapeId,
}: {
	imageShapeId: TLShapeId;
}) {
	const editor = useEditor();
	const image = editor.getShape(imageShapeId) as TLImageShape;
	if (!image) return null;

	const bounds = editor.getShapePageBounds(imageShapeId);
	if (!bounds) return null;

	const viewport = editor.getViewportScreenBounds();
	const topLeft = editor.pageToViewport(bounds);
	const bottomRight = editor.pageToViewport({
		x: bounds.maxX,
		y: bounds.maxY,
	});

	const path = [
		`M ${-10} ${-10}`,
		`L ${viewport.maxX + 10} ${-10}`,
		`L ${viewport.maxX + 10} ${viewport.maxY + 10}`,
		`L ${-10} ${viewport.maxY + 10}`,
		`Z`,
		`M ${topLeft.x} ${topLeft.y}`,
		`L ${bottomRight.x} ${topLeft.y}`,
		`L ${bottomRight.x} ${bottomRight.y}`,
		`L ${topLeft.x} ${bottomRight.y}`,
		`Z`,
	].join(" ");

	return (
		<SVGContainer>
			<path
				d={path}
				fillRule="evenodd"
				fill="var(--color-background)"
				opacity={0.5}
			/>
		</SVGContainer>
	);
});
