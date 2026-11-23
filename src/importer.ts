// 過去の投稿の一括取り込み（muse などでまとめた JSON から）
import {
  AppData,
  LinkRef,
  Post,
  parseIllustId,
  postSeriesKey,
  addToCatalog,
  extractBooth,
  splitCharacters,
} from './model';

/** JSON の1件分（title と url は必須） */
export interface ImportItem {
  title?: unknown;
  url?: unknown;
  caption?: unknown;
  postedAt?: unknown;
  characters?: unknown;
  situation?: unknown;
  number?: unknown;
}

export interface ImportRow {
  /** JSON 内の順番（1始まり） */
  index: number;
  title: string;
  status: 'new' | 'update' | 'error';
  /** status が error 以外のとき、取り込まれる投稿 */
  post?: Post;
  errors: string[];
  warnings: string[];
}

export interface ImportPlan {
  rows: ImportRow[];
  newCount: number;
  updateCount: number;
  errorCount: number;
}

/** 「キャラ名 シチュ 番号」を分解。番号が無ければ1 */
export function parseTitle(
  title: string,
): { characters: string[]; situation: string; number: number } | null {
  const tokens = title.normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  let number = 1;
  if (tokens.length >= 3 && /^\d+$/.test(tokens[tokens.length - 1])) {
    number = Number(tokens.pop());
  }
  const characters = splitCharacters(tokens[0]);
  const situation = tokens.slice(1).join(' ');
  if (!characters.length || !situation) return null;
  return { characters, situation, number };
}

/** pixiv の API などから来た HTML 混じりのキャプションを素の文字に */
export function cleanCaption(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

const LINK_TAIL =
  /^(.*?)\s*((?:https?:\/\/)?(?:www\.)?pixiv\.net\/(?:en\/)?artworks\/\d+\S*|\S*illust_id=\d+\S*|illust\/\d+)\s*$/;

/** 行末が pixiv の作品リンクになっている行なら、見出しと作品IDを返す */
export function parseLinkLine(line: string): { label: string; illustId: string } | null {
  // 見出しは元の文字のまま残す（＆などを半角に変えない）
  const m = line.trim().match(LINK_TAIL);
  if (!m) return null;
  const illustId = parseIllustId(m[2]);
  return illustId ? { label: m[1].trim(), illustId } : null;
}

/** キャプションを、解説文とリンク行に分ける */
export function splitCaption(caption: string): {
  description: string;
  links: { label: string; illustId: string; line: string }[];
} {
  const desc: string[] = [];
  const links: { label: string; illustId: string; line: string }[] = [];
  for (const line of cleanCaption(caption).split('\n')) {
    const l = parseLinkLine(line);
    if (l) links.push({ ...l, line: line.trim() });
    else desc.push(line);
  }
  return { description: desc.join('\n').trim(), links };
}

function parseItems(raw: unknown): ImportItem[] {
  const list = Array.isArray(raw) ? raw : (raw as { posts?: unknown })?.posts;
  if (!Array.isArray(list)) throw new Error('JSON に投稿の一覧（posts）が見つかりません');
  return list as ImportItem[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * 取り込み内容を確認用に組み立てる（データはまだ変更しない）
 * - 作品IDが既にある投稿は update（skipExisting なら error 扱いで飛ばす）
 * - キャプションのリンク行は、そのまま手動リンクとして再現
 */
export function planImport(
  data: AppData,
  raw: unknown,
  opts: { skipExisting: boolean; now?: number },
): ImportPlan {
  const items = parseItems(raw);
  const now = opts.now ?? Date.now();
  const byIllust = new Map(data.posts.filter((p) => p.illustId).map((p) => [p.illustId, p]));
  const seenIllust = new Map<string, number>();
  const rows: ImportRow[] = [];
  const captions = new Map<ImportRow, ReturnType<typeof splitCaption> | null>();

  // 1回目：各投稿を組み立てる（リンク先の解決は全件そろってから）
  items.forEach((it, i) => {
    const title = str(it?.title).trim();
    const row: ImportRow = { index: i + 1, title: title || '（タイトルなし）', status: 'new', errors: [], warnings: [] };
    rows.push(row);

    const override =
      Array.isArray(it?.characters) && typeof it?.situation === 'string'
        ? {
            characters: (it.characters as unknown[]).map(str).map((c) => c.trim()).filter(Boolean),
            situation: (it.situation as string).trim(),
            number: Number(it.number) || 1,
          }
        : null;
    const parsed = override ?? (title ? parseTitle(title) : null);
    if (!parsed || !parsed.characters.length || !parsed.situation) {
      row.errors.push('タイトルを「キャラ名 シチュ 番号」に分けられません');
    }

    const illustId = parseIllustId(str(it?.url));
    if (!illustId) row.errors.push('URLから作品IDを読み取れません');
    else if (seenIllust.has(illustId)) {
      row.errors.push(`${seenIllust.get(illustId)}件目と同じ作品です`);
    } else seenIllust.set(illustId, row.index);

    if (row.errors.length || !parsed) {
      row.status = 'error';
      return;
    }

    const existing = byIllust.get(illustId);
    if (existing && opts.skipExisting) {
      row.status = 'error';
      row.errors.push('登録済みのため飛ばします');
      return;
    }
    row.status = existing ? 'update' : 'new';

    const postedAt = Date.parse(str(it?.postedAt));
    const cap = typeof it?.caption === 'string' ? splitCaption(it.caption) : null;
    captions.set(row, cap);
    // BOOTH の行は解説文から外す（トップページは設定のものを貼る、個別商品は商品リンクへ）
    const booth = cap ? extractBooth(cap.description) : null;
    if (cap && booth) cap.description = booth.description;

    row.post = {
      id: existing?.id ?? crypto.randomUUID(),
      characters: parsed.characters,
      situation: parsed.situation,
      number: parsed.number,
      description: cap ? cap.description : existing?.description ?? '',
      illustId,
      links: existing?.links,
      booth: booth ? (booth.items.length ? booth.items : undefined) : existing?.booth,
      createdAt: Number.isFinite(postedAt) ? postedAt : existing?.createdAt ?? now - (items.length - i),
      updatedAt: now,
    };
  });

  // シリーズ内の番号の重複チェック
  const ok = rows.filter((r) => r.post);
  const importIds = new Set(ok.map((r) => r.post!.id));
  const slot = new Map<string, ImportRow>();
  for (const r of ok) {
    const k = `${postSeriesKey(r.post!)}#${r.post!.number}`;
    const dup = slot.get(k);
    if (dup) r.warnings.push(`${dup.index}件目と同じシリーズ・同じ番号です`);
    else slot.set(k, r);
    const clash = data.posts.find(
      (p) => !importIds.has(p.id) && postSeriesKey(p) === postSeriesKey(r.post!) && p.number === r.post!.number,
    );
    if (clash) r.warnings.push('同じシリーズ・同じ番号の投稿が既に登録されています');
  }

  // 2回目：キャプションのリンク行を、取り込む投稿・登録済みの投稿に結び付ける
  const target = new Map<string, Post>(byIllust);
  for (const r of ok) target.set(r.post!.illustId, r.post!);
  for (const r of ok) {
    const cap = captions.get(r);
    if (!cap) continue; // キャプションなし：リンクは今の設定のまま（新規なら自動）
    const links: LinkRef[] = [];
    const unknown: string[] = [];
    for (const l of cap.links) {
      const p = target.get(l.illustId);
      if (p && p.id !== r.post!.id) links.push({ postId: p.id, label: l.label });
      else unknown.push(l.line);
    }
    if (unknown.length) {
      r.post!.description = [r.post!.description, ...unknown].filter(Boolean).join('\n');
      r.warnings.push(`リンク先が見つからない行 ${unknown.length}件 を解説文に残しました`);
    }
    // リンク行が1つも無ければ自動リンク（同じシリーズの過去分）にする
    r.post!.links = links.length ? links : undefined;
  }

  return {
    rows,
    newCount: rows.filter((r) => r.status === 'new').length,
    updateCount: rows.filter((r) => r.status === 'update').length,
    errorCount: rows.filter((r) => r.status === 'error').length,
  };
}

/** 確認済みの内容をデータに反映（error の行は取り込まない） */
export function applyImport(data: AppData, plan: ImportPlan): AppData {
  const incoming = new Map(plan.rows.filter((r) => r.post).map((r) => [r.post!.id, r.post!]));
  const posts = data.posts.map((p) => incoming.get(p.id) ?? p);
  const existingIds = new Set(data.posts.map((p) => p.id));
  for (const p of incoming.values()) if (!existingIds.has(p.id)) posts.push(p);
  return { ...data, posts, boothCatalog: addToCatalog(data.boothCatalog ?? [], [...incoming.values()]) };
}

/** JSON 文字列を読む（コードブロックの ``` で囲まれていても可） */
export function parseJsonText(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    throw new Error('JSON として読み取れません。muse の出力をそのまま貼り付けてください');
  }
}

