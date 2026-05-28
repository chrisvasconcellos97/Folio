import { useState, useEffect } from "react";

// Desktop breakpoint — single source of truth for "is this a wide layout?".
// Threshold mirrors the long-standing 900px line drawn in App.jsx for the
// desktop/mobile layout split. Updates on resize via a window listener; SSR-
// safe (returns true when window is undefined).
export var DESKTOP_BREAKPOINT_PX = 900;

export function useBreakpoint() {
  var [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= DESKTOP_BREAKPOINT_PX : true
  );
  useEffect(function () {
    function handleResize() {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
    }
    window.addEventListener("resize", handleResize);
    return function () { window.removeEventListener("resize", handleResize); };
  }, []);
  return isDesktop;
}
