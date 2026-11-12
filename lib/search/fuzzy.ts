/**
 * Local fuzzy filter over cached bookmarks. Pure and synchronous, so results
 * can follow every keystroke.
 *
 * A query is split into words and every word has to match somewhere (title,
 * host, tags or URL). Plain substring matches rank first, best at the start
 * of the title. Words of three or more letters may also match with gaps
 * ("gthb" finds "GitHub"), ranked below every substring match in the same field.
 */

export interface SearchFields {
  title: string;
  host: string;
  url: string;
  tags: readonly string[];
}

export interface SearchIndex<T> {
  /** Best matches first. Equal matches keep the order of the indexed items. */
  search(query: string, limit?: number): T[];
}

/** Lowercases and strips diacritics, so "cafe" finds "Café". */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Best substring match of `word` in `text`: at the start, at a word start, or inside. */
function substringScore(
  text: string,
  word: string,
  atStart: number,
  atWordStart: number,
  inside: number,
): number {
  let best = 0;
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (at === 0) return atStart;
    best = Math.max(best, WORD_CHAR.test(text[at - 1]!) ? inside : atWordStart);
    if (best === atWordStart) break;
  }
  return best;
}

const MIN_GAP_WORD_LENGTH = 3;

/**
 * Matches the letters of `word` in order with gaps between them. The tighter
 * the letters sit together, the closer the score gets to `max`. Matches spread
 * over more than twice the word length count as noise.
 */
function gapScore(text: string, word: string, max: number): number {
  if (word.length < MIN_GAP_WORD_LENGTH) return 0;
  let shortest = Infinity;
  for (
    let start = text.indexOf(word[0]!);
    start !== -1;
    start = text.indexOf(word[0]!, start + 1)
  ) {
    let at = start;
    let matched = 1;
    while (matched < word.length) {
      at = text.indexOf(word[matched]!, at + 1);
      if (at === -1) break;
      matched++;
    }
    // No match from here means no match from any later start either.
    if (matched < word.length) break;
    shortest = Math.min(shortest, at - start + 1);
  }
  if (shortest > word.length * 2) return 0;
  return Math.round((max * word.length) / shortest);
}

interface Entry<T> {
  item: T;
  title: string;
  host: string;
  url: string;
  tags: string[];
}

function wordScore(entry: Entry<unknown>, word: string): number {
  return Math.max(
    substringScore(entry.title, word, 100, 80, 60),
    substringScore(entry.host, word, 70, 70, 50),
    ...entry.tags.map((tag) => substringScore(tag, word, 45, 45, 35)),
    substringScore(entry.url, word, 25, 25, 25),
    gapScore(entry.title, word, 30),
    gapScore(entry.host, word, 25),
  );
}

export function createSearchIndex<T>(
  items: readonly T[],
  fieldsOf: (item: T) => SearchFields,
): SearchIndex<T> {
  const entries: Entry<T>[] = items.map((item) => {
    const fields = fieldsOf(item);
    return {
      item,
      title: fold(fields.title),
      host: fold(fields.host),
      url: fold(fields.url),
      tags: fields.tags.map(fold),
    };
  });

  return {
    search(query, limit = Infinity) {
      const words = fold(query).split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];

      const hits: { item: T; score: number }[] = [];
      for (const entry of entries) {
        let total = 0;
        for (const word of words) {
          const score = wordScore(entry, word);
          if (score === 0) {
            total = 0;
            break;
          }
          total += score;
        }
        if (total > 0) hits.push({ item: entry.item, score: total });
      }
      // Array.prototype.sort is stable, so equal scores keep the item order.
      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, limit).map((hit) => hit.item);
    },
  };
}
