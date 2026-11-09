import { describe, expect, it } from 'vitest';
import {
  Post,
  autoLinkRefs,
  buildCaption,
  charsKey,
  findAbbr,
  linkLabel,
  renderLinks,
  buildLinkList,
  buildTitle,
  nextNumber,
  parseBulkLines,
  parseIllustId,
  search,
  seriesKey,
  splitCharacters,
} from './model';

let seq = 0;
const mk = (chars: string, situation: string, number: number, illustId = ''): Post => ({
  id: String(++seq),
  characters: splitCharacters(chars),
  situation,
  number,
  description: '',
  illustId,
  createdAt: seq,
  updatedAt: seq,
});

const posts = [
  mk('甘織れな子＆琴紗月', '攻め', 1, '149961440'),
  mk('甘織れな子＆琴紗月', '攻め', 2, '149992313'),
  mk('琴紗月&甘織れな子', '攻め', 3, '151689661'),
  mk('甘織れな子＆王塚真唯', '水着', 1, '150000000'),
];

describe('parseIllustId', () => {
  it('accepts various formats', () => {
    expect(parseIllustId('https://www.pixiv.net/artworks/151757375')).toBe('151757375');
    expect(parseIllustId('https://www.pixiv.net/en/artworks/151757375?x=1')).toBe('151757375');
    expect(parseIllustId('illust/151757375')).toBe('151757375');
    expect(parseIllustId('１５１７５７３７５')).toBe('151757375');
    expect(parseIllustId('abc')).toBe('');
  });
});

describe('series', () => {
  it('treats character order as the same series', () => {
    expect(seriesKey(['甘織れな子', '琴紗月'], '攻め')).toBe(seriesKey(['琴紗月', '甘織れな子'], '攻め'));
  });
  it('computes next number', () => {
    expect(nextNumber(posts, seriesKey(['甘織れな子', '琴紗月'], '攻め'))).toBe(4);
    expect(nextNumber(posts, seriesKey(['新キャラ'], 'x'))).toBe(1);
  });
  it('builds title', () => {
    expect(buildTitle(posts[0])).toBe('甘織れな子＆琴紗月 攻め');
    expect(buildTitle(posts[1])).toBe('甘織れな子＆琴紗月 攻め 2');
  });
  it('builds caption with all previous links', () => {
    const key = seriesKey(['甘織れな子', '琴紗月'], '攻め');
    const { lines } = buildLinkList(posts, key, 4, 'さつれな', 'short');
    expect(buildCaption('解説', lines)).toBe(
      '解説\nさつれな1 illust/149961440\nさつれな2 illust/149992313\nさつれな3 illust/151689661',
    );
  });
});

describe('search', () => {
  it('finds couple by either character', () => {
    expect(search(posts, 'character', '琴紗月', '').length).toBe(3);
    expect(search(posts, 'character', '甘織れな子', '').length).toBe(4);
  });
  it('sorts newest first', () => {
    expect(search(posts, 'character', '紗月', '').map((p) => p.number)).toEqual([3, 2, 1]);
  });
  it('AND search', () => {
    expect(search(posts, 'both', 'れな子', '水着').length).toBe(1);
    expect(search(posts, 'both', '紗月', '水着').length).toBe(0);
  });
  it('situation only', () => {
    expect(search(posts, 'situation', '', '攻').length).toBe(3);
  });
});

describe('parseBulkLines', () => {
  it('parses pixiv caption lines', () => {
    expect(parseBulkLines('さつれな1 illust/149961440\nさつれな２ https://www.pixiv.net/artworks/149992313\n')).toEqual([
      { number: 1, illustId: '149961440' },
      { number: 2, illustId: '149992313' },
    ]);
  });
});

describe('cross-situation links', () => {
  const hug = mk('甘織れな子＆琴紗月', 'ハグ', 1, '100000001');
  const kiss1 = mk('甘織れな子＆琴紗月', 'キス', 1, '100000002');
  const all = [hug, kiss1];

  it('auto links only the same series', () => {
    const key = seriesKey(['甘織れな子', '琴紗月'], 'キス');
    const { refs } = autoLinkRefs(all, key, 2, 'さつれな');
    expect(refs).toEqual([{ postId: kiss1.id, label: 'さつれな1' }]);
  });

  it('renders manual links in the given order with custom labels', () => {
    const lines = renderLinks(
      all,
      [
        { postId: hug.id, label: 'さつれな1' },
        { postId: kiss1.id, label: 'さつれな2' },
        { postId: 'deleted', label: 'さつれな3' },
      ],
      'short',
    );
    expect(lines).toEqual(['さつれな1 illust/100000001', 'さつれな2 illust/100000002']);
  });

  it('shares the abbreviation across situations of the same couple', () => {
    const series = { [charsKey(['琴紗月', '甘織れな子'])]: { abbr: 'さつれな' } };
    expect(findAbbr(series, ['甘織れな子', '琴紗月'], 'キス')).toBe('さつれな');
    expect(findAbbr(series, ['別キャラ'], 'キス')).toBe('');
    // 旧データ（シリーズ単位）も拾う
    const old = { [seriesKey(['甘織れな子', '琴紗月'], '攻め')]: { abbr: 'さつれな' } };
    expect(findAbbr(old, ['琴紗月', '甘織れな子'], 'ハグ')).toBe('さつれな');
  });
});

describe('default link labels', () => {
  it('uses "characters situation number" when abbreviation is empty', () => {
    const a = mk('甘織れな子＆琴紗月', 'キス', 1, '100000002');
    const b = mk('甘織れな子＆琴紗月', 'キス', 2, '100000003');
    const key = seriesKey(['甘織れな子', '琴紗月'], 'キス');
    expect(linkLabel('', a)).toBe('甘織れな子＆琴紗月 キス 1');
    expect(linkLabel('さつれな', a)).toBe('さつれな1');
    expect(autoLinkRefs([a, b], key, 3, '').refs.map((r) => r.label)).toEqual([
      '甘織れな子＆琴紗月 キス 1',
      '甘織れな子＆琴紗月 キス 2',
    ]);
  });
});
