import { useEffect } from "react";

const SITE = "DRESSELLA";
const ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content || "");
}

export function useSeo({ title, description, path, image, jsonLd, noindex }) {
  useEffect(() => {
    const full = title ? `${title} | ${SITE}` : `${SITE} — Fashion for Her`;
    document.title = full;
    const desc = description || "DRESSELLA — premium women's fashion. Jaipur-crafted kurtas, short kurtis, dresses and essentials, delivered across India.";
    setMeta("name", "description", desc);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", ORIGIN + (path ?? window.location.pathname));
    if (image) setMeta("property", "og:image", image);
    setMeta("name", "robots", noindex ? "noindex,nofollow" : "index,follow");
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = ORIGIN + (path ?? window.location.pathname);
    let script = document.getElementById("ld-json");
    if (jsonLd) {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "ld-json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) script.remove();
  }, [title, description, path, image, jsonLd, noindex]);
}
