const DB_NAME = 'takecopter-local-db';
const STORE_NAME = 'kv';
const SQLITE_KEY = 'sqlite-binary';

interface DbBinaryStorage {
  load: () => Promise<Uint8Array | null>;
  save: (bytes: Uint8Array) => Promise<void>;
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      reject(request.error ?? new Error('无法打开 IndexedDB'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function loadFromIndexedDb(): Promise<Uint8Array | null> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(SQLITE_KEY);

    request.onerror = () => {
      reject(request.error ?? new Error('读取 IndexedDB 失败'));
    };

    request.onsuccess = () => {
      const value = request.result;
      if (!value) {
        resolve(null);
        return;
      }

      if (value instanceof ArrayBuffer) {
        resolve(new Uint8Array(value));
        return;
      }

      if (ArrayBuffer.isView(value)) {
        resolve(new Uint8Array(value.buffer));
        return;
      }

      resolve(null);
    };
  });
}

async function saveToIndexedDb(bytes: Uint8Array): Promise<void> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(bytes.buffer.slice(0), SQLITE_KEY);

    request.onerror = () => {
      reject(request.error ?? new Error('写入 IndexedDB 失败'));
    };

    transaction.oncomplete = () => {
      resolve();
    };
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function loadFromLocalStorage(fallbackKey: string): Uint8Array | null {
  const raw = window.localStorage.getItem(fallbackKey);
  if (!raw) {
    return null;
  }

  try {
    return fromBase64(raw);
  } catch {
    return null;
  }
}

function saveToLocalStorage(fallbackKey: string, bytes: Uint8Array): void {
  window.localStorage.setItem(fallbackKey, toBase64(bytes));
}

export function createDbBinaryStorage(fallbackKey: string): DbBinaryStorage {
  const hasIndexedDb = typeof indexedDB !== 'undefined';

  if (!hasIndexedDb) {
    return {
      load: async () => loadFromLocalStorage(fallbackKey),
      save: async (bytes) => {
        saveToLocalStorage(fallbackKey, bytes);
      },
    };
  }

  return {
    load: async () => {
      try {
        const bytes = await loadFromIndexedDb();
        if (bytes) {
          return bytes;
        }

        return loadFromLocalStorage(fallbackKey);
      } catch {
        return loadFromLocalStorage(fallbackKey);
      }
    },
    save: async (bytes) => {
      try {
        await saveToIndexedDb(bytes);
      } catch {
        saveToLocalStorage(fallbackKey, bytes);
      }
    },
  };
}
