import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, errMsg, img, EMAIL_RE, inr } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { useMeta, useProducts } from "@/lib/queries";
import { Breadcrumbs, Field, PageHero, RichText } from "@/components/Common";
import { SizeGuideTable } from "@/components/SizeGuideTable";
import { Timeline, STATUS_LABEL } from "@/pages/OrderView";
import NotFound from "@/pages/NotFound";

export function ContentPage({ slug: fixed }) {
  const params = useParams();
  const slug = fixed || params.slug;
  const { data, isLoading, isError } = useQuery({ queryKey: ["page", slug], queryFn: () => api.get(`/pages/${slug}`).then((r) => r.data), retry: false });
  useSeo({ title: data?.title, description: data?.meta_description });
  if (isError) return <NotFound />;
  return (
    <div data-testid={`content-page-${slug}`}>
      <PageHero eyebrow="DRESSELLA" title={data?.title || ""} />
      <div className="container-luxe py-14 sm:py-20">
        <div className="max-w-2xl">{isLoading ? <div className="h-60 animate-pulse bg-linen" /> : <RichText body={data.body} />}</div>
      </div>
    </div>
  );
}

export function SizeGuidePage() {
  useSeo({ title: "Size Guide", description: "DRESSELLA women's size guide — bust, waist and hip measurements." });
  return (
    <div data-testid="size-guide-page">
      <PageHero eyebrow="Client care" title="Size Guide" />
      <div className="container-luxe max-w-3xl py-14 sm:py-20"><SizeGuideTable /><p className="mt-8 text-sm text-taupe">Need help choosing? <Link to="/contact" className="underline">Contact client care</Link>.</p></div>
    </div>
  );
}

export function Contact() {
  useSeo({ title: "Contact Us", description: "Contact DRESSELLA client care." });
  const { data: meta } = useMeta();
  const [f, setF] = useState({ name: "", email: "", order_number: "", message: "" });
  const [state, setState] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name || !EMAIL_RE.test(f.email) || f.message.trim().length < 5) return setState({ err: true, t: "Please complete your name, a valid email and a message." });
    try { await api.post("/contact", f); setState({ t: "Thank you — our client care team will reply by email." }); setF({ name: "", email: "", order_number: "", message: "" }); } catch (e2) { setState({ err: true, t: errMsg(e2) }); }
  };
  const s = meta?.settings;
  return (
    <div data-testid="contact-page">
      <PageHero eyebrow="Client care" title="Contact us" />
      <div className="container-luxe grid gap-14 py-14 sm:py-20 lg:grid-cols-12">
        <div className="text-sm leading-relaxed lg:col-span-4">
          <p className="eyebrow mb-3">Write to us</p>
          {s?.contact_email && <a href={`mailto:${s.contact_email}`} className="underline">{s.contact_email}</a>}
          {s?.contact_phone && <p className="mt-2">{s.contact_phone}</p>}
          <p className="mt-6 text-taupe">For order questions, please include your order number. You can also <Link to="/track-order" className="underline">track your order</Link>.</p>
        </div>
        <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2 lg:col-span-7 lg:col-start-6" data-testid="contact-form">
          <Field label="Name" id="contact-name"><input id="contact-name" className="input-luxe" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} data-testid="contact-name-input" /></Field>
          <Field label="Email" id="contact-email"><input id="contact-email" type="email" className="input-luxe" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="contact-email-input" /></Field>
          <div className="sm:col-span-2"><Field label="Order number (optional)" id="contact-order"><input id="contact-order" className="input-luxe" value={f.order_number} onChange={(e) => setF({ ...f, order_number: e.target.value })} maxLength={30} /></Field></div>
          <div className="sm:col-span-2"><Field label="Message" id="contact-message"><textarea id="contact-message" rows={6} className="input-luxe h-auto py-3" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={2000} data-testid="contact-message-input" /></Field></div>
          {state && <p role={state.err ? "alert" : "status"} className={`text-sm sm:col-span-2 ${state.err ? "text-destructive" : ""}`} data-testid="contact-status">{state.t}</p>}
          <div><button className="btn-primary" data-testid="contact-submit-button">Send message</button></div>
        </form>
      </div>
    </div>
  );
}

export function TrackOrder() {
  useSeo({ title: "Track Order" });
  const [f, setF] = useState({ order_number: "", email: "" });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (f.order_number.length < 6 || !EMAIL_RE.test(f.email)) return setErr("Please enter your order number and the email used at checkout.");
    setErr("");
    try { const { data } = await api.post("/orders/track", f); setRes(data); } catch (e2) { setRes(null); setErr(errMsg(e2)); }
  };
  return (
    <div data-testid="track-order-page">
      <PageHero eyebrow="Client care" title="Track your order" />
      <div className="container-luxe grid gap-14 py-14 sm:py-20 lg:grid-cols-2">
        <form onSubmit={submit} noValidate className="max-w-md space-y-5" data-testid="track-form">
          <Field label="Order number" id="track-number"><input id="track-number" className="input-luxe" value={f.order_number} onChange={(e) => setF({ ...f, order_number: e.target.value.toUpperCase() })} placeholder="e.g. ANR2610123456" data-testid="track-number-input" /></Field>
          <Field label="Email" id="track-email"><input id="track-email" type="email" className="input-luxe" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="track-email-input" /></Field>
          {err && <p role="alert" className="text-sm text-destructive" data-testid="track-error">{err}</p>}
          <button className="btn-primary" data-testid="track-submit-button">Track order</button>
        </form>
        {res && (
          <div data-testid="track-result">
            <p className="eyebrow">Order {res.order_number}</p>
            <p className="mt-2 font-serif text-3xl">{STATUS_LABEL[res.status] || res.status}</p>
            <p className="mb-6 mt-1 text-xs text-taupe">Delivering to {res.shipping.city} {res.shipping.pincode}</p>
            <div className="mb-6 border-y border-line py-4 text-sm">
              <p>Payment: {res.payment_method === "cod" ? "Cash on Delivery" : "Razorpay"} · {STATUS_LABEL[res.payment_status] || res.payment_status}</p>
              <p className="mt-2 font-semibold">Total: {inr(res.totals.total)}</p>
              <ul className="mt-3 space-y-1">{res.lines.map((line) => <li key={line.product_id + line.size}>{line.title} · Size {line.size} × {line.qty}</li>)}</ul>
            </div>
            <Timeline order={res} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CollectionsIndex() {
  useSeo({ title: "Collections", description: "Curated DRESSELLA edits — The Jaipur Edit, Festive Edit, Desk to Dinner and Everyday Ease." });
  const { data: meta } = useMeta();
  const { data } = useProducts({ limit: 24 });
  const all = data?.items || [];
  const cols = (meta?.collections || []).filter((c) => c.count);
  return (
    <div data-testid="collections-page">
      <div className="container-luxe pt-10"><Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Collections" }]} /></div>
      <div className="container-luxe py-10"><h1 className="text-4xl sm:text-5xl lg:text-6xl">Collections</h1></div>
      <div className="container-luxe grid gap-x-8 gap-y-16 pb-24 sm:grid-cols-2">
        {cols.map((c, i) => {
          const inCol = all.filter((p) => (p.collections || []).includes(c.slug));
          const pic = c.image || inCol[i % Math.max(inCol.length, 1)]?.images?.[0]?.path_lg;
          return (
            <Link key={c.slug} to={`/collections/${c.slug}`} className="group" data-testid={`collection-tile-${c.slug}`}>
              <div className="aspect-[4/5] overflow-hidden bg-linen"><img src={img(pic)} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" /></div>
              <p className="mt-6 font-serif text-3xl">{c.name}</p>
              <p className="mt-1 text-sm text-taupe">{c.description} · {c.count} pieces</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
