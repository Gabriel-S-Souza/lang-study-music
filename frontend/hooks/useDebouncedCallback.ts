"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<T extends readonly unknown[]>(
  fn: (...args: T) => void,
  delayMs: number,
): (...args: T) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(
    () => (): void => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return useCallback(
    (...args: T) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
