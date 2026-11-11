import { describe, expect, it } from 'vitest';

import { isHttpUrl } from './url';

describe('isHttpUrl', () => {
  it.each([
    'http://example.com',
    'https://example.com/path?q=1#frag',
    'HTTPS://EXAMPLE.COM',
    'http://192.168.1.10:3000/',
    'https://[::1]:8443/',
    '  https://example.com  ',
    'ht\ttps://example.com',
  ])('accepts %j', (value) => {
    expect(isHttpUrl(value)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'blob:https://example.com/5f0c',
    'view-source:https://example.com',
    'about:blank',
    'moz-extension://abc/newtab.html',
    'chrome://settings',
    'ftp://example.com',
    'ws://example.com',
    '//example.com',
    '/relative/path',
    'example.com',
    'https://',
    '',
  ])('rejects %j', (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });

  it.each([undefined, null, 42, {}, new URL('https://example.com')])(
    'rejects non-string %j',
    (value) => {
      expect(isHttpUrl(value)).toBe(false);
    },
  );
});
