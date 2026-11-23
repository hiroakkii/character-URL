import { describe, expect, it } from 'vitest';
import { applyImport, parseJsonText, parseLinkLine, parseTitle, planImport, splitCaption } from './importer';
import { AppData, buildCaption, emptyData, renderLinks } from './model';

describe('parseTitle', () => {
  it('splits characters, situation and number', () => {
    expect(parseTitle('甘織れな子＆琴紗月 キス 2')).toEqual({ characters: ['甘織れな子', '琴紗月'], situation: 'キス', number: 2 });
    expect(parseTitle('甘織れな子＆琴紗月 キス')).toEqual({ characters: ['甘織れな子', '琴紗月'], situation: 'キス', number: 1 });
    expect(parseTitle('甘織れな子＆琴紗月　キス　３')?.number).toBe(3); // 全角スペース・全角数字
    expect(parseTitle('甘織れな子')).toBeNull();
  });
});

describe('caption', () => {
  it('detects link lines only when the line ends with a pixiv link', () => {
    expect(parseLinkLine('さつれな1 illust/149961440')).toEqual({ label: 'さつれな1', illustId: '149961440' });
    expect(parseLinkLine('甘織れな子＆琴紗月 キス https://www.pixiv.net/artworks/1')).toEqual({ label: '甘織れな子＆琴紗月 キス', illustId: '1' });
    expect(parseLinkLine('今日は 2')).toBeNull();
  });
  it('handles HTML captions', () => {
    const r = splitCaption('解説<br />さつれな1 <a href="/artworks/5">illust/5</a>');
    expect(r).toEqual({ description: '解説', links: [{ label: 'さつれな1', illustId: '5', line: 'さつれな1 illust/5' }] });
  });
});

describe('planImport', () => {
  const json = {
    posts: [
      { title: '甘織れな子＆琴紗月 キス 3', url: 'illust/300', caption: '三作目\n甘織れな子＆琴紗月 キス illust/100\n甘織れな子＆琴紗月 キス 2 illust/200' },
      { title: '甘織れな子＆琴紗月 キス', url: 'https://www.pixiv.net/artworks/100', caption: '一作目' },
      { title: '甘織れな子＆琴紗月 キス 2', url: '200', caption: '二作目\nさつれな1 illust/100\n昔の作品 illust/999' },
      { title: 'タイトルだけ', url: '400' },
      { title: '甘織れな子＆琴紗月 キス 4', url: 'illust/100' },
    ],
  };

  it('reproduces caption links, resolving posts in any order', () => {
    const plan = planImport(emptyData(), json, { skipExisting: false, now: 1 });
    expect([plan.newCount, plan.errorCount]).toEqual([3, 2]);
    const third = plan.rows[0].post!;
    const data = applyImport(emptyData(), plan);
    expect(buildCaption(third.description, renderLinks(data.posts, third.links!, 'short'))).toBe(
      '三作目\n甘織れな子＆琴紗月 キス illust/100\n甘織れな子＆琴紗月 キス 2 illust/200',
    );
    const second = plan.rows[2];
    expect(second.post!.description).toBe('二作目\n昔の作品 illust/999');
    expect(second.warnings.length).toBe(1);
    expect(plan.rows[0].post!.links!.length).toBe(2);
    expect(plan.rows[1].post!.links).toBeUndefined();
  });

  it('updates existing posts by illust id or skips them', () => {
    const base: AppData = applyImport(emptyData(), planImport(emptyData(), { posts: [json.posts[1]] }, { skipExisting: false }));
    const id = base.posts[0].id;
    const upd = planImport(base, { posts: [{ ...json.posts[1], caption: '書き直し' }] }, { skipExisting: false });
    expect(upd.updateCount).toBe(1);
    const after = applyImport(base, upd);
    expect(after.posts.length).toBe(1);
    expect(after.posts[0]).toMatchObject({ id, description: '書き直し' });
    expect(planImport(base, { posts: [json.posts[1]] }, { skipExisting: true }).errorCount).toBe(1);
  });

  it('accepts a bare array and fenced JSON text', () => {
    expect(planImport(emptyData(), parseJsonText('```json\n[{"title":"A＆B シチュ","url":"1"}]\n```'), { skipExisting: false }).newCount).toBe(1);
  });
});

describe('BOOTH lines in imported captions', () => {
  it('moves item links out of the description and drops the top page line', () => {
    const plan = planImport(
      emptyData(),
      { posts: [{ title: 'A＆B シチュ', url: '1', caption: '解説\n\nBOOTH https://shop.booth.pm/\n新刊 https://shop.booth.pm/items/5' }] },
      { skipExisting: false },
    );
    const p = plan.rows[0].post!;
    expect(p.description).toBe('解説');
    expect(p.booth).toEqual([{ label: '新刊', url: 'https://shop.booth.pm/items/5' }]);
  });
});
