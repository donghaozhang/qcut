export const PanelView = {
  PROPERTIES: "properties",
  EXPORT: "export",
} as const;

export type PanelViewType = (typeof PanelView)[keyof typeof PanelView];
