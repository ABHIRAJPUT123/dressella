import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, Wand2, X } from "lucide-react";
import { api, errMsg, img, inr } from "@/lib/api";
import { AdminH1 } from "@/admin/AdminLayout";

function RackRow({ it, i, n, move, remove, setImage }) {
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  const p = it.product;
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/admin/rack/upload", fd);
      setImage(data.path);
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  const auto = async () => {
    setBusy("auto");
    try {
      const { data } = await api.post(`/admin/rack/auto/${p.id}`, null, { timeout: 150000 });
      setImage(data.path);
      toast.success("Clothes-only image created — review it, then save the rack.");
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line py-4 sm:flex-nowrap sm:gap-4" data-testid={`admin-rack-item-${p.slug}`}>
      <span className="w-6 text-xs text-taupe">{String(i + 1).padStart(2, "0")}</span>
      <div className="h-20 w-14 shrink-0 bg-linen"><img src={img(p.images?.[0]?.path)} alt="" className="h-full w-full object-cover" /></div>
      <div className="flex h-20 w-14 shrink-0 items-center justify-center border border-dashed border-line2 bg-[repeating-conic-gradient(#f1ebe1_0_25%,#fff_0_50%)] bg-[length:12px_12px]" title="Rack image">
        {busy === "auto" ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-line2 border-t-ink" data-testid={`admin-rack-auto-spinner-${p.slug}`} /> : it.image ? <img src={img(it.image)} alt="Rack garment" className="h-full w-full object-contain" /> : <span className="px-1 text-center text-[9px] text-taupe">Photo used</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{p.title}</p>
        <p className="text-xs text-taupe">{inr(p.price)} · {p.category}{p.status && p.status !== "published" ? ` · ${p.status} (hidden on store)` : ""}</p>
        {busy === "auto" && <p className="text-xs text-cocoa">Creating clothes-only image… this takes about 20 seconds.</p>}
      </div>
      <input ref={file} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={upload} data-testid={`admin-rack-file-${p.slug}`} />
      <button type="button" className="chip h-9 gap-1.5" onClick={auto} disabled={!!busy} data-testid={`admin-rack-auto-${p.slug}`}><Wand2 size={14} /> Auto cutout</button>
      <button type="button" className="chip h-9 gap-1.5" onClick={() => file.current?.click()} disabled={!!busy} data-testid={`admin-rack-upload-${p.slug}`}><ImagePlus size={14} /> {busy === "upload" ? "Uploading…" : it.image ? "Replace" : "Upload"}</button>
      {it.image && <button type="button" className="chip h-9" onClick={() => setImage(null)} aria-label="Use product photo instead" data-testid={`admin-rack-clear-image-${p.slug}`}><X size={14} /></button>}
      <button type="button" className="chip h-9" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" data-testid={`admin-rack-up-${p.slug}`}><ArrowUp size={14} /></button>
      <button type="button" className="chip h-9" disabled={i === n - 1} onClick={() => move(i, 1)} aria-label="Move down" data-testid={`admin-rack-down-${p.slug}`}><ArrowDown size={14} /></button>
      <button type="button" className="chip h-9 text-destructive" onClick={remove} aria-label="Remove from rack" data-testid={`admin-rack-remove-${p.slug}`}><Trash2 size={14} /></button>
    </li>
  );
}

function AddProduct({ onAdd, taken }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["admin-rack-search", q], queryFn: () => api.get("/admin/products", { params: { q, limit: 12 } }).then((r) => r.data) });
  const list = (data?.items || []).filter((p) => !taken.has(p.id));
  return (
    <div className="border border-line bg-ivory p-5" data-testid="admin-rack-add">
      <p className="label-luxe">Add a product to the rack</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU" className="input-luxe h-10" data-testid="admin-rack-search-input" />
      <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <div className="h-12 w-9 shrink-0 bg-linen"><img src={img(p.images?.[0]?.path)} alt="" className="h-full w-full object-cover" /></div>
            <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
            <button type="button" className="chip h-8 gap-1" onClick={() => onAdd(p)} data-testid={`admin-rack-add-${p.slug}`}><Plus size={13} /> Add</button>
          </li>
        ))}
        {!list.length && <li className="py-3 text-xs text-taupe">{q.trim() ? "No products match this search." : "No more products to add."}</li>}
      </ul>
    </div>
  );
}

export default function AdminRack() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-rack"], queryFn: () => api.get("/admin/rack").then((r) => r.data) });
  const [items, setItems] = useState(null);
  const [saving, setSaving] = useState(false);
  const memory = useRef({});
  useEffect(() => { if (data) setItems(data.items); }, [data]);
  useEffect(() => { (items || []).forEach((x) => { if (x.image) memory.current[x.product.id] = x.image; }); }, [items]);

  const sig = (xs) => JSON.stringify((xs || []).map((x) => [x.product.id, x.image || null]));
  const dirty = !!data && !!items && sig(items) !== sig(data.items);
  useEffect(() => {
    if (!dirty) return undefined;
    const msg = "You have unsaved rack changes. Leave without saving?";
    const onUnload = (e) => { e.preventDefault(); e.returnValue = msg; return msg; };
    const onClick = (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!window.confirm(msg)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  const move = (i, d) => setItems((xs) => { const n = [...xs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/rack", { items: items.map((x) => ({ product_id: x.product.id, image: x.image || null })) });
      toast.success("Rack saved — it is live on the homepage.");
      qc.invalidateQueries({ queryKey: ["admin-rack"] });
      qc.invalidateQueries({ queryKey: ["rack"] });
    } catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };

  if (isLoading || !items) return <div className="h-40 animate-pulse bg-linen" />;
  return (
    <div data-testid="admin-rack-page">
      <AdminH1 action={
        <div className="flex items-center gap-4">
          {dirty && <span className="flex items-center gap-2 text-xs text-cocoa" role="status" data-testid="admin-rack-unsaved"><span className="h-2 w-2 rounded-full bg-gold" />Unsaved changes</span>}
          <button className="btn-primary" onClick={save} disabled={saving || !dirty} data-testid="admin-rack-save-button">{saving ? "Saving…" : "Save rack"}</button>
        </div>
      }>Edit Rack</AdminH1>
      <p className="mb-6 max-w-2xl text-sm text-taupe">
        Choose which pieces hang on the homepage rail and in what order. For the most realistic look, upload a garment-only image (no model, transparent PNG/WebP) for each piece; otherwise the product photo is used.
        {!data.configured && " The rail currently shows your newest products automatically — saving here will fix the selection."}
      </p>
      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <ul className="border-t border-line" data-testid="admin-rack-list">
          {items.map((it, i) => (
            <RackRow key={it.product.id} it={it} i={i} n={items.length} move={move}
              remove={() => setItems((xs) => xs.filter((x) => x.product.id !== it.product.id))}
              setImage={(path) => setItems((xs) => xs.map((x) => (x.product.id === it.product.id ? { ...x, image: path } : x)))} />
          ))}
          {!items.length && <li className="py-8 text-sm text-taupe" data-testid="admin-rack-empty">The rack is empty. Add products from the right.</li>}
        </ul>
        <AddProduct taken={new Set(items.map((x) => x.product.id))} onAdd={(p) => setItems((xs) => (xs.length >= 40 ? xs : [...xs, { product: p, image: memory.current[p.id] || null }]))} />
      </div>
    </div>
  );
}
