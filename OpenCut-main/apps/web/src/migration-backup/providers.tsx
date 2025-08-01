// Extracted providers from Next.js layout
// These will need to be integrated into the Vite app

import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { StorageProvider } from "../components/storage-provider";
import { defaultFont } from "../lib/font-config";
import { BotIdClient } from "botid/client";
import { env } from "@/env";

export const protectedRoutes = [
  {
    path: "/api/waitlist",
    method: "POST",
  },
];

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark">
      <TooltipProvider>
        <StorageProvider>{children}</StorageProvider>
        <Analytics />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

// Scripts to add:
// - BotIdClient in head
// - Databuddy analytics script