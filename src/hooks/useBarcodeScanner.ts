import { useEffect, useRef } from "react";

interface Options {
  /** Minimum characters before a burst counts as a scan. */
  minLength?: number;
  /** Max milliseconds allowed between two keystrokes of the same scan. */
  maxDelay?: number;
  enabled?: boolean;
}

/**
 * Detects hardware barcode scanners (USB HID keyboard wedge). Such scanners type
 * a whole code within a few milliseconds and finish with Enter, which is what
 * separates them from a human typing into the search box.
 */
export function useBarcodeScanner(onScan: (code: string) => void, options: Options = {}) {
  const { minLength = 4, maxDelay = 60, enabled = true } = options;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    function onKeyDown(event: KeyboardEvent) {
      const now = Date.now();
      if (now - last > maxDelay) buffer = "";
      last = now;

      if (event.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= minLength) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }
      if (event.key.length === 1) buffer += event.key;
      else buffer = "";
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, minLength, maxDelay]);
}
