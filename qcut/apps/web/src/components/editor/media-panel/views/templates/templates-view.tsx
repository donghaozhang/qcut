import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RemotionView } from "../remotion";
import { SmartPackagingView } from "./smart-packaging-view";
import { TimelineTemplateWorkbench } from "./timeline-template-workbench";

export function TemplatesView() {
	return (
		<div
			className="flex h-full min-h-0 flex-col p-3"
			data-testid="templates-panel"
		>
			<Tabs defaultValue="timeline" className="flex min-h-0 flex-1 flex-col">
				<TabsList className="grid h-8 w-full shrink-0 grid-cols-3">
					<TabsTrigger value="timeline" className="text-xs">
						Templates
					</TabsTrigger>
					<TabsTrigger value="smart" className="text-xs">
						Smart Pack
					</TabsTrigger>
					<TabsTrigger value="motion" className="text-xs">
						Motion
					</TabsTrigger>
				</TabsList>
				<TabsContent value="timeline" className="mt-3 min-h-0 overflow-y-auto">
					<TimelineTemplateWorkbench />
				</TabsContent>
				<TabsContent value="smart" className="mt-3 min-h-0 overflow-y-auto">
					<SmartPackagingView />
				</TabsContent>
				<TabsContent
					value="motion"
					className="mt-0 min-h-0 flex-1 overflow-hidden"
				>
					<RemotionView />
				</TabsContent>
			</Tabs>
		</div>
	);
}
