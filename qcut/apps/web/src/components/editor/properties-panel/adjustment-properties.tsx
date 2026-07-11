import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";

export function AdjustmentProperties() {
	const setActiveTab = useMediaPanelStore((state) => state.setActiveTab);
	return (
		<Button
			type="button"
			variant="outline"
			className="w-full"
			onClick={() => setActiveTab("effects")}
		>
			<Sparkles className="size-4" />
			Add effect
		</Button>
	);
}
