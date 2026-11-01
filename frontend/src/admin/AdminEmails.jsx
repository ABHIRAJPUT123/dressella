import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AdminH1, Badge } from "@/admin/AdminLayout";

const KIND = { order_confirmed: "Order confirmed", order_shipped: "Shipped", order_delivered: "Delivered", order_cancelled: "Cancelled", order_refunded: "Refunded", password_reset: "Password reset" };
const tone = (s) => ({ sent: "ok", logged: "warn", failed: "bad" }[s] || "default");

export default function AdminEmails() {
  const { data } = useQuery({ queryKey: ["admin-emails"], queryFn: () => api.get("/admin/emails").then((r) => r.data), refetchInterval: 15000 });
  if (!data) return <div className="h-40 animate-pulse bg-linen" />;
  return (
    <div data-testid="admin-emails">
      <AdminH1>Transactional emails</AdminH1>
      <div className="mb-6 border-l-2 border-gold bg-ivory p-4 text-sm" data-testid="admin-email-status">
        {data.configured
          ? <>Emails are <strong>live</strong>, sent as <strong>{data.from_name}</strong> via Emergent's managed email service. Customers receive order confirmation, shipping (with tracking), delivery, cancellation, refund and password-reset emails automatically.</>
          : <><strong>Email service not configured.</strong> Emails are composed and recorded here with status “logged”, but not delivered. Add EMERGENT_EMAIL_KEY to the backend .env to start sending.</>}
      </div>
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe"><tr><th className="p-3">When</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Status</th></tr></thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0" data-testid={`email-row-${e.id}`}>
                <td className="whitespace-nowrap p-3 text-xs text-taupe">{new Date(e.created_at).toLocaleString("en-IN")}</td>
                <td>{KIND[e.kind] || e.kind}</td><td>{e.to}</td><td className="max-w-xs truncate pr-3">{e.subject}</td>
                <td><Badge tone={tone(e.status)}>{e.status}</Badge>{e.error && <span className="ml-2 text-[11px] text-destructive">{e.error}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <p className="p-6 text-sm text-taupe">No emails yet. They appear here as orders are paid, shipped or updated.</p>}
      </div>
    </div>
  );
}
