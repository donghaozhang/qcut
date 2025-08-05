import { StorageAdapter } from "./types";

export class LocalStorageAdapter<T> implements StorageAdapter<T> {
  private prefix: string;

  constructor(dbName: string, storeName: string) {
    this.prefix = `${dbName}_${storeName}_`;
    console.log(
      "[DEBUG] LocalStorageAdapter: Initialized with prefix:",
      this.prefix
    );
  }

  async get(key: string): Promise<T | null> {
    try {
      const fullKey = this.prefix + key;
      const data = localStorage.getItem(fullKey);
      console.log(
        "[DEBUG] LocalStorageAdapter: Getting key:",
        fullKey,
        "found:",
        !!data
      );
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(
        "[DEBUG] LocalStorageAdapter: Error getting key:",
        key,
        error
      );
      return null;
    }
  }

  async set(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      localStorage.setItem(fullKey, JSON.stringify(value));
      console.log("[DEBUG] LocalStorageAdapter: Set key:", fullKey);
    } catch (error) {
      console.error(
        "[DEBUG] LocalStorageAdapter: Error setting key:",
        key,
        error
      );
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      localStorage.removeItem(fullKey);
      console.log("[DEBUG] LocalStorageAdapter: Removed key:", fullKey);
    } catch (error) {
      console.error(
        "[DEBUG] LocalStorageAdapter: Error removing key:",
        key,
        error
      );
      throw error;
    }
  }

  async list(): Promise<string[]> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keys.push(key.substring(this.prefix.length));
        }
      }
      console.log("[DEBUG] LocalStorageAdapter: Listed keys:", keys);
      return keys;
    } catch (error) {
      console.error("[DEBUG] LocalStorageAdapter: Error listing keys:", error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
      console.log(
        "[DEBUG] LocalStorageAdapter: Cleared",
        keysToRemove.length,
        "keys"
      );
    } catch (error) {
      console.error("[DEBUG] LocalStorageAdapter: Error clearing:", error);
      throw error;
    }
  }
}
