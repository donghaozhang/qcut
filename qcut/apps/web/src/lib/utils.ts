// Generic utilities

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a UUID v4 string
 * Uses crypto.randomUUID() if available, otherwise falls back to a custom implementation
 */
export function generateUUID(): string {
  // Use the native crypto.randomUUID if available
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Secure fallback using crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version 4 (UUIDv4)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant 10xxxxxx
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));

  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

export function isDOMElement(el: any): el is HTMLElement {
  return !!el && (el instanceof Element || el instanceof HTMLElement);
}

export function isTypableElement(el: HTMLElement): boolean {
  // If content editable, then it is editable
  if (el.isContentEditable) return true;

  // If element is an input and the input is enabled, then it is typable
  if (el.tagName === "INPUT") {
    return !(el as HTMLInputElement).disabled;
  }
  // If element is a textarea and the input is enabled, then it is typable
  if (el.tagName === "TEXTAREA") {
    return !(el as HTMLTextAreaElement).disabled;
  }

  return false;
}
export function isAppleDevice() {
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
}

export function getPlatformSpecialKey() {
  return isAppleDevice() ? "⌘" : "Ctrl";
}

export function getPlatformAlternateKey() {
  return isAppleDevice() ? "⌥" : "Alt";
}

/**
 * Generates a consistent ID for a file based on its properties
 * This ensures the same file always gets the same ID
 */
export async function generateFileBasedId(file: File): Promise<string> {
  // Ensure Web Crypto is available
  if (
    typeof crypto === "undefined" ||
    !crypto.subtle ||
    typeof crypto.subtle.digest !== "function"
  ) {
    // Deterministic ID is not possible without SubtleCrypto; let caller decide fallback
    throw new Error("Web Crypto API not available for hashing file-based ID");
  }

  // Create a unique string from normalized file properties
  const name = file.name.trim().toLowerCase();
  const type = file.type.trim().toLowerCase();
  const uniqueString = `${name}-${file.size}-${file.lastModified}-${type}`;

  // Use Web Crypto API to hash the string
  const encoder = new TextEncoder();
  const data = encoder.encode(uniqueString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert hash to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Format as UUID-like string (take first 32 chars and format)
  return [
    hashHex.slice(0, 8),
    hashHex.slice(8, 12),
    hashHex.slice(12, 16),
    hashHex.slice(16, 20),
    hashHex.slice(20, 32),
  ].join("-");
}
