<script lang="ts">
  import Modal from './Modal.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  /** Each shortcut: the keys to press, alternatives as separate entries, and what they do. */
  const GROUPS: { name: string; shortcuts: { keys: string[][]; text: string }[] }[] = [
    {
      name: 'Search',
      shortcuts: [
        { keys: [['/']], text: 'Go to the search field' },
        { keys: [['A'], ['Z']], text: 'Any letter starts a search on your pages' },
        { keys: [['Enter']], text: 'Search all of Karakeep' },
        { keys: [['Esc']], text: 'Clear the search, then leave the field' },
        { keys: [['↓']], text: 'From the search field to the first bookmark' },
      ],
    },
    {
      name: 'Pages',
      shortcuts: [
        { keys: [['1'], ['9']], text: 'Show page 1 to 9' },
        {
          keys: [
            ['Ctrl', '←'],
            ['Ctrl', '→'],
          ],
          text: 'Previous or next page',
        },
      ],
    },
    {
      name: 'Bookmarks',
      shortcuts: [
        { keys: [['←'], ['→'], ['↑'], ['↓']], text: 'Move across the bookmarks' },
        { keys: [['Home'], ['End']], text: 'First or last bookmark' },
        { keys: [['Enter']], text: 'Open the chosen bookmark' },
        { keys: [['Ctrl', 'Enter']], text: 'Open it in a new tab (Cmd on a Mac)' },
      ],
    },
    {
      name: 'General',
      shortcuts: [
        { keys: [['Esc']], text: 'Hold for one second to hide or show your bookmarks' },
        { keys: [['?']], text: 'Show this list, outside of the search field' },
      ],
    },
  ];
</script>

<Modal bind:open title="Keyboard shortcuts">
  <div class="groups">
    {#each GROUPS as group (group.name)}
      <section>
        <h2>{group.name}</h2>
        <dl>
          {#each group.shortcuts as shortcut (shortcut.text)}
            <div class="row">
              <dt>
                {#each shortcut.keys as combination, index (index)}
                  <span class="combination">
                    {#each combination as key (key)}<kbd>{key}</kbd>{/each}
                  </span>
                {/each}
              </dt>
              <dd>{shortcut.text}</dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</Modal>

<style>
  .groups {
    padding: 0.5rem 1.5rem 1.5rem;
  }

  h2 {
    margin: 1.25rem 0 0.25rem;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  dl {
    margin: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 9.5rem minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .row:last-child {
    border-bottom: none;
  }

  dt {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .combination {
    display: inline-flex;
    gap: 0.125rem;
  }

  dd {
    margin: 0;
    font-size: 0.9375rem;
  }

  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.4rem;
    background: var(--color-well);
    color: var(--color-text);
    border-radius: 0.4rem;
    box-shadow: inset 0 0 0 1px var(--color-border-strong);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  @media (max-width: 30rem) {
    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.375rem;
    }
  }
</style>
