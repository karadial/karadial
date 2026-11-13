<script lang="ts">
  import {
    DEFAULT_TILE_LAYOUT,
    TILE_LAYOUT_LIMITS,
    TILE_SIZES,
    type TileLayout,
    type TileSize,
  } from '@/lib/settings/appearance';

  import { useAppearance } from './appearance.svelte';

  const TILE_SIZE_LABELS: Record<TileSize, string> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  };

  const SLIDERS: { key: keyof TileLayout; label: string; unit: string }[] = [
    { key: 'columns', label: 'Columns', unit: '' },
    { key: 'spacing', label: 'Spacing', unit: ' px' },
    { key: 'width', label: 'Width', unit: ' %' },
  ];

  const appearance = useAppearance();
  const custom = $derived(appearance.current.customLayout);

  const withLayout = (key: keyof TileLayout, value: number) => ({
    layout: { ...appearance.current.layout, [key]: value },
  });
</script>

<section aria-labelledby="tiles-heading">
  <h2 id="tiles-heading">Tiles</h2>
  <p class="hint intro">Changes are saved right away.</p>

  <fieldset>
    <legend>Size</legend>
    {#each TILE_SIZES as tileSize (tileSize)}
      <label class="choice">
        <input
          type="radio"
          name="tile-size"
          checked={!custom && appearance.current.tileSize === tileSize}
          onchange={() => appearance.update({ tileSize, customLayout: false })}
        />
        {TILE_SIZE_LABELS[tileSize]}
      </label>
    {/each}
    <label class="choice">
      <input
        type="radio"
        name="tile-size"
        checked={custom}
        onchange={() => appearance.update({ customLayout: true })}
      />
      Custom
    </label>
  </fieldset>

  {#if custom}
    <div class="sliders">
      {#each SLIDERS as { key, label, unit } (key)}
        {@const limits = TILE_LAYOUT_LIMITS[key]}
        <label for="tile-{key}">{label}</label>
        <!-- While the slider moves the page follows. Letting go saves. -->
        <input
          id="tile-{key}"
          type="range"
          min={limits.min}
          max={limits.max}
          step={limits.step}
          value={appearance.current.layout[key]}
          oninput={(event) =>
            appearance.preview(withLayout(key, event.currentTarget.valueAsNumber))}
          onchange={(event) =>
            appearance.update(withLayout(key, event.currentTarget.valueAsNumber))}
        />
        <output for="tile-{key}">{appearance.current.layout[key]}{unit}</output>
      {/each}
    </div>
    <p class="hint">
      Width is the share of the window the bookmarks may use. A window too narrow for the columns
      shows fewer of them.
    </p>
    <div class="actions">
      <button
        type="button"
        onclick={() => appearance.update({ customLayout: false, layout: DEFAULT_TILE_LAYOUT })}
      >
        Reset to standard
      </button>
    </div>
  {/if}
</section>

<style>
  .sliders {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 3.5rem;
    align-items: center;
    gap: 0.6rem 1rem;
    margin-top: 1rem;
  }

  .sliders label {
    margin: 0;
    font-weight: 400;
  }

  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: var(--color-accent);
  }

  output {
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
