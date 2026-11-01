import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";

export function MobileNav({ open, onOpenChange, items, cats, cols }) {
  const { user } = useAuth();
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto bg-ivory p-0" data-testid="mobile-nav-drawer">
        <SheetHeader className="border-b border-line px-6 py-5 text-left">
          <SheetTitle className="font-serif text-2xl tracking-[0.3em]">DRESSELLA</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="px-6 py-6">
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.label}>
                <Link to={it.to} onClick={close} className="block py-3 font-serif text-2xl" data-testid={`mobile-nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}>{it.label}</Link>
              </li>
            ))}
          </ul>
          <p className="eyebrow mb-3 mt-8">Categories</p>
          <ul className="space-y-2 text-sm">
            {cats.map((c) => <li key={c.slug}><Link to={`/category/${c.slug}`} onClick={close} className="block py-1.5">{c.name}</Link></li>)}
          </ul>
          <p className="eyebrow mb-3 mt-8">Edits</p>
          <ul className="space-y-2 text-sm">
            {cols.map((c) => <li key={c.slug}><Link to={`/collections/${c.slug}`} onClick={close} className="block py-1.5">{c.name}</Link></li>)}
          </ul>
          <div className="mt-10 space-y-3 border-t border-line pt-6 text-sm">
            <Link to={user ? "/account" : "/login"} onClick={close} className="block py-1.5" data-testid="mobile-nav-account">{user ? "My Account" : "Sign in / Register"}</Link>
            <Link to="/track-order" onClick={close} className="block py-1.5">Track Order</Link>
            <Link to="/contact" onClick={close} className="block py-1.5">Client Care</Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
