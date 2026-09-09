import { StorageConflictError, type JsonObjectStore, type StoredJson, type StoredObjectMetadata } from "../blob-storage";

interface Entry { value: unknown; etag: string; uploadedAt: string }

export class MemoryObjectStore implements JsonObjectStore {
  readonly entries = new Map<string, Entry>();
  beforeCreate?: (pathname: string) => Promise<void> | void;
  beforeWrite?: (pathname: string) => Promise<void> | void;
  private version = 0;

  async read<T>(pathname: string): Promise<StoredJson<T> | null> {
    const entry = this.entries.get(pathname);
    return entry ? { value: structuredClone(entry.value) as T, etag: entry.etag, pathname, uploadedAt: entry.uploadedAt } : null;
  }

  async create<T>(pathname: string, value: T): Promise<StoredJson<T>> {
    await this.beforeCreate?.(pathname);
    if (this.entries.has(pathname)) throw new StorageConflictError();
    return this.set(pathname, value);
  }

  async write<T>(pathname: string, value: T, etag: string): Promise<StoredJson<T>> {
    await this.beforeWrite?.(pathname);
    const current = this.entries.get(pathname);
    if (!current || current.etag !== etag) throw new StorageConflictError();
    return this.set(pathname, value);
  }

  async list(prefix: string): Promise<StoredObjectMetadata[]> {
    return [...this.entries.entries()]
      .filter(([pathname]) => pathname.startsWith(prefix))
      .map(([pathname, entry]) => ({ pathname, etag: entry.etag, uploadedAt: entry.uploadedAt }));
  }

  async delete(pathnames: string[]): Promise<void> {
    for (const pathname of pathnames) this.entries.delete(pathname);
  }

  private set<T>(pathname: string, value: T): StoredJson<T> {
    this.version += 1;
    const entry = { value: structuredClone(value), etag: `etag-${this.version}`, uploadedAt: new Date().toISOString() };
    this.entries.set(pathname, entry);
    return { value, etag: entry.etag, pathname, uploadedAt: entry.uploadedAt };
  }
}
