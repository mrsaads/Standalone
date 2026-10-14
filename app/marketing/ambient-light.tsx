"use client";
import { useEffect } from "react";
import "./ambient.css";

// The public site's moving light: three soft colour glows parked in the corners, a faint spotlight
// that follows the pointer, and a highlight on whichever card or button is under it (ambient.css
// draws all of it; this only feeds it the pointer position).
//
// One pointer listener for the whole page, throttled to one update per animation frame. It only
// writes CSS custom properties, so React never re-renders because the mouse moved. On a touch
// screen, or with "reduce motion" turned on, it does nothing and the page is simply static.
const GLOW_TARGETS = ".ix-l-card, .ix-l-step, .ix-l-workspace-card, .ix-l-enquiry-form, .ix-ps-result, .ix-ps-aside, .ix-l-btn-solid, .ix-m-glow";

export function AmbientLight() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;

    const root = document.documentElement;
    let frame = 0;
    let last: PointerEvent | null = null;
    let lit: HTMLElement | null = null;

    const paint = () => {
      frame = 0;
      if (!last) return;
      root.style.setProperty("--ix-mx", `${last.clientX}px`);
      root.style.setProperty("--ix-my", `${last.clientY}px`);
      const target = (last.target instanceof Element ? last.target.closest(GLOW_TARGETS) : null) as HTMLElement | null;
      if (lit && lit !== target) lit.removeAttribute("data-lit");
      lit = target;
      if (target) {
        const box = target.getBoundingClientRect();
        target.style.setProperty("--cx", `${last.clientX - box.left}px`);
        target.style.setProperty("--cy", `${last.clientY - box.top}px`);
        target.setAttribute("data-lit", "");
      }
    };
    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      root.style.setProperty("--ix-spot", "0");
      if (lit) { lit.removeAttribute("data-lit"); lit = null; }
    };
    const onEnter = () => root.style.setProperty("--ix-spot", "1");

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    root.style.setProperty("--ix-spot", "1");
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--ix-mx"); root.style.removeProperty("--ix-my"); root.style.removeProperty("--ix-spot");
    };
  }, []);

  return (
    <div className="ix-ambient" aria-hidden="true">
      <i className="ix-ambient-tl" />
      <i className="ix-ambient-tr" />
      <i className="ix-ambient-br" />
      <i className="ix-ambient-spot" />
    </div>
  );
}
