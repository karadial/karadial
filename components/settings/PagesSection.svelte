<script lang="ts">
  import { onMount } from 'svelte';

  import { createKarakeepClient } from '@/lib/karakeep/client';
  import { KarakeepError, type KarakeepErrorKind } from '@/lib/karakeep/errors';
  import { buildListTree, flattenListTree } from '@/lib/karakeep/lists';
  import type { KarakeepList } from '@/lib/karakeep/types';
  import { hasHostPermission, onHostPermissionChanged } from '@/lib/permissions/host';
  import { getConnection, onConnectionChanged, type Connection } from '@/lib/settings/connection';
  import { getPageListIds, onPageListIdsChanged, savePageListIds } from '@/lib/settings/pages';

  type LoadState =
    | { status: 'loading' }
    | { status: 'ok'; lists: KarakeepList[] }
    | { status: 'failed'; kind: KarakeepErrorKind };

  /** Null until the saved connection is known to be usable. */
  let connection = $state.raw<Connection | null>(null);
  let blocked = $state<'loading' | 'unconfigured' | 'no-access' | null>('loading');
  let load = $state<LoadState>({ status: 'loading' });
  let selected = $state<string[]>([]);

  const entries = $derived(load.status === 'ok' ? flattenListTree(buildListTree(load.lists)) : []);
  const byId = $derived(new Map(entries.map((entry) => [entry.list.id, entry.list])));

  async function loadLists() {
    const current = connection;
    if (!current) return;
    load = { status: 'loading' };
    try {
      const lists = await createKarakeepClient(current).listLists();
      if (connection === current) load = { status: 'ok', lists };
    } catch (error) {
      if (!(error instanceof KarakeepError)) throw error;
      if (connection === current) load = { status: 'failed', kind: error.kind };
    }
  }

  let checks = 0;

  /** Reads the saved connection and whether the browser lets KaraDial reach it. */
  async function check() {
    const run = ++checks;
    const stored = await getConnection();
    const granted = stored ? await hasHostPermission(stored.baseUrl).catch(() => false) : false;
    if (run !== checks) return;
    blocked = !stored ? 'unconfigured' : granted ? null : 'no-access';
    const usable = stored && granted ? stored : null;
    const same = usable?.baseUrl === connection?.baseUrl && usable?.apiKey === connection?.apiKey;
    if (same) return;
    connection = usable;
    void loadLists();
  }

  onMount(() => {
    void getPageListIds().then((ids) => (selected = ids));
    void check();
    const unsubscribe = [
      onConnectionChanged(() => void check()),
      onHostPermissionChanged(() => void check()),
      onPageListIdsChanged((ids) => (selected = ids)),
    ];
    return () => unsubscribe.forEach((off) => off());
  });

  function update(ids: string[]) {
    selected = ids;
    void savePageListIds(ids);
  }

  function toggle(id: string, checked: boolean) {
    update(checked ? [...selected, id] : selected.filter((other) => other !== id));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const ids = [...selected];
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    update(ids);
  }

  /** Index of the row being dragged. */
  let dragIndex = $state<number | null>(null);
  /** The order to return to when a drag is cancelled. */
  let orderBeforeDrag: string[] = [];

  function onDragStart(event: DragEvent, index: number) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    // Firefox starts a drag only when it carries data.
    event.dataTransfer.setData('text/plain', '');
    orderBeforeDrag = selected;
    dragIndex = index;
  }

  /** The dragged row takes the place of the row under the pointer. Nothing is saved yet. */
  function onDragOver(event: DragEvent, index: number) {
    if (dragIndex === null) return;
    event.preventDefault();
    if (index === dragIndex) return;
    const ids = [...selected];
    ids.splice(index, 0, ...ids.splice(dragIndex, 1));
    selected = ids;
    dragIndex = index;
  }

  function onDragEnd(event: DragEvent) {
    if (dragIndex === null) return;
    dragIndex = null;
    // Escape or a drop outside the list cancels.
    if (event.dataTransfer?.dropEffect === 'none') selected = orderBeforeDrag;
    else if (selected.join('\n') !== orderBeforeDrag.join('\n')) update(selected);
  }

  const label = (list: KarakeepList) => (list.icon ? `${list.icon} ${list.name}` : list.name);
</script>

<section aria-labelledby="pages-heading">
  <h2 id="pages-heading">Pages</h2>
  <p class="hint intro">
    Each selected list becomes one page on your new tab. Lists inside a selected list are shown as
    groups on its page. Changes are saved right away.
  </p>

  {#if blocked === 'unconfigured'}
    <p class="notice">Connect KaraDial to your Karakeep instance first, under Connection.</p>
  {:else if blocked === 'no-access'}
    <p class="notice warning" role="status">
      KaraDial has no access to your Karakeep instance. Grant access under Connection.
    </p>
  {:else if blocked === null}
    {#if selected.length > 0}
      <h3 id="order-heading">Page order</h3>
      <p class="hint">Drag a page to move it, or use the arrows.</p>
      <!-- The list takes the drop, so letting go between two rows counts too. -->
      <ol
        class="order"
        aria-labelledby="order-heading"
        ondragover={(event) => {
          if (dragIndex !== null) event.preventDefault();
        }}
        ondrop={(event) => event.preventDefault()}
      >
        {#each selected as id, index (id)}
          {@const list = byId.get(id)}
          <li
            draggable="true"
            class:dragging={dragIndex === index}
            ondragstart={(event) => onDragStart(event, index)}
            ondragover={(event) => onDragOver(event, index)}
            ondragend={onDragEnd}
          >
            <span class="grip" aria-hidden="true">⠿</span>
            <span class="name" class:missing={!list && load.status === 'ok'}>
              {#if list}
                {label(list)}
              {:else if load.status === 'ok'}
                List no longer exists
              {:else}
                ...
              {/if}
            </span>
            <button
              type="button"
              aria-label="Move up"
              title="Move up"
              disabled={index === 0}
              onclick={() => move(index, -1)}>↑</button
            >
            <button
              type="button"
              aria-label="Move down"
              title="Move down"
              disabled={index === selected.length - 1}
              onclick={() => move(index, 1)}>↓</button
            >
            <button
              type="button"
              aria-label="Remove page"
              title="Remove page"
              onclick={() => toggle(id, false)}>✕</button
            >
          </li>
        {/each}
      </ol>
    {/if}

    <h3 id="lists-heading">Your Karakeep lists</h3>
    {#if load.status === 'loading'}
      <p class="notice">Loading lists...</p>
    {:else if load.status === 'failed'}
      <p class="notice error" role="alert">
        The lists could not be loaded ({load.kind}). Check the status under Connection.
      </p>
    {:else if entries.length === 0}
      <p class="notice">
        This Karakeep account has no lists yet. Create a list in Karakeep and add bookmarks to it.
      </p>
    {:else}
      <ul class="lists" aria-labelledby="lists-heading">
        {#each entries as { list, depth } (list.id)}
          <li style:padding-left="{depth * 1.5}rem">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(list.id)}
                onchange={(event) => toggle(list.id, event.currentTarget.checked)}
              />
              <span>{label(list)}</span>
              {#if list.type === 'smart'}<span class="tag">smart</span>{/if}
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      <button type="button" onclick={loadLists} disabled={load.status === 'loading'}>
        Reload lists
      </button>
    </div>
  {/if}
</section>

<style>
  h3 {
    margin: 1.25rem 0 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  ol,
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .order li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .order {
    margin-top: 0.5rem;
  }

  .order li[draggable='true'] {
    cursor: grab;
  }

  .order li.dragging {
    opacity: 0.4;
  }

  .grip {
    color: var(--color-text-muted);
  }

  .order li:last-child {
    border-bottom: none;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name.missing {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .order button {
    min-width: 2.1rem;
    padding: 0.25rem 0.5rem;
  }

  .lists label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.25rem 0;
    font-weight: 400;
    cursor: pointer;
  }

  .lists span:first-of-type {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tag {
    padding: 0 0.4rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }
</style>
