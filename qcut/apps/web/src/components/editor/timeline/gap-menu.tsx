import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "../../ui/dropdown-menu";
import type { GapGenerateMode, TimelineGap } from "@/stores/timeline/gap-store";
import { useGapStore } from "@/stores/timeline/gap-store";
import { closeGapOnTimeline } from "./gap-actions";

interface GapMenuProps {
  gap: TimelineGap;
}

export function GapMenu({ gap }: GapMenuProps) {
  const clearGapSelection = useGapStore((s) => s.clearGapSelection);
  const setGapGenerateMode = useGapStore((s) => s.setGapGenerateMode);
  const gapDuration = gap.endTime - gap.startTime;

  const handleModeSelect = ({ mode }: { mode: GapGenerateMode }) => {
    setGapGenerateMode(mode);
  };

  const handleCloseGap = () => {
    closeGapOnTimeline({ gap });
    clearGapSelection();
  };

  return (
    <DropdownMenuContent
      align="center"
      className="z-[250] w-[200px]"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DropdownMenuLabel className="px-3 pt-1.5 pb-1.5 text-[10px] font-medium text-muted-foreground">
        {gapDuration.toFixed(1)}s gap selected
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="mx-0 mb-1" />
      <DropdownMenuItem
        className="px-3 py-1.5 text-xs"
        onSelect={() => handleModeSelect({ mode: "text-to-image" })}
      >
        Fill with Image
      </DropdownMenuItem>
      <DropdownMenuItem
        className="px-3 py-1.5 text-xs"
        onSelect={() => handleModeSelect({ mode: "text-to-video" })}
      >
        Fill with Video
      </DropdownMenuItem>
      <DropdownMenuSeparator className="mx-0 my-1" />
      <DropdownMenuItem
        className="justify-between px-3 py-1.5 text-xs text-muted-foreground"
        onSelect={handleCloseGap}
      >
        <span>Close gap</span>
        <DropdownMenuShortcut className="rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-mono leading-none text-muted-foreground">
          Del
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
