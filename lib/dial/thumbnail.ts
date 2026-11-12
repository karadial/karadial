const MAX_WIDTH = 640;
/** Full page screenshots are very tall. Keep the top part only. */
const MAX_HEIGHT = 800;

/**
 * Scales an image down to tile size and re-encodes it as WebP, so the image
 * cache stays small and tiles decode fast.
 *
 * Returns the original blob when it is already small. Rejects when the
 * browser cannot decode the image; callers then keep the original.
 */
export async function shrinkImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.min(Math.round(bitmap.height * scale), MAX_HEIGHT);
    if (scale === 1 && height === bitmap.height) return blob;

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return blob;
    // Source rectangle: full width, as much height from the top as fits.
    context.drawImage(bitmap, 0, 0, bitmap.width, height / scale, 0, 0, width, height);
    const small = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    return small.size < blob.size ? small : blob;
  } finally {
    bitmap.close();
  }
}
