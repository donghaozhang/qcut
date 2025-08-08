/**
 * Debug Logger for QCut Components
 * Simple logging utility for development and debugging
 */

// Global debug flag - set to false to disable verbose logging
const DEBUG_ENABLED = false;

export interface LogData {
  [key: string]: any;
}

export const debugLogger = {
  log: (component: string, event: string, data?: LogData) => {
    if (!DEBUG_ENABLED) return;
    
    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
    const message = `[${timestamp}] [${component}] ${event}`;

    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  },

  error: (
    component: string,
    event: string,
    error: Error | string,
    data?: LogData
  ) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    const message = `[${timestamp}] [${component}] ERROR: ${event}`;

    console.error(message, error, data || "");
  },

  warn: (component: string, event: string, data?: LogData) => {
    if (!DEBUG_ENABLED) return;
    
    const timestamp = new Date().toISOString().slice(11, 23);
    const message = `[${timestamp}] [${component}] WARNING: ${event}`;

    if (data) {
      console.warn(message, data);
    } else {
      console.warn(message);
    }
  },
};
