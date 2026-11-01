export const SIZE_ROWS = [
  ["XS", 32, 26, 35],
  ["S", 34, 28, 37],
  ["M", 36, 30, 39],
  ["L", 38, 32, 41],
  ["XL", 40, 34, 43],
  ["2XL", 42, 36, 45],
  ["3XL", 44, 38, 47],
];

export function SizeGuideTable() {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm" data-testid="size-guide-table">
          <caption className="sr-only">Body measurements in inches</caption>
          <thead><tr className="border-b border-ink text-[11px] uppercase tracking-[0.16em]">{["Size", "Bust (in)", "Waist (in)", "Hip (in)"].map((h) => <th key={h} scope="col" className="py-3 pr-4 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{SIZE_ROWS.map(([s, b, w, h]) => <tr key={s} className="border-b border-line"><th scope="row" className="py-3 pr-4 font-semibold">{s}</th><td>{b}</td><td>{w}</td><td>{h}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-taupe">Indicative body measurements (inches). Garment length is listed on each product page. If you are between sizes, we suggest sizing up for a relaxed fit. Measurements to be confirmed by DRESSELLA before launch.</p>
    </div>
  );
}
