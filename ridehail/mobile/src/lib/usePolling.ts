import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

/** Run `fn` now and every `ms` while the screen is focused (and `enabled`). */
export function usePolling(fn: () => Promise<void> | void, ms: number, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      const tick = async () => {
        try {
          await ref.current();
        } catch {
          // keep polling through transient errors
        }
        if (!stopped) timer = setTimeout(tick, ms);
      };
      tick();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    }, [ms, enabled]),
  );
}
