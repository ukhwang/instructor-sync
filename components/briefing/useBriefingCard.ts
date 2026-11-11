'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function haptic(ms: number): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

/** 오프닝 멘트 편집·복사 상태. 서버 데이터는 복제하지 않고 편집 초안만 로컬로 가진다. */
export function useBriefingCard(openingLine: string) {
  const [draft, setDraft] = useState(openingLine);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 새 브리핑이 들어오면 초안을 초기화한다.
  useEffect(() => {
    setDraft(openingLine);
    setEditing(false);
  }, [openingLine]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = useCallback((ok: boolean) => {
    setCopied(ok);
    setCopyFailed(!ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 1800);
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft);
      haptic(10);
      flash(true);
    } catch {
      flash(false);
    }
  }, [draft, flash]);

  const toggleEdit = useCallback(() => {
    haptic(8);
    setEditing((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    haptic(8);
    setDraft(openingLine);
    setEditing(false);
  }, [openingLine]);

  return {
    draft,
    setDraft,
    editing,
    toggleEdit,
    reset,
    copy,
    copied,
    copyFailed,
    isEdited: draft !== openingLine,
  };
}
