import { describe, expect, it } from 'vitest';

import { createSearchIndex, fold, type SearchFields } from './fuzzy';

const item = (title: string, url: string, tags: string[] = []): SearchFields => ({
  title,
  host: new URL(url).hostname,
  url,
  tags,
});

const items = [
  item('GitHub', 'https://github.com/'),
  item('Svelte docs', 'https://svelte.dev/docs', ['frontend', 'reference']),
  item('The Git book', 'https://git-scm.com/book'),
  item('Café Crème recipes', 'https://kitchen.example/coffee', ['food']),
  item('Legit news', 'https://news.example/'),
  item('Hosting dashboard', 'https://panel.example/login?next=/github'),
];

const index = createSearchIndex(items, (entry) => entry);
const titles = (query: string, limit?: number) =>
  index.search(query, limit).map((entry) => entry.title);

describe('fold', () => {
  it('lowercases and strips diacritics', () => {
    expect(fold('Café CRÈME')).toBe('cafe creme');
  });
});

describe('createSearchIndex', () => {
  it('returns nothing for an empty query', () => {
    expect(titles('')).toEqual([]);
    expect(titles('   ')).toEqual([]);
  });

  it('ranks title start, then word start, then inside the title, then the URL', () => {
    expect(titles('git')).toEqual(['GitHub', 'The Git book', 'Legit news', 'Hosting dashboard']);
  });

  it('matches the host', () => {
    expect(titles('svelte.dev')).toEqual(['Svelte docs']);
    expect(titles('scm')).toEqual(['The Git book']);
  });

  it('matches tags', () => {
    expect(titles('frontend')).toEqual(['Svelte docs']);
    expect(titles('food')).toEqual(['Café Crème recipes']);
  });

  it('ignores case and diacritics', () => {
    expect(titles('CAFE creme')).toEqual(['Café Crème recipes']);
    expect(titles('crème')).toEqual(['Café Crème recipes']);
  });

  it('requires every word to match, in any field', () => {
    expect(titles('git book')).toEqual(['The Git book']);
    expect(titles('docs reference')).toEqual(['Svelte docs']);
    expect(titles('git svelte')).toEqual([]);
  });

  it('matches letters with gaps', () => {
    expect(titles('gthb')).toEqual(['GitHub']);
    expect(titles('svlt')).toEqual(['Svelte docs']);
  });

  it('ranks a substring match above a match with gaps', () => {
    const ranked = createSearchIndex(
      [item('Not eaten', 'https://a.example/'), item('Travel notes', 'https://b.example/')],
      (entry) => entry,
    );
    expect(ranked.search('note').map((entry) => entry.title)).toEqual([
      'Travel notes',
      'Not eaten',
    ]);
  });

  it('does not match letters that are spread too far apart', () => {
    expect(titles('gbk')).toEqual([]);
  });

  it('does not match short words with gaps', () => {
    expect(titles('gb')).toEqual([]);
  });

  it('keeps the item order for equal matches and honours the limit', () => {
    const same = createSearchIndex(
      [item('Alpha one', 'https://1.example/'), item('Alpha two', 'https://2.example/')],
      (entry) => entry,
    );
    expect(same.search('alpha').map((entry) => entry.title)).toEqual(['Alpha one', 'Alpha two']);
    expect(same.search('alpha', 1).map((entry) => entry.title)).toEqual(['Alpha one']);
  });
});
