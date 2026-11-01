import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { api, errMsg, inr } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { openRazorpay } from "@/lib/razorpay";
import { Summary } from "@/pages/Checkout";

export const STATUS_LABEL = { pending: "Awaiting payment", paid: "Paid", pending_payment: "Awaiting payment", pending_collection: "Payment due on delivery", payment_collected: "Payment collected", payment_review: "Payment under review", confirmed: "Confirmed", processing: "Being prepared", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded", payment_failed: "Payment not completed" };

export function Timeline({ order }) {
  return (
    <ol className="space-y-4 border-l border-line pl-6" data-testid="order-timeline">
      {(order.timeline || []).map((t) => (
        <li key={`${t.status}-${t.at}`} className="relative">
          <span className="absolute -left-[29px] top-1.5 h-2 w-2 rounded-full bg-ink" aria-hidden="true" />
          <p className="text-sm font-semibold">{STATUS_LABEL[t.status] || t.status}</p>
          <p className="text-xs text-taupe">{new Date(t.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{t.note ? ` — ${t.note}` : ""}</p>
        </li>
      ))}
      {order.tracking?.number && <li className="text-sm">Carrier: {order.tracking.carrier} · Tracking: <span data-testid="order-tracking-number">{order.tracking.number}</span>{order.tracking.url && <> · <a href={order.tracking.url} target="_blank" rel="noopener noreferrer" className="underline">Track shipment</a></>}</li>}
    </ol>
  );
}

function orderHeading(o, { cancelled, paymentReview, paid }) {
  if (cancelled) return paid ? "Payment received after cancellation" : "This order was cancelled";
  if (paymentReview) return "Payment received — order under review";
  if (paid || o.payment_status === "payment_collected") return "Thank you — your order is confirmed";
  if (o.payment_method === "cod") return "Order confirmed — pay on delivery";
  return "Your order is awaiting payment";
}

export default function OrderView() {
  useSeo({ title: "Your order", noindex: true });
  const { id } = useParams();
  const [sp] = useSearchParams();
  const t = sp.get("t") || "";
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["order", id], queryFn: () => api.get(`/orders/view/${id}`, { params: { t } }).then((r) => r.data), refetchInterval: (q) => (["pending", "pending_collection"].includes(q.state.data?.order?.payment_status) ? 8000 : false) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="container-luxe py-28"><div className="h-10 w-1/2 animate-pulse bg-linen" /></div>;
  if (isError) return <div className="container-luxe py-28 text-center"><h1 className="text-4xl">Order not found</h1><Link to="/track-order" className="btn-outline mt-8">Track an order</Link></div>;
  const o = data.order;
  const cancelled = o.status === "cancelled";
  const paymentReview = o.status === "payment_review";
  const paid = o.payment_status === "paid" || o.payment_status === "refunded";
  const codConfirmed = !cancelled && !paymentReview && o.payment_method === "cod";

  const pay = async () => {
    setBusy(true); setMsg("");
    try {
      const { data: r } = await api.post("/checkout/retry", { order_id: o.id, access_token: t });
      openRazorpay({
        rz: r.razorpay, order: o, prefill: { name: o.shipping.name, email: o.email, contact: o.shipping.phone },
        onSuccess: async (resp) => { try { await api.post("/checkout/verify", { order_id: o.id, access_token: t, ...resp }); } catch (e) { setMsg(errMsg(e)); } refetch(); setBusy(false); },
        onDismiss: () => setBusy(false),
        onFail: (m) => { setMsg(m); setBusy(false); },
      });
    } catch (e) { setMsg(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="container-luxe grid gap-12 py-12 sm:py-16 lg:grid-cols-12" data-testid="order-page">
      <div className="lg:col-span-7">
        {cancelled ? <AlertTriangle size={36} strokeWidth={1.2} /> : paid || codConfirmed ? <CheckCircle2 size={36} strokeWidth={1.2} aria-hidden="true" /> : <Clock size={36} strokeWidth={1.2} aria-hidden="true" />}
        <p className="eyebrow mt-6">Order {o.order_number}</p>
        <h1 className="mt-3 text-4xl sm:text-5xl" data-testid="order-heading">{orderHeading(o, { cancelled, paymentReview, paid })}</h1>
        <p className="mt-3 text-sm" data-testid="order-payment-details">
          Payment: {o.payment_method === "cod" ? "Cash on Delivery" : "Razorpay"} · {STATUS_LABEL[o.payment_status] || o.payment_status}
        </p>
        <p className="mt-4 max-w-lg text-sm text-taupe" data-testid="order-status-text">
          {cancelled && paid ? "The order will not be shipped. Our team will review the payment for a refund; no further action is needed." : cancelled ? "No further action is needed." : paymentReview ? "The payment was received, but the order needs a manual review before it can be fulfilled. Our team will contact you." : o.payment_method === "cod" && o.payment_status === "pending_collection" ? "Please pay the delivery agent when your order arrives." : paid ? `Payment verified. We'll email ${o.email} when your order ships (once email notifications are enabled).` : data.payment_configured ? "We haven't received a verified payment for this order yet. If you've just paid, this page will update automatically. Otherwise you can complete payment below." : "Online payment is still being set up for this store, so no payment has been taken and this order is not yet confirmed. Our team may contact you, or you can try again later."}
        </p>
        {!paid && o.status === "pending_payment" && data.payment_configured && <button className="btn-primary mt-8" onClick={pay} disabled={busy} data-testid="order-complete-payment-button">{busy ? "Opening…" : `Complete payment · ${inr(o.totals.total)}`}</button>}
        {msg && <p role="alert" className="mt-4 text-sm text-destructive">{msg}</p>}
        <div className="mt-12 grid gap-10 sm:grid-cols-2">
          <div><p className="eyebrow mb-3">Delivering to</p><p className="text-sm leading-relaxed">{o.shipping.name}<br />{o.shipping.line1}{o.shipping.line2 && <>, {o.shipping.line2}</>}<br />{o.shipping.city}, {o.shipping.state} {o.shipping.pincode}<br />{o.shipping.phone}</p></div>
          <div><p className="eyebrow mb-3">Status</p><Timeline order={o} /></div>
        </div>
        <Link to="/shop" className="btn-outline mt-12">Continue shopping</Link>
        <Link to="/returns" className="ml-5 text-sm underline">Return & exchange policy</Link>
      </div>
      <div className="lg:col-span-5"><Summary priced={{ lines: o.lines, totals: o.totals, coupon: o.coupon }} /></div>
    </div>
  );
}
