// Optional third-party scripts. Loaded ONLY after the matching consent category is granted
// and only if the business owner configures an ID in frontend env.
const GA_ID = process.env.REACT_APP_GA_MEASUREMENT_ID;
const META_PIXEL_ID = process.env.REACT_APP_META_PIXEL_ID;

const loaded = new Set();

function inject(id, src, inline) {
  if (loaded.has(id) || document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  if (src) s.src = src;
  if (inline) s.text = inline;
  document.head.appendChild(s);
  loaded.add(id);
}

export function applyTrackers(consent) {
  window.__anoraConsent = consent || { analytics: false, marketing: false, personalization: false };
  if (consent?.analytics && GA_ID) {
    inject("ga-src", `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    inject("ga-init", null, `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`);
  }
  if (GA_ID) window[`ga-disable-${GA_ID}`] = !consent?.analytics;
  if (consent?.marketing && META_PIXEL_ID) {
    inject("meta-pixel", null, `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`);
  }
  if (window.fbq) window.fbq("consent", consent?.marketing ? "grant" : "revoke");
}

export function track(event, params = {}) {
  const c = window.__anoraConsent || {};
  if (c.analytics && window.gtag) window.gtag("event", event, params);
  if (c.marketing && window.fbq) window.fbq("trackCustom", event, params);
}
