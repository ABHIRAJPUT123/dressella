import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const WishCtx = createContext(null);
const KEY = "anora_wishlist_v1";

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  });
  const synced = useRef(false);

  useEffect(() => {
    if (!user) {
      synced.current = false;
      return;
    }
    api.get("/account/wishlist").then(({ data }) => {
      setIds((local) => {
        const merged = [...new Set([...data, ...local])];
        if (merged.length !== data.length) api.put("/account/wishlist", { ids: merged }).catch(() => {});
        return merged;
      });
      synced.current = true;
    });
  }, [user]);

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(ids)), [ids]);

  const toggle = useCallback(
    (p) => {
      setIds((cur) => {
        const has = cur.includes(p.id);
        const next = has ? cur.filter((i) => i !== p.id) : [p.id, ...cur];
        if (user && synced.current) api.put("/account/wishlist", { ids: next }).catch(() => {});
        toast(has ? "Removed from wishlist" : "Saved to wishlist", { description: p.title });
        return next;
      });
    },
    [user]
  );

  const value = useMemo(() => ({ ids, toggle, has: (id) => ids.includes(id) }), [ids, toggle]);
  return <WishCtx.Provider value={value}>{children}</WishCtx.Provider>;
}

export const useWishlist = () => useContext(WishCtx);
