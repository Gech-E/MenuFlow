"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "./ui-api";

export function useResource<T>(path: string | null, interval = 0) {
  const [state, setState] = useState<{
    path: string | null;
    data: T | null;
    error: string;
    loading: boolean;
    status: number;
  }>({ path: null, data: null, error: "", loading: true, status: 0 });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!path) return;
    try {
      const data = await api<T>(path);
      if (request === sequence.current)
        setState({ path, data, error: "", loading: false, status: 200 });
    } catch (error) {
      if (request === sequence.current)
        setState((prev) => ({
          path,
          data: prev.path === path ? prev.data : null,
          error: messageOf(error),
          loading: false,
          status:
            error && typeof error === "object" && "status" in error
              ? Number(error.status)
              : 0,
        }));
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    if (path && interval) {
      timer = setInterval(onFocus, interval);
      window.addEventListener("focus", onFocus);
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [path, refresh, interval]);
  return {
    ...(state.path === path
      ? state
      : { data: null, error: "", loading: true, status: 0 }),
    refresh,
  };
}
