import { describe, expect, it, vi } from 'vitest';

import { createMemoryCache } from '@/lib/cache/memory';

import { createImageLoader, type ImageLoaderOptions } from './images';

const png = (name = 'x') => new Blob([name], { type: 'image/png' });

function setup(overrides: Partial<ImageLoaderOptions> = {}) {
  const cache = createMemoryCache();
  const revoked: string[] = [];
  let counter = 0;
  const fetchAsset = vi.fn(async (assetId: string) => png(assetId));
  const loader = createImageLoader({
    cache,
    fetchAsset,
    createObjectURL: () => `blob:${++counter}`,
    revokeObjectURL: (url) => revoked.push(url),
    ...overrides,
  });
  return { cache, loader, fetchAsset, revoked };
}

describe('createImageLoader', () => {
  it('serves a cached image without contacting the server', async () => {
    const { cache, loader, fetchAsset } = setup();
    await cache.putImage('a', png());
    expect(await loader.load('a')).toBe('blob:1');
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('downloads a missing image once and caches it', async () => {
    const { cache, loader, fetchAsset } = setup();
    const [first, second] = await Promise.all([loader.load('a'), loader.load('a')]);
    expect(first).toBe('blob:1');
    expect(second).toBe('blob:1');
    expect(loader.peek('a')).toBe('blob:1');
    expect(loader.peek('b')).toBeNull();
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(await cache.getImage('a')).not.toBeNull();
  });

  it('caches the shrunk image', async () => {
    const small = png('small');
    const { cache, loader } = setup({ shrink: async () => small });
    await loader.load('a');
    expect(await cache.getImage('a')).toBe(small);
  });

  it('keeps the original when shrinking fails', async () => {
    const { cache, loader } = setup({
      shrink: async () => {
        throw new Error('decode failed');
      },
    });
    expect(await loader.load('a')).toBe('blob:1');
    expect(await (await cache.getImage('a'))!.text()).toBe('a');
  });

  it('returns null without a download function when the image is not cached', async () => {
    const { loader } = setup({ fetchAsset: null });
    expect(await loader.load('a')).toBeNull();
  });

  it('returns null when the download fails', async () => {
    const { loader } = setup({
      fetchAsset: async () => {
        throw new Error('offline');
      },
    });
    expect(await loader.load('a')).toBeNull();
  });

  it('rejects assets that are not images', async () => {
    const { cache, loader } = setup({
      fetchAsset: async () => new Blob(['<script>'], { type: 'text/html' }),
    });
    expect(await loader.load('a')).toBeNull();
    expect(await cache.getImage('a')).toBeNull();
  });

  it('shows the image even when the cache cannot store it', async () => {
    const { cache, loader } = setup();
    cache.putImage = async () => {
      throw new Error('quota');
    };
    expect(await loader.load('a')).toBe('blob:1');
  });

  it('limits parallel downloads', async () => {
    let running = 0;
    let peak = 0;
    const { loader } = setup({
      concurrency: 2,
      fetchAsset: async (assetId) => {
        peak = Math.max(peak, ++running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return png(assetId);
      },
    });
    const urls = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => loader.load(id)));
    expect(urls.every((url) => url !== null)).toBe(true);
    expect(peak).toBe(2);
  });

  it('releases object URLs and stops downloads on dispose', async () => {
    const { loader, revoked, fetchAsset } = setup({ concurrency: 1 });
    await loader.load('a');
    const pending = [loader.load('b'), loader.load('c')];
    loader.dispose();
    expect(await Promise.all(pending)).toEqual([null, null]);
    expect(revoked).toEqual(['blob:1']);
    expect(fetchAsset.mock.calls.map(([id]) => id)).not.toContain('c');
  });
});
