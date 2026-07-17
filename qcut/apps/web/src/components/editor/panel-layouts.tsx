"use client";

import React from "react";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "../ui/resizable";
import { MediaPanel } from "./media-panel";
import { PropertiesPanel } from "./properties-panel";
import { Timeline } from "./timeline";
import { PreviewPanel } from "./preview-panel";
import { usePanelStore } from "@/stores/editor/panel-store";
import { ErrorBoundary } from "@/components/error-boundary";
import { PanelErrorFallback } from "./panel-error-fallback";

const PanelBoundary = ({
	name,
	children,
}: {
	name: string;
	children: React.ReactNode;
}) => (
	<ErrorBoundary
		isolate
		fallback={(props) => <PanelErrorFallback {...props} name={name} />}
	>
		{children}
	</ErrorBoundary>
);

interface LayoutProps {
	resetCounter: number;
}

/** Convert a numeric size to a percentage string for react-resizable-panels v4+ */
const pct = (n: number) => `${n}%`;

export function DefaultLayout({ resetCounter }: LayoutProps) {
	const {
		toolsPanel,
		previewPanel,
		mainContent,
		timeline,
		propertiesPanel,
		setToolsPanel,
		setPreviewPanel,
		setMainContent,
		setTimeline,
		setPropertiesPanel,
	} = usePanelStore();

	// Memoize initial sizes so they only change on preset reset (resetCounter).
	// v4 re-applies defaultSize on prop changes, so we must keep it stable
	// during drag to avoid fighting the library's internal state.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only recompute on preset reset, not during drag (v4 re-applies defaultSize)
	const defaults = React.useMemo(
		() => ({
			tools: pct(toolsPanel),
			preview: pct(previewPanel),
			properties: pct(propertiesPanel),
			main: pct(mainContent),
			time: pct(timeline),
		}),
		[resetCounter]
	);

	return (
		<ResizablePanelGroup
			key={`default-${resetCounter}`}
			orientation="vertical"
			className="h-full w-full"
		>
			<ResizablePanel
				defaultSize={defaults.main}
				minSize="30%"
				maxSize="85%"
				onResize={(size) => setMainContent(size.asPercentage)}
				className="min-h-0"
			>
				<ResizablePanelGroup
					orientation="horizontal"
					className="h-full w-full px-1"
				>
					<ResizablePanel
						defaultSize={defaults.tools}
						minSize="10%"
						maxSize="50%"
						onResize={(size) => setToolsPanel(size.asPercentage)}
						className="min-w-0"
					>
						<PanelBoundary name="Media">
							<MediaPanel />
						</PanelBoundary>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={defaults.preview}
						minSize="20%"
						onResize={(size) => setPreviewPanel(size.asPercentage)}
						className="min-w-0 min-h-0 flex-1"
					>
						<PanelBoundary name="Preview">
							<PreviewPanel />
						</PanelBoundary>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={defaults.properties}
						minSize="10%"
						maxSize="50%"
						onResize={(size) => setPropertiesPanel(size.asPercentage)}
						className="min-w-0"
					>
						<PanelBoundary name="Properties">
							<PropertiesPanel />
						</PanelBoundary>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={defaults.time}
				minSize="15%"
				maxSize="70%"
				onResize={(size) => setTimeline(size.asPercentage)}
				className="min-h-0 px-1 pb-1"
			>
				<PanelBoundary name="Timeline">
					<Timeline />
				</PanelBoundary>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

export function MediaLayout({ resetCounter }: LayoutProps) {
	const {
		toolsPanel,
		previewPanel,
		mainContent,
		timeline,
		propertiesPanel,
		setToolsPanel,
		setPreviewPanel,
		setMainContent,
		setTimeline,
		setPropertiesPanel,
	} = usePanelStore();

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only recompute on preset reset, not during drag (v4 re-applies defaultSize)
	const defaults = React.useMemo(() => {
		const rightTotal = Math.max(1, previewPanel + propertiesPanel);
		return {
			tools: pct(toolsPanel),
			right: pct(100 - toolsPanel),
			main: pct(mainContent),
			time: pct(timeline),
			preview: pct((previewPanel / rightTotal) * 100),
			properties: pct((propertiesPanel / rightTotal) * 100),
		};
	}, [resetCounter]);

	const rightGroupTotal = Math.max(1, 100 - toolsPanel);
	const toGlobalPreview = (pctVal: number) => (pctVal * rightGroupTotal) / 100;
	const toGlobalProperties = (pctVal: number) =>
		(pctVal * rightGroupTotal) / 100;

	return (
		<ResizablePanelGroup
			key={`media-${resetCounter}`}
			orientation="horizontal"
			className="h-full w-full"
		>
			<ResizablePanel
				defaultSize={defaults.tools}
				minSize="10%"
				maxSize="50%"
				onResize={(size) => setToolsPanel(size.asPercentage)}
				className="min-w-0"
			>
				<PanelBoundary name="Media">
					<MediaPanel />
				</PanelBoundary>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={defaults.right}
				minSize="50%"
				className="min-w-0 min-h-0"
			>
				<ResizablePanelGroup orientation="vertical" className="h-full w-full">
					<ResizablePanel
						defaultSize={defaults.main}
						minSize="30%"
						maxSize="85%"
						onResize={(size) => setMainContent(size.asPercentage)}
						className="min-h-0"
					>
						<ResizablePanelGroup
							orientation="horizontal"
							className="h-full w-full px-1"
						>
							<ResizablePanel
								defaultSize={defaults.preview}
								minSize="20%"
								onResize={(size) =>
									setPreviewPanel(toGlobalPreview(size.asPercentage))
								}
								className="min-w-0 min-h-0 flex-1"
							>
								<PanelBoundary name="Preview">
									<PreviewPanel />
								</PanelBoundary>
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel
								defaultSize={defaults.properties}
								minSize="10%"
								maxSize="50%"
								onResize={(size) =>
									setPropertiesPanel(toGlobalProperties(size.asPercentage))
								}
								className="min-w-0"
							>
								<PanelBoundary name="Properties">
									<PropertiesPanel />
								</PanelBoundary>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={defaults.time}
						minSize="15%"
						maxSize="70%"
						onResize={(size) => setTimeline(size.asPercentage)}
						className="min-h-0 px-1 pb-1"
					>
						<PanelBoundary name="Timeline">
							<Timeline />
						</PanelBoundary>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

export function InspectorLayout({ resetCounter }: LayoutProps) {
	const {
		toolsPanel,
		previewPanel,
		mainContent,
		timeline,
		propertiesPanel,
		setToolsPanel,
		setPreviewPanel,
		setMainContent,
		setTimeline,
		setPropertiesPanel,
	} = usePanelStore();

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only recompute on preset reset, not during drag (v4 re-applies defaultSize)
	const defaults = React.useMemo(() => {
		const leftTotal = Math.max(1, toolsPanel + previewPanel);
		return {
			left: pct(toolsPanel + previewPanel),
			main: pct(mainContent),
			time: pct(timeline),
			tools: pct((toolsPanel / leftTotal) * 100),
			preview: pct((previewPanel / leftTotal) * 100),
			properties: pct(propertiesPanel),
		};
	}, [resetCounter]);

	const leftGroupTotal = Math.max(1, 100 - propertiesPanel);
	const toGlobalTools = (pctVal: number) => (pctVal * leftGroupTotal) / 100;
	const toGlobalPreview = (pctVal: number) => (pctVal * leftGroupTotal) / 100;

	return (
		<ResizablePanelGroup
			key={`inspector-${resetCounter}`}
			orientation="horizontal"
			className="h-full w-full px-3 pb-3"
		>
			<ResizablePanel defaultSize={defaults.left} minSize="50%">
				<ResizablePanelGroup orientation="vertical" className="h-full w-full">
					<ResizablePanel
						defaultSize={defaults.main}
						minSize="30%"
						onResize={(size) => setMainContent(size.asPercentage)}
					>
						<ResizablePanelGroup
							orientation="horizontal"
							className="h-full w-full"
						>
							<ResizablePanel
								defaultSize={defaults.tools}
								minSize="10%"
								onResize={(size) =>
									setToolsPanel(toGlobalTools(size.asPercentage))
								}
							>
								<PanelBoundary name="Media">
									<MediaPanel />
								</PanelBoundary>
							</ResizablePanel>
							<ResizableHandle withHandle />
							<ResizablePanel
								defaultSize={defaults.preview}
								minSize="20%"
								onResize={(size) =>
									setPreviewPanel(toGlobalPreview(size.asPercentage))
								}
							>
								<PanelBoundary name="Preview">
									<PreviewPanel />
								</PanelBoundary>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel
						defaultSize={defaults.time}
						minSize="15%"
						onResize={(size) => setTimeline(size.asPercentage)}
					>
						<PanelBoundary name="Timeline">
							<Timeline />
						</PanelBoundary>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel
				defaultSize={defaults.properties}
				minSize="10%"
				maxSize="50%"
				onResize={(size) => setPropertiesPanel(size.asPercentage)}
			>
				<PanelBoundary name="Properties">
					<PropertiesPanel />
				</PanelBoundary>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

/** Mirror of VerticalPreviewLayout: the full-height preview sits on the left. */
export function VerticalPreviewLeftLayout({ resetCounter }: LayoutProps) {
	const {
		toolsPanel,
		previewPanel,
		mainContent,
		timeline,
		propertiesPanel,
		setToolsPanel,
		setPreviewPanel,
		setMainContent,
		setTimeline,
		setPropertiesPanel,
	} = usePanelStore();

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only recompute on preset reset, not during drag (v4 re-applies defaultSize)
	const defaults = React.useMemo(() => {
		const rightTotal = Math.max(1, toolsPanel + propertiesPanel);
		return {
			right: pct(toolsPanel + propertiesPanel),
			main: pct(mainContent),
			time: pct(timeline),
			tools: pct((toolsPanel / rightTotal) * 100),
			properties: pct((propertiesPanel / rightTotal) * 100),
			preview: pct(previewPanel),
		};
	}, [resetCounter]);

	const rightGroupTotal = Math.max(1, 100 - previewPanel);
	const toGlobalTools = (pctVal: number) => (pctVal * rightGroupTotal) / 100;
	const toGlobalProperties = (pctVal: number) =>
		(pctVal * rightGroupTotal) / 100;

	return (
		<ResizablePanelGroup
			key={`vertical-preview-left-${resetCounter}`}
			orientation="horizontal"
			className="h-full w-full px-3 pb-3"
		>
			<ResizablePanel
				defaultSize={defaults.preview}
				minSize="20%"
				onResize={(size) => setPreviewPanel(size.asPercentage)}
			>
				<PanelBoundary name="Preview">
					<PreviewPanel />
				</PanelBoundary>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={defaults.right} minSize="50%">
				<ResizablePanelGroup orientation="vertical" className="h-full w-full">
					<ResizablePanel
						defaultSize={defaults.main}
						minSize="30%"
						onResize={(size) => setMainContent(size.asPercentage)}
					>
						<ResizablePanelGroup
							orientation="horizontal"
							className="h-full w-full"
						>
							<ResizablePanel
								defaultSize={defaults.tools}
								minSize="15%"
								onResize={(size) =>
									setToolsPanel(toGlobalTools(size.asPercentage))
								}
							>
								<PanelBoundary name="Media">
									<MediaPanel />
								</PanelBoundary>
							</ResizablePanel>
							<ResizableHandle withHandle />
							<ResizablePanel
								defaultSize={defaults.properties}
								minSize="15%"
								onResize={(size) =>
									setPropertiesPanel(toGlobalProperties(size.asPercentage))
								}
							>
								<PanelBoundary name="Properties">
									<PropertiesPanel />
								</PanelBoundary>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel
						defaultSize={defaults.time}
						minSize="15%"
						onResize={(size) => setTimeline(size.asPercentage)}
					>
						<PanelBoundary name="Timeline">
							<Timeline />
						</PanelBoundary>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

export function VerticalPreviewLayout({ resetCounter }: LayoutProps) {
	const {
		toolsPanel,
		previewPanel,
		mainContent,
		timeline,
		propertiesPanel,
		setToolsPanel,
		setPreviewPanel,
		setMainContent,
		setTimeline,
		setPropertiesPanel,
	} = usePanelStore();

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only recompute on preset reset, not during drag (v4 re-applies defaultSize)
	const defaults = React.useMemo(() => {
		const leftTotal = Math.max(1, toolsPanel + propertiesPanel);
		return {
			left: pct(toolsPanel + propertiesPanel),
			main: pct(mainContent),
			time: pct(timeline),
			tools: pct((toolsPanel / leftTotal) * 100),
			properties: pct((propertiesPanel / leftTotal) * 100),
			preview: pct(previewPanel),
		};
	}, [resetCounter]);

	const leftGroupTotal = Math.max(1, 100 - previewPanel);
	const toGlobalTools = (pctVal: number) => (pctVal * leftGroupTotal) / 100;
	const toGlobalProperties = (pctVal: number) =>
		(pctVal * leftGroupTotal) / 100;

	return (
		<ResizablePanelGroup
			key={`vertical-preview-${resetCounter}`}
			orientation="horizontal"
			className="h-full w-full px-3 pb-3"
		>
			<ResizablePanel defaultSize={defaults.left} minSize="50%">
				<ResizablePanelGroup orientation="vertical" className="h-full w-full">
					<ResizablePanel
						defaultSize={defaults.main}
						minSize="30%"
						onResize={(size) => setMainContent(size.asPercentage)}
					>
						<ResizablePanelGroup
							orientation="horizontal"
							className="h-full w-full"
						>
							<ResizablePanel
								defaultSize={defaults.tools}
								minSize="15%"
								onResize={(size) =>
									setToolsPanel(toGlobalTools(size.asPercentage))
								}
							>
								<PanelBoundary name="Media">
									<MediaPanel />
								</PanelBoundary>
							</ResizablePanel>
							<ResizableHandle withHandle />
							<ResizablePanel
								defaultSize={defaults.properties}
								minSize="15%"
								onResize={(size) =>
									setPropertiesPanel(toGlobalProperties(size.asPercentage))
								}
							>
								<PanelBoundary name="Properties">
									<PropertiesPanel />
								</PanelBoundary>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel
						defaultSize={defaults.time}
						minSize="15%"
						onResize={(size) => setTimeline(size.asPercentage)}
					>
						<PanelBoundary name="Timeline">
							<Timeline />
						</PanelBoundary>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel
				defaultSize={defaults.preview}
				minSize="20%"
				onResize={(size) => setPreviewPanel(size.asPercentage)}
			>
				<PanelBoundary name="Preview">
					<PreviewPanel />
				</PanelBoundary>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
