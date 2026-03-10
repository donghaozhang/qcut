/**
 * Detect iOS virtual keyboard visibility using visualViewport API.
 * Returns true when keyboard is likely open (viewport height shrinks significantly).
 */
import { useState, useEffect } from "react";

export function useVirtualKeyboard() {
	const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
	const [keyboardHeight, setKeyboardHeight] = useState(0);

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		const threshold = 150; // px - minimum height change to detect keyboard

		const handleResize = () => {
			const heightDiff = window.innerHeight - viewport.height;
			const open = heightDiff > threshold;
			setIsKeyboardOpen(open);
			setKeyboardHeight(open ? heightDiff : 0);
		};

		viewport.addEventListener("resize", handleResize);
		handleResize(); // Capture initial state in case keyboard is already open
		return () => viewport.removeEventListener("resize", handleResize);
	}, []);

	return { isKeyboardOpen, keyboardHeight };
}
