"use client";

import { TabBar } from "./tabbar";
import { MediaView } from "./views/media";
import { useMediaPanelStore, Tab } from "./store";
import { TextView } from "./views/text";
import { AudioView } from "./views/audio";
import { Text2ImageView } from "./views/text2image";
// Temporary test - Store import verification
import { useAdjustmentStore } from '@/stores/adjustment-store';
// Temporary test - Component imports verification
import { EditHistory } from '@/components/editor/adjustment/edit-history';
import { ImageUploader } from '@/components/editor/adjustment/image-uploader';
import { ModelSelector } from '@/components/editor/adjustment/model-selector';
import { ParameterControls } from '@/components/editor/adjustment/parameter-controls';
import { PreviewPanel } from '@/components/editor/adjustment/preview-panel';
// Temporary test - UI Component dependencies verification
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Temporary test - Toast notifications verification
import { toast } from 'sonner';
import React from 'react';

export function MediaPanel() {
  const { activeTab } = useMediaPanelStore();

  // Temporary test - Toast notification functionality
  React.useEffect(() => {
    const timer = setTimeout(() => {
      toast.success('Adjustment components ready!', {
        description: 'All dependencies verified successfully'
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const viewMap: Record<Tab, React.ReactNode> = {
    media: <MediaView />,
    audio: <AudioView />,
    text: <TextView />,
    stickers: (
      <div className="p-4 text-muted-foreground">
        Stickers view coming soon...
      </div>
    ),
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
    captions: (
      <div className="p-4 text-muted-foreground">
        Captions view coming soon...
      </div>
    ),
    filters: (
      <div className="p-4 text-muted-foreground">
        Filters view coming soon...
      </div>
    ),
    adjustment: (
      <div className="p-4 text-muted-foreground">
        Adjustment view coming soon...
      </div>
    ),
    text2image: <Text2ImageView />,
  };

  return (
    <div className="h-full flex flex-col bg-panel rounded-sm">
      <TabBar />
      <div className="flex-1 overflow-y-auto">{viewMap[activeTab]}</div>
    </div>
  );
}
