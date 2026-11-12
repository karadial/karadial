<script lang="ts">
  import { onMount } from 'svelte';

  import { deleteCache } from '@/lib/cache/db';
  import { createKarakeepClient } from '@/lib/karakeep/client';
  import { KarakeepError, type KarakeepErrorKind } from '@/lib/karakeep/errors';
  import {
    hasHostPermission,
    onHostPermissionChanged,
    removeHostPermission,
    requestHostPermission,
  } from '@/lib/permissions/host';
  import {
    hostPermissionPattern,
    isInsecureRemote,
    parseInstanceUrl,
    type InstanceUrlError,
  } from '@/lib/security/url';
  import {
    clearConnection,
    getConnection,
    maskApiKey,
    saveConnection,
    type Connection,
  } from '@/lib/settings/connection';
  import { clearPageListIds } from '@/lib/settings/pages';

  import PagesSection from './PagesSection.svelte';

  type TestState =
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'ok'; listCount: number }
    | { status: 'failed'; kind: KarakeepErrorKind; httpStatus: number | undefined };

  const URL_ERRORS: Record<InstanceUrlError, string> = {
    empty: 'Enter the address of your Karakeep instance.',
    invalid: 'This is not a valid address.',
    scheme: 'The address must start with http:// or https://.',
    credentials: 'Remove the user name and password from the address.',
  };

  const TEST_ERRORS: Record<KarakeepErrorKind, string> = {
    network:
      'The instance did not answer. Check the address, that the server is running and, for https, that its certificate is trusted by this browser.',
    timeout: 'The instance took too long to answer.',
    redirect:
      'The instance answered with a redirect. Enter the final address, for example with https:// instead of http://.',
    unauthorized: 'The instance rejected the API key. Check that it is complete and not expired.',
    forbidden: 'The API key is valid but may not read lists. Give it read access.',
    'not-found':
      'No Karakeep API found at this address. Enter only the base address, without a page path such as /signin.',
    http: 'The instance answered with an error.',
    'invalid-response':
      'The answer does not look like Karakeep. Check that the address points to your Karakeep instance.',
  };

  let loaded = $state(false);
  let saved = $state<Connection | null>(null);
  let permitted = $state(false);

  let urlInput = $state('');
  let keyInput = $state('');
  let formError = $state('');
  let test = $state<TestState>({ status: 'idle' });
  let pathRemoved = $state(false);

  const typedUrl = $derived(parseInstanceUrl(urlInput));
  const insecure = $derived(typedUrl.ok && isInsecureRemote(typedUrl.baseUrl));
  const savedHost = $derived(saved ? new URL(saved.baseUrl).host : '');
  // The status section always describes the saved connection, not the form.
  const unsaved = $derived(
    saved !== null &&
      (keyInput.trim() !== '' || !typedUrl.ok || typedUrl.baseUrl !== saved.baseUrl),
  );

  async function refreshPermission() {
    permitted = saved ? await hasHostPermission(saved.baseUrl) : false;
  }

  onMount(() => {
    void (async () => {
      saved = await getConnection();
      urlInput = saved?.baseUrl ?? '';
      await refreshPermission();
      loaded = true;
    })();
    return onHostPermissionChanged(() => void refreshPermission());
  });

  async function runTest() {
    if (!saved) return;
    pathRemoved = false;
    test = { status: 'running' };
    try {
      const { listCount } = await createKarakeepClient(saved).testConnection();
      test = { status: 'ok', listCount };
    } catch (error) {
      if (!(error instanceof KarakeepError)) throw error;
      test = { status: 'failed', kind: error.kind, httpStatus: error.status };
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    formError = '';

    const parsed = parseInstanceUrl(urlInput);
    if (!parsed.ok) {
      formError = URL_ERRORS[parsed.reason];
      return;
    }
    const apiKey = keyInput.trim() || saved?.apiKey;
    if (!apiKey) {
      formError = 'Enter an API key.';
      return;
    }

    // The permission request has to be the first await of this input handler.
    const granted = await requestHostPermission(parsed.baseUrl).catch(() => false);

    const previous = saved;
    const next: Connection = { baseUrl: parsed.baseUrl, apiKey };
    await saveConnection(next);
    saved = next;
    urlInput = next.baseUrl;
    keyInput = '';

    if (
      previous &&
      hostPermissionPattern(previous.baseUrl) !== hostPermissionPattern(next.baseUrl)
    ) {
      await removeHostPermission(previous.baseUrl);
    }
    // List ids of another server mean nothing here.
    if (previous && new URL(previous.baseUrl).origin !== new URL(next.baseUrl).origin) {
      await clearPageListIds();
    }

    permitted = granted;
    if (granted) {
      await runTest();
      await retryWithoutPath(next);
    } else {
      test = { status: 'idle' };
    }
  }

  /**
   * People paste the address of a Karakeep page, for example `/signin`. If the
   * API is not found below that path, try the bare origin and keep it if it works.
   */
  async function retryWithoutPath(connection: Connection) {
    const origin = new URL(connection.baseUrl).origin;
    if (test.status !== 'failed' || test.kind !== 'not-found' || origin === connection.baseUrl) {
      return;
    }
    const trimmed: Connection = { baseUrl: origin, apiKey: connection.apiKey };
    try {
      const { listCount } = await createKarakeepClient(trimmed).testConnection();
      await saveConnection(trimmed);
      saved = trimmed;
      urlInput = trimmed.baseUrl;
      test = { status: 'ok', listCount };
      pathRemoved = true;
    } catch (error) {
      // Keep the original failure on screen.
      if (!(error instanceof KarakeepError)) throw error;
    }
  }

  async function grant() {
    if (!saved) return;
    // First await of the input handler, see save().
    const granted = await requestHostPermission(saved.baseUrl).catch(() => false);
    permitted = granted;
    if (granted) await runTest();
  }

  async function disconnect() {
    if (!saved) return;
    const previous = saved;
    await clearConnection();
    await clearPageListIds();
    await deleteCache().catch(() => undefined);
    await removeHostPermission(previous.baseUrl);
    saved = null;
    permitted = false;
    urlInput = '';
    keyInput = '';
    formError = '';
    test = { status: 'idle' };
    pathRemoved = false;
  }
</script>

<main>
  <a class="back" href="/newtab.html"><span aria-hidden="true">←</span> Back to speed dial</a>
  <h1>KaraDial Options</h1>

  {#if loaded}
    <section aria-labelledby="connection-heading">
      <h2 id="connection-heading">Karakeep connection</h2>

      <form onsubmit={save} novalidate>
        <label for="instance-url">Instance address</label>
        <input
          id="instance-url"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://karakeep.example.com"
          aria-describedby="instance-url-hint"
          bind:value={urlInput}
        />
        <p id="instance-url-hint" class="hint">
          The address you open Karakeep with. Without http:// or https:// in front, https is used.
        </p>

        {#if insecure}
          <p class="notice warning" role="status">
            This address uses plain http outside your local network. Your API key and bookmarks
            would travel unencrypted. Use https if you can.
          </p>
        {/if}

        <label for="api-key">API key</label>
        <input
          id="api-key"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder={saved ? `Saved: ${maskApiKey(saved.apiKey)}` : ''}
          aria-describedby="api-key-hint"
          bind:value={keyInput}
        />
        <p id="api-key-hint" class="hint">
          {#if saved}Leave empty to keep the saved key.{/if}
          Create a separate key for KaraDial in your Karakeep user settings. KaraDial only reads, so give
          the key read-only access if your Karakeep version offers it.
        </p>

        {#if formError}
          <p class="notice error" role="alert">{formError}</p>
        {/if}

        <div class="actions">
          <button type="submit" class="primary">Save and connect</button>
          {#if saved}
            <button type="button" onclick={disconnect}>Remove connection</button>
          {/if}
        </div>
        <p class="hint">
          Saving asks the browser for access to this one address. The key is stored only in this
          browser and sent only to this address.
        </p>
      </form>
    </section>

    {#if saved}
      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Status</h2>

        {#if unsaved}
          <p class="hint unsaved">
            Your changes above are not saved yet. This shows the saved connection to {savedHost}.
          </p>
        {/if}

        {#if !permitted}
          <p class="notice warning" role="status">
            KaraDial has no access to <strong>{savedHost}</strong>. The browser permission was
            declined or removed.
          </p>
          <div class="actions">
            <button type="button" class="primary" onclick={grant}>Grant access</button>
          </div>
        {:else}
          <div aria-live="polite">
            {#if test.status === 'running'}
              <p class="notice">Testing the connection...</p>
            {:else if test.status === 'ok'}
              <p class="notice success">
                Connected to <strong>{savedHost}</strong>. The key can read
                {test.listCount}
                {test.listCount === 1 ? 'list' : 'lists'}.
                {#if pathRemoved}The page path was removed from the address.{/if}
              </p>
            {:else if test.status === 'failed'}
              <p class="notice error">
                {TEST_ERRORS[test.kind]}
                {#if test.httpStatus !== undefined}(HTTP {test.httpStatus}){/if}
              </p>
            {:else}
              <p class="notice">Access to <strong>{savedHost}</strong> is granted.</p>
            {/if}
          </div>
          <div class="actions">
            <button type="button" onclick={runTest} disabled={test.status === 'running'}>
              Test connection
            </button>
          </div>
        {/if}
      </section>

      {#if permitted}
        {#key `${saved.baseUrl}\n${saved.apiKey}`}
          <PagesSection connection={saved} />
        {/key}
      {/if}
    {/if}
  {/if}
</main>
