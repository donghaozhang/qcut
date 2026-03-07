import React, { useId, useState } from "react";
import { useNanoEditStore } from "@/stores/editor/nano-edit-store";

interface PromptInputProps {
	onGenerate: (prompt: string) => Promise<void>;
	placeholder?: string;
	label?: string;
}

export const PromptInput: React.FC<PromptInputProps> = ({
	onGenerate,
	placeholder = "Describe the image you want to generate...",
	label = "AI Prompt",
}) => {
	const [prompt, setPrompt] = useState("");
	const { isProcessing } = useNanoEditStore();
	const inputId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || isProcessing) return;

		try {
			await onGenerate(prompt.trim());
			setPrompt(""); // Clear prompt after successful generation
		} catch (error) {
			console.error("Error generating image:", error);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-3">
			<div>
				<label
					htmlFor={inputId}
					className="block text-sm font-medium text-gray-200 mb-2"
				>
					{label}
				</label>
				<textarea
					id={inputId}
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder={placeholder}
					disabled={isProcessing}
					className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					rows={3}
				/>
			</div>

			<button
				type="submit"
				disabled={!prompt.trim() || isProcessing}
				className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				{isProcessing ? "Generating..." : "Generate Image"}
			</button>
		</form>
	);
};

export default PromptInput;
