import {
  closeGapInTracks,
  type TimelineGap,
} from "@/stores/timeline/gap-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

export function isSameGap({
  left,
  right,
}: {
  left: TimelineGap | null;
  right: TimelineGap | null;
}) {
  if (!left || !right) return false;

  return (
    left.trackId === right.trackId &&
    Math.abs(left.startTime - right.startTime) < 0.01 &&
    Math.abs(left.endTime - right.endTime) < 0.01
  );
}

export function closeGapOnTimeline({ gap }: { gap: TimelineGap }) {
  const store = useTimelineStore.getState();
  store.pushHistory();
  const newTracks = closeGapInTracks(store._tracks, gap);
  store.restoreTracks(newTracks);
}
