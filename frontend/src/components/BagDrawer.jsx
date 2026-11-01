import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useCart } from "@/context/CartContext";
import { api, img, inr } from "@/lib/api";

export function QtyStepper({ value, max, onChange, testid }) {
  return (
    <div className="inline-flex h-9 items-center border border-line2" data-testid={testid}>
      <button type="button" aria-label="Decrease quantity" className="flex h-full w-9 items-center justify-center disabled:opacity-30" disabled={value <= 1} onClick={() => onChange(value - 1)} data-testid={`${testid}-dec`}><Minus size={13} /></button>
      <span className="w-7 text-center text-sm" aria-live="polite" data-testid={`${testid}-value`}>{value}</span>
      <button type="button" aria-label="Increase quantity" className="flex h-full w-9 items-center justify-center disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} data-testid={`${testid}-inc`}><Plus size={13} /></button>
    </div>
  );
}

export function BagLine({ l, max, onQty, onRemove, compact }) {
  return (
    <li className="flex gap-4 py-5" data-testid={`bag-line-${l.slug}-${l.size}`}>
      <Link to={`/product/${l.slug}`} className="block w-20 shrink-0 sm:w-24"><div className="aspect-[3/4] bg-linen"><img src={img(l.image)} alt={l.title} className="h-full w-full object-cover" loading="lazy" /></div></Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <Link to={`/product/${l.slug}`} className="font-serif text-lg leading-snug">{l.title}</Link>
          {onRemove && <button aria-label={`Remove ${l.title}`} onClick={onRemove} className="h-8 w-8 shrink-0 text-taupe hover:text-ink" data-testid={`bag-remove-${l.slug}-${l.size}`}><X size={16} className="mx-auto" /></button>}
        </div>
        <p className="mt-1 text-xs text-taupe">{l.color} · Size {l.size}</p>
        <div className="mt-auto flex items-end justify-between pt-3">
          {onQty ? <QtyStepper value={l.qty} max={max ?? 5} onChange={onQty} testid={`bag-qty-${l.slug}-${l.size}`} /> : <span className="text-xs text-taupe">Qty {l.qty}</span>}
          <span className="text-sm" data-testid={`bag-line-total-${l.slug}-${l.size}`}>{inr((l.unit_price ?? l.price) * l.qty)}</span>
        </div>
      </div>
    </li>
  );
}

export function BagDrawer() {
  const { items, open, setOpen, update, remove } = useCart();
  const [priced, setPriced] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open || !items.length) return setPriced(null);
    api.post("/cart/validate", { items: items.map(({ product_id, size, qty }) => ({ product_id, size, qty })) }).then((r) => setPriced(r.data)).catch(() => setPriced(null));
  }, [open, items]);

  const maxFor = (l) => priced?.lines.find((x) => x.product_id === l.product_id && x.size === l.size)?.max_qty ?? 5;
  const priceFor = (l) => priced?.lines.find((x) => x.product_id === l.product_id && x.size === l.size)?.unit_price ?? l.price;
  const t = priced?.totals;
  const threshold = priced?.free_shipping_threshold;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col bg-ivory p-0 sm:max-w-md" data-testid="bag-drawer">
        <SheetHeader className="border-b border-line px-6 py-5 text-left">
          <SheetTitle className="font-serif text-2xl font-normal">Your Bag {items.length > 0 && <span className="text-base text-taupe">({items.reduce((s, x) => s + x.qty, 0)})</span>}</SheetTitle>
          <SheetDescription className="sr-only">Review items in your shopping bag</SheetDescription>
        </SheetHeader>
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center" data-testid="bag-empty">
            <p className="font-serif text-3xl">Your bag is empty</p>
            <p className="mt-3 text-sm text-taupe">Discover pieces from The Jaipur Edit.</p>
            <button className="btn-primary mt-8" onClick={() => { setOpen(false); nav("/shop"); }} data-testid="bag-empty-shop-button">Continue shopping</button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-6">
              {items.map((l) => <BagLine key={l.product_id + l.size} l={{ ...l, unit_price: priceFor(l) }} max={maxFor(l)} onQty={(q) => update(l.product_id, l.size, q)} onRemove={() => remove(l.product_id, l.size)} />)}
            </ul>
            {priced?.issues?.length > 0 && (
              <div className="mx-6 mb-2 border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert" data-testid="bag-issues">
                {priced.issues.map((i) => <p key={i.product_id + i.size}>{i.message}</p>)}
              </div>
            )}
            <div className="border-t border-line px-6 py-6">
              {t && threshold > 0 && t.subtotal < threshold && <p className="mb-4 text-xs text-taupe" data-testid="bag-free-shipping-note">Add {inr(threshold - t.subtotal)} more for complimentary shipping.</p>}
              <div className="flex justify-between text-sm"><span>Subtotal</span><span data-testid="bag-subtotal">{inr(t?.subtotal ?? items.reduce((s, l) => s + l.price * l.qty, 0))}</span></div>
              <p className="mt-1 text-xs text-taupe">Shipping and offers calculated at checkout. Prices include applicable taxes.</p>
              <button className="btn-primary mt-5 w-full" onClick={() => { setOpen(false); nav("/checkout"); }} data-testid="bag-checkout-button">Proceed to checkout</button>
              <button className="mt-3 w-full py-2 text-xs uppercase tracking-[0.2em] text-taupe hover:text-ink" onClick={() => setOpen(false)} data-testid="bag-continue-button">Continue shopping</button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
