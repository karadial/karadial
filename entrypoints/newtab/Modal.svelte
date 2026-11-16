<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title,
    size = 'small',
    children,
  }: {
    open?: boolean;
    title: string;
    /** `large` has a fixed height for content that changes, `small` is as tall as its content. */
    size?: 'small' | 'large';
    children: Snippet;
  } = $props();

  const titleId = $props.id();

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
  class={size}
  aria-labelledby={titleId}
  onclose={() => (open = false)}
  onmousedown={(event) => (pressedBackdrop = event.target === dialog)}
  onclick={(event) => {
    if (pressedBackdrop && event.target === dialog) open = false;
  }}
>
  {#if open}
    <div class="frame">
      <header>
        <h1 id={titleId}>{title}</h1>
        <button type="button" aria-label="Close" title="Close" onclick={() => (open = false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div class="body">
        {@render children()}
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    max-width: none;
    max-height: none;
    padding: 0;
    overflow: hidden;
    background: var(--color-surface);
    color: var(--color-text);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow:
      0 0 0 1px var(--color-border),
      0 1.5rem 4rem -1rem var(--color-shadow);
  }

  dialog.large {
    width: min(58rem, calc(100vw - 2rem));
    height: min(42rem, calc(100vh - 2rem));
  }

  dialog.small {
    width: min(34rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .frame {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    max-height: inherit;
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
    font-size: 1.0625rem;
    font-weight: 600;
  }

  button {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    background: transparent;
    color: var(--color-text-muted);
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  button:hover {
    background: var(--color-well);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .body {
    min-height: 0;
  }

  .small .body {
    overflow-y: auto;
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
