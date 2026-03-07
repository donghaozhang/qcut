import React, { useRef, useEffect, useState, useCallback } from "react";

interface ImageEditorCanvasProps {
	onImageSelect: (file: File, dataUrl: string) => void;
	initialImageUrl: string | null;
	onMaskChange: (dataUrl: string | null) => void;
	onClearImage: () => void;
	isMaskToolActive: boolean;
}

const ImageEditorCanvas: React.FC<ImageEditorCanvasProps> = ({
	onImageSelect,
	initialImageUrl,
	onMaskChange,
	onClearImage,
	isMaskToolActive,
}) => {
	const imageCanvasRef = useRef<HTMLCanvasElement>(null);
	const maskCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const [image, setImage] = useState<HTMLImageElement | null>(null);

	const [isDrawing, setIsDrawing] = useState(false);
	const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
	const [brushSize, setBrushSize] = useState(20);
	const [history, setHistory] = useState<ImageData[]>([]);

	const [isDragging, setIsDragging] = useState(false); // For file drop

	const getCanvasContexts = useCallback(() => {
		const imageCanvas = imageCanvasRef.current;
		const maskCanvas = maskCanvasRef.current;
		const imageCtx = imageCanvas?.getContext("2d");
		const maskCtx = maskCanvas?.getContext("2d");
		return { imageCanvas, maskCanvas, imageCtx, maskCtx };
	}, []);

	const draw = useCallback(() => {
		const { imageCtx, imageCanvas, maskCanvas } = getCanvasContexts();
		const container = containerRef.current;

		if (!imageCtx || !imageCanvas || !image || !container) return;

		const contRatio = container.clientWidth / container.clientHeight;
		const imgRatio = image.width / image.height;

		let displayW, displayH, displayX, displayY;
		if (contRatio > imgRatio) {
			displayH = container.clientHeight;
			displayW = displayH * imgRatio;
		} else {
			displayW = container.clientWidth;
			displayH = displayW / imgRatio;
		}
		displayX = (container.clientWidth - displayW) / 2;
		displayY = (container.clientHeight - displayH) / 2;

		[imageCanvas, maskCanvas].forEach((canvas) => {
			if (canvas) {
				canvas.width = container.clientWidth;
				canvas.height = container.clientHeight;
			}
		});

		imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
		imageCtx.drawImage(image, displayX, displayY, displayW, displayH);
	}, [image, getCanvasContexts]);

	useEffect(() => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			setImage(img);
			setHistory([]);
			const { maskCtx, maskCanvas } = getCanvasContexts();
			if (maskCtx && maskCanvas) {
				maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
				onMaskChange(null);
			}
		};
		if (initialImageUrl) {
			img.src = initialImageUrl;
		} else {
			setImage(null);
		}
	}, [initialImageUrl, getCanvasContexts, onMaskChange]);

	useEffect(() => {
		draw();
		const handleResize = () => {
			const { maskCanvas, imageCanvas, maskCtx } = getCanvasContexts();
			const snapshot = maskCanvas?.toDataURL();
			draw();
			if (snapshot && maskCanvas && imageCanvas && maskCtx) {
				const img = new Image();
				img.onload = () => {
					// scale snapshot to new canvas size
					maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
					maskCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
				};
				img.src = snapshot;
			}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [draw, getCanvasContexts]);

	const saveToHistory = useCallback(() => {
		const { maskCtx, maskCanvas } = getCanvasContexts();
		if (maskCtx && maskCanvas) {
			setHistory((prev) => [
				...prev,
				maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
			]);
		}
	}, [getCanvasContexts]);

	const clearMask = useCallback(() => {
		const { maskCtx, maskCanvas } = getCanvasContexts();
		if (maskCtx && maskCanvas) {
			saveToHistory();
			maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
			onMaskChange(null);
			setHistory((prev) => [
				...prev,
				maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
			]);
		}
	}, [getCanvasContexts, onMaskChange, saveToHistory]);

	const handleUndo = useCallback(() => {
		const { maskCtx, maskCanvas } = getCanvasContexts();
		if (!maskCtx || !maskCanvas || history.length === 0) return;

		const newHistory = history.slice(0, -1);
		setHistory(newHistory);
		maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

		if (newHistory.length > 0) {
			maskCtx.putImageData(newHistory[newHistory.length - 1], 0, 0);
			onMaskChange(maskCanvas.toDataURL());
		} else {
			onMaskChange(null);
		}
	}, [getCanvasContexts, onMaskChange, history]);

	const getMaskCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
		const canvas = maskCanvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const x =
			"touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
		const y =
			"touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
		return { x, y };
	};

	const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
		const coords = getMaskCoordinates(e);
		if (!coords) return;
		saveToHistory();
		setIsDrawing(true);
		setLastPos(coords);
	};

	const doDraw = (e: React.MouseEvent | React.TouchEvent) => {
		if (!isDrawing) return;
		const coords = getMaskCoordinates(e);
		if (!coords || !lastPos) return;
		const { maskCtx } = getCanvasContexts();
		if (maskCtx) {
			maskCtx.beginPath();
			maskCtx.strokeStyle = "rgba(249, 115, 22, 0.7)";
			maskCtx.lineWidth = brushSize;
			maskCtx.lineCap = "round";
			maskCtx.lineJoin = "round";
			maskCtx.moveTo(lastPos.x, lastPos.y);
			maskCtx.lineTo(coords.x, coords.y);
			maskCtx.stroke();
		}
		setLastPos(coords);
	};

	const stopDrawing = () => {
		setIsDrawing(false);
		setLastPos(null);
		onMaskChange(maskCanvasRef.current?.toDataURL() ?? null);
	};

	const handleFile = useCallback(
		(file: File) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result) {
					onImageSelect(file, e.target.result as string);
				}
			};
			reader.onerror = () => {
				if (import.meta.env.DEV) {
					console.error("Failed to read file:", file.name);
				}
				// Consider adding user-facing error notification
			};
			reader.readAsDataURL(file);
		},
		[onImageSelect]
	);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (event.target.files?.[0]) handleFile(event.target.files[0]);
	};
	const handleDrop = useCallback(
		(event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			event.stopPropagation();
			setIsDragging(false);
			if (event.dataTransfer.files?.[0])
				handleFile(event.dataTransfer.files[0]);
		},
		[handleFile]
	);
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};
	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	return (
		<div className="flex flex-col gap-4">
			<div
				ref={containerRef}
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				className={`relative w-full aspect-square bg-black rounded-lg flex items-center justify-center transition-colors duration-200 select-none ${
					isDragging
						? "outline-dashed outline-2 outline-orange-500 bg-orange-500/10"
						: ""
				} ${initialImageUrl ? "p-0" : "p-4 border-2 border-dashed border-white/20"}`}
			>
				{initialImageUrl ? (
					<>
						<button
							type="button"
							onClick={onClearImage}
							className="absolute top-2 right-2 z-30 p-1 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-red-600 transition-colors"
							aria-label="Remove image"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fillRule="evenodd"
									d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
						<canvas
							ref={imageCanvasRef}
							className="absolute top-0 left-0"
							style={{ zIndex: 1 }}
						/>
						<canvas
							ref={maskCanvasRef}
							className="absolute top-0 left-0"
							style={{
								zIndex: 3,
								touchAction: "none",
								cursor: isMaskToolActive ? "crosshair" : "default",
							}}
							onMouseDown={isMaskToolActive ? startDrawing : undefined}
							onMouseMove={isMaskToolActive ? doDraw : undefined}
							onMouseUp={isMaskToolActive ? stopDrawing : undefined}
							onMouseLeave={isMaskToolActive ? stopDrawing : undefined}
							onTouchStart={isMaskToolActive ? startDrawing : undefined}
							onTouchMove={isMaskToolActive ? doDraw : undefined}
							onTouchEnd={isMaskToolActive ? stopDrawing : undefined}
						/>
					</>
				) : (
					<label
						htmlFor="file-upload"
						className="flex flex-col items-center justify-center text-gray-500 cursor-pointer w-full h-full"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-10 w-10 mb-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.158 0h.008v.008h-.008V8.25z"
							/>
						</svg>
						<p className="mb-2 text-sm">
							<span className="font-semibold">Click to upload</span> or drag and
							drop
						</p>
						<input
							id="file-upload"
							type="file"
							className="hidden"
							onChange={handleFileChange}
							accept="image/*"
						/>
					</label>
				)}
			</div>
			{initialImageUrl && isMaskToolActive && (
				<div className="p-3 bg-black/60 backdrop-blur-md rounded-lg flex flex-col gap-4 border border-white/10 animate-fade-in-fast">
					<p className="text-xs text-gray-300 -mb-2">
						Draw on the image to create a mask for localized edits.
					</p>
					<div className="flex items-center gap-4">
						<label
							htmlFor="brush-size"
							className="text-sm font-medium text-gray-200 whitespace-nowrap"
						>
							Brush Size
						</label>
						<input
							id="brush-size"
							type="range"
							min="5"
							max="100"
							value={brushSize}
							onChange={(e) => setBrushSize(Number(e.target.value))}
							className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
						/>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={handleUndo}
							disabled={history.length === 0}
							className="px-4 py-2 text-sm font-semibold text-gray-200 bg-gray-800 rounded-md hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
						>
							Undo
						</button>
						<button
							type="button"
							onClick={clearMask}
							disabled={history.length === 0}
							className="px-4 py-2 text-sm font-semibold text-gray-200 bg-gray-800 rounded-md hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
						>
							Clear Mask
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default ImageEditorCanvas;
