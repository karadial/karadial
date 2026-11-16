<script lang="ts">
  import SettingsPanel, { type SectionId } from '@/components/settings/SettingsPanel.svelte';

  import Modal from './Modal.svelte';

  let {
    open = $bindable(false),
    section = $bindable('connection'),
  }: { open?: boolean; section?: SectionId } = $props();
</script>

<Modal bind:open title="Options" size="large">
  <SettingsPanel bind:section />
</Modal>
