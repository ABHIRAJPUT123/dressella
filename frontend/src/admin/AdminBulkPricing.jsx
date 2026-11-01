import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api, errMsg, img } from "@/lib/api";
import { AdminH1, Badge } from "@/admin/AdminLayout";

const SIZES = ["S", "M", "L", "XL", "2XL"];

function Row({ p, onChange, sizes }) {
  const stock = (s) => p.sizes.find((x) => x.size === s)?.stock ?? "";
  const setStock = (s, v) => onChange({ ...p, sizes: p.sizes.some((x) => x.size === s) ? p.sizes.map((x) => (x.size === s ? { ...x, stock: v } : x)) : [...p.sizes, { size: s, stock: v }] });
  return (
    <tr className="border-b border-line last:border-0" data-testid={`bulk-row-${p.sku}`}>
      <td className="p-3"><div className="flex items-center gap-3"><img src={img(p.image)} alt="" className="h-12 w-9 object-cover" /><div><p className="text-sm">{p.title}</p><p className="text-[11px] text-taupe">{p.sku} {p.is_demo && <Badge tone="warn">Demo</Badge>}</p></div></div></td>
      <td className="p-2"><input type="number" min={1} className="input-luxe h-10 w-28 bg-ivory" value={p.price} onChange={(e) => onChange({ ...p, price: e.target.value })} aria-label={`Price for ${p.title}`} data-testid={`bulk-price-${p.sku}`} /></td>
      <td className="p-2"><input type="number" min={0} className="input-luxe h-10 w-28 bg-ivory" value={p.compare_at_price ?? ""} placeholder="—" onChange={(e) => onChange({ ...p, compare_at_price: e.target.value })} aria-label={`Original price for ${p.title}`} data-testid={`bulk-compare-${p.sku}`} /></td>
      {sizes.map((s) => (
        <td key={s} className="p-2"><input type="number" min={0} className="input-luxe h-10 w-16 bg-ivory px-2 text-center" value={stock(s)} placeholder="–" onChange={(e) => setStock(s, e.target.value)} aria-label={`Stock ${s} for ${p.title}`} data-testid={`bulk-stock-${p.sku}-${s}`} /></td>
      ))}
    </tr>
  );
}

export default function AdminBulkPricing() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-bulk"], queryFn: () => api.get("/admin/products-bulk").then((r) => r.data) });
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setRows(data.items); }, [data]);
  if (!rows) return <div className="h-40 animate-pulse bg-linen" />;
  const sizes = [...new Set([...SIZES, ...rows.flatMap((p) => p.sizes.map((s) => s.size))])];
  const update = (i, p) => setRows(rows.map((r, j) => (j === i ? p : r)));

  const save = async () => {
    setBusy(true);
    try {
      const body = { rows: rows.map((p) => ({ id: p.id, price: Number(p.price), compare_at_price: p.compare_at_price === "" || p.compare_at_price == null ? null : Number(p.compare_at_price),
        sizes: p.sizes.filter((s) => s.size && s.stock !== "").map((s) => ({ size: s.size, stock: Number(s.stock) })) })) };
      const { data: r } = await api.put("/admin/products-bulk", body);
      toast.success(`Saved ${r.updated} products — demo flags cleared`);
      qc.invalidateQueries();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div data-testid="admin-bulk-pricing">
      <Link to="/admin/products" className="mb-4 inline-flex items-center gap-2 text-xs"><ArrowLeft size={14} /> Products</Link>
      <AdminH1 action={<button className="btn-primary" onClick={save} disabled={busy} data-testid="bulk-save-button">{busy ? "Saving…" : "Save all & confirm as real"}</button>}>Prices & stock</AdminH1>
      <p className="mb-6 max-w-2xl text-sm text-taupe">Edit retail prices (₹, incl. taxes) and per-size stock for every product in one place. Saving confirms the values as real and removes the <strong>Demo</strong> flag. Leave “Original price” empty unless the item is genuinely discounted.</p>
      {data?.demo_count > 0 && <p className="mb-6 border-l-2 border-gold bg-ivory p-3 text-xs" data-testid="bulk-demo-notice">{data.demo_count} product{data.demo_count > 1 ? "s" : ""} still carry placeholder demo values.</p>}
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">Product</th><th className="p-2">Price ₹</th><th className="p-2">Original ₹</th>{sizes.map((s) => <th key={s} className="p-2 text-center">{s}</th>)}</tr></thead>
          <tbody>{rows.map((p, i) => <Row key={p.id} p={p} sizes={sizes} onChange={(np) => update(i, np)} />)}</tbody>
        </table>
      </div>
    </div>
  );
}
