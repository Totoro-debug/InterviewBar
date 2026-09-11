import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '../domain/types';
import { createDemoData, createEmptyData, parseAppData } from './data';

const BROWSER_STORAGE_KEY = 'interviewbar.preview.data';

interface AppDataState {
  data: AppData;
  ready: boolean;
  loadError: string | null;
  saveError: string | null;
  update: (updater: AppData | ((current: AppData) => AppData)) => void;
  retry: () => Promise<void>;
}

async function loadFromPlatform(): Promise<AppData> {
  if (window.interviewBar) {
    const stored = await window.interviewBar.data.load();
    return stored === null ? createEmptyData() : parseAppData(stored);
  }
  const stored = localStorage.getItem(BROWSER_STORAGE_KEY);
  if (stored) return parseAppData(JSON.parse(stored) as unknown);
  return new URLSearchParams(window.location.search).get('demo') === '1'
    ? createDemoData()
    : createEmptyData();
}

async function saveToPlatform(data: AppData): Promise<void> {
  if (window.interviewBar) {
    await window.interviewBar.data.save(data);
  } else {
    localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(data));
  }
}

export function useAppData(): AppDataState {
  const [data, setData] = useState<AppData>(() => createEmptyData());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const canPersist = useRef(false);
  const lastStartedRevision = useRef(0);

  const retry = useCallback(async () => {
    setReady(false);
    setLoadError(null);
    canPersist.current = false;
    try {
      const loaded = await loadFromPlatform();
      setData(loaded);
      canPersist.current = true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法读取本机数据。');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void retry();
  }, [retry]);

  useEffect(() => {
    if (!ready || !canPersist.current || revision === 0 || revision === lastStartedRevision.current) return;
    const startedRevision = revision;
    lastStartedRevision.current = startedRevision;
    void saveToPlatform(data)
      .then(() => {
        if (lastStartedRevision.current === startedRevision) setSaveError(null);
      })
      .catch((error: unknown) => {
        if (lastStartedRevision.current === startedRevision) {
          setSaveError(error instanceof Error ? error.message : '保存失败，请检查数据目录。');
        }
      });
  }, [data, ready, revision]);

  useEffect(() => {
    return window.interviewBar?.data.onChanged((next) => {
      try {
        setData(parseAppData(next));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '后台更新的数据无效。');
      }
    });
  }, []);

  const update = useCallback((updater: AppData | ((current: AppData) => AppData)) => {
    setData((current) => (typeof updater === 'function' ? updater(current) : updater));
    setRevision((current) => current + 1);
  }, []);

  return { data, ready, loadError, saveError, update, retry };
}
