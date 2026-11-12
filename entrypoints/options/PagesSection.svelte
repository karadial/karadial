<script lang="ts">
  import { onMount } from 'svelte';

  import { createKarakeepClient } from '@/lib/karakeep/client';
  import { KarakeepError, type KarakeepErrorKind } from '@/lib/karakeep/errors';
  import { buildListTree, flattenListTree } from '@/lib/karakeep/lists';
  import type { KarakeepList } from '@/lib/karakeep/types';
  import type { Connection } from '@/lib/settings/connection';
  import { getPageListIds, savePageListIds } from '@/lib/settings/pages';

  let { connection }: { connection: Connection } = $props();

  type LoadState =
    | { status: 'loading' }
    | { status: 'ok'; lists: KarakeepList[] }
    | { status: 'failed'; kind: KarakeepErrorKind };

  let load = $state<LoadState>({ status: 'loading' });
  let selected = $state<string[]>([]);

  const entries = $derived(load.status === 'ok' ? flattenListTree(buildListTree(load.lists)) : []);
  const byId = $derived(new Map(entries.map((entry) => [entry.list.id, entry.list])));

  async function loadLists() {
    load = { status: 'loading' };
    try {
      load = { status: 'ok', lists: await createKarakeepClient(connection).listLists() };
    } catch (error) {
      if (!(error instanceof KarakeepError)) throw error;
      load = { status: 'failed', kind: error.kind };
    }
  }

  onMount(() => {
    void getPageListIds().then((ids) => (selected = ids));
    void loadLists();
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

  const label = (list: KarakeepList) => (list.icon ? `${list.icon} ${list.name}` : list.name);
</script>

<section aria-labelledby="pages-heading">
  <h2 id="pages-heading">Pages</h2>
  <p class="hint intro">
    Each selected list becomes one page of the speed dial. Lists inside a selected list are shown as
    groups on its page. Changes are saved right away.
  </p>

  {#if selected.length > 0}
    <h3 id="order-heading">Page order</h3>
    <ol class="order" aria-labelledby="order-heading">
      {#each selected as id, index (id)}
        {@const list = byId.get(id)}
        <li>
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
      The lists could not be loaded ({load.kind}). Check the connection status above.
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
</section>

<style>
  h3 {
    margin: 1.25rem 0 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .intro {
    margin-top: -0.5rem;
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
