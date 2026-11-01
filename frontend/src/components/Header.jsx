import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Search, User, Heart, ShoppingBag, Menu } from "lucide-react";
import { useMeta } from "@/lib/queries";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { SearchOverlay } from "@/components/SearchOverlay";
import { img } from "@/lib/api";

export function useNavItems() {
  const { data } = useMeta();
  const cats = (data?.categories || []).filter((c) => c.count);
  const cols = (data?.collections || []).filter((c) => c.count);
  const has = (s) => cats.some((c) => c.slug === s);
  return {
    cats, cols, meta: data,
    items: [
      { label: "New In", to: "/new-in" },
      { label: "Clothing", to: "/shop", mega: "clothing" },
      has("dresses") && { label: "Dresses", to: "/category/dresses" },
      has("co-ord-sets") && { label: "Co-ord Sets", to: "/category/co-ord-sets" },
      has("tops") && { label: "Tops", to: "/category/tops" },
      cols.some((c) => c.slug === "festive-edit") && { label: "Occasionwear", to: "/collections/festive-edit" },
      { label: "Collections", to: "/collections", mega: "collections" },
      data?.has_sale && { label: "Sale", to: "/sale" },
    ].filter(Boolean),
  };
}

function MegaPanel({ kind, cats, cols, meta, close }) {
  const hero = meta?.settings?.editorials?.[kind === "clothing" ? 0 : 1];
  const list = kind === "clothing" ? cats.map((c) => ({ ...c, to: `/category/${c.slug}` })) : cols.map((c) => ({ ...c, to: `/collections/${c.slug}` }));
  return (
    <div className="rise absolute inset-x-0 top-full z-40 border-t border-line bg-ivory shadow-[0_40px_60px_-30px_rgba(23,21,19,.28)]" style={{ animationDuration: ".45s" }} data-testid={`mega-menu-${kind}`}>
      <div className="container-luxe grid grid-cols-12 gap-10 py-14">
        <div className="col-span-3">
          <p className="eyebrow mb-5">{kind === "clothing" ? "Shop by category" : "Curated edits"}</p>
          <ul className="space-y-3">
            {list.map((c) => (
              <li key={c.slug}>
                <Link to={c.to} onClick={close} className="link-u font-serif text-2xl" data-testid={`mega-link-${c.slug}`}>{c.name}</Link>
              </li>
            ))}
            {kind === "clothing" && <li><Link to="/shop" onClick={close} className="link-u text-xs uppercase tracking-[0.2em]" data-testid="mega-link-all">View all clothing</Link></li>}
          </ul>
        </div>
        <div className="col-span-4">
          <p className="eyebrow mb-5">{kind === "clothing" ? "Edits" : "Categories"}</p>
          <ul className="space-y-2.5 text-sm text-taupe">
            {(kind === "clothing" ? cols.map((c) => ({ ...c, to: `/collections/${c.slug}` })) : cats.map((c) => ({ ...c, to: `/category/${c.slug}` }))).map((c) => (
              <li key={c.slug}><Link to={c.to} onClick={close} className="link-u hover:text-ink">{c.name}</Link></li>
            ))}
          </ul>
        </div>
        {hero && (
          <Link to={hero.link} onClick={close} className="group col-span-5 grid grid-cols-2 items-end gap-6">
            <div className="aspect-[3/4] overflow-hidden bg-linen"><img src={img(hero.image)} alt={hero.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" /></div>
            <div><p className="eyebrow mb-2">Featured</p><p className="font-serif text-2xl">{hero.title}</p><p className="mt-2 text-sm text-taupe">{hero.text}</p></div>
          </Link>
        )}
      </div>
    </div>
  );
}

const IconBtn = ({ label, testid, onClick, to, children, badge }) => {
  const cls = "relative inline-flex h-11 w-11 max-[360px]:h-9 max-[360px]:w-9 items-center justify-center text-ink transition-[opacity,transform] duration-300 hover:opacity-60";
  const inner = (<>{children}{badge > 0 && <span className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cocoa px-1 text-[9px] font-medium text-ivory" data-testid={`${testid}-count`}>{badge}</span>}</>);
  return to ? <Link to={to} aria-label={label} className={cls} data-testid={testid}>{inner}</Link> : <button type="button" aria-label={label} onClick={onClick} className={cls} data-testid={testid}>{inner}</button>;
};

export function Header() {
  const { items, cats, cols, meta } = useNavItems();
  const { count, setOpen } = useCart();
  const { ids } = useWishlist();
  const { user } = useAuth();
  const [mega, setMega] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ivory/90 backdrop-blur-xl" onMouseLeave={() => setMega(null)} data-testid="site-header">
      <div className="container-luxe grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-[76px]">
        <div className="flex items-center gap-1">
          <span className="lg:hidden"><IconBtn label="Open menu" testid="mobile-menu-button" onClick={() => setMobile(true)}><Menu size={20} strokeWidth={1.4} /></IconBtn></span>
          <span className="hidden lg:inline-flex"><IconBtn label="Search" testid="header-search-button" onClick={() => setSearch(true)}><Search size={19} strokeWidth={1.4} /></IconBtn></span>
        </div>
        <div className="flex justify-center"><Logo /></div>
        <div className="flex items-center justify-end">
          <span className="lg:hidden"><IconBtn label="Search" testid="header-search-button-mobile" onClick={() => setSearch(true)}><Search size={19} strokeWidth={1.4} /></IconBtn></span>
          <span className="hidden sm:inline-flex"><IconBtn label={user ? "My account" : "Sign in"} testid="header-account-link" to={user ? "/account" : "/login"}><User size={19} strokeWidth={1.4} /></IconBtn></span>
          <IconBtn label={`Wishlist, ${ids.length} items`} testid="header-wishlist-link" to="/wishlist" badge={ids.length}><Heart size={19} strokeWidth={1.4} /></IconBtn>
          <IconBtn label={`Shopping bag, ${count} items`} testid="header-bag-button" onClick={() => setOpen(true)} badge={count}><ShoppingBag size={19} strokeWidth={1.4} /></IconBtn>
        </div>
      </div>
      <nav aria-label="Primary" className="hidden border-t border-line/60 lg:block">
        <ul className="container-luxe flex h-[52px] items-center justify-center gap-10 xl:gap-12">
          {items.map((it) => (
            <li key={it.label} onMouseEnter={() => setMega(it.mega || null)} onFocus={() => setMega(it.mega || null)}>
              <NavLink to={it.to} onClick={() => setMega(null)} className="link-u text-[10.5px] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:text-ink" aria-haspopup={it.mega ? "true" : undefined} aria-expanded={it.mega ? mega === it.mega : undefined} data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}>{it.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {mega && <MegaPanel kind={mega} cats={cats} cols={cols} meta={meta} close={() => setMega(null)} />}
      <MobileNav open={mobile} onOpenChange={setMobile} items={items} cats={cats} cols={cols} />
      <SearchOverlay open={search} onClose={() => setSearch(false)} />
    </header>
  );
}
