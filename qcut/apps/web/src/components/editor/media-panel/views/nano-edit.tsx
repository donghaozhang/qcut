import type { FC } from "react";
import { ExternalLink } from "lucide-react";
import ImageAssetsTab from "@/components/editor/nano-edit/tabs/ImageAssetsTab";

/** Prompt library view with links to external prompt galleries and the image assets tab. */
const NanoEditView: FC = () => {
	return (
		<div className="p-4 h-full flex flex-col">
			{/* Header */}
			<div className="mb-6">
				<div className="flex items-center gap-3 mb-2">
					<h2 className="text-sm font-medium">Nano Edit</h2>
					<div className="flex items-center gap-2">
						<a
							href="https://opennana.com/awesome-prompt-gallery"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors"
						>
							Prompt Gallery
							<ExternalLink className="h-3 w-3" />
						</a>
						<a
							href="https://prompthero.com/"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors"
						>
							PromptHero
							<ExternalLink className="h-3 w-3" />
						</a>
						<a
							href="https://youmind.com/seedance-2-0-prompts"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-md transition-colors"
						>
							Seedance Prompts
							<ExternalLink className="h-3 w-3" />
						</a>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">
					AI-powered image and video enhancement
				</p>
			</div>

			{/* Single content area (tabs removed) */}
			<div className="flex-1 overflow-y-auto">
				<ImageAssetsTab />
			</div>
		</div>
	);
};

export default NanoEditView;
