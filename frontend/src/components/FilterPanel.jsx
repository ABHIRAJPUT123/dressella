import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { inr } from "@/lib/api";
import { useMeta } from "@/lib/queries";

export const FILTER_KEYS = ["category", "size", "color", "occasion", "style", "min_price", "max_price", "in_stock"];

const Group = ({ title, children }) => (
  <fieldset className="border-b border-line pb-6 pt-6 first:pt-0">
    <legend className="eyebrow mb-4 text-ink">{title}</legend>
    {children}
  </fieldset>
);

function toggleCsv(csv, v) {
  const set = new Set((csv || "").split(",").filter(Boolean));
  set.has(v) ? set.delete(v) : set.add(v);
  return [...set].join(",") || null;
}

function Price({ facets, filters, setParam }) {
  const lo = facets.price_min, hi = facets.price_max;
  const [v, setV] = useState([Number(filters.min_price) || lo, Number(filters.max_price) || hi]);
  useEffect(() => setV([Number(filters.min_price) || lo, Number(filters.max_price) || hi]), [lo, hi, filters.min_price, filters.max_price]);
  if (lo === hi) return null;
  return (
    <Group title="Price">
      <Slider min={lo} max={hi} step={10} value={v} onValueChange={setV} onValueCommit={([a, b]) => { setParam("min_price", a > lo ? a : null); setParam("max_price", b < hi ? b : null); }} aria-label="Price range" data-testid="filter-price-slider" />
      <div className="mt-3 flex justify-between text-xs text-taupe"><span>{inr(v[0])}</span><span>{inr(v[1])}</span></div>
    </Group>
  );
}

export function FilterPanel({ facets, filters, setParam, hideCategory }) {
  const { data: meta } = useMeta();
  if (!facets) return <div className="h-64 animate-pulse bg-linen" />;
  const sel = (k) => (filters[k] || "").split(",").filter(Boolean);
  const catName = (s) => meta?.categories?.find((c) => c.slug === s)?.name || s;
  const ListGroup = ({ k, title, values, label = (x) => x }) =>
    values.length > 0 && (
      <Group title={title}>
        <ul className="space-y-2.5">
          {values.map((v) => (
            <li key={v}>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#1A1918]" checked={sel(k).includes(v)} onChange={() => setParam(k, toggleCsv(filters[k], v))} data-testid={`filter-${k}-${v.toLowerCase().replace(/\s+/g, "-")}`} />
                {label(v)}
              </label>
            </li>
          ))}
        </ul>
      </Group>
    );

  return (
    <div data-testid="filter-panel">
      {!hideCategory && <ListGroup k="category" title="Category" values={facets.categories} label={catName} />}
      {facets.sizes.length > 0 && (
        <Group title="Size">
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <button key={s} type="button" aria-pressed={sel("size").includes(s)} onClick={() => setParam("size", toggleCsv(filters.size, s))} className={`chip ${sel("size").includes(s) ? "chip-on" : ""}`} data-testid={`filter-size-${s}`}>{s}</button>
            ))}
          </div>
        </Group>
      )}
      {facets.colors.length > 0 && (
        <Group title="Colour">
          <ul className="space-y-2.5">
            {facets.colors.map((c) => (
              <li key={c.name}>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#1A1918]" checked={sel("color").includes(c.name)} onChange={() => setParam("color", toggleCsv(filters.color, c.name))} data-testid={`filter-color-${c.name.toLowerCase().replace(/\s+/g, "-")}`} />
                  <span className="h-3.5 w-3.5 rounded-full border border-line2" style={{ background: c.hex }} aria-hidden="true" />{c.name}
                </label>
              </li>
            ))}
          </ul>
        </Group>
      )}
      <Price facets={facets} filters={filters} setParam={setParam} />
      <Group title="Availability">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#1A1918]" checked={filters.in_stock === "true"} onChange={(e) => setParam("in_stock", e.target.checked ? "true" : null)} data-testid="filter-in-stock" /> In stock only
        </label>
      </Group>
      <ListGroup k="occasion" title="Occasion" values={facets.occasions} />
      <ListGroup k="style" title="Style" values={facets.styles} />
    </div>
  );
}
