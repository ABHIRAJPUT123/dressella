import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errMsg, inr } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { useAuth } from "@/context/AuthContext";
import { AddressForm, EMPTY_ADDR, validateAddress } from "@/components/AddressForm";
import { Field } from "@/components/Common";
import { STATUS_LABEL, Timeline } from "@/pages/OrderView";
import { WishlistGrid } from "@/pages/Wishlist";
import AccountExchanges from "@/pages/AccountExchanges";

function Orders() {
  const { data, isLoading } = useQuery({ queryKey: ["my-orders"], queryFn: () => api.get("/account/orders").then((r) => r.data) });
  const [open, setOpen] = useState(null);
  if (isLoading) return <div className="h-40 animate-pulse bg-linen" />;
  if (!data?.length) return <div className="py-10" data-testid="account-orders-empty"><p className="font-serif text-2xl">No orders yet</p><Link to="/shop" className="btn-outline mt-6">Start shopping</Link></div>;
  return (
    <ul className="divide-y divide-line border-y border-line" data-testid="account-orders-list">
      {data.map((o) => (
        <li key={o.id} className="py-5">
          <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} data-testid={`account-order-${o.order_number}`}>
            <span><span className="font-semibold">{o.order_number}</span><span className="ml-3 text-xs text-taupe">{new Date(o.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span></span>
            <span className="text-xs uppercase tracking-[0.16em]">{STATUS_LABEL[o.status] || o.status}</span>
            <span className="text-sm">{inr(o.totals.total)}</span>
          </button>
          {open === o.id && (
            <div className="mt-5 grid gap-8 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-xs text-taupe">Payment: {o.payment_method === "cod" ? "Cash on Delivery" : "Razorpay"} · {STATUS_LABEL[o.payment_status] || o.payment_status}</p>
                <ul className="space-y-3 text-sm">{o.lines.map((l, index) => <li key={l.product_id + l.size}>{l.title} · {l.size} × {l.qty} — {inr(l.line_total)}{o.status === "delivered" && <Link className="ml-3 text-xs underline" to={`/account?tab=exchanges&order_id=${encodeURIComponent(o.id)}&line_index=${index}`}>Exchange item</Link>}</li>)}</ul>
                <Link to="/returns" className="mt-4 inline-block text-xs underline">Return & exchange policy</Link>
              </div>
              <Timeline order={o} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Addresses() {
  const { user, setUser } = useAuth();
  const [edit, setEdit] = useState(null);
  const [errs, setErrs] = useState({});
  const save = async () => {
    const er = validateAddress(edit);
    setErrs(er);
    if (Object.keys(er).length) return;
    try {
      const body = { name: edit.name, phone: edit.phone, line1: edit.line1, line2: edit.line2 || "", city: edit.city, state: edit.state, pincode: edit.pincode, is_default: !!edit.is_default };
      const { data } = edit.id ? await api.put(`/account/addresses/${edit.id}`, body) : await api.post("/account/addresses", body);
      setUser({ ...user, addresses: data }); setEdit(null); toast.success("Address saved");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => { const { data } = await api.delete(`/account/addresses/${id}`); setUser({ ...user, addresses: data }); };
  if (edit) return (
    <div className="max-w-xl" data-testid="address-form">
      <AddressForm value={edit} onChange={setEdit} errors={errs} prefix="addr" />
      <label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={!!edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} className="h-4 w-4 accent-[#1A1918]" /> Set as default</label>
      <div className="mt-6 flex gap-3"><button className="btn-primary" onClick={save} data-testid="address-save-button">Save address</button><button className="btn-outline" onClick={() => setEdit(null)}>Cancel</button></div>
    </div>
  );
  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2">
        {(user.addresses || []).map((a) => (
          <div key={a.id} className="border border-line p-5 text-sm leading-relaxed" data-testid={`address-card-${a.id}`}>
            {a.is_default && <p className="eyebrow mb-2">Default</p>}
            <p className="font-semibold">{a.name}</p><p>{a.line1}{a.line2 && `, ${a.line2}`}</p><p>{a.city}, {a.state} {a.pincode}</p><p>{a.phone}</p>
            <div className="mt-4 flex gap-4 text-xs"><button className="underline" onClick={() => setEdit(a)}>Edit</button><button className="underline" onClick={() => del(a.id)} data-testid={`address-delete-${a.id}`}>Remove</button></div>
          </div>
        ))}
      </div>
      <button className="btn-outline mt-8" onClick={() => setEdit({ ...EMPTY_ADDR })} data-testid="add-address-button">Add new address</button>
    </div>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user.name, phone: user.phone || "" });
  const save = async (e) => {
    e.preventDefault();
    try { const { data } = await api.put("/account/profile", f); setUser({ ...user, ...data }); toast.success("Profile updated"); } catch (e2) { toast.error(errMsg(e2)); }
  };
  return (
    <form onSubmit={save} className="max-w-md space-y-5" data-testid="profile-form">
      <Field label="Email" id="profile-email"><input id="profile-email" className="input-luxe text-taupe" value={user.email} disabled /></Field>
      <Field label="Full name" id="profile-name"><input id="profile-name" className="input-luxe" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} data-testid="profile-name-input" /></Field>
      <Field label="Mobile" id="profile-phone"><input id="profile-phone" className="input-luxe" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={14} data-testid="profile-phone-input" /></Field>
      <button className="btn-primary" data-testid="profile-save-button">Save changes</button>
    </form>
  );
}

const TABS = [["orders", "Orders"], ["exchanges", "Returns & exchanges"], ["addresses", "Addresses"], ["wishlist", "Wishlist"], ["profile", "Profile"]];

export default function Account() {
  useSeo({ title: "My Account", noindex: true });
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "orders";
  if (user === null) return <div className="container-luxe py-28"><div className="h-10 w-1/3 animate-pulse bg-linen" /></div>;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  return (
    <div className="container-luxe py-12 sm:py-16" data-testid="account-page">
      <p className="eyebrow">My account</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl">Hello, {user.name?.split(" ")[0]}</h1>
        <div className="flex gap-5 text-xs uppercase tracking-[0.18em]">
          {(user.role === "admin" || user.role === "staff") && <Link to="/admin" className="underline" data-testid="account-admin-link">Admin dashboard</Link>}
          <button onClick={async () => { await logout(); qc.clear(); }} className="underline" data-testid="logout-button">Sign out</button>
        </div>
      </div>
      <div role="tablist" aria-label="Account sections" className="no-scrollbar mt-10 flex gap-8 overflow-x-auto border-b border-line">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setSp({ tab: k })} className={`-mb-px shrink-0 border-b py-4 text-[11px] font-semibold uppercase tracking-[0.2em] ${tab === k ? "border-ink" : "border-transparent text-taupe"}`} data-testid={`account-tab-${k}`}>{l}</button>)}
      </div>
      <div role="tabpanel" className="py-10">
        {tab === "orders" && <Orders />}
        {tab === "exchanges" && <AccountExchanges />}
        {tab === "addresses" && <Addresses />}
        {tab === "wishlist" && <WishlistGrid />}
        {tab === "profile" && <Profile />}
      </div>
    </div>
  );
}
