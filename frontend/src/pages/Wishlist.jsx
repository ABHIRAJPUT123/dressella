import { Link } from "react-router-dom";
import { useSeo } from "@/lib/seo";
import { useProductsByIds } from "@/lib/queries";
import { useWishlist } from "@/context/WishlistContext";
import { useAuth } from "@/context/AuthContext";
import { ProductGrid } from "@/components/ProductCard";

export function WishlistGrid() {
  const { ids } = useWishlist();
  const { data, isLoading } = useProductsByIds(ids);
  if (!ids.length) return (
    <div className="py-16 text-center" data-testid="wishlist-empty">
      <p className="font-serif text-3xl">Nothing saved yet</p>
      <p className="mt-3 text-sm text-taupe">Tap the heart on any piece to keep it here.</p>
      <Link to="/shop" className="btn-primary mt-8">Discover the collection</Link>
    </div>
  );
  return <ProductGrid items={data || []} loading={isLoading} count={ids.length} />;
}

export default function Wishlist() {
  useSeo({ title: "Wishlist", noindex: true });
  const { user } = useAuth();
  return (
    <div data-testid="wishlist-page">
      <section className="border-b border-line bg-cream">
        <div className="container-luxe py-14 sm:py-20">
          <p className="eyebrow mb-4">Saved pieces</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl">Wishlist</h1>
          {!user && <p className="mt-4 text-sm text-taupe">Saved on this device. <Link to="/login?next=/wishlist" className="underline underline-offset-4">Sign in</Link> to keep your wishlist across devices.</p>}
        </div>
      </section>
      <div className="container-luxe py-14 sm:py-20"><WishlistGrid /></div>
    </div>
  );
}
