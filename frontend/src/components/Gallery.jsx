import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { img } from "@/lib/api";

function ZoomImage({ image, onOpen, priority }) {
  const [z, setZ] = useState(null);
  return (
    <button type="button" onClick={onOpen} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZ(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}
      onMouseLeave={() => setZ(null)} className="relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden bg-linen" aria-label="Open full-screen image" data-testid="pdp-main-image">
      <img src={img(image.path_lg || image.path)} alt={image.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
        className="h-full w-full object-cover transition-transform duration-300" style={z ? { transform: "scale(2)", transformOrigin: z } : undefined} />
    </button>
  );
}

export function Gallery({ images, title }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const scroller = useRef(null);
  useEffect(() => setActive(0), [images]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) setActive(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div data-testid="pdp-gallery">
      <div className="hidden gap-4 lg:grid lg:grid-cols-[84px_1fr]">
        <ul className="space-y-3">
          {images.map((im, i) => (
            <li key={im.path}>
              <button type="button" onClick={() => setActive(i)} aria-label={`View image ${i + 1}`} aria-current={active === i} className={`block aspect-[3/4] w-full overflow-hidden border transition-colors ${active === i ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`} data-testid={`pdp-thumb-${i}`}>
                <img src={img(im.path)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
        {images[active] && <ZoomImage image={images[active]} onOpen={() => setOpen(true)} priority />}
      </div>
      <div className="lg:hidden">
        <div ref={scroller} onScroll={onScroll} className="no-scrollbar -mx-5 flex snap-x snap-mandatory overflow-x-auto sm:mx-0">
          {images.map((im, i) => (
            <button key={im.path} type="button" onClick={() => { setActive(i); setOpen(true); }} className="aspect-[3/4] w-full shrink-0 snap-center bg-linen" aria-label={`Open image ${i + 1} full-screen`}>
              <img src={img(im.path_lg || im.path)} alt={im.alt} className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-2" aria-hidden="true">{images.map((_, i) => <span key={i} className={`h-[3px] w-6 transition-colors ${active === i ? "bg-ink" : "bg-line2"}`} />)}</div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[100dvh] max-w-none border-0 bg-ivory p-0 sm:h-[94vh] sm:max-w-5xl" data-testid="pdp-lightbox">
          <DialogTitle className="sr-only">{title} — images</DialogTitle>
          <DialogDescription className="sr-only">Scroll to view all images</DialogDescription>
          <div className="h-full overflow-y-auto">
            {images.map((im) => <img key={im.path} src={img(im.path_lg || im.path)} alt={im.alt} className="mx-auto w-full max-w-3xl" loading="lazy" />)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
