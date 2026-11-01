# Reference snippet for mobile sweep (iteration 5) - metrics JS used in browser_automation
METRICS_JS = """() => {
  const vw = document.documentElement.clientWidth;
  const out = {sw: document.documentElement.scrollWidth, vw, bodySW: document.body.scrollWidth};
  const wide = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') { clipped = true; break; } p = p.parentElement; }
      if (!clipped && getComputedStyle(el).position !== 'fixed') wide.push((el.dataset.testid || el.tagName + '.' + String(el.className).slice(0, 40)) + '@' + Math.round(r.left) + '-' + Math.round(r.right));
    }
  });
  out.wide = wide.slice(0, 6);
  out.unrevealed = document.querySelectorAll('.reveal:not(.is-in)').length;
  const inv = [];
  document.querySelectorAll('main *').forEach(el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (cs.opacity === '0' && r.width > 40 && r.height > 20 && !el.closest('[data-testid=clothing-rack]')) inv.push(el.dataset.testid || el.tagName + '.' + String(el.className).slice(0, 30)); });
  out.invisible = inv.slice(0, 5);
  const ab = document.querySelector('[data-testid=announcement-bar]'); out.annH = ab ? Math.round(ab.getBoundingClientRect().height) : null;
  const f = document.querySelector('[data-testid=site-footer]');
  out.afterFooter = f ? Math.round(document.documentElement.scrollHeight - (f.getBoundingClientRect().bottom + window.scrollY)) : null;
  const pt = document.querySelector('[data-testid=page-transition]'); out.ptOpacity = pt ? getComputedStyle(pt).opacity : null;
  return out;
}"""
