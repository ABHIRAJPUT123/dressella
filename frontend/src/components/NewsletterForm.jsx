import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg, EMAIL_RE } from "@/lib/api";

export function NewsletterForm({ dark, compact }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState({ status: "idle", msg: "" });
  const id = dark ? "nl-footer" : "nl-main";

  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setState({ status: "error", msg: "Please enter a valid email address." });
    if (!consent) return setState({ status: "error", msg: "Please tick the box to confirm you'd like to hear from us." });
    setState({ status: "loading", msg: "" });
    try {
      await api.post("/newsletter", { email, consent });
      setState({ status: "ok", msg: "Thank you — you're on the list." });
      setEmail("");
      setConsent(false);
    } catch (err) {
      setState({ status: "error", msg: errMsg(err) });
    }
  };
  const tone = dark ? "border-ivory/30 text-ivory placeholder:text-ivory/40 focus:border-ivory" : "";

  return (
    <form onSubmit={submit} noValidate data-testid={`${id}-form`}>
      {compact && <p className="eyebrow mb-3 text-champagne">The DRESSELLA letter</p>}
      <div className="flex">
        <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
        <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className={`input-luxe ${tone}`} autoComplete="email" data-testid={`${id}-email-input`} />
        <button type="submit" disabled={state.status === "loading"} className={`${dark ? "btn-light" : "btn-primary"} shrink-0 px-6`} data-testid={`${id}-submit-button`}>{state.status === "loading" ? "…" : "Subscribe"}</button>
      </div>
      <label className={`mt-4 flex cursor-pointer items-start gap-3 text-xs leading-relaxed ${dark ? "text-ivory/70" : "text-taupe"}`}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-current" data-testid={`${id}-consent-checkbox`} />
        <span>I agree to receive emails about new collections and offers from DRESSELLA. I can unsubscribe anytime. See our <Link to="/privacy-policy" className="underline">Privacy Policy</Link>.</span>
      </label>
      {state.msg && <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs ${state.status === "error" ? (dark ? "text-red-300" : "text-destructive") : dark ? "text-champagne" : "text-ink"}`} data-testid={`${id}-message`}>{state.msg}</p>}
    </form>
  );
}
