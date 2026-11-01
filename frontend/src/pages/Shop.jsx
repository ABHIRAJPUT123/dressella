import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation, useParams, useSearchParams, Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useMeta } from "@/lib/queries";
import { useSeo } from "@/lib/seo";
import { ProductGrid } from "@/components/ProductCard";
import { Breadcrumbs } from "@/components/Common";
import { FilterPanel, FILTER_KEYS } from "@/components/FilterPanel";

const LIMIT = 12;

function useScope() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const { data: meta } = useMeta();
  if (pathname.startsWith("/category/")) {
    const c = meta?.categories?.find((x) => x.slug === slug);
    return { kind: "category", base: { category: slug }, title: c?.name || "", desc: c?.description, crumbs: [{ label: "Shop", to: "/shop" }, { label: c?.name || "" }] };
  }
  if (pathname.startsWith("/collections/")) {
    const c = meta?.collections?.find((x) => x.slug === slug);
    return { kind: "collection", base: { collection: slug }, title: c?.name || "", desc: c?.description, crumbs: [{ label: "Collections", to: "/collections" }, { label: c?.name || "" }] };
  }
  if (pathname === "/new-in") return { kind: "new", base: {}, title: "New In", desc: "The latest pieces from DRESSELLA.", crumbs: [{ label: "New In" }] };
  if (pathname === "/sale") return { kind: "sale", base: { sale: true }, title: "Sale", desc: "Genuine reductions on selected pieces.", crumbs: [{ label: "Sale" }] };
  if (pathname === "/search") {
    const q = sp.get("q") || "";
    return { kind: "search", base: { q }, title: q ? `Results for “${q}”` : "Search", desc: "", crumbs: [{ label: "Search" }] };
  }
  return { kind: "shop", base: {}, title: "All Clothing", desc: "Kurtas, short kurtis, dresses and trousers — the complete DRESSELLA wardrobe.", crumbs: [{ label: "Shop" }] };
}

export default function Shop() {
  const scope = useScope();
  const [sp, setSp] = useSearchParams();
  const [drawer, setDrawer] = useState(false);
  const { data: meta } = useMeta();
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k)]).filter(([, v]) => v)), [sp]);
  const sort = sp.get("sort") || "newest";
  const params = { ...scope.base, ...filters, sort, limit: LIMIT };

  const q = useInfiniteQuery({
    queryKey: ["shop", params],
    queryFn: ({ pageParam }) => api.get("/products", { params: { ...params, page: pageParam } }).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) || [];
  const first = q.data?.pages[0];
  const total = first?.total ?? 0;
  const facets = first?.facets;
  const activeCount = Object.keys(filters).length;

  const setParam = (k, v) => {
    const next = new URLSearchParams(sp);
    v === null || v === "" || v === undefined ? next.delete(k) : next.set(k, v);
    setSp(next, { replace: true });
  };
  const clearAll = () => {
    const next = new URLSearchParams();
    if (sp.get("q")) next.set("q", sp.get("q"));
    if (sp.get("sort")) next.set("sort", sp.get("sort"));
    setSp(next, { replace: true });
  };

  useSeo({ title: scope.title || "Shop", description: scope.desc || `Shop ${scope.title} at DRESSELLA.`, noindex: scope.kind === "search" });

  const sorts = [["newest", "Newest"], ["price_asc", "Price: Low to High"], ["price_desc", "Price: High to Low"], ...(meta?.has_sales_data ? [["popular", "Popularity"]] : [])];
  const panel = <FilterPanel facets={facets} filters={filters} setParam={setParam} hideCategory={scope.kind === "category"} />;

  return (
    <div data-testid="shop-page">
      <section className="border-b border-line bg-cream">
        <div className="container-luxe pb-12 pt-10 sm:pb-16 sm:pt-14">
          <Breadcrumbs items={[{ label: "Home", to: "/" }, ...scope.crumbs]} />
          <h1 className="mt-8 text-4xl sm:text-5xl lg:text-6xl" data-testid="shop-title">{scope.title}</h1>
          {scope.desc && <p className="mt-4 max-w-xl text-sm text-taupe sm:text-base">{scope.desc}</p>}
        </div>
      </section>
      <div className="sticky top-16 z-30 border-b border-line bg-ivory/90 backdrop-blur-xl lg:top-32">
        <div className="container-luxe flex h-14 items-center justify-between gap-4">
          <button className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] lg:hidden" onClick={() => setDrawer(true)} data-testid="open-filters-button">
            <SlidersHorizontal size={15} /> Filter {activeCount > 0 && `(${activeCount})`}
          </button>
          <p className="hidden text-xs text-taupe lg:block" aria-live="polite" data-testid="shop-result-count">{q.isLoading ? "Loading…" : `${total} ${total === 1 ? "piece" : "pieces"}`}</p>
          <div className="flex items-center gap-3">
            <label htmlFor="sort" className="hidden text-[11px] uppercase tracking-[0.18em] text-taupe sm:block">Sort</label>
            <Select value={sort} onValueChange={(v) => setParam("sort", v === "newest" ? null : v)}>
              <SelectTrigger id="sort" className="h-9 w-[190px] rounded-none border-line2 bg-transparent text-xs" data-testid="sort-select"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none bg-ivory">{sorts.map(([v, l]) => <SelectItem key={v} value={v} data-testid={`sort-option-${v}`}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="container-luxe grid gap-12 py-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-52">
            {panel}
            {activeCount > 0 && <button onClick={clearAll} className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] underline underline-offset-4" data-testid="clear-filters-button">Clear all filters</button>}
          </div>
        </aside>
        <div>
          <p className="mb-6 text-xs text-taupe lg:hidden" aria-live="polite">{q.isLoading ? "Loading…" : `${total} ${total === 1 ? "piece" : "pieces"}`}</p>
          {q.isError ? (
            <div className="py-20 text-center" role="alert"><p className="font-serif text-3xl">We couldn't load this page</p><button className="btn-outline mt-6" onClick={() => q.refetch()}>Try again</button></div>
          ) : !q.isLoading && items.length === 0 ? (
            <div className="py-20 text-center" data-testid="shop-empty-state">
              <p className="font-serif text-3xl">{scope.kind === "sale" ? "No pieces are on sale right now" : "No pieces match your selection"}</p>
              <p className="mx-auto mt-3 max-w-sm text-sm text-taupe">{activeCount ? "Try removing a filter or two." : "Explore our latest arrivals instead."}</p>
              <div className="mt-8 flex justify-center gap-3">
                {activeCount > 0 && <button className="btn-primary" onClick={clearAll} data-testid="empty-clear-filters-button">Clear filters</button>}
                <Link className="btn-outline" to="/shop">View all clothing</Link>
              </div>
            </div>
          ) : (
            <ProductGrid items={items} loading={q.isLoading} cols="grid-cols-2 md:grid-cols-3" />
          )}
          {q.hasNextPage && (
            <div className="mt-16 text-center">
              <p className="mb-4 text-xs text-taupe">Showing {items.length} of {total}</p>
              <button className="btn-outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} data-testid="load-more-button">{q.isFetchingNextPage ? "Loading…" : "Load more"}</button>
            </div>
          )}
        </div>
      </div>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="flex w-[90vw] max-w-sm flex-col bg-ivory p-0" data-testid="filter-drawer">
          <SheetHeader className="border-b border-line px-6 py-5 text-left"><SheetTitle className="font-serif text-2xl font-normal">Filter</SheetTitle><SheetDescription className="sr-only">Refine products</SheetDescription></SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-6">{panel}</div>
          <div className="grid grid-cols-2 gap-3 border-t border-line p-4">
            <button className="btn-outline px-3" onClick={clearAll} data-testid="drawer-clear-filters-button">Clear</button>
            <button className="btn-primary px-3" onClick={() => setDrawer(false)} data-testid="drawer-apply-filters-button">Show {total}</button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
