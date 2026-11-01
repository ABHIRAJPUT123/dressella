import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, Trash2, Upload } from "lucide-react";
import { api, errMsg, img, inr } from "@/lib/api";
import { AdminH1, Badge, Pager, statusTone } from "@/admin/AdminLayout";

export function AdminProducts() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ["admin-products", q, status, page], queryFn: () => api.get("/admin/products", { params: { q, status, page } }).then((r) => r.data) });
  return (
    <div data-testid="admin-products">
      <AdminH1 action={<div className="flex gap-3"><Link to="/admin/products/bulk" className="btn-outline" data-testid="admin-bulk-pricing-link">Prices & stock</Link><Link to="/admin/products/new" className="btn-primary" data-testid="admin-new-product-button">New product</Link></div>}>Products</AdminH1>
      <div className="mb-5 flex flex-wrap gap-3">
        <input className="input-luxe h-10 max-w-xs bg-ivory" placeholder="Search title or SKU" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-testid="admin-products-search" />
        <select className="input-luxe h-10 w-40 bg-ivory" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} data-testid="admin-products-status-filter"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
      </div>
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0" data-testid={`admin-product-row-${p.sku}`}>
                <td className="flex items-center gap-3 p-3"><img src={img(p.images?.[0]?.path)} alt="" className="h-14 w-11 object-cover" /><span>{p.title}{p.is_demo && <span className="ml-2"><Badge tone="warn">Demo</Badge></span>}</span></td>
                <td>{p.sku}</td><td>{inr(p.price)}</td><td>{p.sizes.reduce((s, x) => s + x.stock, 0)}</td><td><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                <td className="pr-3 text-right"><Link to={`/admin/products/${p.id}`} className="underline" data-testid={`admin-edit-product-${p.sku}`}>Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <p className="p-6 text-sm text-taupe">No products found.</p>}
      </div>
      {data && <Pager page={data.page} pages={data.pages} setPage={setPage} />}
    </div>
  );
}

const BLANK = { title: "", slug: "", sku: "", subtitle: "", description: "", price: 0, compare_at_price: null, category: "", collections: [], occasion: [], style: [], color: { name: "", hex: "#000000" }, group: "", sizes: ["S", "M", "L", "XL", "2XL"].map((s) => ({ size: s, stock: 0 })), images: [], fabric: "", composition: "", fit: "", care: "", length: "", neckline: "", sleeve: "", status: "draft" };
const csv = (a) => (a || []).join(", ");
const uncsv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

const F = ({ label, children }) => <label className="block"><span className="label-luxe">{label}</span>{children}</label>;

export function AdminProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const [params] = useSearchParams();
  const toRack = isNew && params.get("to_rack") === "1";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [p, setP] = useState(isNew ? BLANK : null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [err, setErr] = useState("");
  useQuery({ queryKey: ["admin-product", id], enabled: !isNew, queryFn: () => api.get(`/admin/products/${id}`).then((r) => { setP(r.data); return r.data; }) });
  const { data: cats } = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.get("/admin/categories").then((r) => r.data) });
  const { data: cols } = useQuery({ queryKey: ["admin-collections"], queryFn: () => api.get("/admin/collections").then((r) => r.data) });
  if (!p) return <div className="h-40 animate-pulse bg-linen" />;
  const set = (k, v) => setP({ ...p, [k]: v });
  const inp = (k, props = {}) => <input className="input-luxe bg-ivory" value={p[k] ?? ""} onChange={(e) => set(k, e.target.value)} data-testid={`admin-product-${k}-input`} {...props} />;

  const upload = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    setUploading(true);
    try {
      for (const [index, f] of files.entries()) {
        setUploadProgress(`Uploading photo ${index + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/admin/upload", fd, { timeout: 120000 });
        setP((cur) => ({ ...cur, images: [...cur.images, { ...data, alt: cur.title }] }));
      }
    } catch (e2) {
      toast.error(errMsg(e2));
    } finally {
      setUploading(false);
      setUploadProgress("");
      e.target.value = "";
    }
  };
  const move = (i) => { const a = [...p.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set("images", a); };

  const save = async () => {
    setBusy(true); setErr("");
    const body = { ...p, price: Number(p.price), compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null, sizes: p.sizes.map((s) => ({ size: s.size, stock: Number(s.stock) })) };
    ["id", "sales_count", "is_demo", "created_at", "updated_at"].forEach((k) => delete body[k]);
    try {
      const { data } = isNew ? await api.post("/admin/products", body) : await api.put(`/admin/products/${id}`, body);
      if (isNew && toRack) {
        try {
          await api.post("/admin/rack/items", { product_id: data.id });
          toast.success("New cloth saved and hung on the rack.");
          qc.invalidateQueries();
          nav("/admin/rack", { replace: true });
        } catch (e3) {
          toast.error(`Product saved, but not added to the rack: ${errMsg(e3)}`);
          qc.invalidateQueries();
          nav(`/admin/products/${data.id}`, { replace: true });
        }
        setBusy(false);
        return;
      }
      toast.success("Product saved"); qc.invalidateQueries(); if (isNew) nav(`/admin/products/${data.id}`, { replace: true });
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  };
  const del = async () => {
    if (!window.confirm("Permanently delete this product? Consider archiving instead.")) return;
    try { await api.delete(`/admin/products/${id}`); qc.invalidateQueries(); nav("/admin/products"); } catch (e2) { toast.error(errMsg(e2)); }
  };

  return (
    <div data-testid="admin-product-edit">
      <Link to={toRack ? "/admin/rack" : "/admin/products"} className="mb-4 inline-flex items-center gap-2 text-xs"><ArrowLeft size={14} /> {toRack ? "Edit Rack" : "Products"}</Link>
      <AdminH1 action={<div className="flex gap-3">{!isNew && <button className="btn-outline" onClick={del} data-testid="admin-delete-product-button">Delete</button>}<button className="btn-primary" onClick={save} disabled={busy || uploading} data-testid="admin-save-product-button">{uploading ? "Uploading photos…" : busy ? "Saving…" : toRack ? "Save & hang on rack" : "Save"}</button></div>}>{toRack ? "New cloth for the rack" : isNew ? "New product" : p.title}</AdminH1>
      {toRack && <p className="mb-6 border-l-2 border-gold bg-ivory p-3 text-xs" data-testid="admin-product-to-rack-note">This cloth will be saved as a product and hung on the homepage rack (max 7 pieces). Fill in the name, category, price, sizes with stock, description and photos. Choose <b>Published</b> so it appears on the store and the rack. After saving you can press "Auto cutout" in Edit Rack for a clothes-only image.</p>}
      {p.is_demo && <p className="mb-6 border-l-2 border-gold bg-ivory p-3 text-xs">DEMO product — price and stock are placeholders. Confirm real values before launch.</p>}
      {isNew && <p className="mb-6 border-l-2 border-line2 bg-ivory p-3 text-xs text-taupe">Add the product details, prices, sizes, stock and photos below. Choose Published to list it on the storefront; Draft products stay hidden.</p>}
      {err && <p role="alert" className="mb-6 text-sm text-destructive" data-testid="admin-product-error">{err}</p>}
      <div className="grid gap-8 xl:grid-cols-3">
        <div className="space-y-5 border border-line bg-ivory p-6 xl:col-span-2">
          <F label="Title">{inp("title", { maxLength: 140 })}</F>
          <div className="grid gap-5 sm:grid-cols-2"><F label="Slug (URL)">{inp("slug", { maxLength: 120 })}</F><F label="SKU">{inp("sku", { maxLength: 40 })}</F></div>
          <F label="Description"><textarea rows={5} className="input-luxe h-auto bg-ivory py-3" value={p.description} onChange={(e) => set("description", e.target.value)} data-testid="admin-product-description-input" /></F>
          <div className="grid gap-5 sm:grid-cols-3">
            <F label="Price (₹)">{inp("price", { type: "number", min: 1 })}</F>
            <F label="Original price (₹, optional)">{inp("compare_at_price", { type: "number", min: 0 })}</F>
            <F label="Status"><select className="input-luxe bg-ivory" value={p.status} onChange={(e) => set("status", e.target.value)} data-testid="admin-product-status-select"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></F>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <F label="Category"><select className="input-luxe bg-ivory" value={p.category} onChange={(e) => set("category", e.target.value)} data-testid="admin-product-category-select"><option value="">Select</option>{cats?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></F>
            <F label="Colour name"><input className="input-luxe bg-ivory" value={p.color.name} onChange={(e) => set("color", { ...p.color, name: e.target.value })} data-testid="admin-product-color-name-input" /></F>
            <F label="Colour swatch"><input type="color" className="h-12 w-full border border-line2" value={p.color.hex} onChange={(e) => set("color", { ...p.color, hex: e.target.value })} /></F>
          </div>
          <fieldset><legend className="label-luxe">Collections</legend><div className="flex flex-wrap gap-4 text-sm">{cols?.map((c) => <label key={c.slug} className="flex items-center gap-2"><input type="checkbox" className="accent-[#1A1918]" checked={p.collections.includes(c.slug)} onChange={() => set("collections", p.collections.includes(c.slug) ? p.collections.filter((x) => x !== c.slug) : [...p.collections, c.slug])} />{c.name}</label>)}</div></fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <F label="Occasion (comma separated)"><input className="input-luxe bg-ivory" defaultValue={csv(p.occasion)} onBlur={(e) => set("occasion", uncsv(e.target.value))} /></F>
            <F label="Style (comma separated)"><input className="input-luxe bg-ivory" defaultValue={csv(p.style)} onBlur={(e) => set("style", uncsv(e.target.value))} /></F>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <F label="Fabric">{inp("fabric")}</F><F label="Composition">{inp("composition")}</F><F label="Fit">{inp("fit")}</F>
            <F label="Length">{inp("length")}</F><F label="Neckline">{inp("neckline")}</F><F label="Sleeve">{inp("sleeve")}</F>
          </div>
          <F label="Care">{inp("care")}</F>
          <F label="Variant group (same value links colourways)">{inp("group")}</F>
        </div>
        <div className="space-y-6">
          <div className="border border-line bg-ivory p-6">
            <p className="label-luxe">Sizes & stock</p>
            {p.sizes.map((s, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input className="input-luxe h-10 w-20" value={s.size} onChange={(e) => set("sizes", p.sizes.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} aria-label="Size" />
                <input type="number" min={0} className="input-luxe h-10" value={s.stock} onChange={(e) => set("sizes", p.sizes.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} aria-label={`Stock for ${s.size}`} data-testid={`admin-stock-${s.size}`} />
                <button aria-label="Remove size" onClick={() => set("sizes", p.sizes.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="mt-2 text-xs underline" onClick={() => set("sizes", [...p.sizes, { size: "", stock: 0 }])}>Add size</button>
          </div>
          <div className="border border-line bg-ivory p-6">
            <p className="label-luxe">Images (first is primary)</p>
            <div className="grid grid-cols-3 gap-3">
              {p.images.map((im, i) => (
                <div key={im.path} className="relative">
                  <img src={img(im.path)} alt={im.alt || p.title} className="aspect-[3/4] w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ivory/90 p-1">
                    <button aria-label="Move earlier" disabled={i === 0} onClick={() => move(i)} className="disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button aria-label="Remove image" onClick={() => set("images", p.images.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <label className={`btn-outline mt-4 w-full ${uploading ? "cursor-wait opacity-60" : "cursor-pointer"}`}><Upload size={14} /> {uploading ? "Uploading photos…" : "Upload images"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={upload} disabled={uploading} data-testid="admin-image-upload-input" /></label>
            {uploadProgress && <p className="mt-2 text-xs text-taupe" role="status" aria-live="polite">{uploadProgress}</p>}
            <p className="mt-2 text-xs text-taupe">JPG/PNG/WebP, max 8 MB. Converted to WebP automatically. Use 3:4 portrait images.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
