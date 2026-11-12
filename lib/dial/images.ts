import type { Cache } from '@/lib/cache/db';

export interface ImageLoaderOptions {
  cache: Cache;
  /**
   * Downloads an asset from Karakeep. `null` when the server must not be
   * contacted (no host permission): only cached images are shown then.
   */
  fetchAsset: ((assetId: string, signal: AbortSignal) => Promise<Blob>) | null;
  /** Reduces a downloaded image to tile size before it is cached. */
  shrink?: (blob: Blob) => Promise<Blob>;
  /** Injectable for tests. */
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  concurrency?: number;
}

export interface ImageLoader {
  /**
   * Resolves to an object URL for the image, or `null` when there is none
   * (not cached and not downloadable, or not an image). Never rejects.
   */
  load(assetId: string): Promise<string | null>;
  /** The object URL of an image that `load` already resolved, without waiting. */
  peek(assetId: string): string | null;
  /** Cancels downloads and releases all object URLs. */
  dispose(): void;
}

const isImage = (blob: Blob) => blob.type.startsWith('image/');

/**
 * Serves tile images from the cache and downloads missing ones.
 *
 * Images are handed out as object URLs of local blobs, so no `<img>` ever
 * points at the Karakeep API or at a bookmarked site.
 */
export function createImageLoader(options: ImageLoaderOptions): ImageLoader {
  const { cache, fetchAsset, shrink } = options;
  const createObjectURL = options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
  const concurrency = options.concurrency ?? 4;

  const controller = new AbortController();
  const results = new Map<string, Promise<string | null>>();
  const urls = new Map<string, string>();
  const waiting: (() => void)[] = [];
  let active = 0;

  /** Runs at most `concurrency` downloads at a time. */
  async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  async function download(assetId: string): Promise<Blob | null> {
    if (!fetchAsset) return null;
    const blob = await limited(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return fetchAsset(assetId, controller.signal);
    });
    if (!isImage(blob)) return null;
    const small = shrink ? await shrink(blob).catch(() => blob) : blob;
    // A full or broken cache must not keep the image from being shown.
    await cache.putImage(assetId, small).catch(() => undefined);
    return small;
  }

  async function resolve(assetId: string): Promise<string | null> {
    try {
      const cached = await cache.getImage(assetId).catch(() => null);
      const blob = cached && isImage(cached) ? cached : await download(assetId);
      if (!blob || controller.signal.aborted) return null;
      const url = createObjectURL(blob);
      urls.set(assetId, url);
      return url;
    } catch {
      return null;
    }
  }

  return {
    load(assetId) {
      let result = results.get(assetId);
      if (!result) {
        result = resolve(assetId);
        results.set(assetId, result);
      }
      return result;
    },
    peek: (assetId) => urls.get(assetId) ?? null,
    dispose() {
      controller.abort();
      urls.forEach(revokeObjectURL);
      urls.clear();
      results.clear();
    },
  };
}
