<script lang="ts">
  import SettingsPanel from '@/components/settings/SettingsPanel.svelte';
</script>

<main>
  <a class="back" href="/newtab.html"><span aria-hidden="true">←</span> Back to bookmarks</a>
  <h1>KaraDial Options</h1>
  <div class="panel">
    <SettingsPanel />
  </div>
</main>

<style>
  .panel {
    min-height: 28rem;
    overflow: hidden;
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 1px var(--color-border);
  }

  /* The panel fills its frame, so short sections do not shrink it. */
  .panel > :global(.settings) {
    min-height: inherit;
  }
</style>
