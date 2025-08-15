"use client";

import { TabBar } from "./tabbar";
import { MediaView } from "./views/media";
import { useMediaPanelStore, Tab } from "./store";
import { TextView } from "./views/text";
import { AudioView } from "./views/audio";
import { Text2ImageView } from "./views/text2image";
import { AdjustmentPanel } from "@/components/editor/adjustment";
import { AiView } from "./views/ai";
import { StickersView } from "./views/stickers";
import { CaptionsView } from "./views/captions";
import React from "react";

export function MediaPanel() {
  const { activeTab } = useMediaPanelStore();

  const viewMap: Record<Tab, React.ReactNode> = {
    media: <MediaView />,
    audio: <AudioView />,
    text: <TextView />,
    stickers: <StickersView />,
    effects: (
      <div className="p-4 text-muted-foreground">
        Effects view coming soon...
      </div>
    ),
    transitions: (
      <div className="p-4 text-muted-foreground">
        Transitions view coming soon...
      </div>
    ),
    captions: <CaptionsView />,
    filters: (
      <div className="p-4 text-muted-foreground">
        Filters view coming soon...
      </div>
    ),
    adjustment: <AdjustmentPanel />,
    text2image: <Text2ImageView />,
    ai: <AiView />,
  };

  return (
    <div className="h-full flex flex-col bg-panel rounded-sm">
      <TabBar />
      <div className="flex-1 overflow-y-auto">{viewMap[activeTab]}</div>
    </div>
  );
}
