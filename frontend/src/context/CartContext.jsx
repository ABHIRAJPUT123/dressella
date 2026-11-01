import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const CartCtx = createContext(null);
const KEY = "anora_bag_v1";
export const MAX_QTY = 5;

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
};

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(items)), [items]);

  const add = useCallback((p, size, qty = 1, maxQty = MAX_QTY, openBag = true) => {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.product_id === p.id && x.size === size);
      if (i >= 0) {
        const next = [...cur];
        next[i] = { ...next[i], qty: Math.min(next[i].qty + qty, maxQty) };
        return next;
      }
      return [...cur, { product_id: p.id, slug: p.slug, title: p.title, size, qty: Math.min(qty, maxQty), price: p.price, image: p.images?.[0]?.path || "", color: p.color?.name || "" }];
    });
    setAnnounce(`${p.title}, size ${size}, added to your bag`);
    toast.success("Added to bag", { description: `${p.title} · ${size}` });
    if (openBag) setOpen(true);
  }, []);

  const update = useCallback((pid, size, qty) => setItems((cur) => cur.map((x) => (x.product_id === pid && x.size === size ? { ...x, qty: Math.max(1, Math.min(qty, MAX_QTY)) } : x))), []);
  const remove = useCallback((pid, size) => {
    setItems((cur) => cur.filter((x) => !(x.product_id === pid && x.size === size)));
    setAnnounce("Item removed from your bag");
  }, []);
  const clear = useCallback(() => setItems([]), []);
  const replace = useCallback((next) => setItems(next), []);

  const count = items.reduce((s, x) => s + x.qty, 0);
  const value = useMemo(() => ({ items, add, update, remove, clear, replace, count, open, setOpen }), [items, add, update, remove, clear, replace, count, open]);
  return (
    <CartCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="sr-only" data-testid="bag-live-region">{announce}</div>
    </CartCtx.Provider>
  );
}

export const useCart = () => useContext(CartCtx);
