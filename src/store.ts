import { useCallback, useEffect, useState } from 'react';
import { AppData, emptyData, validateData } from './model';

const KEY = 'character-url:data';

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? validateData(JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData();
  }
}

/** 端末内（localStorage）に保存するデータストア */
export function useAppData() {
  const [data, setData] = useState<AppData>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      alert('保存に失敗しました。端末の空き容量を確認してください。');
    }
  }, [data]);

  useEffect(() => {
    // ブラウザによる自動削除をされにくくする
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);
  return { data, update, replace: setData };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
