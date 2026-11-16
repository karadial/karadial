import { describe, expect, it } from 'vitest';

import { GECKO_ID, UPDATE_URL, geckoSettings } from './firefox';

describe('geckoSettings', () => {
  it('names the update URL in a self-distributed build', () => {
    expect(geckoSettings(false)).toMatchObject({ id: GECKO_ID, update_url: UPDATE_URL });
  });

  it('leaves the update URL out of a listed build', () => {
    const settings = geckoSettings(true);
    expect(settings.id).toBe(GECKO_ID);
    expect(settings).not.toHaveProperty('update_url');
  });

  it('declares the same data in both builds', () => {
    expect(geckoSettings(true).data_collection_permissions).toEqual(
      geckoSettings(false).data_collection_permissions,
    );
  });
});
