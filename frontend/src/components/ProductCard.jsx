import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { img, inr } from "@/lib/api";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";

export function ProductCard({ p, priority }) {
  const { has, toggle } = useWishlist();
  const { add } = useCart();
  const [quick, setQuick] = useState(false);
  const saved = has(p.id);
  const second = p.images?.[1]?.path;
  const discount = p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0;

  return (
    <article className="group relative" data-testid={`product-card-${p.slug}`} onMouseLeave={() => setQuick(false)}>
      <div className="relative aspect-[3/4] overflow-hidden bg-linen">
        <Link to={`/product/${p.slug}`} aria-label={p.title} tabIndex={-1}>
          <img src={img(p.images?.[0]?.path)} alt={p.images?.[0]?.alt || p.title} loading={priority ? "eager" : "lazy"} decoding="async" width="600" height="800"
            className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1200ms] ease-out group-hover:scale-[1.04] ${second ? "group-hover:opacity-0" : ""}`} />
          {second && <img src={img(second)} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-[1.04] object-cover opacity-0 transition-[opacity,transform] duration-[1200ms] ease-out group-hover:scale-100 group-hover:opacity-100" />}
        </Link>
        {!p.in_stock && <span className="absolute left-3 top-3 bg-ivory px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.24em]" data-testid={`product-card-soldout-${p.slug}`}>Sold out</span>}
        {p.in_stock && discount > 0 && <span className="absolute left-3 top-3 bg-ink px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.24em] text-ivory">−{discount}%</span>}
        <button type="button" onClick={() => toggle(p)} aria-pressed={saved} aria-label={saved ? `Remove ${p.title} from wishlist` : `Save ${p.title} to wishlist`}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-ivory/0 transition-[background-color,transform] duration-300 hover:scale-105 hover:bg-ivory/85" data-testid={`wishlist-toggle-${p.slug}`}>
          <Heart size={17} strokeWidth={1.3} className={saved ? "fill-ink" : ""} />
        </button>
        {p.in_stock && (
          <div className="absolute inset-x-3 bottom-3 hidden translate-y-[calc(100%+12px)] bg-ivory/90 p-2.5 backdrop-blur-md transition-transform duration-500 ease-out group-hover:translate-y-0 group-focus-within:translate-y-0 md:block">
            {!quick ? (
              <button type="button" onClick={() => setQuick(true)} className="w-full py-2 text-[10.5px] font-medium uppercase tracking-[0.28em]" data-testid={`quick-add-${p.slug}`}>Quick add</button>
            ) : (
              <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Choose a size">
                {p.sizes.map((s) => (
                  <button key={s.size} type="button" disabled={!s.available} onClick={() => { add(p, s.size, 1, s.max_qty); setQuick(false); }}
                    className="chip h-9 min-w-[2.5rem] disabled:cursor-not-allowed disabled:text-mute disabled:line-through" data-testid={`quick-add-size-${p.slug}-${s.size}`}>{s.size}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="pt-4">
        <Link to={`/product/${p.slug}`} className="block font-serif text-[17px] leading-snug sm:text-lg" data-testid={`product-card-title-${p.slug}`}>{p.title}</Link>
        <div className="mt-1 flex items-center gap-2 text-[13px] tracking-wide text-charcoal">
          <span data-testid={`product-card-price-${p.slug}`}>{inr(p.price)}</span>
          {discount > 0 && <s className="text-mute">{inr(p.compare_at_price)}</s>}
        </div>
        {p.color?.hex && <span className="mt-2.5 inline-block h-3 w-3 rounded-full border border-line2" style={{ background: p.color.hex }} title={p.color.name} aria-label={`Colour: ${p.color.name}`} />}
      </div>
    </article>
  );
}

export const CardSkeleton = () => (
  <div aria-hidden="true">
    <div className="aspect-[3/4] animate-pulse bg-linen" />
    <div className="mt-4 h-3 w-3/4 animate-pulse bg-linen" />
    <div className="mt-2 h-3 w-1/4 animate-pulse bg-linen" />
  </div>
);

export function ProductGrid({ items, loading, count = 8, cols = "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" }) {
  return (
    <div className={`grid ${cols} gap-x-4 gap-y-14 sm:gap-x-6 lg:gap-x-8`} data-testid="product-grid">
      {loading ? Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />) : items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 4} />)}
    </div>
  );
}
