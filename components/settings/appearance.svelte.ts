import { onMount } from 'svelte';

import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  getAppearance,
  onAppearanceChanged,
  saveAppearance,
  type Appearance,
} from '@/lib/settings/appearance';

/**
 * The stored appearance for a section that edits it. Call it while the
 * component is set up.
 */
export function useAppearance() {
  let appearance = $state.raw<Appearance>(DEFAULT_APPEARANCE);

  onMount(() => {
    void getAppearance().then((stored) => (appearance = stored));
    return onAppearanceChanged((changed) => (appearance = changed));
  });

  return {
    get current() {
      return appearance;
    },
    /** Shows a change on this page without saving it, for example while a slider moves. */
    preview(change: Partial<Appearance>) {
      appearance = { ...appearance, ...change };
      applyAppearance(appearance);
    },
    /** Saves a change. Every open KaraDial page follows. */
    update(change: Partial<Appearance> = {}) {
      appearance = { ...appearance, ...change };
      void saveAppearance(appearance);
    },
  };
}
