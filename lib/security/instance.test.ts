import { describe, expect, it } from 'vitest';

import { hostPermissionPattern, isInsecureRemote, isLocalHost, parseInstanceUrl } from './url';

describe('parseInstanceUrl', () => {
  it.each([
    ['https://keep.example.com', 'https://keep.example.com'],
    ['https://keep.example.com/', 'https://keep.example.com'],
    ['  https://keep.example.com///  ', 'https://keep.example.com'],
    ['keep.example.com', 'https://keep.example.com'],
    ['keep.example.com:8443/', 'https://keep.example.com:8443'],
    ['HTTP://Keep.Example.com', 'http://keep.example.com'],
    ['http://192.168.1.10:3000', 'http://192.168.1.10:3000'],
    ['http://[fd00::1]:3000/', 'http://[fd00::1]:3000'],
    ['https://example.com/karakeep/', 'https://example.com/karakeep'],
    ['https://keep.example.com/api/v1', 'https://keep.example.com'],
    ['https://keep.example.com/api/v1/', 'https://keep.example.com'],
    ['https://example.com/karakeep/api', 'https://example.com/karakeep'],
    ['https://keep.example.com/?a=1#frag', 'https://keep.example.com'],
    ['https://keep.example.com:443', 'https://keep.example.com'],
  ])('normalizes %j', (input, baseUrl) => {
    expect(parseInstanceUrl(input)).toEqual({ ok: true, baseUrl });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['ftp://keep.example.com', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['javascript:alert(1)', 'invalid'],
    ['https://', 'invalid'],
    ['https://exa mple.com', 'invalid'],
    ['https://user:secret@keep.example.com', 'credentials'],
    ['https://user@keep.example.com', 'credentials'],
  ])('rejects %j as %s', (input, reason) => {
    expect(parseInstanceUrl(input)).toEqual({ ok: false, reason });
  });
});

describe('hostPermissionPattern', () => {
  it.each([
    ['https://keep.example.com', 'https://keep.example.com/*'],
    ['http://192.168.1.10:3000', 'http://192.168.1.10/*'],
    ['https://example.com:8443/karakeep', 'https://example.com/*'],
    ['http://[fd00::1]:3000', 'http://[fd00::1]/*'],
  ])('drops port and path of %j', (baseUrl, pattern) => {
    expect(hostPermissionPattern(baseUrl)).toBe(pattern);
  });
});

describe('isLocalHost', () => {
  it.each([
    'localhost',
    'app.localhost',
    'nas',
    'nas.local',
    'karakeep.lan',
    'keep.home.arpa',
    'keep.internal',
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.178.20',
    '169.254.10.10',
    '[::1]',
    '[fd12:3456::1]',
    '[fe80::1]',
  ])('treats %j as local', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    'keep.example.com',
    'example.com',
    'local.example.com',
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.1.1',
    '11.0.0.1',
    '[2001:db8::1]',
  ])('treats %j as remote', (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});

describe('isInsecureRemote', () => {
  it.each([
    ['http://keep.example.com', true],
    ['http://8.8.8.8:3000', true],
    ['https://keep.example.com', false],
    ['http://192.168.1.10:3000', false],
    ['http://localhost:3000', false],
    ['http://nas.local', false],
  ])('%j is %s', (baseUrl, expected) => {
    expect(isInsecureRemote(baseUrl)).toBe(expected);
  });
});
