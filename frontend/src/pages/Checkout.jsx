import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { api, errMsg, inr, EMAIL_RE } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { useMeta } from "@/lib/queries";
import { openRazorpay } from "@/lib/razorpay";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { AddressForm, EMPTY_ADDR, validateAddress } from "@/components/AddressForm";
import { BagLine } from "@/components/BagDrawer";
import { Field } from "@/components/Common";

const idemKey = () => {
  let k = sessionStorage.getItem("anora_checkout_key");
  if (!k) {
    k = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
    sessionStorage.setItem("anora_checkout_key", k);
  }
  return k;
};

export function Summary({ priced, coupon, setCoupon, applyCoupon, couponMsg }) {
  const t = priced?.totals;
  return (
    <div className="bg-sand p-6 sm:p-8" data-testid="checkout-summary">
      <h2 className="font-serif text-2xl">Order summary</h2>
      <ul className="mt-2 divide-y divide-line">{priced?.lines.map((l) => <BagLine key={l.product_id + l.size} l={l} />)}</ul>
      {setCoupon && (
        <div className="mt-4 border-t border-line pt-5">
          <label htmlFor="coupon" className="label-luxe">Promo code</label>
          <div className="flex">
            <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} maxLength={30} className="input-luxe h-11 bg-ivory" placeholder="Enter code" onKeyDown={(e) => e.key === "Enter" && applyCoupon(e)} data-testid="coupon-input" />
            <button type="button" onClick={applyCoupon} className="btn-outline h-11 shrink-0 px-5 py-0" data-testid="coupon-apply-button">Apply</button>
          </div>
          {couponMsg && <p role="status" className={`mt-2 text-xs ${couponMsg.ok ? "text-ink" : "text-destructive"}`} data-testid="coupon-message">{couponMsg.text}</p>}
        </div>
      )}
      {t && (
        <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid="summary-subtotal">{inr(t.subtotal)}</dd></div>
          {t.discount > 0 && <div className="flex justify-between"><dt>Discount {priced.coupon && `(${priced.coupon.code})`}</dt><dd data-testid="summary-discount">−{inr(t.discount)}</dd></div>}
          <div className="flex justify-between"><dt>Shipping</dt><dd data-testid="summary-shipping">{t.shipping ? inr(t.shipping) : "Complimentary"}</dd></div>
          <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd data-testid="summary-total">{inr(t.total)}</dd></div>
          <p className="text-xs text-taupe">Inclusive of all taxes.</p>
        </dl>
      )}
    </div>
  );
}

export default function Checkout() {
  useSeo({ title: "Checkout", noindex: true });
  const { items, replace, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [priced, setPriced] = useState(null);
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [couponMsg, setCouponMsg] = useState(null);
  const [email, setEmail] = useState("");
  const [ship, setShip] = useState(EMPTY_ADDR);
  const [billSame, setBillSame] = useState(true);
  const [bill, setBill] = useState(EMPTY_ADDR);
  const [saveAddr, setSaveAddr] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("razorpay");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const errRef = useRef(null);
  const { data: meta } = useMeta();

  const clearFixed = (prefix, addr) => setErrors((er) => {
    const keys = Object.keys(er).filter((k) => k.startsWith(prefix));
    if (!keys.length) return er;
    const now = validateAddress(addr);
    const next = { ...er };
    keys.forEach((k) => { if (!now[k.slice(prefix.length)]) delete next[k]; });
    return next;
  });
  const onShip = (v) => { setShip(v); clearFixed("ship_", v); };
  const onBill = (v) => { setBill(v); clearFixed("bill_", v); };
  const onEmail = (v) => {
    setEmail(v);
    if (EMAIL_RE.test(v)) setErrors((er) => { if (!er.email) return er; const { email: _, ...rest } = er; return rest; });
  };
  useEffect(() => {
    if (!Object.keys(errors).length) setFormErr((f) => (f === "Please correct the highlighted fields." ? "" : f));
  }, [errors]);

  useEffect(() => {
    if (user) {
      setEmail((e) => e || user.email);
      const def = user.addresses?.find((a) => a.is_default) || user.addresses?.[0];
      if (def) setShip((s) => (s.line1 ? s : { ...EMPTY_ADDR, ...def }));
      else setShip((s) => ({ ...s, name: s.name || user.name, phone: s.phone || user.phone || "" }));
    }
  }, [user]);

  const reprice = useCallback(async (code) => {
    if (!items.length) return setPriced(null);
    const { data } = await api.post("/cart/validate", { items: items.map(({ product_id, size, qty }) => ({ product_id, size, qty })), coupon_code: code || null });
    setPriced(data);
    return data;
  }, [items]);

  useEffect(() => { reprice(applied).catch((e) => setFormErr(errMsg(e))); }, [reprice, applied]);
  useEffect(() => {
    if (meta?.payment_configured === false) setPaymentMethod("cod");
  }, [meta?.payment_configured]);

  const applyCoupon = async (e) => {
    e.preventDefault();
    if (!coupon.trim()) return;
    const d = await reprice(coupon.trim());
    if (d.coupon_error) { setCouponMsg({ ok: false, text: d.coupon_error }); setApplied(""); reprice(""); }
    else { setApplied(coupon.trim()); setCouponMsg({ ok: true, text: `Code ${d.coupon.code} applied.` }); }
  };

  const place = async (e) => {
    e.preventDefault();
    const er = {};
    if (!EMAIL_RE.test(email)) er.email = "Please enter a valid email address.";
    const se = validateAddress(ship);
    Object.entries(se).forEach(([k, v]) => (er[`ship_${k}`] = v));
    if (!billSame) Object.entries(validateAddress(bill)).forEach(([k, v]) => (er[`bill_${k}`] = v));
    setErrors(er);
    if (Object.keys(er).length) { setFormErr("Please correct the highlighted fields."); return setTimeout(() => errRef.current?.focus(), 0); }
    setBusy(true); setFormErr("");
    try {
      const { data } = await api.post("/checkout", {
        items: items.map(({ product_id, size, qty }) => ({ product_id, size, qty })), coupon_code: applied || null, email, shipping: ship,
        payment_method: paymentMethod, billing_same: billSame, billing: billSame ? null : bill,
        idempotency_key: idemKey(), save_address: !!user && saveAddr,
      });
      const { order, access_token: t, razorpay: rz } = data;
      const done = () => { clear(); sessionStorage.removeItem("anora_checkout_key"); nav(`/order/${order.id}?t=${t}`); };
      if (order.payment_method === "cod") return done();
      if (!rz) {
        setFormErr("Online payment could not be started. Your bag is still saved; please try again.");
        setBusy(false);
        return;
      }
      openRazorpay({
        rz, order, prefill: { name: ship.name, email, contact: ship.phone },
        onSuccess: async (resp) => {
          try {
            const { data: verified } = await api.post("/checkout/verify", { order_id: order.id, access_token: t, ...resp });
            if (verified.order.payment_status === "paid") return done();
            setFormErr("Payment is being reviewed. Your bag is still saved.");
          } catch (verifyError) {
            setFormErr(`We couldn't verify the payment yet. Your bag is still saved. ${errMsg(verifyError)}`);
          }
          setBusy(false);
        },
        onDismiss: () => {
          api.post("/checkout/failed", { order_id: order.id, access_token: t, reason: "Payment window closed" })
            .catch(() => setFormErr("Payment was cancelled and its status could not be updated. Your bag is still saved."));
          setFormErr("Payment was cancelled. Your bag is still saved.");
          setBusy(false);
        },
        onFail: (msg) => {
          api.post("/checkout/failed", { order_id: order.id, access_token: t, reason: msg })
            .catch(() => setFormErr("Payment failed and its status could not be updated. Your bag is still saved."));
          setFormErr(`${msg} Your bag is still saved.`);
          setBusy(false);
        },
      });
    } catch (err) {
      const d = err.response?.data?.detail;
      if (err.response?.status === 409 && d?.issues) {
        const fresh = await reprice(applied);
        replace(fresh.lines.map((l) => ({ product_id: l.product_id, slug: l.slug, title: l.title, size: l.size, qty: l.qty, price: l.unit_price, image: l.image, color: l.color })));
      }
      setFormErr(errMsg(err));
      setBusy(false);
    }
  };

  if (!items.length) return (
    <div className="container-luxe py-28 text-center" data-testid="checkout-empty">
      <h1 className="text-4xl sm:text-5xl">Your bag is empty</h1>
      <Link to="/shop" className="btn-primary mt-8">Continue shopping</Link>
    </div>
  );

  const shipErr = Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith("ship_")).map(([k, v]) => [k.slice(5), v]));
  const billErr = Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith("bill_")).map(([k, v]) => [k.slice(5), v]));

  return (
    <div className="container-luxe py-10 sm:py-14" data-testid="checkout-page">
      <h1 className="text-4xl sm:text-5xl">Checkout</h1>
      {!user && <p className="mt-3 text-sm text-taupe">Checking out as a guest. <Link to="/login?next=/checkout" className="underline" data-testid="checkout-login-link">Sign in</Link> for faster checkout.</p>}
      <form onSubmit={place} noValidate className="mt-10 grid gap-12 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-7">
          <section aria-labelledby="h-contact">
            <h2 id="h-contact" className="mb-6 font-serif text-2xl">Contact</h2>
            <Field label="Email" id="checkout-email" error={errors.email}>
              <input id="checkout-email" type="email" value={email} onChange={(e) => onEmail(e.target.value)} autoComplete="email" className="input-luxe" aria-invalid={!!errors.email} data-testid="checkout-email-input" />
            </Field>
          </section>
          <section aria-labelledby="h-ship">
            <h2 id="h-ship" className="mb-6 font-serif text-2xl">Shipping address</h2>
            {user?.addresses?.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">{user.addresses.map((a) => <button type="button" key={a.id} onClick={() => onShip({ ...EMPTY_ADDR, ...a })} className={`chip h-auto px-4 py-2 text-left ${ship.line1 === a.line1 && ship.pincode === a.pincode ? "chip-on" : ""}`} data-testid={`checkout-saved-address-${a.id}`}>{a.name}, {a.city} {a.pincode}</button>)}</div>
            )}
            <AddressForm value={ship} onChange={onShip} errors={shipErr} prefix="ship" />
            {user && <label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} className="h-4 w-4 accent-[#1A1918]" data-testid="checkout-save-address-checkbox" /> Save this address to my account</label>}
          </section>
          <section aria-labelledby="h-bill">
            <h2 id="h-bill" className="mb-6 font-serif text-2xl">Billing</h2>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={billSame} onChange={(e) => setBillSame(e.target.checked)} className="h-4 w-4 accent-[#1A1918]" data-testid="checkout-billing-same-checkbox" /> Same as shipping address</label>
            {!billSame && <div className="mt-6"><AddressForm value={bill} onChange={onBill} errors={billErr} prefix="bill" /></div>}
          </section>
          <section aria-labelledby="h-pay" className="border border-line p-6">
            <h2 id="h-pay" className="font-serif text-2xl">Payment</h2>
            <fieldset className="mt-4 space-y-4">
              <legend className="sr-only">Choose a payment method</legend>
              <label className="flex cursor-pointer items-start gap-3 border border-line bg-ivory p-4" data-testid="payment-method-cod">
                <input type="radio" name="payment-method" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} className="mt-1 accent-[#1A1918]" />
                <span><span className="block text-sm font-semibold">Cash on Delivery</span><span className="mt-1 block text-xs text-taupe">Pay when your order is delivered.</span></span>
              </label>
              <label className={`flex items-start gap-3 border border-line bg-ivory p-4 ${meta?.payment_configured === false ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} data-testid="payment-method-razorpay">
                <input type="radio" name="payment-method" value="razorpay" checked={paymentMethod === "razorpay"} disabled={meta?.payment_configured === false} onChange={() => setPaymentMethod("razorpay")} className="mt-1 accent-[#1A1918]" />
                <span><span className="block text-sm font-semibold">Pay online with Razorpay</span><span className="mt-1 block text-xs text-taupe">{meta?.payment_configured === false ? "Online payment is not currently available." : "UPI, cards, net banking and wallets. Payment is confirmed only after server verification."}</span></span>
              </label>
            </fieldset>
          </section>
        </div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-40">
            <Summary priced={priced} coupon={coupon} setCoupon={setCoupon} applyCoupon={applyCoupon} couponMsg={couponMsg} />
            {priced?.issues?.length > 0 && <div role="alert" className="mt-4 border border-destructive/40 p-3 text-xs text-destructive" data-testid="checkout-issues">{priced.issues.map((i) => <p key={i.product_id + i.size}>{i.message}</p>)}</div>}
            {formErr && <p ref={errRef} tabIndex={-1} role="alert" className="mt-4 text-sm text-destructive" data-testid="checkout-error">{formErr}</p>}
            <button type="submit" disabled={busy || !priced} className="btn-primary mt-6 w-full" data-testid="place-order-button"><Lock size={14} /> {busy ? "Processing…" : paymentMethod === "cod" ? `Place COD order · ${priced ? inr(priced.totals.total) : ""}` : `Pay ${priced ? inr(priced.totals.total) : ""}`}</button>
            <p className="mt-3 text-center text-xs text-taupe">By placing your order you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy-policy" className="underline">Privacy Policy</Link>.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
