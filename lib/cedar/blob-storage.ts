import {
  BlobPreconditionFailedError,
  del,
  get,
  list,
  put,
} from "@vercel/blob";

export interface StoredJson<T> {
  value: T;
  etag: string;
  pathname: string;
  uploadedAt: string;
}

export interface StoredObjectMetadata {
  pathname: string;
  etag: string;
  uploadedAt: string;
}

export interface JsonObjectStore {
  read<T>(pathname: string): Promise<StoredJson<T> | null>;
  create<T>(pathname: string, value: T): Promise<StoredJson<T>>;
  write<T>(pathname: string, value: T, etag: string): Promise<StoredJson<T>>;
  list(prefix: string): Promise<StoredObjectMetadata[]>;
  delete(pathnames: string[]): Promise<void>;
}

export class StorageConflictError extends Error {
  constructor(message = "The stored document changed before this write completed.") {
    super(message);
    this.name = "StorageConflictError";
  }
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof Error &&
      (error.name === "BlobPreconditionFailedError" || /already exists|precondition/i.test(error.message)))
  );
}

async function parseJsonStream<T>(stream: ReadableStream<Uint8Array>): Promise<T> {
  return JSON.parse(await new Response(stream).text()) as T;
}

function strongEtag(etag: string): string {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

export const blobObjectStore: JsonObjectStore = {
  async read<T>(pathname: string) {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200) throw new Error(`Unexpected 304 while reading ${pathname}`);
    return {
      value: await parseJsonStream<T>(result.stream),
      etag: strongEtag(result.blob.etag),
      pathname: result.blob.pathname,
      uploadedAt: result.blob.uploadedAt.toISOString(),
    };
  },
  async create<T>(pathname: string, value: T) {
    try {
      const result = await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      return { value, etag: result.etag, pathname: result.pathname, uploadedAt: new Date().toISOString() };
    } catch (error) {
      if (isConflict(error)) throw new StorageConflictError();
      throw error;
    }
  },
  async write<T>(pathname: string, value: T, etag: string) {
    try {
      const result = await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: strongEtag(etag),
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      return { value, etag: result.etag, pathname: result.pathname, uploadedAt: new Date().toISOString() };
    } catch (error) {
      if (isConflict(error)) throw new StorageConflictError();
      throw error;
    }
  },
  async list(prefix: string) {
    const objects: StoredObjectMetadata[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      objects.push(
        ...page.blobs.map((blob) => ({
          pathname: blob.pathname,
          etag: strongEtag(blob.etag),
          uploadedAt: blob.uploadedAt.toISOString(),
        })),
      );
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return objects;
  },
  async delete(pathnames: string[]) {
    if (pathnames.length === 0) return;
    for (let index = 0; index < pathnames.length; index += 1000) {
      await del(pathnames.slice(index, index + 1000));
    }
  },
};
