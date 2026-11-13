<script module lang="ts">
  // One observer for all tiles: images load when a tile comes near the viewport.
  const callbacks = new WeakMap<Element, () => void>();
  let observer: IntersectionObserver | undefined;

  function whenVisible(element: Element, callback: () => void): () => void {
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          callbacks.get(entry.target)?.();
          callbacks.delete(entry.target);
        }
      },
      { rootMargin: '400px' },
    );
    callbacks.set(element, callback);
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      callbacks.delete(element);
    };
  }

  function hueOf(text: string): number {
    let hash = 0;
    for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) % 360;
    return hash;
  }
</script>

<script lang="ts">
  import type { ImageLoader } from '@/lib/dial/images';
  import type { Tile } from '@/lib/dial/model';

  let {
    tile,
    loader,
    dragging = false,
  }: { tile: Tile; loader: ImageLoader | null; dragging?: boolean } = $props();

  let element = $state<HTMLAnchorElement>();
  let src = $state<string | null>(null);
  /** The browser could not decode the image. */
  let failed = $state(false);

  // Derived, so a refresh that delivers the same bookmark again does not reload the image.
  const assetId = $derived(tile.imageAssetId);
  const letter = $derived([...tile.host][0]?.toUpperCase() ?? '?');

  $effect(() => {
    const id = assetId;
    const current = loader;
    const known = current && id !== null ? current.peek(id) : null;
    src = known;
    failed = false;
    if (!current || id === null || known !== null || !element) return;

    let cancelled = false;
    const stop = whenVisible(element, () => {
      void current.load(id).then((url) => {
        if (!cancelled) src = url;
      });
    });
    return () => {
      cancelled = true;
      stop();
    };
  });
</script>

<!-- tile.url is http(s) only, see toTile(). Bookmark text is rendered as text, never as HTML. -->
<a
  bind:this={element}
  class="tile"
  class:dragging
  data-tile
  data-id={tile.id}
  href={tile.url}
  rel="noopener noreferrer"
  referrerpolicy="no-referrer"
  title={tile.title}
>
  <span class="thumb" style:--hue={hueOf(tile.host)}>
    {#if src && !failed}
      <img {src} alt="" draggable="false" onerror={() => (failed = true)} />
    {:else}
      <span class="letter" aria-hidden="true">{letter}</span>
    {/if}
  </span>
  <span class="title">{tile.title}</span>
  <span class="host">{tile.host}</span>
</a>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 0.4rem;
    border-radius: 0.75rem;
    color: inherit;
    text-decoration: none;
  }

  .tile:hover {
    background: var(--color-surface);
  }

  /* The tile being moved in the manual order. */
  .tile.dragging {
    opacity: 0.35;
  }

  .tile:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .thumb {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    background: hsl(var(--hue) 35% 42%);
  }

  .tile:hover .thumb {
    border-color: var(--color-border-strong);
  }

  /*
   * Out of the flow, so the image always has the size of the frame. As a grid
   * item a tall image kept its own height and `object-fit` did nothing.
   */
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    background: var(--color-surface);
  }

  /* The image fit chosen in the options, see applyAppearance(). */
  :global(:root[data-tile-image='cover']) img,
  :global(:root[data-tile-image='contain']) img {
    object-position: center;
  }

  :global(:root[data-tile-image='contain']) img {
    object-fit: contain;
  }

  :global(:root[data-tile-image='stretch']) img {
    object-fit: fill;
  }

  .letter {
    color: #fff;
    font-size: 2.5rem;
    font-weight: 600;
    line-height: 1;
  }

  .title,
  .host {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    margin-top: 0.45rem;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .host {
    color: var(--color-text-muted);
    font-size: 0.78rem;
  }

  /* Hidden texts stay in the tooltip of the tile. */
  :global(:root[data-tile-title='off']) .title,
  :global(:root[data-tile-address='off']) .host {
    display: none;
  }

  :global(:root[data-tile-title='off']) .host {
    margin-top: 0.45rem;
  }

  @media (prefers-reduced-motion: no-preference) {
    .tile {
      transition: background-color 120ms ease;
    }

    img {
      animation: appear 160ms ease;
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
</style>
