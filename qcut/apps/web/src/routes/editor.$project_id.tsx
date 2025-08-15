import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/editor/$project_id")({
  // This file only contains critical route configuration
  // The component is defined in editor.$project_id.lazy.tsx
});
