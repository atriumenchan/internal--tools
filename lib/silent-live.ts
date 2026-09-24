"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/** Pull new task rows in the background. No spinner, no remount. Realtime plus a quiet minute poll. */
export function useSilentLive(reload: () => void, key: string) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => reloadRef.current(), 350);
    };

    const channel = supabase
      .channel(`silent-live:${key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, kick)
      .subscribe();
    const interval = window.setInterval(kick, 60_000);
    document.addEventListener("visibilitychange", kick);
    return () => {
      if (debounce) clearTimeout(debounce);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", kick);
      void supabase.removeChannel(channel);
    };
  }, [key]);
}
