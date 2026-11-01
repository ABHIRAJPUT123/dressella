import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, inr } from "@/lib/api";
import { AdminH1, Badge } from "@/admin/AdminLayout";

const Stat = ({ label, value, testid }) => (
  <div className="border border-line bg-ivory p-6" data-testid={testid}><p className="eyebrow">{label}</p><p className="mt-3 font-serif text-4xl">{value}</p></div>
);

export default function AdminDashboard() {
  const { data: m } = useQuery({ queryKey: ["admin-metrics"], queryFn: () => api.get("/admin/metrics").then((r) => r.data) });
  if (!m) return <div className="h-40 animate-pulse bg-linen" />;
  return (
    <div data-testid="admin-dashboard">
      <AdminH1>Overview</AdminH1>
      {!m.payment_configured && <div role="alert" className="mb-6 border-l-2 border-gold bg-ivory p-4 text-sm" data-testid="admin-payment-warning"><strong>Payments not configured.</strong> Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET (test mode first) to the backend .env and restart — checkout switches to real Razorpay payments automatically. Orders currently stay “awaiting payment”.</div>}
      {m.payment_configured && <p className="mb-6 text-xs text-taupe">Razorpay mode: <strong className="uppercase">{m.payment_mode}</strong></p>}
      <div className="mb-6 grid gap-4 md:grid-cols-3" data-testid="admin-integrations">
        <div className="border border-line bg-ivory p-5 text-sm"><p className="eyebrow mb-3">Razorpay</p><Badge tone={m.payment_configured ? "ok" : "warn"}>{m.payment_configured ? `${m.payment_mode} keys active` : "keys missing"}</Badge><p className="mt-3 text-xs text-taupe">Webhook URL (events: payment.captured, order.paid, payment.failed):</p><code className="mt-1 block break-all text-[11px]" data-testid="admin-webhook-url">{m.webhook_url}</code></div>
        <div className="border border-line bg-ivory p-5 text-sm"><p className="eyebrow mb-3">Transactional email</p><Badge tone={m.email_configured ? "ok" : "warn"}>{m.email_configured ? "live" : "logging only"}</Badge><p className="mt-3 text-xs text-taupe">Order confirmed · shipped · delivered · cancelled · refunded · password reset. <Link to="/admin/emails" className="underline">View log</Link></p></div>
        <div className="border border-line bg-ivory p-5 text-sm"><p className="eyebrow mb-3">Catalogue</p><Badge tone={m.demo_products ? "warn" : "ok"}>{m.demo_products ? `${m.demo_products} demo-priced` : "prices confirmed"}</Badge><p className="mt-3 text-xs text-taupe">{m.demo_products ? "Confirm real retail prices and stock before launch." : "All products carry owner-confirmed prices and stock."} <Link to="/admin/products/bulk" className="underline" data-testid="admin-bulk-link">Prices & stock</Link></p></div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenue (paid)" value={inr(m.revenue)} testid="metric-revenue" />
        <Stat label="Paid orders" value={m.paid_orders} testid="metric-paid-orders" />
        <Stat label="To fulfil" value={m.to_fulfil} testid="metric-to-fulfil" />
        <Stat label="Awaiting payment" value={m.pending_orders} testid="metric-pending" />
        <Stat label="Customers" value={m.customers} testid="metric-customers" />
        <Link to="/admin/exchanges" data-testid="metric-exchange-requests-link"><Stat label="Exchange requests" value={m.exchange_requests} testid="metric-exchange-requests" /></Link>
        <Stat label="Subscribers" value={m.subscribers} testid="metric-subscribers" />
        <Stat label="Products" value={m.products} testid="metric-products" />
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="border border-line bg-ivory p-6 lg:col-span-2">
          <p className="eyebrow mb-6">Paid revenue — last 30 days with sales</p>
          {m.daily.length ? (
            <div className="h-64"><ResponsiveContainer><BarChart data={m.daily}><XAxis dataKey="_id" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(v) => inr(v)} /><Bar dataKey="revenue" fill="#1A1918" /></BarChart></ResponsiveContainer></div>
          ) : <p className="text-sm text-taupe">No paid orders yet. Sales data will appear here once payments are verified.</p>}
        </div>
        <div className="space-y-6">
          <div className="border border-line bg-ivory p-6"><p className="eyebrow mb-4">Top sellers</p>{m.top_products.length ? <ul className="space-y-2 text-sm">{m.top_products.map((p) => <li key={p.sku} className="flex justify-between"><span>{p.title}</span><span>{p.sales_count}</span></li>)}</ul> : <p className="text-sm text-taupe">No sales yet.</p>}</div>
          <div className="border border-line bg-ivory p-6" data-testid="admin-low-stock"><p className="eyebrow mb-4">Low stock (≤2)</p>{m.low_stock.length ? <ul className="space-y-2 text-sm">{m.low_stock.map((p) => <li key={p.sku + p.size} className="flex justify-between"><span>{p.title} · {p.size}</span><span>{p.stock}</span></li>)}</ul> : <p className="text-sm text-taupe">All sizes above threshold.</p>}</div>
        </div>
      </div>
    </div>
  );
}
