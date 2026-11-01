import { Component, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { img, inr } from "@/lib/api";

const PUSH = [0.52, 0.3, 0.15, 0.07];
const SWING = [2.6, 1.6, 0.9, 0.4];
const EASE = "cubic-bezier(.22,.8,.24,1)";

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function usePointerFine() {
  const q = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
  const [fine, setFine] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setFine(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return fine;
}

export const RackDefs = () => (
  <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="rack-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8A6342" /><stop offset=".55" stopColor="#5E3F27" /><stop offset="1" stopColor="#3E2818" />
      </linearGradient>
      <linearGradient id="rack-brass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8C7350" /><stop offset=".5" stopColor="#E3CFA4" /><stop offset="1" stopColor="#8C7350" />
      </linearGradient>
    </defs>
  </svg>
);

export const Hanger = () => (
  <svg viewBox="0 0 200 74" className="rack-hanger" aria-hidden="true">
    <path d="M100 34 V16 C100 6 112 4 114 12" fill="none" stroke="url(#rack-brass)" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M7 64 Q100 18 193 64" fill="none" stroke="url(#rack-wood)" strokeWidth="9" strokeLinecap="round" />
    <path d="M18 66 H182" stroke="#4A3120" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="100" cy="36" r="4.2" fill="url(#rack-brass)" />
  </svg>
);

function Garment({ p, i, style, active, onEnter, onClick, eager }) {
  return (
    <Link to={`/product/${p.slug}`} className={`rack-garment ${active ? "is-active" : ""}`} style={style} onMouseEnter={onEnter} onFocus={onEnter} onClick={onClick}
      aria-label={`${p.title}, ${inr(p.price)} — view product`} data-testid={`rack-garment-${p.slug}`}>
      <span className="rack-sway" style={{ animationDelay: `${(i % 5) * -1.3}s` }}>
        <Hanger />
        <span className="rack-cloth">
          <img src={img(p.images?.[0]?.path)} alt="" loading={eager ? "eager" : "lazy"} decoding="async" draggable="false" />
          <span className="rack-shade" />
        </span>
        <span className="rack-tag">{String(i + 1).padStart(2, "0")}</span>
      </span>
    </Link>
  );
}

function Frame({ width, left, height, bar }) {
  return (
    <div className="pointer-events-none absolute top-0" style={{ left, width, height }} aria-hidden="true">
      <span className="rack-bar" style={{ top: bar }} />
      <span className="rack-post" style={{ left: 0, top: bar }} />
      <span className="rack-post" style={{ right: 0, top: bar }} />
      <span className="rack-finial" style={{ left: -9, top: bar - 6 }} />
      <span className="rack-finial" style={{ right: -9, top: bar - 6 }} />
      <span className="rack-bar rack-base" style={{ bottom: 30 }} />
      <span className="rack-foot" style={{ left: -14 }} />
      <span className="rack-foot" style={{ right: -14 }} />
      <span className="rack-floor-shadow" />
    </div>
  );
}

function deskPose(i, hover, step) {
  if (hover === null) return { transform: "translate3d(0,0,0)", zIndex: 10 + i };
  const d = i - hover;
  if (d === 0) return { transform: "translate3d(0,-14px,150px) scale(1.06)", zIndex: 200 };
  const a = Math.min(Math.abs(d), 4) - 1;
  const s = Math.sign(d);
  return { transform: `translate3d(${s * PUSH[a] * step * 1.6}px,0,-${(a + 1) * 14}px) rotate(${s * SWING[a]}deg)`, zIndex: 100 - Math.abs(d), filter: "brightness(.93)" };
}

function touchPose(i, sel, w) {
  const d = i - sel;
  const a = Math.abs(d);
  const s = Math.sign(d);
  if (d === 0) return { transform: "translate3d(0,0,60px)", zIndex: 200 };
  const x = s * (w * 0.5 + (a - 1) * w * 0.24);
  return { transform: `translate3d(${x}px,0,-${a * 90}px) rotateY(${-s * 24}deg)`, zIndex: 100 - a, opacity: a > 3 ? 0 : 1, filter: `brightness(${1 - a * 0.06})`, pointerEvents: a > 3 ? "none" : undefined };
}

function Caption({ p, i, total, hint }) {
  if (!p) return <p className="text-center text-xs uppercase tracking-[0.28em] text-taupe" data-testid="rack-hint">{hint}</p>;
  return (
    <div className="flex flex-col items-center gap-2 text-center" aria-live="polite" data-testid="rack-caption">
      <p className="font-display text-sm tracking-[0.3em] text-umber">No. {String(i + 1).padStart(2, "0")} <span className="text-taupe">/ {String(total).padStart(2, "0")}</span></p>
      <p className="font-serif text-2xl leading-tight sm:text-3xl" data-testid="rack-caption-title">{p.title}</p>
      <div className="flex items-center gap-4 text-sm">
        <span data-testid="rack-caption-price">{inr(p.price)}</span>
        <span className="h-3 w-px bg-line2" />
        <Link to={`/product/${p.slug}`} className="link-u text-[11px] font-medium uppercase tracking-[0.24em]" data-testid="rack-caption-link">View the piece</Link>
      </div>
    </div>
  );
}

function RackInner({ products }) {
  const box = useRef(null);
  const W = useWidth(box);
  const fine = usePointerFine();
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState(0);
  const touchX = useRef(null);
  const n = products.length;
  useEffect(() => { if (sel > n - 1) setSel(0); }, [n, sel]);

  const w = fine ? Math.max(96, Math.min(210, (W - 80) / (n * 0.62 + 0.38))) : Math.min(W * 0.5, 230);
  const step = w * 0.62;
  const track = fine ? step * (n - 1) + w : W;
  const offset = (W - track) / 2;
  const height = Math.round(w * (fine ? 2.25 : 2.15) + 60);
  const frameW = fine ? track + 70 : W - 16;
  const frameL = fine ? offset - 35 : 8;
  const current = fine ? hover : sel;
  const bar = Math.round(4 + ((w * 0.92) / 200) * 8);

  const go = (d) => setSel((s) => Math.max(0, Math.min(n - 1, s + d)));
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  return (
    <div data-testid="clothing-rack" data-mode={fine ? "hover" : "touch"}>
      <RackDefs />
      <div ref={box} className="rack-stage relative mx-auto w-full" style={{ height }} onMouseLeave={() => setHover(null)} onTouchStart={fine ? undefined : onTouchStart} onTouchEnd={fine ? undefined : onTouchEnd}>
        {W > 0 && (
          <>
            <span className="rack-floor" style={{ top: height - 24 }} aria-hidden="true" />
            <Frame width={frameW} left={frameL} height={height} bar={bar} />
            {products.map((p, i) => {
              const pose = fine ? deskPose(i, hover, step) : touchPose(i, sel, w);
              const style = { left: fine ? offset + i * step : (W - w) / 2, width: w, transition: `transform .8s ${EASE}, filter .6s ease, opacity .6s ease`, ...pose };
              return (
                <Garment key={p.id} p={p} i={i} style={style} active={current === i} eager={i < 6}
                  onEnter={fine ? () => setHover(i) : undefined}
                  onClick={!fine && i !== sel ? (e) => { e.preventDefault(); setSel(i); } : undefined} />
              );
            })}
          </>
        )}
      </div>
      <div className="relative z-10 mt-6 min-h-[92px]">
        <Caption p={current !== null ? products[current] : null} i={current} total={n} hint="Hover over a piece to bring it forward — click to open" />
      </div>
      {!fine && (
        <div className="relative z-10 mt-6 flex items-center justify-center gap-3" data-testid="rack-selectors">
          <button type="button" onClick={() => go(-1)} disabled={sel === 0} aria-label="Previous piece" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line2 bg-ivory/70 transition-colors hover:border-ink disabled:opacity-30" data-testid="rack-prev-button"><ArrowLeft size={15} strokeWidth={1.4} /></button>
          <div className="no-scrollbar flex max-w-full flex-wrap justify-center gap-1.5" role="group" aria-label="Choose a piece on the rail">
            {products.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setSel(i)} aria-pressed={sel === i} aria-label={`Piece ${i + 1}: ${p.title}`}
                className={`h-10 min-w-10 rounded-full border px-2 font-display text-xs tracking-[0.12em] transition-[background-color,color,border-color] duration-300 ${sel === i ? "border-ink bg-ink text-ivory" : "border-line2 bg-ivory/70 text-charcoal hover:border-ink"}`}
                data-testid={`rack-selector-${i + 1}`}>{String(i + 1).padStart(2, "0")}</button>
            ))}
          </div>
          <button type="button" onClick={() => go(1)} disabled={sel === n - 1} aria-label="Next piece" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line2 bg-ivory/70 transition-colors hover:border-ink disabled:opacity-30" data-testid="rack-next-button"><ArrowRight size={15} strokeWidth={1.4} /></button>
        </div>
      )}
    </div>
  );
}

class RackBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function RackFallback({ products }) {
  return (
    <div className="no-scrollbar -mx-5 flex snap-x gap-4 overflow-x-auto px-5" data-testid="rack-fallback">
      {products.map((p) => (
        <Link key={p.id} to={`/product/${p.slug}`} className="w-40 shrink-0 snap-start">
          <div className="aspect-[3/4] bg-linen"><img src={img(p.images?.[0]?.path)} alt={p.title} loading="lazy" className="h-full w-full object-cover" /></div>
          <p className="mt-2 text-xs">{p.title}</p>
        </Link>
      ))}
    </div>
  );
}

export default function ClothingRack({ products }) {
  if (!products?.length) return null;
  return <RackBoundary fallback={<RackFallback products={products} />}><RackInner products={products} /></RackBoundary>;
}
