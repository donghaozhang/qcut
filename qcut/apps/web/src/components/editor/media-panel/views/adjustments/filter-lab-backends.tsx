import { useState, type ComponentProps } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JianyingFilterLab } from "./jianying-filter-lab";
import { IndependentFilterShelf } from "./independent-filter-shelf";

export function FilterLabBackends(
	props: ComponentProps<typeof JianyingFilterLab>
) {
	const [backend, setBackend] = useState("jianying");
	return (
		<Tabs
			value={backend}
			onValueChange={setBackend}
			className="flex min-h-0 flex-1 flex-col gap-2"
		>
			<TabsList
				className="grid w-full shrink-0 grid-cols-2"
				aria-label="滤镜渲染器"
			>
				<TabsTrigger value="jianying">剪映本机</TabsTrigger>
				<TabsTrigger value="independent">QCut Metal</TabsTrigger>
			</TabsList>
			<TabsContent
				value="jianying"
				className="mt-0 flex min-h-0 flex-1 flex-col"
			>
				<JianyingFilterLab {...props} />
			</TabsContent>
			<TabsContent
				value="independent"
				className="mt-0 min-h-0 flex-1 overflow-y-auto"
			>
				<IndependentFilterShelf {...props} />
			</TabsContent>
		</Tabs>
	);
}
