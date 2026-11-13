<script lang="ts">
  import { onMount } from 'svelte';

  import {
    DEFAULT_APPEARANCE,
    getAppearance,
    onAppearanceChanged,
    saveAppearance,
    THEMES,
    TILE_SIZES,
    type Appearance,
    type Theme,
    type TileSize,
  } from '@/lib/settings/appearance';

  const THEME_LABELS: Record<Theme, string> = {
    system: 'Follow the browser',
    light: 'Light',
    dark: 'Dark',
  };

  const TILE_SIZE_LABELS: Record<TileSize, string> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  };

  let appearance = $state<Appearance>(DEFAULT_APPEARANCE);

  onMount(() => {
    void getAppearance().then((stored) => (appearance = stored));
    return onAppearanceChanged((changed) => (appearance = changed));
  });

  function update(change: Partial<Appearance>) {
    appearance = { ...appearance, ...change };
    void saveAppearance(appearance);
  }
</script>

<section aria-labelledby="appearance-heading">
  <h2 id="appearance-heading">Appearance</h2>
  <p class="hint intro">Changes are saved right away.</p>

  <fieldset>
    <legend>Theme</legend>
    {#each THEMES as theme (theme)}
      <label>
        <input
          type="radio"
          name="theme"
          checked={appearance.theme === theme}
          onchange={() => update({ theme })}
        />
        {THEME_LABELS[theme]}
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Tile size</legend>
    {#each TILE_SIZES as tileSize (tileSize)}
      <label>
        <input
          type="radio"
          name="tile-size"
          checked={appearance.tileSize === tileSize}
          onchange={() => update({ tileSize })}
        />
        {TILE_SIZE_LABELS[tileSize]}
      </label>
    {/each}
  </fieldset>
</section>

<style>
  .intro {
    margin-top: -0.5rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.5rem;
    margin: 1.25rem 0 0;
    padding: 0;
    border: none;
  }

  legend {
    margin-bottom: 0.3rem;
    padding: 0;
    font-weight: 600;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0.25rem 0;
    font-weight: 400;
    cursor: pointer;
  }
</style>
