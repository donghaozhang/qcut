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
import {
  handleError,
  ErrorCategory,
  ErrorSeverity,
} from "@/lib/debug/error-handler";
import { normalizeImageMimeType } from "@/components/editor/draw/utils/image-file";

/** Image to annotate */
export interface AnnotatorImage {
  src: string;
  width: number;
  height: number;
  type: string;
}

export interface TldrawCanvasHandle {
  getEditor(): Editor | null;
  /** Returns a data URL or an object URL. Object URLs must be revoked by callers. */
  getCanvasDataUrl(): Promise<string | null>;
  getSnapshot(): string | null;
  loadSnapshot(snapshotJson: string): void;
  clearAll(): void;
}

interface TldrawCanvasProps {
  image: AnnotatorImage;
  className?: string;
}

function isLockedImageShape(shape: unknown): shape is TLImageShape {
  try {
    if (!shape || typeof shape !== "object") return false;
    const candidate = shape as { type?: string; isLocked?: boolean };
    return candidate.type === "image" && candidate.isLocked === true;
  } catch {
    return false;
  }
}

function resolveBackgroundImageShapeId({
  editor,
  preferredId,
}: {
  editor: Editor;
  preferredId: TLShapeId | null;
}): TLShapeId | null {
  try {
    if (preferredId) {
      const preferred = editor.getShape(preferredId);
      if (isLockedImageShape(preferred)) {
        return preferredId;
      }
    }

    const shapeIds = [...editor.getCurrentPageShapeIds()];
    for (const shapeId of shapeIds) {
      const shape = editor.getShape(shapeId);
      if (isLockedImageShape(shape)) {
        return shapeId;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeDimension({ value }: { value: number }): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.round(value));
}

export const TldrawCanvas = forwardRef<TldrawCanvasHandle, TldrawCanvasProps>(
  ({ image, className }, ref) => {
    const editorRef = useRef<Editor | null>(null);
    const [mountedEditor, setMountedEditor] = useState<Editor | null>(null);
    const [imageShapeId, setImageShapeId] = useState<TLShapeId | null>(null);
    const imageShapeIdRef = useRef<TLShapeId | null>(null);

    const setResolvedImageShapeId = useCallback((nextId: TLShapeId | null) => {
      imageShapeIdRef.current = nextId;
      setImageShapeId(nextId);
    }, []);

    const handleMount = useCallback((editor: Editor) => {
      try {
        editorRef.current = editor;
        setMountedEditor(editor);
        editor.user.updateUserPreferences({ colorScheme: "dark" });
      } catch (error) {
        handleError(error, {
          operation: "tldraw editor mount",
          category: ErrorCategory.UI,
          severity: ErrorSeverity.MEDIUM,
          showToast: false,
        });
      }
    }, []);

    // Create locked background image + side effects
    useEffect(() => {
      const editor = mountedEditor;
      if (!editor) return;
      const activeEditor: Editor = editor;

      let rmCreate = () => {};
      let rmChange = () => {};
      let rmLock = () => {};
      try {
        const width = sanitizeDimension({ value: image.width });
        const height = sanitizeDimension({ value: image.height });
        if (!image.src) {
          throw new Error("Missing source image");
        }

        const mimeType = normalizeImageMimeType({
          declaredType: image.type,
          dataUrl: image.src,
        });

        const existingShapeId = resolveBackgroundImageShapeId({
          editor: activeEditor,
          preferredId: imageShapeIdRef.current,
        });
        const existingShape = existingShapeId
          ? activeEditor.getShape(existingShapeId)
          : null;

        let shapeId = existingShapeId;
        let assetId = isLockedImageShape(existingShape)
          ? existingShape.props.assetId
          : null;
        const existingAsset = assetId ? activeEditor.getAsset(assetId) : null;
        const shouldCreateAsset =
          !assetId ||
          !existingAsset ||
          existingAsset.type !== "image" ||
          existingAsset.props.src !== image.src ||
          existingAsset.props.w !== width ||
          existingAsset.props.h !== height ||
          existingAsset.props.mimeType !== mimeType;

        if (shouldCreateAsset) {
          assetId = AssetRecordType.createId();
          activeEditor.createAssets([
            {
              id: assetId,
              typeName: "asset",
              type: "image",
              meta: {},
              props: {
                w: width,
                h: height,
                mimeType,
                src: image.src,
                name: "background",
                isAnimated: false,
              },
            },
          ]);
        }

        if (!assetId) {
          throw new Error("Failed to prepare background asset");
        }

        if (shapeId && isLockedImageShape(existingShape)) {
          activeEditor.updateShapes([
            {
              id: shapeId,
              type: "image",
              x: 0,
              y: 0,
              isLocked: true,
              props: { w: width, h: height, assetId },
            },
          ]);
        } else {
          shapeId = createShapeId();
          activeEditor.createShape({
            id: shapeId,
            type: "image",
            x: 0,
            y: 0,
            isLocked: true,
            props: { w: width, h: height, assetId },
          });
        }

        // Keep image at the bottom of the z-order
        function keepAtBottom() {
          const currentShapeId = resolveBackgroundImageShapeId({
            editor: activeEditor,
            preferredId: imageShapeIdRef.current,
          });
          if (!currentShapeId) return;

          const shape = activeEditor.getShape(currentShapeId);
          if (!shape) return;

          const pageId = activeEditor.getCurrentPageId();
          if (shape.parentId !== pageId) {
            activeEditor.moveShapesToPage([shape], pageId);
          }
          const siblings = activeEditor.getSortedChildIdsForParent(pageId);
          const bottom = activeEditor.getShape(siblings[0]);
          if (bottom && bottom.id !== currentShapeId) {
            activeEditor.sendToBack([shape]);
          }
        }
        keepAtBottom();

        rmCreate = activeEditor.sideEffects.registerAfterCreateHandler(
          "shape",
          keepAtBottom,
        );
        rmChange = activeEditor.sideEffects.registerAfterChangeHandler(
          "shape",
          keepAtBottom,
        );

        // Prevent unlocking the background image
        rmLock = activeEditor.sideEffects.registerBeforeChangeHandler(
          "shape",
          (prev, next) => {
            const currentShapeId = resolveBackgroundImageShapeId({
              editor: activeEditor,
              preferredId: imageShapeIdRef.current,
            });
            if (!currentShapeId || next.id !== currentShapeId) return next;
            if (next.isLocked) return next;
            return { ...prev, isLocked: true };
          },
        );

        activeEditor.clearHistory();
        setResolvedImageShapeId(shapeId);
      } catch (error) {
        setResolvedImageShapeId(null);
        handleError(error, {
          operation: "draw panel image setup",
          category: ErrorCategory.UI,
          severity: ErrorSeverity.MEDIUM,
        });
      }

      return () => {
        rmCreate();
        rmChange();
        rmLock();
      };
    }, [
      mountedEditor,
      image.src,
      image.width,
      image.height,
      image.type,
      setResolvedImageShapeId,
    ]);

    // Camera constraints — keep image in view
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const resolvedImageShapeId = resolveBackgroundImageShapeId({
        editor,
        preferredId: imageShapeId,
      });
      if (!resolvedImageShapeId) return;

      const width = sanitizeDimension({ value: image.width });
      const height = sanitizeDimension({ value: image.height });
      editor.setCameraOptions({
        constraints: {
          initialZoom: "fit-min-100",
          baseZoom: "fit-min-100",
          bounds: { x: 0, y: 0, w: width, h: height },
          padding: { x: 16, y: 16 },
          origin: { x: 0.5, y: 0.5 },
          behavior: "contain",
        },
      });
      editor.setCamera(editor.getCamera(), { reset: true });
    }, [imageShapeId, image.width, image.height]);

    useImperativeHandle(ref, () => ({
      getEditor: () => editorRef.current,

      getCanvasDataUrl: async () => {
        try {
          const editor = editorRef.current;
          if (!editor) return image.src || null;

          const resolvedImageShapeId = resolveBackgroundImageShapeId({
            editor,
            preferredId: imageShapeId,
          });
          if (!resolvedImageShapeId) return image.src || null;

          const shapeIds = [...editor.getCurrentPageShapeIds()];
          if (shapeIds.length === 0) return image.src || null;

          const bounds = editor.getShapePageBounds(resolvedImageShapeId);
          if (!bounds) return image.src || null;

          const result = await editor.toImage(shapeIds, {
            format: "png",
            background: true,
            bounds,
            padding: 0,
            scale: 1,
          });
          if (!result?.blob) return image.src || null;
          return URL.createObjectURL(result.blob);
        } catch (error) {
          handleError(error, {
            operation: "draw panel image export",
            category: ErrorCategory.UI,
            severity: ErrorSeverity.MEDIUM,
          });
          return image.src || null;
        }
      },

      getSnapshot: () => {
        const editor = editorRef.current;
        if (!editor) return null;
        return JSON.stringify(editor.store.getStoreSnapshot());
      },

      loadSnapshot: (snapshotJson: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        try {
          const snapshot = JSON.parse(snapshotJson);
          editor.store.loadStoreSnapshot(snapshot);
          // Re-derive imageShapeId from the loaded store
          const resolvedImageShapeId = resolveBackgroundImageShapeId({
            editor,
            preferredId: null,
          });
          setResolvedImageShapeId(resolvedImageShapeId);
        } catch (error) {
          handleError(error, {
            operation: "draw panel snapshot load",
            category: ErrorCategory.STORAGE,
            severity: ErrorSeverity.MEDIUM,
          });
        }
      },

      clearAll: () => {
        const editor = editorRef.current;
        if (!editor) return;
        const resolvedImageShapeId = resolveBackgroundImageShapeId({
          editor,
          preferredId: imageShapeId,
        });
        if (!resolvedImageShapeId) return;
        // Delete all shapes EXCEPT the background image
        const allIds = [...editor.getCurrentPageShapeIds()];
        const toDelete = allIds.filter((id) => id !== resolvedImageShapeId);
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
  },
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
    "Z",
    `M ${topLeft.x} ${topLeft.y}`,
    `L ${bottomRight.x} ${topLeft.y}`,
    `L ${bottomRight.x} ${bottomRight.y}`,
    `L ${topLeft.x} ${bottomRight.y}`,
    "Z",
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
