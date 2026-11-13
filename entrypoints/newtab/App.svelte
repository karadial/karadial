<script lang="ts">
  import { onMount } from 'svelte';

  import { openCache, type Cache } from '@/lib/cache/db';
  import { createMemoryCache } from '@/lib/cache/memory';
  import { createImageLoader, type ImageLoader } from '@/lib/dial/images';
  import {
    buildPages,
    imageAssetIds,
    appendTiles,
    uniqueTiles,
    type Tile as TileData,
  } from '@/lib/dial/model';
  import { neighbour, type Direction } from '@/lib/dial/navigation';
  import { loadFromCache, needsRefresh, refreshFromServer, type DialData } from '@/lib/dial/sync';
  import { shrinkImage } from '@/lib/dial/thumbnail';
  import { createKarakeepClient, type KarakeepClient } from '@/lib/karakeep/client';
  import { KarakeepError, type KarakeepErrorKind } from '@/lib/karakeep/errors';
  import { hasHostPermission, onHostPermissionChanged } from '@/lib/permissions/host';
  import { getConnection, onConnectionChanged } from '@/lib/settings/connection';
  import { createSearchIndex } from '@/lib/search/fuzzy';
  import { getPageListIds, onPageListIdsChanged } from '@/lib/settings/pages';

  import type { SectionId } from '@/components/settings/SettingsPanel.svelte';

  import SettingsDialog from './SettingsDialog.svelte';
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

  /** State of the server side search. */
  interface Remote {
    /** The search these results belong to, or are being loaded for. */
    term: string;
    tiles: TileData[];
    nextCursor: string | null;
    busy: boolean;
    problem: Problem | null;
  }

  /** Upper bound for local matches, so every keystroke renders fast. */
  const LOCAL_LIMIT = 120;
  /** Pause after the last keystroke before the server is asked. */
  const SERVER_DELAY_MS = 350;

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
  let main = $state<HTMLElement>();
  let searchInput = $state<HTMLInputElement>();
  let query = $state('');
  /** Typing filters the cached pages. Enter or the toggle asks the server. */
  let scope = $state<'local' | 'server'>('local');
  let remote = $state.raw<Remote | null>(null);
  let settingsOpen = $state(false);
  /** The section the options dialog shows. It reopens where it was left. */
  let settingsSection = $state<SectionId>('connection');

  let session: Session | null = null;
  let remoteAbort: AbortController | null = null;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;

  const pages = $derived(buildPages(data.lists, pageIds, data.bookmarks));
  const active = $derived(pages.find((page) => page.listId === activeId) ?? pages[0] ?? null);
  const hasData = $derived(data.fetchedAt !== null);
  const term = $derived(query.trim());
  const searchIndex = $derived(createSearchIndex(uniqueTiles(pages), (tile) => tile));
  const localHits = $derived(term ? searchIndex.search(term, LOCAL_LIMIT) : []);
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
      resetRemote();
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
    // Results of the previous configuration mean nothing now.
    resetRemote();

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

  function resetRemote() {
    clearTimeout(remoteTimer);
    remoteAbort?.abort();
    remoteAbort = null;
    remote = null;
    scope = 'local';
  }

  /**
   * Asks Karakeep for the current search. With `more`, loads the next page of
   * the results already shown.
   */
  async function searchServer(more = false) {
    const current = session;
    const wanted = term;
    if (!current || !wanted) return;
    const base = more && remote?.term === wanted && !remote.busy ? remote : null;
    if (more && base?.nextCursor == null) return;

    clearTimeout(remoteTimer);
    remoteAbort?.abort();
    const abort = new AbortController();
    remoteAbort = abort;
    // What is on screen stays there until the answer arrives.
    remote = {
      term: wanted,
      tiles: remote?.tiles ?? [],
      nextCursor: null,
      busy: true,
      problem: null,
    };
    const known = base?.tiles ?? [];
    try {
      // Without the host permission the request cannot leave the browser.
      if (!current.client) throw new KarakeepError('network');
      const page = await current.client.searchBookmarks(wanted, {
        cursor: base?.nextCursor,
        signal: AbortSignal.any([abort.signal, current.controller.signal]),
      });
      if (abort.signal.aborted || session !== current) return;
      remote = {
        term: wanted,
        tiles: appendTiles(known, page.bookmarks),
        nextCursor: page.nextCursor,
        busy: false,
        problem: null,
      };
    } catch (error) {
      if (abort.signal.aborted || session !== current) return;
      remote = {
        term: wanted,
        tiles: known,
        nextCursor: base?.nextCursor ?? null,
        busy: false,
        problem: error instanceof KarakeepError ? error.kind : 'unknown',
      };
    }
  }

  function setQuery(value: string) {
    query = value;
    clearTimeout(remoteTimer);
    if (!value.trim()) resetRemote();
    else if (scope === 'server')
      remoteTimer = setTimeout(() => void searchServer(), SERVER_DELAY_MS);
  }

  function searchLocal() {
    clearTimeout(remoteTimer);
    scope = 'local';
  }

  function searchEverything() {
    if (!term) return;
    scope = 'server';
    // Coming back from the local results, the answer may already be there.
    if (remote?.term !== term || remote.problem) void searchServer();
  }

  function showPage(listId: string) {
    activeId = listId;
    if (query) setQuery('');
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
      resetRemote();
      release(session);
      session = null;
    };
  });

  function problemText(kind: Problem): string {
    switch (kind) {
      case 'network':
      case 'timeout':
      case 'unavailable':
        return `Karakeep at ${host} is not reachable.`;
      case 'unauthorized':
        return 'Karakeep rejected the API key. Check it in the options.';
      case 'forbidden':
        return 'The API key may not read lists and bookmarks. Check it in the options.';
      default:
        return `Karakeep at ${host} gave an unexpected answer. Check the address in the options.`;
    }
  }

  function searchProblemText(kind: Problem): string {
    switch (kind) {
      case 'network':
      case 'timeout':
      case 'unavailable':
      case 'unauthorized':
      case 'forbidden':
        return problemText(kind);
      default:
        return 'Karakeep could not run this search.';
    }
  }

  /** Opens the options in front of the page, so changes show behind them at once. */
  function openOptions(section?: SectionId) {
    if (section) settingsSection = section;
    settingsOpen = true;
  }

  function isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    );
  }

  const DIRECTIONS: Record<string, Direction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Home: 'first',
    End: 'last',
  };

  /** The tiles on screen, in reading order. */
  function visibleTiles(): HTMLElement[] {
    const tiles = main?.querySelectorAll<HTMLElement>('[data-tile]') ?? [];
    return [...tiles].filter((tile) => tile.offsetParent !== null);
  }

  function focusFirstTile(): boolean {
    const first = visibleTiles()[0];
    first?.focus();
    return first !== undefined;
  }

  /**
   * Arrow keys, Home and End move the focus across tiles. Enter and
   * Ctrl/Cmd+Enter then open the focused link, which the browser does itself.
   * Returns whether the key was used.
   */
  function moveAcrossTiles(event: KeyboardEvent): boolean {
    const direction = DIRECTIONS[event.key];
    if (!direction || event.shiftKey || !(event.target instanceof Element)) return false;
    const tile = event.target.closest<HTMLElement>('[data-tile]');
    // From anywhere else, for example the tab bar, down enters the tiles.
    if (!tile) return direction === 'down' && focusFirstTile();

    const tiles = visibleTiles();
    const boxes = tiles.map((element) => element.getBoundingClientRect());
    const target = neighbour(boxes, tiles.indexOf(tile), direction);
    if (target !== null) tiles[target]?.focus();
    // Above the first row sits the search field.
    else if (direction === 'up') searchInput?.focus();
    return true;
  }

  /** Ctrl+Left and Ctrl+Right switch pages. */
  function switchPage(event: KeyboardEvent): boolean {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || pages.length === 0) return false;
    // Inside the tab bar onTabKeydown does it and moves the focus along.
    if (event.target instanceof Node && tablist?.contains(event.target)) return false;
    const index = pages.findIndex((page) => page.listId === active?.listId);
    showPage(pages[(index + step + pages.length) % pages.length]!.listId);
    return true;
  }

  /**
   * Keys pressed outside of a text field: `/` focuses the search, 1 to 9 and
   * Ctrl+Left/Right switch pages, arrow keys move across tiles, any other
   * character starts a search.
   */
  function onKeydown(event: KeyboardEvent) {
    if (event.isComposing || settingsOpen || view !== 'dial' || isTyping(event.target)) return;
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (switchPage(event)) event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (moveAcrossTiles(event)) {
      event.preventDefault();
    } else if (event.key === '/') {
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (/^[1-9]$/.test(event.key)) {
      const page = pages[Number(event.key) - 1];
      if (!page) return;
      event.preventDefault();
      showPage(page.listId);
    } else if (event.key.length === 1 && event.key !== ' ') {
      // Not prevented: the focus moves first, so the character lands in the field.
      searchInput?.focus();
    }
  }

  function onSearchKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      searchEverything();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (query) setQuery('');
      else searchInput?.blur();
    } else if (event.key === 'ArrowDown' && !event.shiftKey) {
      if (focusFirstTile()) event.preventDefault();
    }
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
    if (event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    showPage(pages[target]!.listId);
    tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet grid(tiles: TileData[])}
  <div class="grid">
    {#each tiles as tile (tile.id)}
      <Tile {tile} {loader} />
    {/each}
  </div>
{/snippet}

{#snippet message(title: string, text: string, retry: boolean, section: SectionId)}
  <div class="message">
    <h1>{title}</h1>
    <p>{text}</p>
    <div class="actions">
      {#if retry}
        <button type="button" onclick={() => void refresh()} disabled={refreshing}>
          Try again
        </button>
      {/if}
      <button type="button" onclick={() => openOptions(section)}>Open options</button>
    </div>
  </div>
{/snippet}

{#if view === 'unconfigured'}
  {@render message(
    'KaraDial',
    'Connect KaraDial to your Karakeep instance to get started.',
    false,
    'connection',
  )}
{:else if view === 'no-pages'}
  {@render message(
    'KaraDial',
    'Choose the Karakeep lists you want to see here. Each list becomes one page.',
    false,
    'pages',
  )}
{:else if view === 'dial'}
  <header>
    <div class="top">
      <div class="search" role="search">
        <input
          bind:this={searchInput}
          type="search"
          aria-label="Search bookmarks"
          placeholder="Search bookmarks"
          title="Press / to search, Enter to search all of Karakeep"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          value={query}
          oninput={(event) => setQuery(event.currentTarget.value)}
          onkeydown={onSearchKeydown}
        />
      </div>
      <div class="tools">
        {#if permitted}
          <button type="button" onclick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        {/if}
        <button type="button" onclick={() => openOptions()}>Options</button>
      </div>
    </div>
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
          onclick={() => showPage(page.listId)}
        >
          {#if page.icon}<span aria-hidden="true">{page.icon}</span>{/if}
          {page.name}
        </button>
      {/each}
    </div>
  </header>

  {#if hasData && !permitted}
    <p class="banner" role="status">
      KaraDial has no access to {host}. Showing the bookmarks saved on {savedAt}.
      <button type="button" onclick={() => openOptions('connection')}>Open options</button>
    </p>
  {:else if hasData && problem}
    <p class="banner" role="status">
      {problemText(problem)} Showing the bookmarks saved on {savedAt}.
      <button type="button" onclick={() => void refresh()} disabled={refreshing}>Try again</button>
    </p>
  {/if}

  <main bind:this={main}>
    {#if term}
      <section class="results" aria-labelledby="results-heading">
        <div class="results-head">
          <h2 id="results-heading">Search results</h2>
          <div class="scope" role="group" aria-label="Search in">
            <button type="button" aria-pressed={scope === 'local'} onclick={searchLocal}>
              My pages
            </button>
            <button type="button" aria-pressed={scope === 'server'} onclick={searchEverything}>
              All of Karakeep
            </button>
          </div>
        </div>

        {#if scope === 'local'}
          {#if localHits.length > 0}
            {@render grid(localHits)}
            <p class="note" role="status">
              {#if localHits.length === LOCAL_LIMIT}Showing the first {LOCAL_LIMIT} matches.{/if}
              Press Enter to search all of Karakeep.
            </p>
          {:else}
            <p class="empty" role="status">
              Nothing on your pages matches. Press Enter to search all of Karakeep.
            </p>
          {/if}
        {:else if !permitted}
          <p class="empty" role="status">
            KaraDial has no access to {host}. Grant access in the options.
          </p>
        {:else if !remote || (remote.busy && remote.tiles.length === 0)}
          <p class="empty" role="status">Searching Karakeep...</p>
        {:else if remote.problem && remote.tiles.length === 0}
          <p class="empty" role="alert">
            {searchProblemText(remote.problem)}
            <button type="button" onclick={() => void searchServer()}>Try again</button>
          </p>
        {:else if remote.tiles.length === 0}
          <p class="empty" role="status">Karakeep found no link bookmarks for this search.</p>
        {:else}
          {@render grid(remote.tiles)}
          {#if remote.problem}
            <p class="note" role="alert">
              {searchProblemText(remote.problem)}
              <button type="button" onclick={() => void searchServer(true)}>Try again</button>
            </p>
          {:else if remote.nextCursor !== null}
            <p class="note">
              <button type="button" onclick={() => void searchServer(true)} disabled={remote.busy}>
                {remote.busy ? 'Loading...' : 'Show more'}
              </button>
            </p>
          {/if}
        {/if}
      </section>
    {/if}
    <div
      id="page-panel"
      role="tabpanel"
      aria-labelledby={active ? `tab-${active.listId}` : null}
      hidden={term !== ''}
    >
      {#if !hasData}
        {#if !permitted}
          {@render message(
            'No access',
            `KaraDial has no access to ${host}. Grant access in the options.`,
            false,
            'connection',
          )}
        {:else if problem}
          {@render message('No bookmarks yet', problemText(problem), true, 'connection')}
        {:else}
          <p class="empty" role="status">Loading your bookmarks...</p>
        {/if}
      {:else if !active}
        {@render message(
          'Nothing to show',
          'The selected lists no longer exist in Karakeep. Choose other lists in the options.',
          false,
          'pages',
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

<SettingsDialog bind:open={settingsOpen} bind:section={settingsSection} />

<style>
  header,
  main,
  .banner {
    /* A custom layout sets the width of the whole page content. */
    max-width: var(--dial-width, 110rem);
    margin: 0 auto;
    padding: 0 clamp(0.75rem, 3vw, 2.5rem);
  }

  header {
    padding-top: 1rem;
    padding-bottom: 0.5rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.5rem;
    margin-bottom: 0.75rem;
  }

  .search {
    flex: 1 1 14rem;
    max-width: 36rem;
  }

  .search input {
    width: 100%;
    padding: 0.55rem 1rem;
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    font: inherit;
  }

  .search input::placeholder {
    color: var(--color-text-muted);
    opacity: 1;
  }

  .search input:hover {
    border-color: var(--color-border-strong);
  }

  .search input:focus-visible {
    border-color: var(--color-accent);
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .tabs,
  .tools,
  .scope {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tools {
    margin-left: auto;
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

  [role='tab'][aria-selected='true'],
  .scope [aria-pressed='true'] {
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
  .message button,
  .note button,
  .empty button {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }

  .banner button,
  .empty button {
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
    gap: var(--tile-gap, 0.5rem);
  }

  section {
    margin-top: 1.5rem;
  }

  .results {
    margin-top: 0;
  }

  .results-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    margin-bottom: 0.4rem;
  }

  .results-head h2 {
    margin: 0;
  }

  .scope button {
    font-size: 0.8rem;
  }

  .note {
    margin: 1.25rem 0 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    text-align: center;
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

  /* Small windows ignore a custom layout: they need all of their width. */
  @media (max-width: 30rem) {
    header,
    main,
    .banner {
      max-width: none;
    }

    .grid {
      --tile-min-width: 8.5rem;
    }
  }
</style>
