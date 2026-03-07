import React, { useCallback, useState } from "react";

interface UploaderBoxProps {
	onImageSelect: (file: File, dataUrl: string) => void;
	imageUrl: string | null;
	onClear: () => void;
	title: string;
	description: string;
}

const UploaderBox: React.FC<UploaderBoxProps> = ({
	onImageSelect,
	imageUrl,
	onClear,
	title,
	description,
}) => {
	const [isDragging, setIsDragging] = useState(false);

	const handleFile = useCallback(
		(file: File) => {
			const reader = new FileReader();
			reader.onload = (e) => onImageSelect(file, e.target?.result as string);
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

	const inputId = `file-upload-${title.replace(/\s+/g, "-").toLowerCase()}`;

	return (
		<div className="flex flex-col gap-2">
			<h3 className="text-sm font-semibold text-gray-200">{title}</h3>
			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				className={`relative w-full aspect-square bg-black rounded-lg flex items-center justify-center transition-colors duration-200 select-none ${
					isDragging
						? "outline-dashed outline-2 outline-orange-500 bg-orange-500/10"
						: ""
				} ${imageUrl ? "p-0" : "p-4 border-2 border-dashed border-white/20"}`}
			>
				{imageUrl ? (
					<>
						<img
							src={imageUrl}
							alt={title}
							className="w-full h-full object-contain rounded-lg"
						/>
						<button
							type="button"
							onClick={onClear}
							className="absolute top-2 right-2 z-10 p-1 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-red-600 transition-colors"
							aria-label={`Remove ${title} image`}
						>
							<svg
								aria-hidden="true"
								focusable="false"
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
					</>
				) : (
					<label
						htmlFor={inputId}
						className="flex flex-col items-center justify-center text-gray-500 cursor-pointer w-full h-full text-center"
					>
						<svg
							aria-hidden="true"
							focusable="false"
							xmlns="http://www.w3.org/2000/svg"
							className="h-8 w-8 mb-2"
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
						<p className="mb-1 text-xs font-semibold">
							Click or drag to upload
						</p>
						<p className="text-xs text-gray-600">{description}</p>
						<input
							id={inputId}
							type="file"
							className="hidden"
							onChange={handleFileChange}
							accept="image/*"
						/>
					</label>
				)}
			</div>
		</div>
	);
};

interface MultiImageUploaderProps {
	onPrimarySelect: (file: File, dataUrl: string) => void;
	onSecondarySelect: (file: File, dataUrl: string) => void;
	primaryImageUrl: string | null;
	secondaryImageUrl: string | null;
	onClearPrimary: () => void;
	onClearSecondary: () => void;
	primaryTitle?: string;
	primaryDescription?: string;
	secondaryTitle?: string;
	secondaryDescription?: string;
}

const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({
	onPrimarySelect,
	onSecondarySelect,
	primaryImageUrl,
	secondaryImageUrl,
	onClearPrimary,
	onClearSecondary,
	primaryTitle = "Character",
	primaryDescription = "The main character",
	secondaryTitle = "Pose Reference",
	secondaryDescription = "The pose to apply",
}) => {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<UploaderBox
				title={primaryTitle}
				description={primaryDescription}
				imageUrl={primaryImageUrl}
				onImageSelect={onPrimarySelect}
				onClear={onClearPrimary}
			/>
			<UploaderBox
				title={secondaryTitle}
				description={secondaryDescription}
				imageUrl={secondaryImageUrl}
				onImageSelect={onSecondarySelect}
				onClear={onClearSecondary}
			/>
		</div>
	);
};

export default MultiImageUploader;
