// Simplified environment configuration for Vite/Electron
// No server-side validation, only client-side variables

export const env = {
  NODE_ENV: import.meta.env.MODE || 'development',
  // Add client-side env vars as needed
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME || 'OpenCut',
}

export type Env = typeof env