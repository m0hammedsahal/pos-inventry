import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

/**
 * Global hotkeys for counter staff. Keys are matched case-insensitively and
 * support the `ctrl+`, `alt+` and `shift+` prefixes, e.g. "f9", "ctrl+p", "escape".
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push("ctrl");
      if (event.altKey) parts.push("alt");
      if (event.shiftKey && event.key.length > 1) parts.push("shift");
      parts.push(event.key.toLowerCase());
      const combo = parts.join("+");
      const handler = ref.current[combo];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
