<script lang="ts">
  import SettingsPanel, { type SectionId } from '@/components/settings/SettingsPanel.svelte';

  let {
    open = $bindable(false),
    section = $bindable('connection'),
  }: { open?: boolean; section?: SectionId } = $props();

  let dialog = $state<HTMLDialogElement>();
  /** The press began on the backdrop. A drag that only ends there must not close the dialog. */
  let pressedBackdrop = false;

  // A modal dialog: the browser keeps the focus inside and closes it on Escape.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<!-- Clicks on the backdrop arrive at the dialog element itself. Escape is the keyboard way out. -->
<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  onclose={() => (open = false)}
  onmousedown={(event) => (pressedBackdrop = event.target === dialog)}
  onclick={(event) => {
    if (pressedBackdrop && event.target === dialog) open = false;
  }}
>
  {#if open}
    <div class="frame">
      <header>
        <h1 id="settings-title">Options</h1>
        <button type="button" aria-label="Close" title="Close" onclick={() => (open = false)}>
          ✕
        </button>
      </header>
      <div class="body">
        <SettingsPanel bind:section />
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(58rem, calc(100vw - 2rem));
    max-width: none;
    height: min(42rem, calc(100vh - 2rem));
    max-height: none;
    padding: 0;
    overflow: hidden;
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.3);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .frame {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.75rem 0.75rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  h1 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  button {
    min-width: 2.25rem;
    padding: 0.35rem 0.6rem;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid transparent;
    border-radius: 999px;
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    background: var(--color-bg);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .body {
    min-height: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    dialog[open] {
      animation: rise 140ms ease;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
  }
</style>
