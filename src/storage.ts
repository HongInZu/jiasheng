import { createStore, del, entries, set } from 'idb-keyval';
import type { MemorySession } from './types';

let store: ReturnType<typeof createStore> | undefined;
const getStore = () => store ??= createStore('jiasheng-memories-v1', 'sessions');
const key = (id: string) => {
  if (!id?.trim()) throw new Error('回憶缺少識別編號，無法儲存。');
  return `session:${id}`;
};

/** IndexedDB structured clone keeps original Blob data; failures must reach the caller. */
export async function saveSession(session: MemorySession): Promise<void> {
  const { audio, photo, ...metadata } = session;
  // Vue may pass reactive proxies. JSON-normalize text metadata, keeping media as
  // original Blobs instead of attempting to structured-clone a nested proxy.
  const plain: MemorySession = JSON.parse(JSON.stringify(metadata));
  plain.updatedAt = new Date().toISOString();
  if (audio) plain.audio = audio;
  if (photo) plain.photo = photo;
  await set(key(session.id), plain, getStore());
}

export async function listSessions(): Promise<MemorySession[]> {
  const records = await entries<IDBValidKey, MemorySession>(getStore());
  return records
    .filter(([entryKey]) => typeof entryKey === 'string' && entryKey.startsWith('session:'))
    .map(([, value]) => value)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
}

export async function deleteSession(id: string): Promise<void> {
  await del(key(id), getStore());
}
