// データモデルと純粋なロジック（保存・UIに依存しない部分）

/** キャプションに貼るリンク（見出しと、リンク先の投稿） */
export interface LinkRef {
  postId: string;
  label: string;
}

/** BOOTH の商品リンク（見出しは任意） */
export interface BoothLink {
  label: string;
  url: string;
}

export interface Post {
  id: string;
  /** キャラクター名（カップリングは複数） 例: ["甘織れな子", "琴紗月"] */
  characters: string[];
  /** シチュエーション */
  situation: string;
  /** シリーズ内の番号（1始まり） */
  number: number;
  /** 解説コメント */
  description: string;
  /** pixiv 作品ID（投稿前は空） */
  illustId: string;
  /** キャプションのリンクを手動で指定した場合のみ保存（未指定なら同じシリーズの過去分を自動で貼る） */
  links?: LinkRef[];
  /** この投稿に貼る BOOTH の個別商品リンク（任意） */
  booth?: BoothLink[];
  createdAt: number;
  updatedAt: number;
}

export interface SeriesMeta {
  /** コメント内で使う略称 例: "さつれな" */
  abbr: string;
}

export interface Settings {
  /** リンク一覧のURL形式 */
  linkFormat: 'full' | 'short';
  /** 番号1のときタイトルに「1」を付けるか */
  showNumberOne: boolean;
  /** BOOTH のトップページ（全投稿のキャプションの最後に必ず貼る） */
  boothTopUrl: string;
  /** トップページの行の見出し */
  boothTopLabel: string;
}

export interface AppData {
  version: 1;
  posts: Post[];
  series: Record<string, SeriesMeta>;
  settings: Settings;
}

export const defaultSettings: Settings = {
  linkFormat: 'full',
  showNumberOne: false,
  boothTopUrl: '',
  boothTopLabel: 'BOOTH',
};

export const emptyData = (): AppData => ({
  version: 1,
  posts: [],
  series: {},
  settings: { ...defaultSettings },
});

export const CHAR_SEPARATOR = '＆';

/** 検索・同一判定用の正規化：全角半角・大小文字・カタカナ/ひらがな・空白の違いを吸収 */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

/** 「甘織れな子＆琴紗月」→ ["甘織れな子", "琴紗月"] */
export function splitCharacters(s: string): string[] {
  return s
    .split(/[＆&]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function joinCharacters(chars: string[]): string {
  return chars.join(CHAR_SEPARATOR);
}

/** 同じキャラ（順不同）＋同じシチュエーション = 同じシリーズ */
export function seriesKey(characters: string[], situation: string): string {
  const chars = characters.map(normalize).sort().join('|');
  return `${chars}::${normalize(situation)}`;
}

/** キャラの組み合わせ（順不同）だけのキー。略称はこの単位で持つ */
export const charsKey = (characters: string[]) => characters.map(normalize).sort().join('|');

/** 略称を探す：組み合わせ単位 → 同じシリーズ → 同じ組み合わせの別シリーズ（旧データ） */
export function findAbbr(
  series: Record<string, SeriesMeta>,
  characters: string[],
  situation: string,
): string {
  if (!characters.length) return '';
  const ck = charsKey(characters);
  return (
    series[ck]?.abbr ??
    series[seriesKey(characters, situation)]?.abbr ??
    Object.entries(series).find(([k]) => k.startsWith(`${ck}::`))?.[1].abbr ??
    ''
  );
}

export const postSeriesKey = (p: Pick<Post, 'characters' | 'situation'>) =>
  seriesKey(p.characters, p.situation);

/** URL / "illust/123" / "123" などから作品IDを取り出す */
export function parseIllustId(input: string): string {
  const s = input.normalize('NFKC').trim();
  if (!s) return '';
  const m =
    s.match(/artworks\/(\d+)/) ??
    s.match(/illust_id=(\d+)/) ??
    s.match(/illust\/(\d+)/) ??
    s.match(/^(\d+)$/);
  return m ? m[1] : '';
}

export function illustUrl(id: string, format: Settings['linkFormat'] = 'full'): string {
  return format === 'short' ? `illust/${id}` : `https://www.pixiv.net/artworks/${id}`;
}

export function buildTitle(
  p: Pick<Post, 'characters' | 'situation' | 'number'>,
  settings: Settings = defaultSettings,
): string {
  const showNum = p.number > 1 || settings.showNumberOne;
  // キャラクター名・シチュエーション・番号は半角スペース区切り
  return `${joinCharacters(p.characters)} ${p.situation}${showNum ? ` ${p.number}` : ''}`;
}

/** シリーズ内の投稿（番号の小さい順） */
export function seriesPosts(posts: Post[], key: string): Post[] {
  return posts.filter((p) => postSeriesKey(p) === key).sort((a, b) => a.number - b.number);
}

export function nextNumber(posts: Post[], key: string): number {
  return seriesPosts(posts, key).reduce((max, p) => Math.max(max, p.number), 0) + 1;
}

/**
 * リンクの見出し。略称があれば「略称＋番号」（例：さつれな1）、
 * 未入力ならリンク先のタイトルそのまま（例：甘織れな子＆琴紗月 キス / 甘織れな子＆琴紗月 キス 2）
 */
export function linkLabel(
  abbr: string,
  p: Pick<Post, 'characters' | 'situation' | 'number'>,
  settings: Settings = defaultSettings,
): string {
  return abbr ? `${abbr}${p.number}` : buildTitle(p, settings);
}

/** 同じシリーズの過去分を、見出し付きで自動作成 */
export function autoLinkRefs(
  posts: Post[],
  key: string,
  beforeNumber: number,
  abbr: string,
  settings: Settings = defaultSettings,
): { refs: LinkRef[]; missing: number[] } {
  const refs: LinkRef[] = [];
  const missing: number[] = [];
  for (const p of seriesPosts(posts, key)) {
    if (p.number >= beforeNumber) continue;
    if (!p.illustId) {
      missing.push(p.number);
      continue;
    }
    refs.push({ postId: p.id, label: linkLabel(abbr, p, settings) });
  }
  return { refs, missing };
}

/** リンク指定 → キャプション用の行（URL未登録・削除済みの投稿は除く） */
export function renderLinks(posts: Post[], refs: LinkRef[], format: Settings['linkFormat']): string[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const lines: string[] = [];
  for (const r of refs) {
    const p = byId.get(r.postId);
    if (p?.illustId) lines.push(`${r.label} ${illustUrl(p.illustId, format)}`);
  }
  return lines;
}

/** 過去リンク一覧（指定番号より前の投稿すべて） */
export function buildLinkList(
  posts: Post[],
  key: string,
  beforeNumber: number,
  abbr: string,
  format: Settings['linkFormat'],
  settings: Settings = defaultSettings,
): { lines: string[]; missing: number[] } {
  const { refs, missing } = autoLinkRefs(posts, key, beforeNumber, abbr, settings);
  return { lines: renderLinks(posts, refs, format), missing };
}

/**
 * キャプション：解説 → 過去リンク → （1行空けて）BOOTH のリンク
 */
export function buildCaption(description: string, linkLines: string[], boothLines: string[] = []): string {
  const main = [description.trimEnd(), ...linkLines].filter(Boolean).join('\n');
  if (!boothLines.length) return main;
  return main ? `${main}\n\n${boothLines.join('\n')}` : boothLines.join('\n');
}

const boothLine = (label: string, url: string) => (label.trim() ? `${label.trim()} ${url.trim()}` : url.trim());

/** BOOTH の行：トップページ（設定にあれば必ず）→ この投稿の個別商品 */
export function buildBoothLines(settings: Settings, items: BoothLink[] = []): string[] {
  const lines: string[] = [];
  if (settings.boothTopUrl.trim()) lines.push(boothLine(settings.boothTopLabel, settings.boothTopUrl));
  for (const it of items) if (it.url.trim()) lines.push(boothLine(it.label, it.url));
  return lines;
}

const BOOTH_URL = /(https?:\/\/(?:[\w-]+\.)?booth\.pm\S*)/;

/** URL が BOOTH のショップのトップページ（https://xxx.booth.pm/）か */
export function isBoothTop(url: string): boolean {
  try {
    const u = new URL(url);
    return /\.booth\.pm$/.test(u.hostname) && u.hostname !== 'www.booth.pm' && (u.pathname === '/' || u.pathname === '');
  } catch {
    return false;
  }
}

/**
 * 解説文から BOOTH の行を取り出す（取り込んだ過去のキャプション用）
 * トップページの行は捨て（設定のものを貼るため）、個別商品の行は商品リンクに移す
 */
export function extractBooth(description: string): { description: string; items: BoothLink[]; top?: BoothLink } {
  const keep: string[] = [];
  const items: BoothLink[] = [];
  let top: BoothLink | undefined;
  for (const line of description.split('\n')) {
    const m = line.match(BOOTH_URL);
    if (!m) {
      keep.push(line);
      continue;
    }
    const url = m[1];
    const label = line.replace(url, '').trim();
    if (isBoothTop(url)) top ??= { label, url };
    else items.push({ label, url });
  }
  return { description: keep.join('\n').trim(), items, top };
}

/** 新しい順：未投稿（URL未登録）を先頭、その後は作品IDの大きい順 */
export function compareNewest(a: Post, b: Post): number {
  if (!a.illustId || !b.illustId) {
    if (!a.illustId && !b.illustId) return b.createdAt - a.createdAt;
    return a.illustId ? 1 : -1;
  }
  const d = Number(b.illustId) - Number(a.illustId);
  return d !== 0 ? d : b.number - a.number;
}

const charMatch = (p: Post, q: string) => p.characters.some((c) => normalize(c).includes(q));
const sitMatch = (p: Post, q: string) => normalize(p.situation).includes(q);

export type SearchMode = 'character' | 'situation' | 'both';

/**
 * 検索（部分一致・新しい順）
 * - character: キャラ名のみ（カップリングは片方の名前でもヒット）
 * - situation: シチュエーションのみ
 * - both: キャラ名 AND シチュエーション
 */
export function search(posts: Post[], mode: SearchMode, charQ: string, sitQ: string): Post[] {
  const c = normalize(charQ);
  const s = normalize(sitQ);
  return posts
    .filter((p) => {
      if (mode === 'character') return !c || charMatch(p, c);
      if (mode === 'situation') return !s || sitMatch(p, s);
      return (!c || charMatch(p, c)) && (!s || sitMatch(p, s));
    })
    .sort(compareNewest);
}

/**
 * まとめて登録用：「さつれな1 illust/149961440」形式の行を読み取る
 * 戻り値は番号と作品IDの組
 */
export function parseBulkLines(text: string): { number: number; illustId: string }[] {
  const out: { number: number; illustId: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.normalize('NFKC').trim();
    if (!line) continue;
    const m = line.match(/^(.*?)(\d+)\s+(\S+)$/);
    if (!m) continue;
    const id = parseIllustId(m[3]);
    if (id) out.push({ number: Number(m[2]), illustId: id });
  }
  return out;
}

export function uniqueCharacters(posts: Post[]): string[] {
  return [...new Set(posts.flatMap((p) => p.characters))].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function uniqueCharacterSets(posts: Post[]): string[] {
  return [...new Set(posts.map((p) => joinCharacters(p.characters)))].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  );
}

export function uniqueSituations(posts: Post[]): string[] {
  return [...new Set(posts.map((p) => p.situation))].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** 手動リンクを解除して自動リンクに戻す。onlyEmpty なら、リンク0件で固定されている投稿だけ */
export function resetLinksToAuto(data: AppData, onlyEmpty: boolean): { data: AppData; count: number } {
  let count = 0;
  const now = Date.now();
  const posts = data.posts.map((p) => {
    if (!p.links || (onlyEmpty && p.links.length)) return p;
    count++;
    const { links: _drop, ...rest } = p;
    return { ...rest, updatedAt: now };
  });
  return { data: { ...data, posts }, count };
}

/** 登録済みの解説文に残っている BOOTH の行を整理する（個別商品は商品リンクへ移し、トップページの行は消す） */
export function moveBoothLines(data: AppData): { data: AppData; count: number } {
  let count = 0;
  const now = Date.now();
  const posts = data.posts.map((p) => {
    const r = extractBooth(p.description);
    if (r.description === p.description.trim() && !r.items.length && !r.top) return p;
    count++;
    const booth = [...(p.booth ?? []), ...r.items.filter((it) => !p.booth?.some((b) => b.url === it.url))];
    return { ...p, description: r.description, booth: booth.length ? booth : undefined, updatedAt: now };
  });
  return { data: { ...data, posts }, count };
}

/** バックアップ読み込み時の検証 */
export function validateData(raw: unknown): AppData {
  const d = raw as Partial<AppData>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.posts)) {
    throw new Error('バックアップファイルの形式が正しくありません');
  }
  const posts: Post[] = d.posts.map((p: Partial<Post>, i) => {
    if (!Array.isArray(p.characters) || typeof p.situation !== 'string') {
      throw new Error(`${i + 1}件目のデータが壊れています`);
    }
    return {
      id: String(p.id ?? crypto.randomUUID()),
      characters: p.characters.map(String),
      situation: p.situation,
      number: Number(p.number) || 1,
      description: String(p.description ?? ''),
      illustId: String(p.illustId ?? ''),
      booth: Array.isArray(p.booth)
        ? p.booth.map((b) => ({ label: String(b.label ?? ''), url: String(b.url ?? '') }))
        : undefined,
      links: Array.isArray(p.links)
        ? p.links.map((l) => ({ postId: String(l.postId), label: String(l.label ?? '') }))
        : undefined,
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    };
  });
  return {
    version: 1,
    posts,
    series: d.series && typeof d.series === 'object' ? d.series : {},
    settings: { ...defaultSettings, ...(d.settings ?? {}) },
  };
}
