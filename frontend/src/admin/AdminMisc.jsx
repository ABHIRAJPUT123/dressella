import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BASE, errMsg, inr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AdminH1, Badge, Pager } from "@/admin/AdminLayout";

const EMPTY = { code: "", description: "", type: "percent", value: 10, min_subtotal: 0, max_discount: "", max_uses: "", expires_at: "", active: true };

export function AdminCoupons() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-coupons"], queryFn: () => api.get("/admin/coupons").then((r) => r.data) });
  const [f, setF] = useState(null);
  const save = async () => {
    const body = { ...f, value: Number(f.value), min_subtotal: Number(f.min_subtotal || 0), max_discount: f.max_discount ? Number(f.max_discount) : null, max_uses: f.max_uses ? Number(f.max_uses) : null, expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null };
    delete body.used_count; delete body.created_at; delete body._orig;
    try { await api.put(`/admin/coupons/${f._orig || f.code}`, body); toast.success("Coupon saved"); setF(null); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (code) => { if (window.confirm(`Delete ${code}?`)) { await api.delete(`/admin/coupons/${code}`); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); } };
  const inp = (k, props = {}) => <label className="block"><span className="label-luxe">{props.label}</span><input className="input-luxe h-10 bg-ivory" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: props.upper ? e.target.value.toUpperCase() : e.target.value })} data-testid={`coupon-${k}-input`} type={props.type || "text"} /></label>;
  return (
    <div data-testid="admin-coupons">
      <AdminH1 action={<button className="btn-primary" onClick={() => setF({ ...EMPTY })} data-testid="admin-new-coupon-button">New coupon</button>}>Coupons</AdminH1>
      {f && (
        <div className="mb-8 grid gap-4 border border-line bg-ivory p-6 sm:grid-cols-3" data-testid="coupon-form">
          {inp("code", { label: "Code", upper: true })}
          <label className="block"><span className="label-luxe">Type</span><select className="input-luxe h-10" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} data-testid="coupon-type-select"><option value="percent">Percent</option><option value="fixed">Fixed ₹</option></select></label>
          {inp("value", { label: "Value", type: "number" })}
          {inp("min_subtotal", { label: "Minimum subtotal ₹", type: "number" })}
          {inp("max_discount", { label: "Max discount ₹ (optional)", type: "number" })}
          {inp("max_uses", { label: "Max uses (optional)", type: "number" })}
          {inp("expires_at", { label: "Expires (optional)", type: "date" })}
          <div className="sm:col-span-2">{inp("description", { label: "Description" })}</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#1A1918]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
          <div className="flex gap-3 sm:col-span-3"><button className="btn-primary" onClick={save} data-testid="coupon-save-button">Save</button><button className="btn-outline" onClick={() => setF(null)}>Cancel</button></div>
        </div>
      )}
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">Code</th><th>Rule</th><th>Used</th><th>Status</th><th /></tr></thead>
          <tbody>{data?.map((c) => (
            <tr key={c.code} className="border-b border-line last:border-0" data-testid={`coupon-row-${c.code}`}>
              <td className="p-3 font-semibold">{c.code}<p className="text-xs font-normal text-taupe">{c.description}</p></td>
              <td>{c.type === "percent" ? `${c.value}%` : inr(c.value)} {c.min_subtotal > 0 && `· min ${inr(c.min_subtotal)}`}</td>
              <td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td><td><Badge tone={c.active ? "ok" : "default"}>{c.active ? "Active" : "Inactive"}</Badge></td>
              <td className="space-x-3 pr-3 text-right"><button className="underline" onClick={() => setF({ ...EMPTY, ...c, _orig: c.code, expires_at: c.expires_at ? c.expires_at.slice(0, 10) : "", max_discount: c.max_discount ?? "", max_uses: c.max_uses ?? "" })}>Edit</button><button className="underline" onClick={() => del(c.code)}>Delete</button></td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminCustomers() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, isError } = useQuery({ queryKey: ["admin-customers", q, page], queryFn: () => api.get("/admin/customers", { params: { q, page } }).then((r) => r.data), enabled: user?.role === "admin" });
  if (user?.role !== "admin" || isError) return <p className="text-sm">Customer records are visible to the store owner only.</p>;
  return (
    <div data-testid="admin-customers">
      <AdminH1>Customers</AdminH1>
      <input className="input-luxe mb-5 h-10 max-w-xs bg-ivory" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-testid="admin-customers-search" />
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">Name</th><th>Email</th><th>Joined</th><th>Paid orders</th><th>Spent</th></tr></thead>
          <tbody>{data?.items.map((u) => <tr key={u.id} className="border-b border-line last:border-0"><td className="p-3">{u.name}</td><td>{u.email}</td><td>{new Date(u.created_at).toLocaleDateString("en-IN")}</td><td>{u.orders}</td><td>{inr(u.spent)}</td></tr>)}</tbody>
        </table>
        {data?.items.length === 0 && <p className="p-6 text-sm text-taupe">No customers yet.</p>}
      </div>
      {data && <Pager page={data.page} pages={data.pages} setPage={setPage} />}
    </div>
  );
}

export function AdminNewsletter() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ["admin-newsletter", page], queryFn: () => api.get("/admin/newsletter", { params: { page } }).then((r) => r.data) });
  const unsub = async (email) => { await api.patch(`/admin/newsletter/${encodeURIComponent(email)}`); qc.invalidateQueries({ queryKey: ["admin-newsletter"] }); };
  return (
    <div data-testid="admin-newsletter">
      <AdminH1 action={<a className="btn-outline" href={`${BASE}/api/admin/newsletter.csv`} data-testid="admin-newsletter-export">Export CSV</a>}>Newsletter</AdminH1>
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">Email</th><th>Status</th><th>Consent recorded</th><th /></tr></thead>
          <tbody>{data?.items.map((s) => <tr key={s.email} className="border-b border-line last:border-0"><td className="p-3">{s.email}</td><td><Badge tone={s.status === "subscribed" ? "ok" : "default"}>{s.status}</Badge></td><td>{s.consent_at ? new Date(s.consent_at).toLocaleString("en-IN") : "—"}</td><td className="pr-3 text-right">{s.status === "subscribed" && <button className="underline" onClick={() => unsub(s.email)}>Unsubscribe</button>}</td></tr>)}</tbody>
        </table>
        {data?.items.length === 0 && <p className="p-6 text-sm text-taupe">No subscribers yet.</p>}
      </div>
      {data && <Pager page={data.page} pages={data.pages} setPage={setPage} />}
    </div>
  );
}
