import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import { useMeta, useProducts } from "@/lib/queries";
import { img } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { ProductGrid } from "@/components/ProductCard";
import { NewsletterForm } from "@/components/NewsletterForm";

const ClothingRack = lazy(() => import("@/components/ClothingRack"));

function Hero({ hero }) {
  return (
    <section className="relative grid overflow-hidden bg-cream lg:min-h-[calc(100vh-128px)] lg:grid-cols-12" data-testid="home-hero">
      <div className="relative order-1 aspect-[4/5] overflow-hidden bg-linen sm:aspect-[16/11] lg:order-2 lg:col-span-7 lg:aspect-auto">
        {hero?.image && <img src={img(hero.image)} alt="DRESSELLA campaign — ivory rose A-line kurta in a Jaipur courtyard" fetchPriority="high" className="slowzoom absolute inset-0 h-full w-full object-cover object-[50%_22%]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-transparent lg:bg-gradient-to-r lg:from-cream/25" />
        {hero?.image_secondary && (
          <div className="rise absolute bottom-6 right-6 hidden w-[30%] max-w-[260px] border-[10px] border-ivory shadow-[0_30px_60px_-20px_rgba(23,21,19,.45)] md:block lg:bottom-12 lg:left-[-0px] lg:right-auto lg:ml-10" style={{ animationDelay: ".5s" }}>
            <div className="aspect-[3/4] overflow-hidden"><img src={img(hero.image_secondary)} alt="DRESSELLA campaign — red A-line kurta in a Jaipur courtyard" className="h-full w-full object-cover object-[50%_20%]" /></div>
          </div>
        )}
      </div>
      <div className="relative order-2 flex flex-col justify-between gap-12 px-5 py-14 sm:px-10 sm:py-16 lg:order-1 lg:col-span-5 lg:px-14 lg:py-16 xl:px-20">
        <div className="flex items-center gap-4">
          <span className="h-px w-10 bg-cocoa" />
          <p className="eyebrow rise">{hero?.eyebrow || "The Jaipur Edit"}</p>
        </div>
        <div>
          <h1 className="rise text-4xl leading-[1.02] sm:text-5xl lg:text-6xl xl:text-7xl" style={{ animationDelay: ".1s" }}>{hero?.title || "Quiet colour, hand-printed in the Pink City"}</h1>
          <p className="rise mt-7 max-w-md text-sm leading-relaxed text-taupe sm:text-base" style={{ animationDelay: ".22s" }}>{hero?.subtitle || "Pure cottons and fluid rayons, cut for days that move from courtyard to city."}</p>
          <div className="rise mt-10 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: ".34s" }}>
            <Link to="/shop" className="btn-primary" data-testid="hero-shop-collection-button">{hero?.cta_primary || "Shop the Collection"}</Link>
            <Link to="/new-in" className="btn-outline" data-testid="hero-new-arrivals-button">{hero?.cta_secondary || "Discover New Arrivals"}</Link>
          </div>
        </div>
        <a href="#the-rail" className="group hidden items-center gap-3 text-[10.5px] uppercase tracking-[0.3em] text-taupe lg:inline-flex" data-testid="hero-scroll-cue">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line2 transition-colors group-hover:border-ink"><ArrowDown size={14} strokeWidth={1.3} /></span>
          Step into the atelier
        </a>
      </div>
    </section>
  );
}

function Rail({ products, loading }) {
  return (
    <section id="the-rail" className="showroom relative overflow-hidden py-16 sm:py-24" data-testid="home-rack-section">
      <span className="showroom-panel left-[4%] w-[26%]" aria-hidden="true" />
      <span className="showroom-panel right-[4%] w-[26%]" aria-hidden="true" />
      <div className="container-luxe relative">
        <div className="mb-10 grid gap-6 sm:mb-14 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="eyebrow mb-4">The Dressella Rail</p>
            <h2 className="h-section">Step into the wardrobe</h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-taupe lg:col-span-4 lg:col-start-9">
            Every piece on the rail is from the current collection{products.length ? ` — ${products.length} ${products.length === 1 ? "piece" : "pieces"}` : ""}. Bring one forward, then open it to choose your size.
          </p>
        </div>
        {loading ? <div className="mx-auto h-[420px] max-w-4xl animate-pulse bg-beige/40" aria-busy="true" /> : (
          <Suspense fallback={<div className="mx-auto h-[420px] max-w-4xl animate-pulse bg-beige/40" aria-busy="true" />}>
            <ClothingRack products={products} />
          </Suspense>
        )}
      </div>
    </section>
  );
}

function Marquee({ words }) {
  if (!words.length) return null;
  const row = [...words, ...words, ...words, ...words];
  return (
    <div className="overflow-hidden border-y border-line bg-ivory py-5" aria-hidden="true" data-testid="home-marquee">
      <div className="marquee flex w-max gap-12 whitespace-nowrap">
        {[...row, ...row].map((w, i) => <span key={i} className="flex items-center gap-12 font-display text-2xl tracking-[0.2em] text-cocoa sm:text-3xl">{w}<span className="h-1.5 w-1.5 rotate-45 bg-champagne" /></span>)}
      </div>
    </div>
  );
}

const SectionHead = ({ eyebrow, title, to, cta = "View all", testid, index }) => (
  <div className="mb-12 flex items-end justify-between gap-6 border-b border-line pb-8 sm:mb-16">
    <div className="flex items-end gap-6 sm:gap-10">
      {index && <span className="hidden font-display text-6xl leading-none text-beige sm:block lg:text-7xl">{index}</span>}
      <div><p className="eyebrow mb-3">{eyebrow}</p><h2 className="h-section">{title}</h2></div>
    </div>
    {to && <Link to={to} className="link-u hidden shrink-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.26em] sm:inline-flex" data-testid={testid}>{cta} <ArrowRight size={14} strokeWidth={1.4} /></Link>}
  </div>
);

function Categories({ cats, products }) {
  const tiles = cats.map((c) => ({ ...c, image: c.image || products.find((p) => p.category === c.slug)?.images?.[0]?.path_lg }));
  return (
    <section className="container-luxe py-20 sm:py-32" data-testid="home-categories">
      <SectionHead index="03" eyebrow="Shop by category" title="The wardrobe, considered" to="/shop" cta="All clothing" testid="home-categories-view-all" />
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {tiles.map((c, i) => (
          <Link key={c.slug} to={`/category/${c.slug}`} className={`group relative block overflow-hidden bg-linen ${i % 2 ? "lg:mt-20" : ""}`} data-testid={`home-category-${c.slug}`}>
            <div className="aspect-[3/4]"><img src={img(c.image)} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]" /></div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent p-5 text-ivory sm:p-7">
              <p className="font-display text-[10px] tracking-[0.3em] text-ivory/70">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 font-serif text-2xl sm:text-3xl">{c.name}</p>
              <p className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-ivory/85">{c.count} {c.count === 1 ? "piece" : "pieces"} <ArrowRight size={12} className="transition-transform duration-500 group-hover:translate-x-1" /></p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Editorial({ e, flip, i }) {
  return (
    <section className="grid items-center gap-10 bg-ivory lg:grid-cols-12 lg:gap-0" data-testid={`home-editorial-${i}`}>
      <div className={`lg:col-span-7 ${flip ? "lg:order-2" : ""}`}><div className="aspect-[4/5] overflow-hidden bg-linen lg:aspect-[6/7]"><img src={img(e.image)} alt={e.title} loading="lazy" className="h-full w-full object-cover object-[50%_15%]" /></div></div>
      <div className={`px-5 pb-6 sm:px-10 lg:col-span-5 lg:px-20 lg:pb-0 ${flip ? "lg:order-1" : ""}`}>
        <p className="font-display text-5xl leading-none text-beige lg:text-7xl">{String(i + 1).padStart(2, "0")}</p>
        <p className="eyebrow mb-5 mt-6">Editorial</p>
        <h2 className="h-section">{e.title}</h2>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-taupe sm:text-base">{e.text}</p>
        <Link to={e.link} className="btn-outline mt-10" data-testid={`home-editorial-cta-${i}`}>{e.cta}</Link>
      </div>
    </section>
  );
}

function Collections({ cols, products }) {
  return (
    <section className="bg-sand py-20 sm:py-32" data-testid="home-collections">
      <div className="container-luxe">
        <SectionHead index="04" eyebrow="Curated edits" title="Dressed for the occasion" to="/collections" cta="All collections" testid="home-collections-view-all" />
        <div className="no-scrollbar -mx-5 flex snap-x gap-5 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
          {cols.map((c, i) => {
            const pic = c.image || products.filter((p) => (p.collections || []).includes(c.slug))[0]?.images?.[1]?.path_lg || products[i]?.images?.[1]?.path_lg;
            return (
              <Link key={c.slug} to={`/collections/${c.slug}`} className="group w-[72vw] shrink-0 snap-start sm:w-auto" data-testid={`home-collection-${c.slug}`}>
                <div className="aspect-[3/4] overflow-hidden bg-linen"><img src={img(pic)} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]" /></div>
                <div className="mt-5 flex items-baseline justify-between gap-3 border-b border-line2 pb-4">
                  <p className="font-serif text-2xl">{c.name}</p>
                  <ArrowRight size={14} strokeWidth={1.4} className="shrink-0 transition-transform duration-500 group-hover:translate-x-1" />
                </div>
                <p className="mt-3 text-sm text-taupe">{c.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { data: meta } = useMeta();
  const { data: latest, isLoading, isError, refetch } = useProducts({ sort: "newest", limit: 24 });
  const best = useProducts({ sort: "popular", limit: 4 });
  useSeo({ title: null, description: "DRESSELLA — premium women's fashion rooted in Jaipur. Shop A-line kurtas, short kurtis, dresses and trousers in pure cotton and rayon, delivered across India.", path: "/" });
  const all = latest?.items || [];
  const s = meta?.settings || {};
  const cats = (meta?.categories || []).filter((c) => c.count);
  const cols = (meta?.collections || []).filter((c) => c.count);
  const story = all.find((p) => p.slug === "pastel-stripe-dress") || all[0];

  return (
    <div data-testid="home-page">
      <Hero hero={s.hero} />
      {!isError && <Rail products={all} loading={isLoading} />}
      <Marquee words={[...cats.map((c) => c.name), ...cols.map((c) => c.name)]} />
      <section className="container-luxe grid gap-8 py-20 sm:py-32 lg:grid-cols-12" data-testid="home-manifesto">
        <p className="eyebrow lg:col-span-3">DRESSELLA — Fashion for her</p>
        <p className="font-serif text-3xl font-light leading-[1.22] sm:text-4xl lg:col-span-9 lg:text-5xl">Printed by hand-led tradition, cut with a modern line. <span className="italic text-cocoa">Pieces made to be lived in</span> — from courtyard mornings to city evenings.</p>
      </section>
      <section className="container-luxe pb-20 sm:pb-32" data-testid="home-new-arrivals">
        <SectionHead index="02" eyebrow="Just in" title="New Arrivals" to="/new-in" testid="home-new-arrivals-view-all" />
        {isError ? (
          <div className="py-12 text-center" role="alert" data-testid="home-products-error">
            <p className="text-sm text-taupe">We couldn't load the latest pieces right now.</p>
            <button type="button" className="btn-outline mt-5" onClick={() => refetch()}>Try again</button>
          </div>
        ) : <ProductGrid items={all.slice(0, 8)} loading={isLoading} />}
      </section>
      {(s.editorials || []).slice(0, 1).map((e, i) => <Editorial key={i} e={e} i={i} />)}
      <Categories cats={cats} products={all} />
      {meta?.has_sales_data && best.data?.items?.length > 0 && (
        <section className="container-luxe pb-20 sm:pb-32" data-testid="home-bestsellers">
          <SectionHead eyebrow="Most loved" title="Bestsellers" to="/shop?sort=popular" testid="home-bestsellers-view-all" />
          <ProductGrid items={best.data.items} />
        </section>
      )}
      <Collections cols={cols} products={all} />
      {(s.editorials || []).slice(1).map((e, i) => <div key={i} className="py-20 sm:py-32"><Editorial e={e} i={i + 1} flip /></div>)}
      <section className="relative overflow-hidden bg-ink text-ivory" data-testid="home-brand-story">
        <div className="container-luxe grid items-center gap-12 py-20 sm:py-32 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            {story && <div className="aspect-[3/4] overflow-hidden"><img src={img(story.images?.[2]?.path_lg || story.images?.[0]?.path_lg)} alt="DRESSELLA pastel stripe midi dress" loading="lazy" className="h-full w-full object-cover" /></div>}
            <span className="pointer-events-none absolute -bottom-6 -right-4 hidden border border-champagne/40 lg:block" style={{ inset: "24px -24px -24px 24px" }} aria-hidden="true" />
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <p className="eyebrow mb-6 text-champagne">The DRESSELLA aesthetic</p>
            <h2 className="h-section">Quiet colour. Honest fabric. <span className="italic text-champagne">A line that moves with you.</span></h2>
            <p className="mt-8 max-w-lg text-sm leading-relaxed text-ivory/70 sm:text-base">DRESSELLA begins in Jaipur, where print and cloth have been a language for centuries. We choose breathable cottons and fluid rayons, keep our palettes soft and our silhouettes clean — and edit every piece for a wardrobe you'll return to, season after season.</p>
            <Link to="/about" className="btn-light mt-10" data-testid="home-brand-story-cta">Our story</Link>
          </div>
        </div>
      </section>
      <section className="bg-cream" data-testid="home-newsletter">
        <div className="container-luxe grid gap-10 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:col-span-5"><p className="eyebrow mb-3">The DRESSELLA letter</p><h2 className="h-section">First to know</h2><p className="mt-4 text-sm text-taupe">New edits, restocks and stories from the atelier — occasionally, never noisily.</p></div>
          <div className="lg:col-span-6 lg:col-start-7 lg:pt-10"><NewsletterForm /></div>
        </div>
      </section>
    </div>
  );
}
