import { useEffect, useRef } from 'react';
import { playNoticeSound } from '@/lib/sounds/notice';
import type { Notice } from '../types';

/**
 * Tiempo después de cargar en el que los avisos se toman como "ya estaban":
 * el catálogo y las consultas terminan en momentos distintos y no debe sonar al entrar.
 */
const SETTLE_MS = 6_000;

/**
 * Suena cuando aparece un aviso que antes no estaba (por ejemplo, la caja quedó abierta o
 * se agregó una deuda vieja). No suena al abrir la app ni al cambiar de empresa.
 */
export function useNewNoticeSound(notices: readonly Notice[], isLoading: boolean, companyId: string): void {
  const seenRef = useRef<Set<string>>(new Set());
  const settledAtRef = useRef<number | null>(null);

  // Cambiar de empresa vuelve a empezar: sus avisos se toman como conocidos
  useEffect(() => {
    seenRef.current = new Set();
    settledAtRef.current = null;
  }, [companyId]);

  useEffect(() => {
    if (isLoading) return;
    const now = Date.now();
    settledAtRef.current ??= now;
    const isSettled = now - settledAtRef.current > SETTLE_MS;

    const hasNew = notices.some((notice) => !seenRef.current.has(notice.id));
    seenRef.current = new Set(notices.map((notice) => notice.id));
    if (hasNew && isSettled) playNoticeSound();
  }, [notices, isLoading]);
}
