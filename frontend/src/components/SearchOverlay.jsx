import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api, img, inr } from "@/lib/api";
import { useMeta } from "@/lib/queries";

export function SearchOverlay({ open, onClose }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const nav = useNavigate();
  const { data: meta } = useMeta();

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!q.trim()) return setRes(null);
    const t = setTimeout(() => api.get("/search/suggest", { params: { q: q.trim() } }).then((r) => { setRes(r.data); setActive(-1); }).catch(() => setRes({ products: [], categories: [], collections: [] })), 220);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;
  const products = res?.products || [];
  const go = (to) => { onClose(); setQ(""); nav(to); };
  const submit = (e) => {
    e.preventDefault();
    if (active >= 0 && products[active]) return go(`/product/${products[active].slug}`);
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, products.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search DRESSELLA" data-testid="search-overlay">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close search" onClick={onClose} tabIndex={-1} />
      <div className="relative max-h-[90vh] overflow-y-auto bg-ivory rise">
        <div className="container-luxe py-6 sm:py-10">
          <form onSubmit={submit} className="flex items-center gap-4 border-b border-ink pb-3" role="search">
            <Search size={20} strokeWidth={1.3} aria-hidden="true" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} maxLength={60} placeholder="Search kurtas, dresses, colours…"
              className="w-full bg-transparent font-serif text-2xl placeholder:text-mute focus:outline-none sm:text-3xl" aria-label="Search products" aria-controls="search-results"
              aria-activedescendant={active >= 0 ? `sr-${active}` : undefined} data-testid="search-input" />
            <button type="button" onClick={onClose} aria-label="Close search" className="p-2" data-testid="search-close-button"><X size={22} strokeWidth={1.3} /></button>
          </form>
          <div id="search-results" className="grid gap-10 py-8 md:grid-cols-12" aria-live="polite">
            <div className="md:col-span-3">
              <p className="eyebrow mb-4">{res?.categories?.length || res?.collections?.length ? "Matching" : "Popular searches"}</p>
              <ul className="space-y-2.5 text-sm">
                {res && (res.categories.length || res.collections.length)
                  ? [...res.categories.map((c) => ({ n: c.name, to: `/category/${c.slug}` })), ...res.collections.map((c) => ({ n: c.name, to: `/collections/${c.slug}` }))].map((x) => (
                      <li key={x.to}><button onClick={() => go(x.to)} className="link-u">{x.n}</button></li>
                    ))
                  : ["Kurta", "Short kurti", "Cotton", "Dress", "Rayon"].map((t) => <li key={t}><button onClick={() => setQ(t)} className="link-u" data-testid={`search-suggestion-${t.toLowerCase().replace(/\s/g, "-")}`}>{t}</button></li>)}
              </ul>
            </div>
            <div className="md:col-span-9">
              {res && products.length === 0 && (
                <div data-testid="search-no-results">
                  <p className="font-serif text-2xl">No pieces match “{q}”.</p>
                  <p className="mt-2 text-sm text-taupe">Try a broader term, or explore:</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(meta?.categories || []).filter((c) => c.count).map((c) => <button key={c.slug} onClick={() => go(`/category/${c.slug}`)} className="chip">{c.name}</button>)}
                  </div>
                </div>
              )}
              {products.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                    {products.map((p, i) => (
                      <Link key={p.id} id={`sr-${i}`} to={`/product/${p.slug}`} onClick={onClose} className={`group block ${active === i ? "outline outline-1 outline-offset-4 outline-ink" : ""}`} data-testid={`search-result-${p.slug}`}>
                        <div className="aspect-[3/4] overflow-hidden bg-linen"><img src={img(p.images?.[0]?.path)} alt={p.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /></div>
                        <p className="mt-2 line-clamp-2 text-xs">{p.title}</p>
                        <p className="text-xs text-taupe">{inr(p.price)}</p>
                      </Link>
                    ))}
                  </div>
                  <button onClick={submit} className="btn-outline mt-8" data-testid="search-view-all">View all results</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
