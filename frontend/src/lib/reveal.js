import { useEffect } from "react";

export function useScrollReveal() {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return undefined;
    const root = document.documentElement;
    root.classList.add("reveal-on");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    let frame = 0;
    const scan = () => {
      frame = 0;
      document.querySelectorAll(".reveal:not(.is-in):not([data-rv])").forEach((el) => { el.dataset.rv = "1"; io.observe(el); });
    };
    const mo = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); });
    scan();
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.querySelectorAll("[data-rv]").forEach((el) => { delete el.dataset.rv; });
      root.classList.remove("reveal-on");
    };
  }, []);
}
