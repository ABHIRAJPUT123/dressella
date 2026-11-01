import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { applyTrackers } from "@/lib/trackers";

const ConsentCtx = createContext(null);
export const CONSENT_KEY = "anora_consent";
export const CONSENT_VERSION = "1";

function read() {
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY));
    return c && c.version === CONSENT_VERSION ? c : null;
  } catch {
    return null;
  }
}

export function ConsentProvider({ children }) {
  const [consent, setConsent] = useState(read);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    applyTrackers(consent);
  }, [consent]);

  const save = useCallback((choices) => {
    const c = {
      version: CONSENT_VERSION,
      id: read()?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
      necessary: true,
      analytics: !!choices.analytics,
      marketing: !!choices.marketing,
      personalization: !!choices.personalization,
      decided_at: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
    // Mirror to a first-party cookie so a server could honour it; 180-day expiry.
    document.cookie = `${CONSENT_KEY}=${encodeURIComponent(JSON.stringify({ v: c.version, a: +c.analytics, m: +c.marketing, p: +c.personalization }))}; Max-Age=${180 * 86400}; Path=/; SameSite=Lax; Secure`;
    if (!c.personalization) localStorage.removeItem("anora_recent_v1");
    setConsent(c);
    setPrefsOpen(false);
    api.post("/consent", { consent_id: c.id, analytics: c.analytics, marketing: c.marketing, personalization: c.personalization, version: c.version }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      consent,
      decided: !!consent,
      allowed: (cat) => (cat === "necessary" ? true : !!consent?.[cat]),
      acceptAll: () => save({ analytics: true, marketing: true, personalization: true }),
      rejectAll: () => save({}),
      save,
      prefsOpen,
      openPrefs: () => setPrefsOpen(true),
      closePrefs: () => setPrefsOpen(false),
    }),
    [consent, save, prefsOpen]
  );
  return <ConsentCtx.Provider value={value}>{children}</ConsentCtx.Provider>;
}

export const useConsent = () => useContext(ConsentCtx);
