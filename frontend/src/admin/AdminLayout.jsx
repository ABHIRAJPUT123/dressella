import { NavLink, Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, PackagePlus, ShoppingCart, Tag, Users, Mail, FileText, ExternalLink, Send, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSeo } from "@/lib/seo";

const NAV = [
  ["/admin", "Overview", LayoutDashboard, true],
  ["/admin/products", "Products", Package],
  ["/admin/orders", "Orders", ShoppingCart],
  ["/admin/exchanges", "Returns & exchanges", RefreshCw],
  ["/admin/emails", "Emails", Send],
  ["/admin/coupons", "Coupons", Tag],
  ["/admin/customers", "Customers", Users],
  ["/admin/newsletter", "Newsletter", Mail],
  ["/admin/content", "Content & Pages", FileText],
  ["/admin/products/new", "Add Stock", PackagePlus, true],
];

export const AdminH1 = ({ children, action }) => (
  <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><h1 className="font-serif text-4xl">{children}</h1>{action}</div>
);

export const Pager = ({ page, pages, setPage }) => pages > 1 && (
  <div className="mt-6 flex items-center gap-3 text-xs" data-testid="admin-pager">
    <button className="chip" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="admin-pager-prev">Prev</button>
    <span>Page {page} of {pages}</span>
    <button className="chip" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="admin-pager-next">Next</button>
  </div>
);

export const Badge = ({ children, tone = "default" }) => {
  const t = { default: "bg-linen text-ink", ok: "bg-[#E4EBDD] text-[#33461F]", warn: "bg-[#F4E7CF] text-[#6B4A12]", bad: "bg-[#F3DAD7] text-[#7A2219]" }[tone];
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${t}`}>{children}</span>;
};

export const statusTone = (s) => ({ confirmed: "ok", delivered: "ok", paid: "ok", published: "ok", shipped: "ok", processing: "warn", pending_payment: "warn", pending: "warn", draft: "warn", cancelled: "bad", refunded: "bad", archived: "default" }[s] || "default");

export default function AdminLayout() {
  useSeo({ title: "Admin", noindex: true });
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  if (user === null) return <div className="p-10">Loading…</div>;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== "admin" && user.role !== "staff") return (
    <div className="grid min-h-screen place-items-center p-8 text-center" data-testid="admin-forbidden"><div><h1 className="font-serif text-4xl">Access restricted</h1><p className="mt-3 text-sm text-taupe">This area is for DRESSELLA administrators only.</p><Link to="/" className="btn-primary mt-8">Return to store</Link></div></div>
  );
  return (
    <div className="min-h-screen bg-sand lg:grid lg:grid-cols-[240px_1fr]" data-testid="admin-layout">
      <aside className="border-b border-line bg-ink text-ivory lg:min-h-screen lg:border-0">
        <div className="px-6 py-6"><span className="font-serif text-xl tracking-[0.2em]">DRESSELLA</span></div>
        <nav aria-label="Admin" className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
          {NAV.map(([to, l, Icon, end]) => (
            <NavLink key={to} to={to} end={end || to === "/admin/products"} className={({ isActive }) => {
              const productSectionActive = to === "/admin/products" && pathname.startsWith("/admin/products/") && pathname !== "/admin/products/new";
              return `flex shrink-0 items-center gap-3 px-3 py-2.5 text-sm transition-colors ${isActive || productSectionActive ? "bg-ivory/10 text-ivory" : "text-ivory/65 hover:text-ivory"}`;
            }} data-testid={`admin-nav-${l.toLowerCase().split(" ")[0]}`}>
              <Icon size={16} strokeWidth={1.5} /> {l}
            </NavLink>
          ))}
        </nav>
        <div className="hidden space-y-2 px-6 py-8 text-xs text-ivory/60 lg:block">
          <p>{user.email}</p>
          <Link to="/" className="flex items-center gap-1.5 hover:text-ivory"><ExternalLink size={12} /> View store</Link>
          <button onClick={logout} className="hover:text-ivory" data-testid="admin-logout-button">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 p-5 sm:p-8 lg:p-12"><Outlet /></main>
    </div>
  );
}
