<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';

  import { openCache, type Cache } from '@/lib/cache/db';
  import { createMemoryCache } from '@/lib/cache/memory';
  import { createImageLoader, type ImageLoader } from '@/lib/dial/images';
  import { buildPages, imageAssetIds } from '@/lib/dial/model';
  import { loadFromCache, needsRefresh, refreshFromServer, type DialData } from '@/lib/dial/sync';
  import { shrinkImage } from '@/lib/dial/thumbnail';
  import { createKarakeepClient, type KarakeepClient } from '@/lib/karakeep/client';
  import { KarakeepError, type KarakeepErrorKind } from '@/lib/karakeep/errors';
  import { hasHostPermission, onHostPermissionChanged } from '@/lib/permissions/host';
  import { getConnection, onConnectionChanged } from '@/lib/settings/connection';
  import { getPageListIds, onPageListIdsChanged } from '@/lib/settings/pages';

  import Tile from './Tile.svelte';

  /** Everything that belongs to one loaded configuration. Replaced as a whole when settings change. */
  interface Session {
    controller: AbortController;
    pageIds: string[];
    cache?: Cache;
    /** Only set when the host permission is granted. */
    client?: KarakeepClient;
    loader?: ImageLoader;
  }

  type View = 'loading' | 'unconfigured' | 'no-pages' | 'dial';
  type Problem = KarakeepErrorKind | 'unknown';

  const EMPTY: DialData = { lists: [], bookmarks: new Map(), fetchedAt: null };

  let view = $state<View>('loading');
  let data = $state.raw<DialData>(EMPTY);
  let pageIds = $state.raw<string[]>([]);
  let loader = $state.raw<ImageLoader | null>(null);
  let host = $state('');
  let permitted = $state(true);
  let refreshing = $state(false);
  let problem = $state<Problem | null>(null);
  let activeId = $state<string | null>(null);
  let tablist = $state<HTMLElement>();

  let session: Session | null = null;

  const pages = $derived(buildPages(data.lists, pageIds, data.bookmarks));
  const active = $derived(pages.find((page) => page.listId === activeId) ?? pages[0] ?? null);
  const hasData = $derived(data.fetchedAt !== null);
  const savedAt = $derived(
    data.fetchedAt === null
      ? ''
      : new Date(data.fetchedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
  );

  function release(old: Session | null) {
    if (!old) return;
    old.controller.abort();
    old.loader?.dispose();
    old.cache?.close();
  }

  /** Loads settings and cache, shows them, then refreshes from the server if needed. */
  async function start() {
    const previous = session;
    previous?.controller.abort();
    const current: Session = { controller: new AbortController(), pageIds: [] };
    session = current;
    // A newer start() took over while this one was waiting.
    const superseded = () => {
      if (session === current) return false;
      release(current);
      release(previous);
      return true;
    };

    const [connection, ids] = await Promise.all([getConnection(), getPageListIds()]);
    if (superseded()) return;
    if (!connection || ids.length === 0) {
      release(previous);
      loader = null;
      data = EMPTY;
      refreshing = false;
      problem = null;
      view = connection ? 'no-pages' : 'unconfigured';
      return;
    }
    current.pageIds = ids;

    // Without IndexedDB the dial still works, it just starts from the server every time.
    const [cache, granted] = await Promise.all([
      openCache(connection.baseUrl).catch(() => createMemoryCache()),
      hasHostPermission(connection.baseUrl).catch(() => false),
    ]);
    current.cache = cache;
    if (superseded()) return;

    const cached = await loadFromCache(cache, ids).catch(() => EMPTY);
    if (superseded()) return;

    const client = granted ? createKarakeepClient(connection) : undefined;
    current.client = client;
    current.loader = createImageLoader({
      cache,
      fetchAsset: client ? (assetId, signal) => client.getAsset(assetId, { signal }) : null,
      shrink: shrinkImage,
    });

    host = new URL(connection.baseUrl).host;
    permitted = granted;
    pageIds = ids;
    data = cached;
    loader = current.loader;
    refreshing = false;
    problem = null;
    view = 'dial';
    release(previous);

    if (needsRefresh(cached, ids)) await refresh();
  }

  async function refresh() {
    const current = session;
    if (!current?.client || !current.cache || refreshing) return;
    refreshing = true;
    try {
      const fresh = await refreshFromServer(
        current.client,
        current.cache,
        current.pageIds,
        current.controller.signal,
      );
      if (session !== current) return;
      data = fresh;
      problem = null;
      void current.cache.pruneImages(imageAssetIds(pages)).catch(() => undefined);
    } catch (error) {
      if (session !== current) return;
      problem = error instanceof KarakeepError ? error.kind : 'unknown';
    } finally {
      if (session === current) refreshing = false;
    }
  }

  function refreshIfStale() {
    if (document.visibilityState !== 'visible' || view !== 'dial') return;
    if (needsRefresh(data, pageIds)) void refresh();
  }

  onMount(() => {
    void start();
    const restart = () => void start();
    const unsubscribe = [
      onConnectionChanged(restart),
      onPageListIdsChanged(restart),
      onHostPermissionChanged(restart),
    ];
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      unsubscribe.forEach((off) => off());
      document.removeEventListener('visibilitychange', refreshIfStale);
      release(session);
      session = null;
    };
  });

  function problemText(kind: Problem): string {
    switch (kind) {
      case 'network':
      case 'timeout':
        return `Karakeep at ${host} is not reachable.`;
      case 'unauthorized':
        return 'Karakeep rejected the API key. Check it in the options.';
      case 'forbidden':
        return 'The API key may not read lists and bookmarks. Check it in the options.';
      default:
        return `Karakeep at ${host} gave an unexpected answer. Check the address in the options.`;
    }
  }

  const openOptions = () => void browser.runtime.openOptionsPage();

  function isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    );
  }

  /** Number keys 1 to 9 switch pages. */
  function onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const page = pages[Number(event.key) - 1];
    if (!page) return;
    event.preventDefault();
    activeId = page.listId;
  }

  /** Arrow keys inside the tab bar, as usual for tabs. */
  function onTabKeydown(event: KeyboardEvent) {
    const index = pages.findIndex((page) => page.listId === active?.listId);
    let target: number;
    if (event.key === 'ArrowRight') target = (index + 1) % pages.length;
    else if (event.key === 'ArrowLeft') target = (index - 1 + pages.length) % pages.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = pages.length - 1;
    else return;
    event.preventDefault();
    activeId = pages[target]!.listId;
    tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet grid(tiles: (typeof pages)[number]['tiles'])}
  <div class="grid">
    {#each tiles as tile (tile.id)}
      <Tile {tile} {loader} />
    {/each}
  </div>
{/snippet}

{#snippet message(title: string, text: string, retry: boolean)}
  <div class="message">
    <h1>{title}</h1>
    <p>{text}</p>
    <div class="actions">
      {#if retry}
        <button type="button" onclick={() => void refresh()} disabled={refreshing}>
          Try again
        </button>
      {/if}
      <button type="button" onclick={openOptions}>Open options</button>
    </div>
  </div>
{/snippet}

{#if view === 'unconfigured'}
  {@render message('KaraDial', 'Connect KaraDial to your Karakeep instance to get started.', false)}
{:else if view === 'no-pages'}
  {@render message(
    'KaraDial',
    'Choose the Karakeep lists you want to see here. Each list becomes one page.',
    false,
  )}
{:else if view === 'dial'}
  <header>
    <div
      class="tabs"
      role="tablist"
      aria-label="Pages"
      tabindex="-1"
      bind:this={tablist}
      onkeydown={onTabKeydown}
    >
      {#each pages as page, index (page.listId)}
        {@const selected = page.listId === active?.listId}
        <button
          type="button"
          role="tab"
          id="tab-{page.listId}"
          aria-selected={selected}
          aria-controls="page-panel"
          tabindex={selected ? 0 : -1}
          title={index < 9 ? `Press ${index + 1}` : undefined}
          onclick={() => (activeId = page.listId)}
        >
          {#if page.icon}<span aria-hidden="true">{page.icon}</span>{/if}
          {page.name}
        </button>
      {/each}
    </div>
    <div class="tools">
      {#if permitted}
        <button type="button" onclick={() => void refresh()} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      {/if}
      <button type="button" onclick={openOptions}>Options</button>
    </div>
  </header>

  {#if hasData && !permitted}
    <p class="banner" role="status">
      KaraDial has no access to {host}. Showing the bookmarks saved on {savedAt}.
      <button type="button" onclick={openOptions}>Open options</button>
    </p>
  {:else if hasData && problem}
    <p class="banner" role="status">
      {problemText(problem)} Showing the bookmarks saved on {savedAt}.
      <button type="button" onclick={() => void refresh()} disabled={refreshing}>Try again</button>
    </p>
  {/if}

  <main>
    <div id="page-panel" role="tabpanel" aria-labelledby={active ? `tab-${active.listId}` : null}>
      {#if !hasData}
        {#if !permitted}
          {@render message(
            'No access',
            `KaraDial has no access to ${host}. Grant access in the options.`,
            false,
          )}
        {:else if problem}
          {@render message('No bookmarks yet', problemText(problem), true)}
        {:else}
          <p class="empty" role="status">Loading your bookmarks...</p>
        {/if}
      {:else if !active}
        {@render message(
          'Nothing to show',
          'The selected lists no longer exist in Karakeep. Choose other lists in the options.',
          false,
        )}
      {:else}
        {#if active.tiles.length > 0}
          {@render grid(active.tiles)}
        {:else if active.groups.length === 0}
          <p class="empty">This list has no link bookmarks yet.</p>
        {/if}
        {#each active.groups as group (group.listId)}
          <section aria-labelledby="group-{group.listId}">
            <h2 id="group-{group.listId}">
              {#if group.icon}<span aria-hidden="true">{group.icon}</span>{/if}
              {group.name}
            </h2>
            {@render grid(group.tiles)}
          </section>
        {/each}
      {/if}
    </div>
  </main>
{/if}

<style>
  header,
  main,
  .banner {
    max-width: 110rem;
    margin: 0 auto;
    padding: 0 clamp(0.75rem, 3vw, 2.5rem);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    padding-top: 1rem;
    padding-bottom: 0.5rem;
  }

  .tabs,
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  button {
    padding: 0.4rem 0.8rem;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid transparent;
    border-radius: 999px;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--color-surface);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.6;
  }

  [role='tab'] {
    font-size: 1rem;
  }

  [role='tab'][aria-selected='true'] {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text);
    font-weight: 600;
  }

  .tools button {
    font-size: 0.8rem;
  }

  .banner {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .banner button,
  .message button {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }

  .banner button {
    margin-left: 0.5rem;
    padding: 0.15rem 0.6rem;
    font-size: inherit;
  }

  main {
    padding-top: 0.5rem;
    padding-bottom: 3rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--tile-min-width, 11rem), 100%), 1fr));
    gap: 0.5rem;
  }

  section {
    margin-top: 1.5rem;
  }

  h2 {
    margin: 0 0 0.4rem;
    padding: 0 0.4rem;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .empty {
    margin: 4rem 0;
    color: var(--color-text-muted);
    text-align: center;
  }

  .message {
    display: grid;
    place-content: center;
    justify-items: center;
    min-height: 70vh;
    padding: 2rem;
    text-align: center;
  }

  .message h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
  }

  .message p {
    max-width: 32rem;
    margin: 0.5rem 0 0;
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }

  @media (max-width: 30rem) {
    .grid {
      --tile-min-width: 8.5rem;
    }
  }
</style>
