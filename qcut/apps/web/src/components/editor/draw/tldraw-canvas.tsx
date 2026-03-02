import {
	forwardRef,
	useImperativeHandle,
	useRef,
	useCallback,
	type ReactNode,
} from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";

export interface TldrawCanvasHandle {
	getEditor(): Editor | null;
	getCanvasDataUrl(): Promise<string | null>;
	getSnapshot(): string | null;
	loadSnapshot(snapshotJson: string): void;
	clearAll(): void;
}

interface TldrawCanvasProps {
	className?: string;
	persistenceKey?: string;
	onMount?: (editor: Editor) => void;
	children?: ReactNode;
}

export const TldrawCanvas = forwardRef<TldrawCanvasHandle, TldrawCanvasProps>(
	({ className, persistenceKey, onMount, children }, ref) => {
		const editorRef = useRef<Editor | null>(null);

		const handleMount = useCallback(
			(editor: Editor) => {
				editorRef.current = editor;
				editor.user.updateUserPreferences({ colorScheme: "dark" });
				onMount?.(editor);
			},
			[onMount]
		);

		useImperativeHandle(ref, () => ({
			getEditor: () => editorRef.current,

			getCanvasDataUrl: async () => {
				const editor = editorRef.current;
				if (!editor) return null;

				const shapeIds = [...editor.getCurrentPageShapeIds()];
				if (shapeIds.length === 0) return null;

				const result = await editor.toImageDataUrl(shapeIds, {
					format: "png",
					background: true,
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
				if (!editor) return;
				editor.selectAll();
				editor.deleteShapes(editor.getSelectedShapeIds());
			},
		}));

		return (
			<div
				className={className}
				style={{ width: "100%", height: "100%", isolation: "isolate" }}
			>
				<Tldraw
					persistenceKey={persistenceKey}
					onMount={handleMount}
					inferDarkMode={false}
				>
					{children}
				</Tldraw>
			</div>
		);
	}
);

TldrawCanvas.displayName = "TldrawCanvas";
