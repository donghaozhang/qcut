import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { parseFilterLabRenderLocalEffectRequest } from "../jianying-filter-lab-request.js";
import { validateIndependentFilterIdentity } from "./assets.js";
import {
	QCUT_FILTER_LOAD,
	QCUT_FILTER_RENDER,
	QCUT_FILTER_LIST,
	QCUT_FOG_RESOURCE,
} from "./contract.js";
import { createIndependentFilterProvider } from "./provider.js";
import { createIndependentLutProvider } from "./lut-provider.js";
import { createSoftGlowProvider } from "./soft-glow-provider.js";
import { SOFT_GLOW_RESOURCE } from "./soft-glow-contract.js";
import {
	listIndependentFilters,
	parseIndependentIdentity,
} from "./lut-catalog.js";

export function setupIndependentFilterIPC({
	getMainWindow,
}: {
	getMainWindow: () => BrowserWindow | null;
}) {
	const provider = createIndependentFilterProvider();
	const lutProvider = createIndependentLutProvider();
	const softGlowProvider = createSoftGlowProvider();
	const assertTrusted = ({ event }: { event: IpcMainInvokeEvent }) => {
		const window = getMainWindow();
		if (
			!window ||
			window.isDestroyed() ||
			window.webContents.isDestroyed() ||
			event.sender !== window.webContents ||
			!event.senderFrame ||
			event.senderFrame !== window.webContents.mainFrame
		) {
			throw new Error("Independent filter rejected an untrusted renderer.");
		}
	};
	ipcMain.handle(QCUT_FILTER_LIST, (event, request: unknown) => {
		assertTrusted({ event });
		return listIndependentFilters({
			refresh: Boolean(
				request &&
					typeof request === "object" &&
					"refresh" in request &&
					request.refresh === true
			),
		});
	});
	ipcMain.handle(QCUT_FILTER_LOAD, (event, request: unknown) => {
		assertTrusted({ event });
		if (request !== undefined) {
			const identity = parseIndependentIdentity({ request });
			if (identity.resourceId === SOFT_GLOW_RESOURCE)
				return softGlowProvider.load(identity);
			if (identity.resourceId !== QCUT_FOG_RESOURCE)
				return lutProvider.load(identity);
			validateIndependentFilterIdentity(identity);
		}
		return provider.load();
	});
	ipcMain.handle(QCUT_FILTER_RENDER, (event, request: unknown) => {
		assertTrusted({ event });
		const parsed = parseFilterLabRenderLocalEffectRequest({ request });
		if (
			!request ||
			typeof request !== "object" ||
			!("version" in request) ||
			typeof request.version !== "string"
		) {
			throw new Error("Independent filter requires an exact version.");
		}
		const input = { ...parsed, version: request.version };
		if (input.resourceId === SOFT_GLOW_RESOURCE)
			return softGlowProvider.render(input);
		if (input.resourceId !== QCUT_FOG_RESOURCE) {
			parseIndependentIdentity({ request: input });
			return lutProvider.render(input);
		}
		validateIndependentFilterIdentity(input);
		return provider.render(input);
	});
	return {
		dispose() {
			ipcMain.removeHandler(QCUT_FILTER_LOAD);
			ipcMain.removeHandler(QCUT_FILTER_RENDER);
			ipcMain.removeHandler(QCUT_FILTER_LIST);
			void provider.dispose();
			void lutProvider.dispose();
			void softGlowProvider.dispose();
		},
	};
}
