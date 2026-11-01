import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errMsg, inr } from "@/lib/api";
import { AdminH1, Badge, Pager, statusTone } from "@/admin/AdminLayout";
import { Timeline, STATUS_LABEL } from "@/pages/OrderView";

const NEXT = { payment_review: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"], processing: ["shipped", "cancelled"], shipped: ["delivered"], pending_payment: ["cancelled"] };

function OrderDetail({ id, onClose }) {
  const qc = useQueryClient();
  const { data: o, refetch } = useQuery({ queryKey: ["admin-order", id], queryFn: () => api.get(`/admin/orders/${id}`).then((r) => r.data) });
  const [f, setF] = useState({ status: "", note: "", carrier: "", tracking_number: "", tracking_url: "" });
  if (!o) return <div className="h-40 animate-pulse bg-linen" />;
  const update = async () => {
    try { await api.patch(`/admin/orders/${id}/status`, f); toast.success("Order updated"); setF({ status: "", note: "", carrier: "", tracking_number: "", tracking_url: "" }); refetch(); qc.invalidateQueries({ queryKey: ["admin-orders"] }); } catch (e) { toast.error(errMsg(e)); }
  };
  const refund = async () => {
    if (!window.confirm("Issue a full refund via Razorpay?")) return;
    try { await api.post(`/admin/orders/${id}/refund`); toast.success("Refund initiated"); refetch(); } catch (e) { toast.error(errMsg(e)); }
  };
  const collectCod = async () => {
    if (!window.confirm("Confirm that Cash on Delivery was collected from the customer?")) return;
    try {
      await api.post(`/admin/orders/${id}/collect-cod`);
      toast.success("COD collection recorded");
      refetch();
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="border border-line bg-ivory p-6" data-testid="admin-order-detail">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-serif text-3xl">{o.order_number}</p><p className="text-xs text-taupe">{new Date(o.created_at).toLocaleString("en-IN")} · {o.email}{o.is_test && " · TEST"}</p></div>
        <button className="text-xs underline" onClick={onClose}>Close</button>
      </div>
      {o.stock_issue && <p role="alert" className="mt-4 bg-[#F3DAD7] p-3 text-xs">Paid but stock was insufficient for at least one line — review and contact the customer.</p>}
      {o.payment_review && <p role="alert" className="mt-4 bg-[#F4E7CF] p-3 text-xs">Captured payment amount or currency did not match the order — verify the Razorpay payment before confirming or refunding.</p>}
      {o.refund_due && <p role="alert" className="mt-4 bg-[#F4E7CF] p-3 text-xs">Payment requires refund review before this order can be closed.</p>}
      <div className="mt-6 grid gap-8 md:grid-cols-3">
        <div className="text-sm"><p className="eyebrow mb-2">Ship to</p>{o.shipping.name}<br />{o.shipping.line1} {o.shipping.line2}<br />{o.shipping.city}, {o.shipping.state} {o.shipping.pincode}<br />{o.shipping.phone}</div>
        <div className="text-sm"><p className="eyebrow mb-2">Items</p>{o.lines.map((l) => <p key={l.product_id + l.size}>{l.sku} · {l.title} · {l.size} × {l.qty}</p>)}<p className="mt-2">Total {inr(o.totals.total)} (shipping {inr(o.totals.shipping)}, discount {inr(o.totals.discount)})</p></div>
        <div className="text-sm"><p className="eyebrow mb-2">Payment</p><p className="mb-2">{o.payment_method === "cod" ? "Cash on Delivery" : "Razorpay"}</p><Badge tone={statusTone(o.payment_status)}>{o.payment_status}</Badge>{o.payment_id && <p className="mt-2 break-all text-xs">Payment: {o.payment_id}</p>}{o.razorpay_order_id && <p className="break-all text-xs">RZP order: {o.razorpay_order_id}</p>}
          {o.cod_collected_at && <p className="mt-2 text-xs" data-testid="cod-collection-details">Collected {new Date(o.cod_collected_at).toLocaleString("en-IN")}{o.cod_collected_by?.email && ` by ${o.cod_collected_by.email}`}</p>}
          {o.payment_method === "cod" && o.status === "delivered" && o.payment_status === "pending_collection" && <button className="btn-outline mt-3 px-4 py-2" onClick={collectCod} data-testid="admin-cod-collect-button">Record COD collection</button>}
          {o.payment_method !== "cod" && o.payment_status === "paid" && <button className="btn-outline mt-3 px-4 py-2" onClick={refund} data-testid="admin-refund-button">Refund</button>}</div>
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <Timeline order={o} />
        {NEXT[o.status] && (
          <div className="space-y-3" data-testid="admin-order-status-form">
            <select className="input-luxe h-10" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} data-testid="admin-order-status-select"><option value="">Update status…</option>{NEXT[o.status].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
            {f.status === "shipped" && <><input className="input-luxe h-10" placeholder="Carrier" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} data-testid="admin-carrier-input" /><input className="input-luxe h-10" placeholder="Tracking number" value={f.tracking_number} onChange={(e) => setF({ ...f, tracking_number: e.target.value })} data-testid="admin-tracking-input" /><input className="input-luxe h-10" placeholder="Tracking URL (https://…)" value={f.tracking_url} onChange={(e) => setF({ ...f, tracking_url: e.target.value })} /></>}
            <input className="input-luxe h-10" placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <button className="btn-primary" disabled={!f.status} onClick={update} data-testid="admin-order-update-button">Update</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data } = useQuery({ queryKey: ["admin-orders", q, status, page], queryFn: () => api.get("/admin/orders", { params: { q, status, page } }).then((r) => r.data) });
  return (
    <div data-testid="admin-orders">
      <AdminH1>Orders</AdminH1>
      <div className="mb-5 flex flex-wrap gap-3">
        <input className="input-luxe h-10 max-w-xs bg-ivory" placeholder="Order no., email, name, phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-testid="admin-orders-search" />
        <select className="input-luxe h-10 w-48 bg-ivory" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} data-testid="admin-orders-status-filter"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).filter(([k]) => k !== "payment_failed").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {open && <div className="mb-6"><OrderDetail id={open} onClose={() => setOpen(null)} /></div>}
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-sand" onClick={() => setOpen(o.id)} data-testid={`admin-order-row-${o.order_number}`}>
                <td className="p-3 font-semibold">{o.order_number}</td><td>{new Date(o.created_at).toLocaleDateString("en-IN")}</td><td>{o.shipping?.name}<br /><span className="text-xs text-taupe">{o.email}</span></td>
                <td>{inr(o.totals.total)}</td><td><span className="block text-xs">{o.payment_method === "cod" ? "COD" : "Razorpay"}</span><Badge tone={statusTone(o.payment_status)}>{o.payment_status}</Badge></td><td><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status] || o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <p className="p-6 text-sm text-taupe">No orders found.</p>}
      </div>
      {data && <Pager page={data.page} pages={data.pages} setPage={setPage} />}
    </div>
  );
}
