<script lang="ts">
  import { THEMES, type Theme } from '@/lib/settings/appearance';

  import { useAppearance } from './appearance.svelte';

  const THEME_LABELS: Record<Theme, string> = {
    system: 'Follow the browser',
    light: 'Light',
    dark: 'Dark',
  };

  const appearance = useAppearance();
</script>

<section aria-labelledby="appearance-heading">
  <h2 id="appearance-heading">Appearance</h2>
  <p class="hint intro">Changes are saved right away.</p>

  <fieldset>
    <legend>Theme</legend>
    {#each THEMES as theme (theme)}
      <label class="choice">
        <input
          type="radio"
          name="theme"
          checked={appearance.current.theme === theme}
          onchange={() => appearance.update({ theme })}
        />
        {THEME_LABELS[theme]}
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Lists</legend>
    <label class="choice">
      <input
        type="checkbox"
        checked={appearance.current.showListIcons}
        onchange={(event) => appearance.update({ showListIcons: event.currentTarget.checked })}
      />
      Show the icons of lists on pages and groups
    </label>
  </fieldset>

  <fieldset>
    <legend>Privacy</legend>
    <label class="choice">
      <input
        type="checkbox"
        checked={appearance.current.privacyMode}
        onchange={(event) => appearance.update({ privacyMode: event.currentTarget.checked })}
      />
      Privacy mode
    </label>
  </fieldset>
  <p class="hint">
    Hides your bookmarks on every new tab, for example while you share your screen. Holding Esc for
    a second on the new tab page switches it on and off.
  </p>
</section>
