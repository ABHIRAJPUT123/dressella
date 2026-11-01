import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useMeta, useProducts } from "@/lib/queries";
import { img } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { ProductGrid } from "@/components/ProductCard";
import { NewsletterForm } from "@/components/NewsletterForm";

function Hero({ hero }) {
  return (
    <section className="relative grain h-[82vh] min-h-[560px] overflow-hidden bg-linen sm:h-[88vh]" data-testid="home-hero">
      <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2">
        {hero?.image && <img src={img(hero.image)} alt="DRESSELLA campaign — ivory rose A-line kurta in a Jaipur courtyard" fetchPriority="high" className="slowzoom h-full w-full object-cover object-[50%_20%]" />}
        {hero?.image_secondary && <img src={img(hero.image_secondary)} alt="DRESSELLA campaign — red A-line kurta in a Jaipur courtyard" className="slowzoom hidden h-full w-full object-cover object-[50%_20%] md:block" />}
      </div>
      <div className="absolute inset-0 z-[2] bg-gradient-to-t from-ink/80 via-ink/30 to-ink/5" />
      <div className="container-luxe relative z-[3] flex h-full flex-col justify-end pb-14 text-ivory sm:pb-20">
        <p className="eyebrow rise mb-5 text-ivory/90">{hero?.eyebrow || "The Jaipur Edit"}</p>
        <h1 className="rise max-w-3xl text-4xl font-light leading-[1.05] sm:text-6xl lg:text-7xl" style={{ animationDelay: ".12s" }}>{hero?.title || "Quiet colour, hand-printed in the Pink City"}</h1>
        <p className="rise mt-6 max-w-lg text-sm leading-relaxed text-ivory/85 sm:text-base" style={{ animationDelay: ".24s" }}>{hero?.subtitle || "Pure cottons and fluid rayons, cut for days that move from courtyard to city."}</p>
        <div className="rise mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: ".36s" }}>
          <Link to="/shop" className="btn-light" data-testid="hero-shop-collection-button">{hero?.cta_primary || "Shop the Collection"}</Link>
          <Link to="/new-in" className="inline-flex items-center justify-center gap-2 border border-ivory/70 px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-ivory hover:text-ink" data-testid="hero-new-arrivals-button">{hero?.cta_secondary || "Discover New Arrivals"}</Link>
        </div>
      </div>
    </section>
  );
}

const SectionHead = ({ eyebrow, title, to, cta = "View all", testid }) => (
  <div className="mb-10 flex items-end justify-between gap-6 sm:mb-14">
    <div><p className="eyebrow mb-3">{eyebrow}</p><h2 className="h-section">{title}</h2></div>
    {to && <Link to={to} className="link-u hidden shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] sm:inline-flex" data-testid={testid}>{cta} <ArrowRight size={14} /></Link>}
  </div>
);

function Categories({ cats, products }) {
  const tiles = cats.map((c) => ({ ...c, image: c.image || products.find((p) => p.category === c.slug)?.images?.[0]?.path_lg }));
  return (
    <section className="container-luxe py-20 sm:py-28" data-testid="home-categories">
      <SectionHead eyebrow="Shop by category" title="The wardrobe, considered" to="/shop" cta="All clothing" testid="home-categories-view-all" />
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {tiles.map((c, i) => (
          <Link key={c.slug} to={`/category/${c.slug}`} className={`group relative block overflow-hidden bg-linen ${i % 2 ? "lg:mt-16" : ""}`} data-testid={`home-category-${c.slug}`}>
            <div className="aspect-[3/4]"><img src={img(c.image)} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" /></div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent p-5 text-ivory sm:p-7">
              <p className="font-serif text-2xl sm:text-3xl">{c.name}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-ivory/80">{c.count} {c.count === 1 ? "piece" : "pieces"}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Editorial({ e, flip, i }) {
  return (
    <section className={`grid items-center gap-10 lg:grid-cols-12 lg:gap-0 ${i ? "" : "border-t border-line"}`} data-testid={`home-editorial-${i}`}>
      <div className={`lg:col-span-7 ${flip ? "lg:order-2" : ""}`}><div className="aspect-[4/5] overflow-hidden bg-linen lg:aspect-[6/7]"><img src={img(e.image)} alt={e.title} loading="lazy" className="h-full w-full object-cover object-[50%_15%]" /></div></div>
      <div className={`px-5 sm:px-10 lg:col-span-5 lg:px-20 ${flip ? "lg:order-1" : ""}`}>
        <p className="eyebrow mb-5">Editorial {String(i + 1).padStart(2, "0")}</p>
        <h2 className="h-section">{e.title}</h2>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-taupe sm:text-base">{e.text}</p>
        <Link to={e.link} className="btn-outline mt-10" data-testid={`home-editorial-cta-${i}`}>{e.cta}</Link>
      </div>
    </section>
  );
}

function Collections({ cols, products }) {
  return (
    <section className="bg-sand py-20 sm:py-28" data-testid="home-collections">
      <div className="container-luxe">
        <SectionHead eyebrow="Curated edits" title="Dressed for the occasion" to="/collections" cta="All collections" testid="home-collections-view-all" />
        <div className="no-scrollbar -mx-5 flex snap-x gap-5 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
          {cols.map((c, i) => {
            const pic = c.image || products.filter((p) => (p.collections || []).includes(c.slug))[0]?.images?.[1]?.path_lg || products[i]?.images?.[1]?.path_lg;
            return (
              <Link key={c.slug} to={`/collections/${c.slug}`} className="group w-[72vw] shrink-0 snap-start sm:w-auto" data-testid={`home-collection-${c.slug}`}>
                <div className="aspect-[3/4] overflow-hidden bg-linen"><img src={img(pic)} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" /></div>
                <p className="mt-5 font-serif text-2xl">{c.name}</p>
                <p className="mt-1 text-sm text-taupe">{c.description}</p>
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
  const cols = (meta?.collections || []).filter((c) => c.count);
  const story = all.find((p) => p.slug === "pastel-stripe-dress") || all[0];

  return (
    <div data-testid="home-page">
      <Hero hero={s.hero} />
      <section className="container-luxe grid gap-8 py-20 sm:py-28 lg:grid-cols-12">
        <p className="eyebrow lg:col-span-3">DRESSELLA — Fashion for her</p>
        <p className="font-serif text-3xl leading-[1.2] sm:text-4xl lg:col-span-9 lg:text-5xl">Printed by hand-led tradition, cut with a modern line. Pieces made to be lived in — from courtyard mornings to city evenings.</p>
      </section>
      <section className="container-luxe pb-20 sm:pb-28" data-testid="home-new-arrivals">
        <SectionHead eyebrow="Just in" title="New Arrivals" to="/new-in" testid="home-new-arrivals-view-all" />
        {isError ? (
          <div className="py-12 text-center" role="alert" data-testid="home-products-error">
            <p className="text-sm text-taupe">We couldn't load the latest pieces right now.</p>
            <button type="button" className="btn-outline mt-5" onClick={() => refetch()}>Try again</button>
          </div>
        ) : <ProductGrid items={all.slice(0, 8)} loading={isLoading} />}
      </section>
      {(s.editorials || []).slice(0, 1).map((e, i) => <Editorial key={i} e={e} i={i} />)}
      <Categories cats={(meta?.categories || []).filter((c) => c.count)} products={all} />
      {meta?.has_sales_data && best.data?.items?.length > 0 && (
        <section className="container-luxe pb-20 sm:pb-28" data-testid="home-bestsellers">
          <SectionHead eyebrow="Most loved" title="Bestsellers" to="/shop?sort=popular" testid="home-bestsellers-view-all" />
          <ProductGrid items={best.data.items} />
        </section>
      )}
      <Collections cols={cols} products={all} />
      {(s.editorials || []).slice(1).map((e, i) => <div key={i} className="py-20 sm:py-28"><Editorial e={e} i={i + 1} flip /></div>)}
      <section className="bg-ink text-ivory" data-testid="home-brand-story">
        <div className="container-luxe grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:col-span-5">{story && <div className="aspect-[3/4] overflow-hidden"><img src={img(story.images?.[2]?.path_lg || story.images?.[0]?.path_lg)} alt="DRESSELLA pastel stripe midi dress" loading="lazy" className="h-full w-full object-cover" /></div>}</div>
          <div className="lg:col-span-6 lg:col-start-7">
            <p className="eyebrow mb-6 text-champagne">The DRESSELLA aesthetic</p>
            <h2 className="h-section">Quiet colour. Honest fabric. A line that moves with you.</h2>
            <p className="mt-8 max-w-lg text-sm leading-relaxed text-ivory/75 sm:text-base">DRESSELLA begins in Jaipur, where print and cloth have been a language for centuries. We choose breathable cottons and fluid rayons, keep our palettes soft and our silhouettes clean — and edit every piece for a wardrobe you'll return to, season after season.</p>
            <Link to="/about" className="btn-light mt-10" data-testid="home-brand-story-cta">Our story</Link>
          </div>
        </div>
      </section>
      <section className="container-luxe grid gap-10 py-20 sm:py-28 lg:grid-cols-12" data-testid="home-newsletter">
        <div className="lg:col-span-5"><p className="eyebrow mb-3">The DRESSELLA letter</p><h2 className="h-section">First to know</h2><p className="mt-4 text-sm text-taupe">New edits, restocks and stories from the atelier — occasionally, never noisily.</p></div>
        <div className="lg:col-span-6 lg:col-start-7 lg:pt-10"><NewsletterForm /></div>
      </section>
    </div>
  );
}
