// LoadingSpinner component copied from nano-banana with QCut styling adaptation
import React from "react";

interface LoadingSpinnerProps {
	message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => {
	return (
		<div className="flex flex-col items-center justify-center gap-4 text-gray-300">
			<svg
				className="animate-spin h-10 w-10 text-yellow-500"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<title>Loading</title>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				/>
			</svg>
			<p className="text-lg font-medium">{message || "Processing..."}</p>
			<p className="text-sm text-gray-400">This may take a moment.</p>
		</div>
	);
};

export default LoadingSpinner;
