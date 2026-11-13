<script module lang="ts">
  export const SECTIONS = ['connection', 'pages', 'appearance'] as const;
  export type SectionId = (typeof SECTIONS)[number];
</script>

<script lang="ts">
  import './settings.css';

  import AppearanceSection from './AppearanceSection.svelte';
  import ConnectionSection from './ConnectionSection.svelte';
  import PagesSection from './PagesSection.svelte';

  /** `section` is the one on screen. Bind it to choose or remember it. */
  let { section = $bindable('connection') }: { section?: SectionId } = $props();

  const LABELS: Record<SectionId, string> = {
    connection: 'Connection',
    pages: 'Pages',
    appearance: 'Appearance',
  };
</script>

<div class="settings">
  <nav aria-label="Option sections">
    {#each SECTIONS as id (id)}
      <button
        type="button"
        aria-current={section === id ? 'page' : undefined}
        onclick={() => (section = id)}
      >
        {LABELS[id]}
      </button>
    {/each}
  </nav>

  <!-- Only the chosen section exists, so each one loads its data when it is opened. -->
  <div class="content">
    {#if section === 'connection'}
      <ConnectionSection />
    {:else if section === 'pages'}
      <PagesSection />
    {:else}
      <AppearanceSection />
    {/if}
  </div>
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: 12rem minmax(0, 1fr);
    min-height: 0;
    height: 100%;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 1rem 0.75rem;
    background: var(--color-bg);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  nav button {
    padding: 0.5rem 0.75rem;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid transparent;
    border-radius: 0.5rem;
    text-align: left;
  }

  nav button:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  nav button[aria-current='page'] {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text);
    font-weight: 600;
  }

  .content {
    min-width: 0;
    padding: 1.5rem;
    background: var(--color-surface);
    overflow-y: auto;
    /* In the dialog, scrolling past the end must not move the page behind it. */
    overscroll-behavior: contain;
  }

  @media (max-width: 40rem) {
    .settings {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    nav {
      flex-direction: row;
      flex-wrap: wrap;
      padding: 0.5rem;
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }

    .content {
      padding: 1rem;
    }
  }
</style>
