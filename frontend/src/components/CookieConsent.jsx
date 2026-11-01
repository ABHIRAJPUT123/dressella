import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useConsent } from "@/context/ConsentContext";

const CATS = [
  { key: "necessary", title: "Strictly necessary", desc: "Required for security, your shopping bag, checkout and remembering your cookie choice. These cannot be switched off.", locked: true },
  { key: "analytics", title: "Analytics", desc: "Helps us understand how the site is used (e.g. page visits) so we can improve it. Only loaded if you allow it." },
  { key: "marketing", title: "Marketing & advertising", desc: "Used to measure campaigns and show relevant DRESSELLA ads on other platforms. Only loaded if you allow it." },
  { key: "personalization", title: "Personalisation", desc: "Remembers pieces you've recently viewed on this device to show them back to you." },
];

function Preferences() {
  const { consent, prefsOpen, closePrefs, save, acceptAll, rejectAll } = useConsent();
  const [c, setC] = useState({ analytics: false, marketing: false, personalization: false });
  useEffect(() => {
    if (prefsOpen) setC({ analytics: !!consent?.analytics, marketing: !!consent?.marketing, personalization: !!consent?.personalization });
  }, [prefsOpen, consent]);
  return (
    <Dialog open={prefsOpen} onOpenChange={(o) => !o && closePrefs()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-ivory" data-testid="cookie-preferences-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">Cookie preferences</DialogTitle>
          <DialogDescription className="text-sm text-taupe">Choose which optional cookies DRESSELLA may use. You can change this anytime from “Cookie Settings” in the footer.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-line">
          {CATS.map((cat) => (
            <li key={cat.key} className="flex items-start justify-between gap-6 py-4">
              <div>
                <p className="text-sm font-semibold" id={`cc-${cat.key}`}>{cat.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-taupe">{cat.desc}</p>
              </div>
              {cat.locked ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-taupe">Always on</span> : (
                <Switch checked={c[cat.key]} onCheckedChange={(v) => setC((s) => ({ ...s, [cat.key]: v }))} aria-labelledby={`cc-${cat.key}`} data-testid={`cookie-toggle-${cat.key}`} />
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button className="btn-outline flex-1 px-4" onClick={rejectAll} data-testid="cookie-prefs-reject-button">Reject non-essential</button>
          <button className="btn-outline flex-1 px-4" onClick={acceptAll} data-testid="cookie-prefs-accept-all-button">Accept all</button>
          <button className="btn-primary flex-1 px-4" onClick={() => save(c)} data-testid="cookie-prefs-save-button">Save choices</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CookieConsent() {
  const { decided, acceptAll, rejectAll, openPrefs, prefsOpen } = useConsent();
  return (
    <>
      {!decided && !prefsOpen && (
        <section role="region" aria-label="Cookie consent" className="fixed inset-x-3 bottom-3 z-50 border border-line bg-ivory p-6 shadow-[0_20px_50px_-20px_rgba(26,25,24,.35)] rise sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-md" data-testid="cookie-banner">
          <p className="font-serif text-2xl">Your privacy, your choice</p>
          <p className="mt-3 text-xs leading-relaxed text-taupe">
            We use strictly necessary cookies to run this site. With your permission, we'd also like to use analytics, marketing and personalisation cookies. Nothing optional loads until you choose. <Link to="/privacy-policy" className="underline">Privacy Policy</Link>
          </p>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button className="btn-primary px-4 py-3" onClick={acceptAll} data-testid="cookie-accept-all-button">Accept all</button>
            <button className="btn-outline px-4 py-3" onClick={rejectAll} data-testid="cookie-reject-button">Reject non-essential</button>
          </div>
          <button className="mt-3 w-full py-2 text-[11px] font-semibold uppercase tracking-[0.2em] underline-offset-4 hover:underline" onClick={openPrefs} data-testid="cookie-customize-button">Customise preferences</button>
        </section>
      )}
      <Preferences />
    </>
  );
}
