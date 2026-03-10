import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "com.qcut.videoeditor",
	appName: "QCut",
	webDir: "dist",
	server: {
		// For dev: uncomment to point at Vite dev server instead of built files
		// url: "http://192.168.x.x:5173",
		// cleartext: true,
	},
	ios: {
		contentInset: "automatic",
		allowsLinkPreview: false,
		scrollEnabled: false,
	},
};

export default config;
