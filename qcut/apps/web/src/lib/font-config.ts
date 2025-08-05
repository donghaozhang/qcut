// Font configuration for Vite (without Next.js font optimization)
// In a real app, you would load these via Google Fonts link in index.html
// or install them as npm packages and import the CSS

// Export font class mapping for use in components
// System fonts return empty string to fallback to fontFamily style
export const FONT_CLASS_MAP = {
  Inter: "font-inter",
  Roboto: "font-roboto",
  "Open Sans": "font-opensans",
  "Playfair Display": "font-playfair",
  "Comic Neue": "font-comic",
  Arial: "",
  Helvetica: "",
  "Times New Roman": "",
  Georgia: "",
} as const;

// Export CSS font families for direct use
export const fonts = {
  inter: {
    style: { fontFamily: "Inter, system-ui, -apple-system, sans-serif" },
  },
  roboto: {
    style: { fontFamily: "Roboto, system-ui, -apple-system, sans-serif" },
  },
  openSans: {
    style: { fontFamily: '"Open Sans", system-ui, -apple-system, sans-serif' },
  },
  playfairDisplay: {
    style: { fontFamily: '"Playfair Display", Georgia, serif' },
  },
  comicNeue: {
    style: { fontFamily: '"Comic Neue", "Comic Sans MS", cursive' },
  },
};

// Default font for the body
export const defaultFont = fonts.inter;
