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
  import {
    getManualOrders,
    onManualOrdersChanged,
    saveManualOrder,
    type ManualOrders,
  } from '@/lib/settings/manual-order';
  import { createSearchIndex } from '@/lib/search/fuzzy';
  import { getPageListIds, onPageListIdsChanged } from '@/lib/settings/pages';

  import { useAppearance } from '@/components/settings/appearance.svelte';
  import type { SectionId } from '@/components/settings/SettingsPanel.svelte';

  import SettingsDialog from './SettingsDialog.svelte';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
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
  let shortcutsOpen = $state(false);
  /** Where the marker of the chosen page sits in the tab bar. It slides when the page changes. */
  let indicator = $state.raw<{ left: number; width: number } | null>(null);

  const appearance = useAppearance();
  const privacy = $derived(appearance.current.privacyMode);
  const showIcons = $derived(appearance.current.showListIcons);

  /** A tile being dragged to a new place in the manual order of its list. */
  interface TileDrag {
    listId: string;
    id: string;
    /** Order of the list while dragging. Saved on drop. */
    ids: string[];
    moved: boolean;
    dropped: boolean;
  }

  let manualOrders = $state.raw<ManualOrders>({});
  let drag = $state.raw<TileDrag | null>(null);
  const manual = $derived(appearance.current.tileOrder === 'manual');

  let session: Session | null = null;
  let remoteAbort: AbortController | null = null;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;

  const pages = $derived(
    buildPages(
      data.lists,
      pageIds,
      data.bookmarks,
      appearance.current.tileOrder,
      // What is being dragged shows where it would land.
      drag ? { ...manualOrders, [drag.listId]: drag.ids } : manualOrders,
    ),
  );
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

  /** The button next to the search field. Without a search yet, typing then asks the server. */
  function toggleScope() {
    if (scope === 'server') {
      searchLocal();
    } else {
      scope = 'server';
      if (term && (remote?.term !== term || remote.problem)) void searchServer();
    }
    searchInput?.focus();
  }

  /** Puts the marker behind the chosen tab. With `reveal`, a tab scrolled out of the bar comes back. */
  function placeIndicator(reveal: boolean) {
    const bar = tablist;
    const tab = bar?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!bar || !tab) {
      indicator = null;
      return;
    }
    const { offsetLeft: left, offsetWidth: width } = tab;
    indicator = { left, width };
    if (!reveal) return;
    const edge = 4;
    if (left - edge < bar.scrollLeft) bar.scrollLeft = left - edge;
    else if (left + width + edge > bar.scrollLeft + bar.clientWidth)
      bar.scrollLeft = left + width + edge - bar.clientWidth;
  }

  // Runs after the tab bar was drawn, so the marker is in place before the next paint.
  $effect(() => {
    void [active?.listId, pages, showIcons];
    const bar = tablist;
    if (!bar) return;
    placeIndicator(true);
    const observer = new ResizeObserver(() => placeIndicator(false));
    observer.observe(bar);
    return () => observer.disconnect();
  });

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
    void getManualOrders().then((orders) => (manualOrders = orders));
    const restart = () => void start();
    const unsubscribe = [
      onManualOrdersChanged((orders) => (manualOrders = orders)),
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

  const tileIdAt = (target: EventTarget | null): string | null =>
    (target instanceof Element && target.closest<HTMLElement>('[data-tile]')?.dataset.id) || null;

  /** Dragging a tile starts a move when the order is manual. Otherwise it stays a plain link drag. */
  function onTileDragStart(event: DragEvent, listId: string, tiles: TileData[]) {
    const id = tileIdAt(event.target);
    if (!manual || id === null) return;
    drag = { listId, id, ids: tiles.map((tile) => tile.id), moved: false, dropped: false };
  }

  /** The dragged tile takes the place of the tile under the pointer, within its own list. */
  function onTileDragOver(event: DragEvent, listId: string) {
    const current = drag;
    if (!current || current.listId !== listId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const over = tileIdAt(event.target);
    const target = over === null ? -1 : current.ids.indexOf(over);
    if (over === current.id || target === -1) return;
    const ids = current.ids.filter((id) => id !== current.id);
    ids.splice(target, 0, current.id);
    drag = { ...current, ids, moved: true };
  }

  /** Prevented, so the browser does not open the dropped link. */
  function onTileDrop(event: DragEvent, listId: string) {
    if (!drag || drag.listId !== listId) return;
    event.preventDefault();
    drag = { ...drag, dropped: true };
  }

  /** Saves the new order. A drag that ended anywhere else, or with Escape, changes nothing. */
  function onTileDragEnd() {
    const ended = drag;
    drag = null;
    if (!ended?.dropped || !ended.moved) return;
    manualOrders = { ...manualOrders, [ended.listId]: ended.ids };
    void saveManualOrder(ended.listId, ended.ids);
  }

  /** How long Escape has to be held to switch the privacy mode. */
  const ESCAPE_HOLD_MS = 1000;
  let escapeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Holding Escape switches the privacy mode. A short press keeps its usual meaning. */
  function holdEscape(event: KeyboardEvent) {
    // While the key is held the browser repeats the event. Only the first one counts.
    if (event.key !== 'Escape' || event.repeat) return;
    clearTimeout(escapeTimer);
    escapeTimer = setTimeout(() => appearance.update({ privacyMode: !privacy }), ESCAPE_HOLD_MS);
  }

  /** Letting go early, or leaving the page, calls it off. */
  function releaseEscape(event?: KeyboardEvent) {
    if (!event || event.key === 'Escape') clearTimeout(escapeTimer);
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
    // In a dialog Escape closes the dialog and nothing else.
    if (event.isComposing || settingsOpen || shortcutsOpen) return;
    holdEscape(event);
    // Outside of a text field `?` lists the shortcuts. In the search field it is a character.
    if (event.key === '?' && view === 'dial' && !isTyping(event.target)) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      shortcutsOpen = true;
      return;
    }
    if (privacy || view !== 'dial' || isTyping(event.target)) return;
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

<svelte:window onkeydown={onKeydown} onkeyup={releaseEscape} onblur={() => releaseEscape()} />

<!-- `listId` is the list whose tiles can be rearranged by dragging, or null for search results. -->
{#snippet grid(tiles: TileData[], listId: string | null)}
  {#if listId === null}
    <div class="grid">
      {#each tiles as tile (tile.id)}
        <Tile {tile} {loader} />
      {/each}
    </div>
  {:else}
    <div
      class="grid"
      role="group"
      ondragstart={(event) => onTileDragStart(event, listId, tiles)}
      ondragover={(event) => onTileDragOver(event, listId)}
      ondrop={(event) => onTileDrop(event, listId)}
      ondragend={onTileDragEnd}
    >
      {#each tiles as tile (tile.id)}
        <Tile {tile} {loader} dragging={drag?.listId === listId && drag.id === tile.id} />
      {/each}
    </div>
  {/if}
{/snippet}

<!-- One list with its tiles. Every panel is as wide as the page, so all tiles have one size. -->
{#snippet panel(listId: string, name: string, icon: string | null | undefined, tiles: TileData[])}
  <section class="panel" aria-labelledby="group-{listId}">
    <div class="panel-head">
      <h2 id="group-{listId}">
        {#if icon && showIcons}<span aria-hidden="true">{icon}</span>{/if}
        {name}
      </h2>
      <span class="count">{tiles.length}</span>
    </div>
    {#if tiles.length > 0}
      {@render grid(tiles, listId)}
    {:else}
      <p class="hollow">This list has no link bookmarks yet.</p>
    {/if}
  </section>
{/snippet}

{#snippet message(title: string, text: string, retry: boolean, section: SectionId)}
  <div class="message">
    <h1>{title}</h1>
    <p>{text}</p>
    <div class="actions">
      {#if retry}
        <button class="pill" type="button" onclick={() => void refresh()} disabled={refreshing}>
          Try again
        </button>
      {/if}
      <button class="pill" type="button" onclick={() => openOptions(section)}>Open options</button>
    </div>
  </div>
{/snippet}

{#snippet brand()}
  <div class="brand">
    <!-- The same shapes as the add-on icon, see scripts/render-logo.ts. -->
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect class="mark" width="32" height="32" rx="9" />
      <rect x="7.5" y="7" width="5.4" height="18" rx="2.7" />
      <path d="M15.2 15V7a9.8 8 0 0 1 9.8 8z" />
      <rect x="15.2" y="17.2" width="7.8" height="7.8" rx="2.2" />
    </svg>
    KaraDial
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
{:else if view === 'dial' && privacy}
  <div class="message">
    <h1>KaraDial</h1>
    <p>Privacy mode is on and your bookmarks are hidden. Hold Esc for a second to show them.</p>
    <div class="actions">
      <button class="pill" type="button" onclick={() => appearance.update({ privacyMode: false })}>
        Show bookmarks
      </button>
      <button class="pill" type="button" onclick={() => openOptions()}>Open options</button>
    </div>
  </div>
{:else if view === 'dial'}
  <header class="top">
    {@render brand()}
    <div class="search" role="search">
      <label>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
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
      </label>
      <button
        class="scope"
        type="button"
        aria-pressed={scope === 'server'}
        title="Search all of Karakeep instead of your pages"
        onclick={toggleScope}
      >
        All of Karakeep
      </button>
    </div>
    <div class="tools">
      {#if permitted}
        <button
          class="round"
          class:spinning={refreshing}
          type="button"
          aria-label={refreshing ? 'Refreshing' : 'Refresh'}
          title="Refresh"
          onclick={() => void refresh()}
          disabled={refreshing}
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 6.3" />
            <path d="M20 4v7h-7" />
          </svg>
        </button>
      {/if}
      <button
        class="round"
        type="button"
        aria-label="Options"
        title="Options"
        onclick={() => openOptions()}
      >
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      </button>
    </div>
  </header>

  <div class="tabrow">
    <div
      class="tabs"
      role="tablist"
      aria-label="Pages"
      tabindex="-1"
      bind:this={tablist}
      onkeydown={onTabKeydown}
    >
      {#if indicator}
        <span
          class="indicator"
          aria-hidden="true"
          style:width="{indicator.width}px"
          style:transform="translateX({indicator.left}px)"
        ></span>
      {/if}
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
          {#if page.icon && showIcons}<span aria-hidden="true">{page.icon}</span>{/if}
          {page.name}
        </button>
      {/each}
    </div>
  </div>

  {#if hasData && !permitted}
    <p class="banner" role="status">
      KaraDial has no access to {host}. Showing the bookmarks saved on {savedAt}.
      <button class="pill" type="button" onclick={() => openOptions('connection')}>
        Open options
      </button>
    </p>
  {:else if hasData && problem}
    <p class="banner" role="status">
      {problemText(problem)} Showing the bookmarks saved on {savedAt}.
      <button class="pill" type="button" onclick={() => void refresh()} disabled={refreshing}>
        Try again
      </button>
    </p>
  {/if}

  <main bind:this={main} class:centered={appearance.current.centerVertically}>
    {#if term}
      <section class="results panel" aria-labelledby="results-heading">
        <div class="panel-head">
          {#if scope === 'local'}
            <h2 id="results-heading">
              {localHits.length}
              {localHits.length === 1 ? 'match' : 'matches'} on your pages
            </h2>
            <span class="hint">Enter searches all of Karakeep</span>
          {:else}
            <h2 id="results-heading">All of Karakeep</h2>
            {#if remote && remote.tiles.length > 0}
              <span class="count">{remote.tiles.length}{remote.nextCursor !== null ? '+' : ''}</span
              >
            {/if}
          {/if}
        </div>

        {#if scope === 'local'}
          {#if localHits.length > 0}
            {@render grid(localHits, null)}
            {#if localHits.length === LOCAL_LIMIT}
              <p class="note" role="status">Showing the first {LOCAL_LIMIT} matches.</p>
            {/if}
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
            <button class="pill" type="button" onclick={() => void searchServer()}>
              Try again
            </button>
          </p>
        {:else if remote.tiles.length === 0}
          <p class="empty" role="status">Karakeep found no link bookmarks for this search.</p>
        {:else}
          {@render grid(remote.tiles, null)}
          {#if remote.problem}
            <p class="note" role="alert">
              {searchProblemText(remote.problem)}
              <button class="pill" type="button" onclick={() => void searchServer(true)}>
                Try again
              </button>
            </p>
          {:else if remote.nextCursor !== null}
            <p class="note">
              <button
                class="pill"
                type="button"
                onclick={() => void searchServer(true)}
                disabled={remote.busy}
              >
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
        {#if active.tiles.length > 0 || active.groups.length === 0}
          {@render panel(active.listId, active.name, active.icon, active.tiles)}
        {/if}
        {#each active.groups as group (group.listId)}
          {@render panel(group.listId, group.name, group.icon, group.tiles)}
        {/each}
      {/if}
    </div>
  </main>

  {#if hasData}
    <footer>Updated {savedAt}</footer>
  {/if}
{/if}

{#if view === 'dial'}
  <button
    class="round help"
    type="button"
    aria-label="Keyboard shortcuts"
    title="Keyboard shortcuts (?)"
    onclick={() => (shortcutsOpen = true)}
  >
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
    </svg>
  </button>
{/if}

<SettingsDialog bind:open={settingsOpen} bind:section={settingsSection} />
<ShortcutsDialog bind:open={shortcutsOpen} />

<style>
  /* The page is at least as tall as the window, so the tiles can be centred in what is left. */
  :global(#app) {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .top,
  .tabrow,
  .banner,
  main,
  footer {
    width: 100%;
    max-width: 110rem;
    margin: 0 auto;
    padding-right: clamp(1rem, 4vw, 3.5rem);
    padding-left: clamp(1rem, 4vw, 3.5rem);
  }

  /* Search in the middle of the window, whatever stands left and right of it. */
  .top {
    display: grid;
    grid-template-columns: 1fr minmax(0, 40rem) 1fr;
    align-items: center;
    gap: 1.5rem;
    padding-top: 1.5rem;
    padding-bottom: 1rem;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 0.5rem;
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .brand svg {
    width: 1.625rem;
    height: 1.625rem;
    fill: var(--color-on-accent);
  }

  .brand .mark {
    fill: var(--color-accent);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    height: 3.5rem;
    padding: 0 0.5rem 0 1.5rem;
    background: var(--color-surface);
    border-radius: 999px;
    box-shadow:
      0 0 0 1px var(--color-border),
      0 0.5rem 1.5rem -1rem var(--color-shadow);
  }

  /* The label around icon and field: a click anywhere in it lands in the field. */
  .search label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    height: 100%;
    cursor: text;
  }

  .search:hover {
    box-shadow:
      0 0 0 1px var(--color-border-strong),
      0 0.5rem 1.5rem -1rem var(--color-shadow);
  }

  .search:focus-within {
    box-shadow:
      0 0 0 2px var(--color-accent),
      0 0.5rem 1.5rem -1rem var(--color-shadow);
  }

  .icon {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .search .icon {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--color-text-muted);
  }

  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    background: none;
    color: inherit;
    border: none;
    outline: none;
    font: inherit;
    font-size: 1.0625rem;
    letter-spacing: inherit;
  }

  .search input::placeholder {
    color: var(--color-text-muted);
    opacity: 1;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: default;
  }

  .scope,
  .pill {
    flex: none;
    height: 2.5rem;
    padding: 0 1rem;
    background: var(--color-surface);
    color: var(--color-text-muted);
    border: none;
    border-radius: 999px;
    box-shadow: 0 0 0 1px var(--color-border);
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: inherit;
    white-space: nowrap;
  }

  /* Inside the search field, so it is recessed instead of outlined. */
  .scope {
    background: var(--color-well);
    box-shadow: none;
  }

  .scope:hover {
    background: var(--color-border-strong);
    color: var(--color-text);
  }

  .pill:hover:not(:disabled) {
    color: var(--color-text);
    box-shadow: 0 0 0 1px var(--color-border-strong);
  }

  .scope:active,
  .pill:active:not(:disabled) {
    transform: scale(0.97);
  }

  .scope[aria-pressed='true'] {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }

  .pill {
    height: 2.25rem;
    color: var(--color-text);
  }

  .pill:disabled {
    opacity: 0.6;
  }

  .tools {
    display: flex;
    justify-self: end;
    gap: 0.5rem;
  }

  .round {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    background: var(--color-surface);
    color: var(--color-text-muted);
    border: none;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--color-border);
  }

  .round:hover:not(:disabled) {
    color: var(--color-text);
    box-shadow: 0 0 0 1px var(--color-border-strong);
  }

  .round:active:not(:disabled) {
    transform: scale(0.94);
  }

  /* Stays in the corner of the window while the page scrolls. */
  .help {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    width: 2.5rem;
    height: 2.5rem;
    box-shadow:
      0 0 0 1px var(--color-border),
      0 0.5rem 1.25rem -0.75rem var(--color-shadow);
  }

  .tabrow {
    display: flex;
    justify-content: center;
    padding-bottom: 1.5rem;
  }

  .tabs {
    position: relative;
    display: flex;
    gap: 2px;
    max-width: 100%;
    padding: 4px;
    overflow-x: auto;
    background: var(--color-well);
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--color-border);
    scrollbar-width: none;
  }

  /* The marker of the chosen page. It lies under the tabs and slides from one to the next. */
  .indicator {
    position: absolute;
    top: 4px;
    left: 0;
    height: 2.5rem;
    background: var(--color-surface);
    border-radius: 999px;
    box-shadow:
      0 0 0 1px var(--color-border),
      0 2px 6px -2px var(--color-shadow);
    pointer-events: none;
  }

  [role='tab'] {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.5rem;
    height: 2.5rem;
    padding: 0 1rem;
    background: none;
    color: var(--color-text-muted);
    border: none;
    border-radius: 999px;
    font-size: 0.9375rem;
    font-weight: 500;
    letter-spacing: inherit;
  }

  [role='tab']:hover,
  [role='tab'][aria-selected='true'] {
    color: var(--color-text);
  }

  [role='tab']:focus-visible {
    outline-offset: -2px;
  }

  .banner {
    margin-top: -0.5rem;
    margin-bottom: 1rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    text-align: center;
  }

  .banner .pill,
  .empty .pill {
    height: 1.75rem;
    margin-left: 0.5rem;
    padding: 0 0.75rem;
    font-size: inherit;
  }

  main {
    flex: 1;
    padding-bottom: 3rem;
  }

  main.centered {
    display: flex;
    flex-direction: column;
    justify-content: safe center;
  }

  /* A custom layout narrows the tiles only. Search, tabs and buttons stay where they are. */
  #page-panel,
  .results {
    width: 100%;
    max-width: var(--dial-width, none);
    margin-right: auto;
    margin-left: auto;
  }

  /* Lists stand below each other, each in a panel of the full width. */
  #page-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }

  #page-panel[hidden] {
    display: none;
  }

  .panel {
    min-width: 0;
    padding: 1.5rem;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 1px var(--color-border);
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-width: 1.625rem;
    height: 1.5rem;
    padding: 0 0.5rem;
    background: var(--color-well);
    color: var(--color-text-muted);
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .hint {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--tile-min-width, 11rem), 100%), 1fr));
    gap: var(--tile-gap, 1.5rem 1rem);
  }

  .note {
    margin: 1.5rem 0 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    text-align: center;
  }

  .hollow {
    margin: 0;
    color: var(--color-text-muted);
  }

  .empty {
    margin: 3rem 0;
    color: var(--color-text-muted);
    text-align: center;
  }

  footer {
    padding-bottom: 1.5rem;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
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

  /* Narrow windows: name and buttons in one row, the search below them, tabs from the left. */
  @media (max-width: 45rem) {
    .top {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'brand tools'
        'search search';
      gap: 0.75rem;
      padding-top: 0.75rem;
      padding-bottom: 0.75rem;
    }

    .brand {
      grid-area: brand;
    }

    .tools {
      grid-area: tools;
    }

    .search {
      grid-area: search;
      height: 3.25rem;
      padding-left: 1rem;
    }

    .hint {
      display: none;
    }

    .tabrow {
      justify-content: flex-start;
      padding-bottom: 1rem;
    }

    #page-panel {
      gap: 0.75rem;
    }

    .panel {
      padding: 1rem;
      border-radius: var(--radius-md);
    }

    .grid {
      gap: var(--tile-gap, 1rem 0.75rem);
    }
  }

  /* Small windows ignore a custom layout: they need all of their width. */
  @media (max-width: 30rem) {
    #page-panel,
    .results {
      max-width: none;
    }

    .grid {
      --tile-min-width: 8.5rem;
    }

    /* Enter still searches all of Karakeep. */
    .scope {
      display: none;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .search,
    .round {
      transition:
        box-shadow 150ms ease,
        color 150ms ease,
        transform 100ms ease;
    }

    .scope,
    .pill {
      transition:
        background-color 150ms ease,
        box-shadow 150ms ease,
        color 150ms ease,
        transform 100ms ease;
    }

    [role='tab'] {
      transition: color 150ms ease;
    }

    .indicator {
      transition:
        transform 280ms cubic-bezier(0.3, 0.7, 0.2, 1),
        width 280ms cubic-bezier(0.3, 0.7, 0.2, 1);
    }

    .spinning .icon {
      animation: spin 900ms linear infinite;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
