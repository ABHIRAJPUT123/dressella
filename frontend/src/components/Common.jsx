import { Link } from "react-router-dom";

export function Breadcrumbs({ items }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.label, item: it.to ? window.location.origin + it.to : undefined })),
  };
  return (
    <nav aria-label="Breadcrumb" className="text-[10.5px] uppercase tracking-[0.24em] text-taupe" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => (
          <li key={`${it.label}-${it.to || ""}`} className="flex items-center gap-2">
            {it.to && i < items.length - 1 ? <Link to={it.to} className="link-u hover:text-ink">{it.label}</Link> : <span aria-current="page" className="text-ink">{it.label}</span>}
            {i < items.length - 1 && <span aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </nav>
  );
}

export function RichText({ body }) {
  const blocks = (body || "").split(/\n\s*\n/);
  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-charcoal">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith("## ")) {
          const [h, ...rest] = t.split("\n");
          return (
            <div key={i}>
              <h2 className="mb-3 mt-6 font-serif text-2xl text-ink">{h.slice(3)}</h2>
              {rest.length > 0 && <p>{rest.join(" ")}</p>}
            </div>
          );
        }
        if (t.startsWith("DRAFT")) return <p key={i} className="border-l-2 border-gold bg-linen px-4 py-3 text-xs uppercase tracking-[0.12em] text-taupe">{t}</p>;
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

export function Field({ label, error, id, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className="label-luxe">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-taupe">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-destructive" data-testid={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function PageHero({ eyebrow, title, children }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-cream">
      <span className="pointer-events-none absolute -right-6 bottom-[-0.2em] hidden select-none font-display text-[11rem] leading-none tracking-[0.1em] text-beige/60 lg:block" aria-hidden="true">D</span>
      <div className="container-luxe relative py-16 sm:py-24">
        {eyebrow && <p className="eyebrow mb-5 flex items-center gap-4"><span className="h-px w-8 bg-cocoa" />{eyebrow}</p>}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl">{title}</h1>
        {children}
      </div>
    </section>
  );
}
