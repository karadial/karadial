import { browser } from 'wxt/browser';

import { hostPermissionPattern } from '@/lib/security/url';

const origins = (baseUrl: string) => ({ origins: [hostPermissionPattern(baseUrl)] });

export function hasHostPermission(baseUrl: string): Promise<boolean> {
  return browser.permissions.contains(origins(baseUrl));
}

/**
 * Asks the user for access to the instance host.
 *
 * Must be the first asynchronous call in a user input handler, otherwise the
 * browser rejects the request.
 */
export function requestHostPermission(baseUrl: string): Promise<boolean> {
  return browser.permissions.request(origins(baseUrl));
}

export function removeHostPermission(baseUrl: string): Promise<boolean> {
  return browser.permissions.remove(origins(baseUrl));
}

/** Calls `callback` when any permission is granted or revoked. Returns an unsubscribe function. */
export function onHostPermissionChanged(callback: () => void): () => void {
  browser.permissions.onAdded.addListener(callback);
  browser.permissions.onRemoved.addListener(callback);
  return () => {
    browser.permissions.onAdded.removeListener(callback);
    browser.permissions.onRemoved.removeListener(callback);
  };
}
