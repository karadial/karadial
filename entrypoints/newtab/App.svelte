<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';

  import { getConnection, onConnectionChanged, type Connection } from '@/lib/settings/connection';

  let loaded = $state(false);
  let connection = $state<Connection | null>(null);

  onMount(() => {
    void getConnection().then((value) => {
      connection = value;
      loaded = true;
    });
    return onConnectionChanged((value) => {
      connection = value;
    });
  });
</script>

<main>
  <h1>KaraDial</h1>
  {#if loaded}
    {#if connection}
      <p>
        Connected to {new URL(connection.baseUrl).host}. The speed dial arrives in a later
        milestone.
      </p>
    {:else}
      <p>Connect KaraDial to your Karakeep instance to get started.</p>
    {/if}
    <button type="button" onclick={() => browser.runtime.openOptionsPage()}>Open options</button>
  {/if}
</main>

<style>
  main {
    display: grid;
    place-content: center;
    justify-items: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
  }

  p {
    margin: 0.5rem 0 0;
    color: var(--color-text-muted);
  }

  button {
    margin-top: 1.25rem;
    padding: 0.5rem 0.9rem;
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border-strong);
    border-radius: 0.375rem;
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
