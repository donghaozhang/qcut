import { StorageAdapter } from "./types";

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
  private dbName: string;
  private storeName: string;
  private version: number;

  constructor(dbName: string, storeName: string, version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
  }

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      console.log('[DEBUG] IndexedDB: Opening database:', this.dbName, 'version:', this.version);
      
      if (!indexedDB) {
        console.error('[DEBUG] IndexedDB: IndexedDB not available');
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('[DEBUG] IndexedDB: Error opening database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        console.log('[DEBUG] IndexedDB: Database opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        console.log('[DEBUG] IndexedDB: Database upgrade needed');
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          console.log('[DEBUG] IndexedDB: Creating object store:', this.storeName);
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
    });
  }

  async get(key: string): Promise<T | null> {
    const db = await this.getDB();
    const transaction = db.transaction([this.storeName], "readonly");
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async set(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.put({ id: key, ...value });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async list(): Promise<string[]> {
    try {
      console.log('[DEBUG] IndexedDB: Getting database for list operation');
      const db = await this.getDB();
      console.log('[DEBUG] IndexedDB: Database opened successfully');
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => {
          console.error('[DEBUG] IndexedDB: Error getting keys:', request.error);
          reject(request.error);
        };
        request.onsuccess = () => {
          console.log('[DEBUG] IndexedDB: Successfully got keys:', request.result);
          resolve(request.result as string[]);
        };
      });
    } catch (error) {
      console.error('[DEBUG] IndexedDB: Error in list():', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}
