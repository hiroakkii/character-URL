import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppData,
  LinkRef,
  Post,
  SearchMode,
  autoLinkRefs,
  buildCaption,
  buildLinkList,
  charsKey,
  findAbbr,
  buildTitle,
  compareNewest,
  illustUrl,
  joinCharacters,
  linkLabel,
  nextNumber,
  normalize,
  parseBulkLines,
  parseIllustId,
  postSeriesKey,
  renderLinks,
  search,
  seriesKey,
  seriesPosts,
  splitCharacters,
  uniqueCharacterSets,
  uniqueCharacters,
  uniqueSituations,
  validateData,
} from './model';
import { copyText, useAppData } from './store';

type View =
  | { name: 'search' }
  | { name: 'edit'; postId?: string; preset?: { characters: string[]; situation: string } }
  | { name: 'series'; key: string }
  | { name: 'settings' };

type Update = (fn: (d: AppData) => AppData) => void;

export default function App() {
  const { data, update, replace } = useAppData();
  const [view, setView] = useState<View>({ name: 'search' });
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const copy = async (text: string, label: string) => {
    setToast((await copyText(text)) ? `${label}をコピーしました` : 'コピーに失敗しました');
  };

  return (
    <div className="app">
      <main>
        {view.name === 'search' && <SearchView data={data} setView={setView} copy={copy} />}
        {view.name === 'edit' && (
          <EditView
            key={view.postId ?? 'new'}
            data={data}
            update={update}
            postId={view.postId}
            preset={view.preset}
            setView={setView}
            copy={copy}
            notify={setToast}
          />
        )}
        {view.name === 'series' && (
          <SeriesView data={data} update={update} seriesKeyValue={view.key} setView={setView} copy={copy} notify={setToast} />
        )}
        {view.name === 'settings' && <SettingsView data={data} update={update} replace={replace} notify={setToast} />}
      </main>

      {toast && <div className="toast">{toast}</div>}

      <nav className="tabbar">
        <button className={view.name === 'search' || view.name === 'series' ? 'on' : ''} onClick={() => setView({ name: 'search' })}>
          <IconSearch />検索
        </button>
        <button className={view.name === 'edit' && !view.postId ? 'on' : ''} onClick={() => setView({ name: 'edit' })}>
          <IconPlus />新規投稿
        </button>
        <button className={view.name === 'settings' ? 'on' : ''} onClick={() => setView({ name: 'settings' })}>
          <IconGear />設定
        </button>
      </nav>
    </div>
  );
}

/* ---------------- 検索 ---------------- */

const SEARCH_STATE_KEY = 'character-url:search';

function SearchView({ data, setView, copy }: { data: AppData; setView: (v: View) => void; copy: (t: string, l: string) => void }) {
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY) ?? '{}');
    } catch {
      return {};
    }
  })();
  const [mode, setMode] = useState<SearchMode>(saved.mode ?? 'character');
  const [q, setQ] = useState<string>(saved.q ?? '');
  const [cq, setCq] = useState<string>(saved.cq ?? '');
  const [sq, setSq] = useState<string>(saved.sq ?? '');

  useEffect(() => {
    try {
      sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ mode, q, cq, sq }));
    } catch {
      /* ignore */
    }
  }, [mode, q, cq, sq]);

  const results = useMemo(
    () =>
      mode === 'both'
        ? search(data.posts, 'both', cq, sq)
        : search(data.posts, mode, mode === 'character' ? q : '', mode === 'situation' ? q : ''),
    [data.posts, mode, q, cq, sq],
  );

  const chars = useMemo(() => uniqueCharacters(data.posts), [data.posts]);
  const sits = useMemo(() => uniqueSituations(data.posts), [data.posts]);

  return (
    <section>
      <div className="searchbar">
        <div className="seg" role="tablist" aria-label="検索方法">
          <button className={mode === 'character' ? 'on' : ''} onClick={() => setMode('character')}>
            キャラ名
          </button>
          <button className={mode === 'situation' ? 'on' : ''} onClick={() => setMode('situation')}>
            シチュ
          </button>
          <button className={mode === 'both' ? 'on' : ''} onClick={() => setMode('both')}>
            キャラ＋シチュ
          </button>
        </div>

        {mode === 'both' ? (
          <div className="pair">
            <input type="search" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="キャラ名　例：琴紗月" list="dl-chars" aria-label="キャラクター名" />
            <input type="search" value={sq} onChange={(e) => setSq(e.target.value)} placeholder="シチュ　例：攻守逆" list="dl-sits" aria-label="シチュエーション" />
          </div>
        ) : (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === 'character' ? 'キャラ名で検索　例：琴紗月' : 'シチュエーションで検索　例：攻守逆'}
            list={mode === 'character' ? 'dl-chars' : 'dl-sits'}
            aria-label={mode === 'character' ? 'キャラクター名' : 'シチュエーション'}
          />
        )}
      </div>
      <datalist id="dl-chars">{chars.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-sits">{sits.map((s) => <option key={s} value={s} />)}</datalist>


      <p className="muted">{results.length}件・新しい順</p>

      {data.posts.length === 0 && (
        <div className="empty">
          まだ投稿がありません。
          <br />
          下の「＋新規投稿」から登録してください。
        </div>
      )}

      <ul className="list">
        {results.map((p) => (
          <PostCard key={p.id} post={p} data={data} setView={setView} copy={copy} />
        ))}
      </ul>
    </section>
  );
}

function PostCard({ post, data, setView, copy }: { post: Post; data: AppData; setView: (v: View) => void; copy: (t: string, l: string) => void }) {
  const title = buildTitle(post, data.settings);
  const url = post.illustId ? illustUrl(post.illustId) : '';
  return (
    <li className="post">
      <div className="post-title">{title}</div>
      <div className="post-meta">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {url.replace('https://www.', '')}
          </a>
        ) : (
          <span className="badge">URL未登録</span>
        )}
        <span className="date">{new Date(post.createdAt).toLocaleDateString('ja-JP')}</span>
      </div>
      {post.description && <p className="post-desc">{post.description}</p>}
      <div className="actions">
        <button className="act" onClick={() => copy(title, 'タイトル')}>タイトルをコピー</button>
        {url && <button className="act" onClick={() => copy(url, 'URL')}>URLをコピー</button>}
      </div>
      <div className="actions subs">
        <button className="sub" onClick={() => setView({ name: 'series', key: postSeriesKey(post) })}>シリーズを見る</button>
        <button className="sub" onClick={() => setView({ name: 'edit', postId: post.id })}>編集</button>
      </div>
    </li>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

/* ---------------- 登録・編集 ---------------- */

function EditView({
  data,
  update,
  postId,
  preset,
  setView,
  copy,
  notify,
}: {
  data: AppData;
  update: Update;
  postId?: string;
  preset?: { characters: string[]; situation: string };
  setView: (v: View) => void;
  copy: (t: string, l: string) => void;
  notify: (m: string) => void;
}) {
  const existing = postId ? data.posts.find((p) => p.id === postId) : undefined;
  const others = useMemo(() => data.posts.filter((p) => p.id !== postId), [data.posts, postId]);

  const [charsText, setCharsText] = useState(joinCharacters(existing?.characters ?? preset?.characters ?? []));
  const [situation, setSituation] = useState(existing?.situation ?? preset?.situation ?? '');
  const [numberText, setNumberText] = useState(existing ? String(existing.number) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [urlText, setUrlText] = useState(existing?.illustId ? illustUrl(existing.illustId) : '');
  const [abbrText, setAbbrText] = useState<string | null>(null);
  const [pastText, setPastText] = useState('');
  const [showPast, setShowPast] = useState(false);
  // null = 同じシリーズの過去分を自動で貼る / 配列 = 手動で指定した一覧
  const [manualLinks, setManualLinks] = useState<LinkRef[] | null>(existing?.links ?? null);
  const [picking, setPicking] = useState(false);
  const newIds = useRef(new Map<string, string>());

  const characters = splitCharacters(charsText);
  const key = seriesKey(characters, situation);

  // 貼り付けた過去作（保存時に一緒に登録される）。同じ番号が既にあればURLを上書き
  const pending = useMemo(() => {
    const byNumber = new Map<number, string>();
    for (const it of parseBulkLines(pastText)) byNumber.set(it.number, it.illustId);
    return [...byNumber].map(([number, illustId]) => {
      // 既存の投稿を上書きする場合はその id、新規なら（再計算しても変わらない）新しい id
      const old = others.find((p) => postSeriesKey(p) === key && p.number === number);
      const nk = `${key}|${number}`;
      if (!old && !newIds.current.has(nk)) newIds.current.set(nk, crypto.randomUUID());
      return { id: old?.id ?? newIds.current.get(nk)!, number, illustId };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastText, others, key]);
  const pool = useMemo<Post[]>(() => {
    if (!pending.length) return others;
    const nums = new Set(pending.map((p) => p.number));
    const kept = others.filter((p) => !(postSeriesKey(p) === key && nums.has(p.number)));
    const now = Date.now();
    const virtual: Post[] = pending.map((it) => ({
      id: it.id,
      characters,
      situation,
      number: it.number,
      description: '',
      illustId: it.illustId,
      createdAt: now,
      updatedAt: now,
    }));
    return [...kept, ...virtual];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others, pending, key]);

  const autoNumber = nextNumber(pool, key);
  const number = numberText ? Math.max(1, Number(numberText) || 1) : existing ? existing.number : autoNumber;
  const seriesCount = seriesPosts(pool, key).length;
  const abbr = abbrText ?? findAbbr(data.series, characters, situation);
  const illustId = parseIllustId(urlText);
  const urlInvalid = urlText.trim() !== '' && !illustId;
  const duplicate = pool.find((p) => postSeriesKey(p) === key && p.number === number);

  const auto = useMemo(() => autoLinkRefs(pool, key, number, abbr), [pool, key, number, abbr]);
  const links: LinkRef[] = manualLinks ?? auto.refs;
  const missing = manualLinks ? [] : auto.missing;
  const lines = renderLinks(pool, links, data.settings.linkFormat);
  const postById = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  // 一覧を編集すると、その時点の内容で固定される（自動に戻すこともできる）
  const editLinks = (fn: (cur: LinkRef[]) => LinkRef[]) => setManualLinks(fn(links.map((l) => ({ ...l }))));
  const title = characters.length && situation ? buildTitle({ characters, situation, number }, data.settings) : '';
  const caption = buildCaption(description, lines);
  const canSave = characters.length > 0 && situation.trim() !== '' && !urlInvalid;

  const charSets = useMemo(() => uniqueCharacterSets(data.posts), [data.posts]);
  const sits = useMemo(() => uniqueSituations(data.posts), [data.posts]);

  const save = () => {
    if (!canSave) return;
    const now = Date.now();
    const post: Post = {
      id: existing?.id ?? crypto.randomUUID(),
      characters,
      situation: situation.trim(),
      number,
      description,
      illustId,
      links: manualLinks ?? undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    update((d) => {
      let posts = existing ? d.posts.map((p) => (p.id === post.id ? post : p)) : [...d.posts, post];
      pending.forEach((it, i) => {
        const idx = posts.findIndex((p) => p.id !== post.id && postSeriesKey(p) === key && p.number === it.number);
        if (idx >= 0) posts[idx] = { ...posts[idx], illustId: it.illustId, updatedAt: now };
        else
          posts = [
            ...posts,
            {
              id: it.id,
              characters,
              situation: situation.trim(),
              number: it.number,
              description: '',
              illustId: it.illustId,
              createdAt: now - (pending.length - i) - 1,
              updatedAt: now,
            },
          ];
      });
      return { ...d, posts, series: abbr ? { ...d.series, [charsKey(characters)]: { abbr } } : d.series };
    });
    notify(existing ? '更新しました' : '保存しました');
    setView({ name: 'series', key });
  };

  const remove = () => {
    if (!existing || !confirm(`「${buildTitle(existing, data.settings)}」を削除しますか？`)) return;
    update((d) => ({ ...d, posts: d.posts.filter((p) => p.id !== existing.id) }));
    notify('削除しました');
    setView({ name: 'search' });
  };

  return (
    <section>
      <h1>{existing ? '投稿を編集' : '新規投稿'}</h1>
      <div className="card">
        <label>キャラクター名</label>
        <input
          value={charsText}
          onChange={(e) => setCharsText(e.target.value)}
          placeholder="例：甘織れな子＆琴紗月"
          list="dl-charsets"
        />
        <p className="hint">カップリングは「＆」で区切ります（どちらの名前でも検索できます）</p>
        <datalist id="dl-charsets">{charSets.map((c) => <option key={c} value={c} />)}</datalist>

        <label>シチュエーション</label>
        <input value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="例：攻守逆" list="dl-sits2" />
        <datalist id="dl-sits2">{sits.map((s) => <option key={s} value={s} />)}</datalist>

        {characters.length > 0 && situation && (
          <p className={`hint ${seriesCount ? 'ok' : ''}`}>
            {seriesCount ? `既存シリーズ：${seriesCount}件登録済み` : '新しいシリーズになります'}
          </p>
        )}

        <div className="grid2">
          <div>
            <label>番号</label>
            <input
              inputMode="numeric"
              value={numberText}
              onChange={(e) => setNumberText(e.target.value.replace(/[^\d０-９]/g, '').normalize('NFKC'))}
              placeholder={String(existing ? existing.number : autoNumber)}
            />
          </div>
          <div>
            <label>コメント用の略称（任意）</label>
            <input value={abbr} onChange={(e) => setAbbrText(e.target.value)} placeholder="未入力：キャラ名 シチュ" />
            <p className="hint">空欄なら「キャラ名 シチュ 番号」で貼ります</p>
          </div>
        </div>
        {duplicate && <p className="hint warn">このシリーズには既に番号{number}があります</p>}

        <label>解説コメント</label>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例：前回の攻守逆バージョン" />

        <label>pixiv URL（投稿後に貼り付け）</label>
        <input
          inputMode="url"
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder="https://www.pixiv.net/artworks/…"
        />
        {urlInvalid && <p className="hint warn">作品IDを読み取れません</p>}
        {illustId && <p className="hint ok">作品ID：{illustId}</p>}

        <button className="link" onClick={() => setShowPast((v) => !v)}>
          {showPast ? '▾' : '▸'} 過去の投稿も登録する{pending.length ? `（${pending.length}件）` : ''}
        </button>
        {showPast && (
          <>
            <p className="hint">
              このアプリに未登録の過去作を、1行に「略称＋番号 URL」で貼り付けます。保存時に一緒に登録され、番号は続きから自動で入ります。
            </p>
            <textarea
              rows={4}
              value={pastText}
              onChange={(e) => setPastText(e.target.value)}
              placeholder={'さつれな1 illust/149961440\nさつれな2 illust/149992313\nさつれな3 illust/151689661'}
            />
          </>
        )}
      </div>

      <h2>キャプションに貼るリンク</h2>
      <LinkEditor
        links={links}
        manual={manualLinks !== null}
        posts={data.posts}
        postById={postById}
        selfId={existing?.id}
        characters={characters}
        abbr={abbr}
        picking={picking}
        setPicking={setPicking}
        editLinks={editLinks}
        resetAuto={() => setManualLinks(null)}
        settings={data.settings}
      />

      <h2>pixivに貼り付ける内容</h2>
      <div className="card">
        <div className="out-head">
          <span>タイトル</span>
          <button disabled={!title} onClick={() => copy(title, 'タイトル')}>コピー</button>
        </div>
        <pre className="out">{title || '（キャラクター名とシチュエーションを入力）'}</pre>

        <div className="out-head">
          <span>キャプション</span>
          <button disabled={!caption} onClick={() => copy(caption, 'キャプション')}>コピー</button>
        </div>
        <pre className="out">{caption || '（解説と過去リンクがここに入ります）'}</pre>
        {missing.length > 0 && <p className="hint warn">番号 {missing.join('・')} はURL未登録のためリンクに含まれていません</p>}
      </div>

      <button className="primary" disabled={!canSave} onClick={save}>
        {existing ? '更新する' : '保存する'}
      </button>
      {existing && (
        <button className="danger" onClick={remove}>
          削除する
        </button>
      )}
    </section>
  );
}

/* ---------------- キャプションのリンク指定 ---------------- */

function LinkEditor({
  links,
  manual,
  posts,
  postById,
  selfId,
  characters,
  abbr,
  picking,
  setPicking,
  editLinks,
  resetAuto,
  settings,
}: {
  links: LinkRef[];
  manual: boolean;
  posts: Post[];
  postById: Map<string, Post>;
  selfId?: string;
  characters: string[];
  abbr: string;
  picking: boolean;
  setPicking: (v: boolean) => void;
  editLinks: (fn: (cur: LinkRef[]) => LinkRef[]) => void;
  resetAuto: () => void;
  settings: AppData['settings'];
}) {
  const [q, setQ] = useState('');
  // 並べ替え・追加・削除のあと、「略称＋数字」の見出しは並び順に合わせて振り直す（自由に書き換えた見出しはそのまま）
  const renumber = (cur: LinkRef[]) =>
    cur.map((l, i) => {
      const m = l.label.match(/^(.*?)(\d+)$/);
      return abbr && m && m[1] === abbr ? { ...l, label: `${abbr}${i + 1}` } : l;
    });
  const move = (i: number, d: number) =>
    editLinks((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      return renumber(cur);
    });

  const candidates = useMemo(() => {
    if (!picking) return [];
    const used = new Set(links.map((l) => l.postId));
    const nq = normalize(q);
    const mine = new Set(characters.map(normalize));
    const shares = (p: Post) => p.characters.some((c) => mine.has(normalize(c)));
    return posts
      .filter((p) => p.id !== selfId && p.illustId && !used.has(p.id))
      .filter((p) => !nq || normalize(`${p.characters.join('')}${p.situation}`).includes(nq))
      .sort((a, b) => Number(shares(b)) - Number(shares(a)) || compareNewest(a, b))
      .slice(0, 40);
  }, [picking, posts, links, q, selfId, characters]);

  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>
        {manual
          ? '手動で指定した一覧です。見出しは自由に書き換えられます。'
          : '同じシリーズの過去分を自動で入れています。追加・削除・並べ替え・見出しの変更をすると、その内容で固定されます。'}
      </p>

      {links.length === 0 && <p className="muted">リンクはまだありません。</p>}
      <ul className="links">
        {links.map((l, i) => {
          const p = postById.get(l.postId) ?? posts.find((x) => x.id === l.postId);
          return (
            <li key={l.postId}>
              <input
                value={l.label}
                aria-label="見出し"
                onChange={(e) => editLinks((cur) => cur.map((c, k) => (k === i ? { ...c, label: e.target.value } : c)))}
              />
              <div className="links-target">
                {p ? buildTitle(p, settings) : '（削除された投稿）'}
                {p && !p.illustId && <span className="badge">　URL未登録</span>}
              </div>
              <div className="links-ctl">
                <button aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button aria-label="下へ" disabled={i === links.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button aria-label="削除" onClick={() => editLinks((cur) => renumber(cur.filter((_, k) => k !== i)))}>×</button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="row">
        <button onClick={() => setPicking(!picking)}>{picking ? '閉じる' : '＋ 別の投稿のリンクを追加'}</button>
        {manual && <button onClick={resetAuto}>自動に戻す</button>}
      </div>

      {picking && (
        <div className="picker">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="キャラ名・シチュで絞り込み" aria-label="絞り込み" />
          <p className="hint">同じキャラの投稿が上に、その中は新しい順です（URL登録済みのみ）。</p>
          <ul className="list">
            {candidates.map((p) => (
              <li key={p.id} className="pick">
                <span>{buildTitle(p, settings)}</span>
                <button
                  onClick={() =>
                    editLinks((cur) =>
                      renumber([...cur, { postId: p.id, label: abbr ? `${abbr}${cur.length + 1}` : linkLabel('', p) }]),
                    )
                  }
                >
                  追加
                </button>
              </li>
            ))}
            {candidates.length === 0 && <li className="muted">追加できる投稿がありません。</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------------- シリーズ ---------------- */

function SeriesView({
  data,
  update,
  seriesKeyValue: key,
  setView,
  copy,
  notify,
}: {
  data: AppData;
  update: Update;
  seriesKeyValue: string;
  setView: (v: View) => void;
  copy: (t: string, l: string) => void;
  notify: (m: string) => void;
}) {
  const posts = seriesPosts(data.posts, key);
  const [abbr, setAbbr] = useState(posts[0] ? findAbbr(data.series, posts[0].characters, posts[0].situation) : '');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  if (!posts.length) {
    return (
      <section>
        <h1>シリーズ</h1>
        <div className="empty">このシリーズの投稿はありません。</div>
      </section>
    );
  }
  const first = posts[0];
  const { lines } = buildLinkList(data.posts, key, Infinity, abbr, data.settings.linkFormat);

  const saveAbbr = () => {
    update((d) => ({ ...d, series: { ...d.series, [charsKey(first.characters)]: { abbr: abbr.trim() } } }));
    notify('略称を保存しました');
  };

  const importBulk = () => {
    const items = parseBulkLines(bulk);
    if (!items.length) {
      notify('読み取れる行がありません');
      return;
    }
    const now = Date.now();
    update((d) => {
      const list = [...d.posts];
      items.forEach((it, i) => {
        const idx = list.findIndex((p) => postSeriesKey(p) === key && p.number === it.number);
        if (idx >= 0) list[idx] = { ...list[idx], illustId: it.illustId, updatedAt: now };
        else
          list.push({
            id: crypto.randomUUID(),
            characters: first.characters,
            situation: first.situation,
            number: it.number,
            description: '',
            illustId: it.illustId,
            createdAt: now - (items.length - i),
            updatedAt: now,
          });
      });
      return { ...d, posts: list };
    });
    setBulk('');
    setShowBulk(false);
    notify(`${items.length}件を登録しました`);
  };

  return (
    <section>
      <button className="link" onClick={() => setView({ name: 'search' })}>
        ‹ 検索に戻る
      </button>
      <h1>{joinCharacters(first.characters)} {first.situation}</h1>

      <div className="card">
        <label>コメント用の略称（任意）</label>
        <div className="row nowrap">
          <input value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder="未入力：キャラ名 シチュ" />
          <button onClick={saveAbbr}>保存</button>
        </div>
      </div>

      <button
        className="primary"
        onClick={() => setView({ name: 'edit', preset: { characters: first.characters, situation: first.situation } })}
      >
        ＋ 続き（{nextNumber(data.posts, key)}）を作成
      </button>

      <div className="card">
        <div className="out-head">
          <span>リンク一覧（全{lines.length}件）</span>
          <button disabled={!lines.length} onClick={() => copy(lines.join('\n'), 'リンク一覧')}>コピー</button>
        </div>
        <pre className="out">{lines.join('\n') || '（URL登録済みの投稿がありません）'}</pre>
      </div>

      <h2>投稿（新しい順）</h2>
      <ul className="list">
        {[...posts].reverse().map((p) => (
          <PostCard key={p.id} post={p} data={data} setView={setView} copy={copy} />
        ))}
      </ul>

      <button className="link" onClick={() => setShowBulk((v) => !v)}>
        {showBulk ? '▾' : '▸'} 過去の投稿をまとめて登録
      </button>
      {showBulk && (
        <div className="card">
          <p className="hint">
            1行に「略称＋番号 URL」の形式で貼り付けてください。既にある番号はURLを上書きします。
          </p>
          <textarea
            rows={5}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={'さつれな1 https://www.pixiv.net/artworks/149961440\nさつれな2 illust/149992313'}
          />
          <button className="primary" onClick={importBulk}>
            登録する（{parseBulkLines(bulk).length}件）
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------------- 設定 ---------------- */

function SettingsView({
  data,
  update,
  replace,
  notify,
}: {
  data: AppData;
  update: Update;
  replace: (d: AppData) => void;
  notify: (m: string) => void;
}) {
  const exportData = async () => {
    const json = JSON.stringify(data, null, 2);
    const name = `character-url-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    // iPhone では共有シート（「ファイルに保存」など）を使う
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const next = validateData(JSON.parse(await file.text()));
      if (!confirm(`${next.posts.length}件のデータで置き換えます。現在のデータ（${data.posts.length}件）は消えます。よろしいですか？`)) return;
      replace(next);
      notify('読み込みました');
    } catch (e) {
      alert((e as Error).message || '読み込みに失敗しました');
    }
  };

  const s = data.settings;
  return (
    <section>
      <h1>設定</h1>
      <div className="card">
        <label>リンク一覧のURL形式</label>
        <div className="seg small">
          <button
            className={s.linkFormat === 'full' ? 'on' : ''}
            onClick={() => update((d) => ({ ...d, settings: { ...d.settings, linkFormat: 'full' } }))}
          >
            https://www.pixiv.net/artworks/…
          </button>
          <button
            className={s.linkFormat === 'short' ? 'on' : ''}
            onClick={() => update((d) => ({ ...d, settings: { ...d.settings, linkFormat: 'short' } }))}
          >
            illust/…
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={s.showNumberOne}
            onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, showNumberOne: e.target.checked } }))}
          />
          1作目のタイトルにも「1」を付ける
        </label>
      </div>

      <h2>バックアップ</h2>
      <div className="card">
        <p className="hint">
          データはこの端末のブラウザ内だけに保存されています。機種変更やブラウザのデータ削除に備えて、定期的に書き出してください。
        </p>
        <button className="primary" onClick={exportData}>
          書き出す（{data.posts.length}件）
        </button>
        <label className="filebtn">
          読み込む
          <input type="file" accept="application/json,.json" onChange={(e) => importData(e.target.files?.[0])} />
        </label>
      </div>

      <h2>使い方のヒント</h2>
      <div className="card hint">
        Safariの共有ボタン →「ホーム画面に追加」でアプリとして使えます。ホーム画面から開くと、データが自動削除されにくくなります。
      </div>
    </section>
  );
}
