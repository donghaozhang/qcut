import { StorageAdapter } from "./types";

export class ElectronStorageAdapter<T> implements StorageAdapter<T> {
  private prefix: string;

  constructor(dbName: string, storeName: string) {
    this.prefix = `${dbName}_${storeName}_`;
  }

  async get(key: string): Promise<T | null> {
    try {
      const fullKey = this.prefix + key;
      return await (window as any).electronAPI.storage.load(fullKey);
    } catch (error) {
      console.error('ElectronStorageAdapter: Error getting key:', key, error);
      return null;
    }
  }

  async set(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      await (window as any).electronAPI.storage.save(fullKey, value);
    } catch (error) {
      console.error('ElectronStorageAdapter: Error setting key:', key, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      await (window as any).electronAPI.storage.remove(fullKey);
    } catch (error) {
      console.error('ElectronStorageAdapter: Error removing key:', key, error);
      throw error;
    }
  }

  async list(): Promise<string[]> {
    try {
      const allKeys = await (window as any).electronAPI.storage.list();
      return allKeys
        .filter((key: string) => key.startsWith(this.prefix))
        .map((key: string) => key.substring(this.prefix.length));
    } catch (error) {
      console.error('ElectronStorageAdapter: Error listing keys:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const allKeys = await (window as any).electronAPI.storage.list();
      const keysToRemove = allKeys.filter((key: string) => key.startsWith(this.prefix));
      await Promise.all(
        keysToRemove.map((key: string) => 
          (window as any).electronAPI.storage.remove(key)
        )
      );
    } catch (error) {
      console.error('ElectronStorageAdapter: Error clearing:', error);
      throw error;
    }
  }
}