import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart, Ruler } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg, img, inr, PIN_RE } from "@/lib/api";
import { useMeta, useProductsByIds } from "@/lib/queries";
import { useSeo } from "@/lib/seo";
import { pushRecent, getRecent } from "@/lib/recent";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { Breadcrumbs } from "@/components/Common";
import { Gallery } from "@/components/Gallery";
import { QtyStepper } from "@/components/BagDrawer";
import { ProductGrid } from "@/components/ProductCard";
import { SizeGuideTable } from "@/components/SizeGuideTable";
import NotFound from "@/pages/NotFound";

function Pincode() {
  const [pin, setPin] = useState("");
  const [res, setRes] = useState(null);
  const check = async (e) => {
    e.preventDefault();
    if (!PIN_RE.test(pin)) return setRes({ error: "Please enter a valid 6-digit PIN code." });
    try {
      const { data } = await api.get(`/pincode/${pin}`);
      setRes(data);
    } catch (err) {
      setRes({ error: errMsg(err) });
    }
  };
  return (
    <form onSubmit={check} className="mt-8 border-t border-line pt-6" noValidate>
      <label htmlFor="pdp-pin" className="label-luxe">Delivery</label>
      <div className="flex">
        <input id="pdp-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter PIN code" className="input-luxe h-11" aria-describedby="pdp-pin-msg" data-testid="pdp-pincode-input" />
        <button className="btn-outline h-11 shrink-0 px-5 py-0" data-testid="pdp-pincode-check-button">Check</button>
      </div>
      {res && <p id="pdp-pin-msg" role={res.error ? "alert" : "status"} className={`mt-2 text-xs ${res.error ? "text-destructive" : "text-taupe"}`} data-testid="pdp-pincode-result">{res.error || `${res.pincode}: ${res.message}`}</p>}
    </form>
  );
}

export default function Product() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["product", slug], queryFn: () => api.get(`/products/${slug}`).then((r) => r.data), retry: (n, e) => e?.response?.status !== 404 && n < 2 });
  const { data: meta } = useMeta();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState("");
  const [guide, setGuide] = useState(false);
  const p = data?.product;
  const [recentIds, setRecentIds] = useState([]);

  useEffect(() => {
    setSize(null); setQty(1); setErr("");
    if (p) { setRecentIds(getRecent().filter((id) => id !== p.id).slice(0, 4)); pushRecent(p.id); }
  }, [p]);
  const recent = useProductsByIds(recentIds);

  const ld = useMemo(() => p && ({
    "@context": "https://schema.org", "@type": "Product", name: p.title, sku: p.sku, description: p.description, brand: { "@type": "Brand", name: "DRESSELLA" },
    image: p.images.map((i) => img(i.path_lg)), color: p.color?.name, material: p.composition,
    offers: { "@type": "Offer", priceCurrency: "INR", price: p.price, availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: window.location.href },
  }), [p]);
  useSeo({ title: p?.title, description: p ? `${p.title} — ${p.description?.slice(0, 140)}` : undefined, image: p ? img(p.images?.[0]?.path_lg) : undefined, jsonLd: ld, path: `/product/${slug}` });

  if (isError && error?.response?.status === 404) return <NotFound />;
  if (isLoading || !p) return <div className="container-luxe grid gap-10 py-10 lg:grid-cols-2" aria-busy="true"><div className="aspect-[3/4] animate-pulse bg-linen" /><div className="space-y-4"><div className="h-10 w-2/3 animate-pulse bg-linen" /><div className="h-5 w-1/4 animate-pulse bg-linen" /></div></div>;

  const sel = p.sizes.find((s) => s.size === size);
  const cat = meta?.categories?.find((c) => c.slug === p.category);
  const discount = p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0;
  const s = meta?.settings;

  const doAdd = (buy) => {
    if (!size) return setErr("Please select a size.");
    if (!sel?.available) return setErr("This size is currently unavailable.");
    setErr("");
    add(p, size, qty, sel.max_qty, !buy);
    if (buy) nav("/checkout");
  };

  return (
    <div data-testid="product-page">
      <div className="container-luxe pt-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: cat?.name || "Shop", to: cat ? `/category/${cat.slug}` : "/shop" }, { label: p.title }]} />
      </div>
      <div className="container-luxe grid gap-10 py-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7"><Gallery images={p.images} title={p.title} /></div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-40">
            <p className="eyebrow">{cat?.name}</p>
            <h1 className="mt-3 text-4xl leading-tight sm:text-5xl" data-testid="pdp-title">{p.title}</h1>
            <p className="mt-2 text-xs tracking-wide text-taupe" data-testid="pdp-sku">SKU {p.sku}</p>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-xl" data-testid="pdp-price">{inr(p.price)}</span>
              {discount > 0 && <><s className="text-mute">{inr(p.compare_at_price)}</s><span className="text-xs uppercase tracking-[0.16em]">{discount}% off</span></>}
            </div>
            <p className="mt-1 text-xs text-taupe">Inclusive of all taxes</p>

            <div className="mt-8">
              <p className="label-luxe">Colour — <span className="normal-case tracking-normal text-ink">{p.color?.name}</span></p>
              <div className="flex gap-2">
                {(data.variants?.length ? data.variants : [{ slug: p.slug, color: p.color }]).map((v) => (
                  <Link key={v.slug} to={`/product/${v.slug}`} aria-label={v.color?.name} aria-current={v.slug === p.slug} className={`h-8 w-8 rounded-full border-2 ${v.slug === p.slug ? "border-ink" : "border-transparent"} p-0.5`}><span className="block h-full w-full rounded-full border border-line2" style={{ background: v.color?.hex }} /></Link>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="label-luxe mb-0" id="size-label">Size {size && <span className="normal-case tracking-normal text-ink">— {size}</span>}</p>
                <button type="button" onClick={() => setGuide(true)} className="inline-flex items-center gap-1.5 text-xs underline underline-offset-4" data-testid="pdp-size-guide-button"><Ruler size={14} /> Size guide</button>
              </div>
              <div role="radiogroup" aria-labelledby="size-label" aria-describedby={err ? "pdp-size-error" : undefined} className="flex flex-wrap gap-2">
                {p.sizes.map((sz) => (
                  <button key={sz.size} type="button" role="radio" aria-checked={size === sz.size} disabled={!sz.available} onClick={() => { setSize(sz.size); setErr(""); setQty((q) => Math.min(q, sz.max_qty)); }}
                    className={`chip h-12 min-w-[3.25rem] ${size === sz.size ? "chip-on" : ""} disabled:cursor-not-allowed disabled:text-mute disabled:line-through`} aria-label={sz.available ? `Size ${sz.size}` : `Size ${sz.size}, out of stock`} data-testid={`pdp-size-${sz.size}`}>{sz.size}</button>
                ))}
              </div>
              {err && <p id="pdp-size-error" role="alert" className="mt-3 text-xs text-destructive" data-testid="pdp-size-error">{err}</p>}
              <p className="mt-3 text-xs text-taupe" data-testid="pdp-stock-status">{!p.in_stock ? "Currently out of stock in all sizes." : size ? (sel?.available ? "In stock — ready to dispatch" : "Out of stock") : "Select a size to see availability."}</p>
            </div>

            {p.in_stock && (
              <div className="mt-8 flex items-center gap-4">
                <span className="label-luxe mb-0">Qty</span>
                <QtyStepper value={qty} max={sel?.max_qty || 5} onChange={setQty} testid="pdp-qty" />
              </div>
            )}
            <div className="mt-8 grid grid-cols-[1fr_auto] gap-3">
              <button className="btn-primary" onClick={() => doAdd(false)} disabled={!p.in_stock} data-testid="pdp-add-to-bag-button">{p.in_stock ? "Add to bag" : "Sold out"}</button>
              <button type="button" onClick={() => toggle(p)} aria-pressed={has(p.id)} aria-label={has(p.id) ? "Remove from wishlist" : "Save to wishlist"} className="flex h-[52px] w-[52px] items-center justify-center border border-ink" data-testid="pdp-wishlist-button"><Heart size={18} strokeWidth={1.4} className={has(p.id) ? "fill-ink" : ""} /></button>
              {p.in_stock && <button className="btn-outline col-span-2" onClick={() => doAdd(true)} data-testid="pdp-buy-now-button">Buy now</button>}
            </div>
            <Pincode />
            <Accordion type="multiple" defaultValue={["desc"]} className="mt-8 border-t border-line">
              <AccordionItem value="desc" className="border-line"><AccordionTrigger className="text-[11px] font-semibold uppercase tracking-[0.2em]" data-testid="pdp-acc-description">Description</AccordionTrigger><AccordionContent className="text-sm leading-relaxed text-charcoal">{p.description}</AccordionContent></AccordionItem>
              <AccordionItem value="fabric" className="border-line"><AccordionTrigger className="text-[11px] font-semibold uppercase tracking-[0.2em]" data-testid="pdp-acc-fabric">Fabric & Care</AccordionTrigger>
                <AccordionContent className="space-y-1.5 text-sm text-charcoal">{p.fabric && <p>Fabric: {p.fabric}</p>}{p.composition && <p>Composition: {p.composition}</p>}{p.care && <p>Care: {p.care}</p>}</AccordionContent></AccordionItem>
              <AccordionItem value="fit" className="border-line"><AccordionTrigger className="text-[11px] font-semibold uppercase tracking-[0.2em]" data-testid="pdp-acc-fit">Fit & Details</AccordionTrigger>
                <AccordionContent className="space-y-1.5 text-sm text-charcoal">{p.fit && <p>Fit: {p.fit}</p>}{p.length && <p>Length: {p.length}</p>}{p.neckline && <p>Neckline: {p.neckline}</p>}{p.sleeve && <p>Sleeve: {p.sleeve}</p>}</AccordionContent></AccordionItem>
              <AccordionItem value="ship" className="border-line"><AccordionTrigger className="text-[11px] font-semibold uppercase tracking-[0.2em]" data-testid="pdp-acc-shipping">Shipping, Returns & Exchanges</AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-charcoal"><p>{s?.delivery_estimate}</p>{s?.free_shipping_threshold > 0 && <p>Complimentary shipping on orders above {inr(s.free_shipping_threshold)}; otherwise {inr(s.shipping_flat)}.</p>}<p>See our <Link to="/shipping-policy" className="underline">Shipping Policy</Link> and <Link to="/returns" className="underline">Returns & Exchanges</Link>.</p></AccordionContent></AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
      {data.related?.length > 0 && (
        <section className="container-luxe border-t border-line py-20" data-testid="pdp-related">
          <h2 className="h-section mb-12">You may also like</h2>
          <ProductGrid items={data.related.slice(0, 4)} />
        </section>
      )}
      {recent.data?.length > 0 && (
        <section className="container-luxe pb-20" data-testid="pdp-recently-viewed">
          <h2 className="mb-10 font-serif text-3xl">Recently viewed</h2>
          <ProductGrid items={recent.data} />
        </section>
      )}
      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent className="max-w-xl bg-ivory" data-testid="size-guide-dialog">
          <DialogHeader><DialogTitle className="font-serif text-3xl font-normal">Size guide</DialogTitle><DialogDescription>{p.length && `Garment length: ${p.length}. `}Fit: {p.fit}.</DialogDescription></DialogHeader>
          <SizeGuideTable />
        </DialogContent>
      </Dialog>
    </div>
  );
}
