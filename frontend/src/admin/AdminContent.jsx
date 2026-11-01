import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { AdminH1, Badge } from "@/admin/AdminLayout";

const L = ({ label, children }) => <label className="block"><span className="label-luxe">{label}</span>{children}</label>;

function ImagePick({ value, onChange, testid }) {
  const up = async (e) => {
    const fd = new FormData();
    fd.append("file", e.target.files[0]);
    try { const { data } = await api.post("/admin/upload", fd, { timeout: 120000 }); onChange(data.path_lg); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="flex items-center gap-3">
      {value && <img src={img(value)} alt="" className="h-16 w-12 object-cover" />}
      <label className="chip cursor-pointer">Replace image<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={up} data-testid={testid} /></label>
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get("/admin/settings").then((r) => r.data) });
  const [s, setS] = useState(null);
  useEffect(() => data && setS(data), [data]);
  if (!s) return <div className="h-40 animate-pulse bg-linen" />;
  const hero = (k, v) => setS({ ...s, hero: { ...s.hero, [k]: v } });
  const ed = (i, k, v) => setS({ ...s, editorials: s.editorials.map((e, j) => (j === i ? { ...e, [k]: v } : e)) });
  const save = async () => {
    const { key, _id, ...body } = s;
    try { await api.put("/admin/settings", { ...body, shipping_flat: Number(s.shipping_flat), free_shipping_threshold: Number(s.free_shipping_threshold), exchange_window_days: s.exchange_window_days === "" || s.exchange_window_days == null ? null : Number(s.exchange_window_days) }); toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["meta"] }); qc.invalidateQueries({ queryKey: ["exchange-policy"] }); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-8" data-testid="admin-settings">
      <div className="grid gap-5 border border-line bg-ivory p-6 sm:grid-cols-2">
        <div className="sm:col-span-2"><L label="Announcement bar"><input className="input-luxe" value={s.announcement} onChange={(e) => setS({ ...s, announcement: e.target.value })} maxLength={160} data-testid="settings-announcement-input" /></L></div>
        <L label="Flat shipping ₹"><input type="number" className="input-luxe" value={s.shipping_flat} onChange={(e) => setS({ ...s, shipping_flat: e.target.value })} data-testid="settings-shipping-input" /></L>
        <L label="Free shipping above ₹ (0 = never)"><input type="number" className="input-luxe" value={s.free_shipping_threshold} onChange={(e) => setS({ ...s, free_shipping_threshold: e.target.value })} /></L>
        <L label="Exchange window after delivery (days)"><input type="number" min="1" max="365" className="input-luxe" value={s.exchange_window_days ?? ""} onChange={(e) => setS({ ...s, exchange_window_days: e.target.value })} placeholder="Not configured" data-testid="settings-exchange-window-input" /></L>
        <p className="self-end text-xs leading-relaxed text-taupe">Leave blank until DRESSELLA has confirmed its policy. Requests cannot be submitted until a window from 1 to 365 days is configured.</p>
        <div className="sm:col-span-2"><L label="Delivery estimate text"><input className="input-luxe" value={s.delivery_estimate} onChange={(e) => setS({ ...s, delivery_estimate: e.target.value })} maxLength={300} /></L></div>
        <L label="Contact email"><input className="input-luxe" value={s.contact_email} onChange={(e) => setS({ ...s, contact_email: e.target.value })} /></L>
        <L label="Contact phone"><input className="input-luxe" value={s.contact_phone} onChange={(e) => setS({ ...s, contact_phone: e.target.value })} /></L>
      </div>
      <div className="grid gap-5 border border-line bg-ivory p-6 sm:grid-cols-2">
        <p className="eyebrow sm:col-span-2">Homepage hero</p>
        <L label="Eyebrow"><input className="input-luxe" value={s.hero.eyebrow} onChange={(e) => hero("eyebrow", e.target.value)} /></L>
        <L label="Headline"><input className="input-luxe" value={s.hero.title} onChange={(e) => hero("title", e.target.value)} maxLength={120} data-testid="settings-hero-title-input" /></L>
        <div className="sm:col-span-2"><L label="Subtitle"><input className="input-luxe" value={s.hero.subtitle} onChange={(e) => hero("subtitle", e.target.value)} maxLength={300} /></L></div>
        <L label="Primary image"><ImagePick value={s.hero.image} onChange={(v) => hero("image", v)} testid="settings-hero-image-upload" /></L>
        <L label="Secondary image (desktop)"><ImagePick value={s.hero.image_secondary} onChange={(v) => hero("image_secondary", v)} testid="settings-hero-image2-upload" /></L>
      </div>
      {s.editorials.map((e, i) => (
        <div key={i} className="grid gap-5 border border-line bg-ivory p-6 sm:grid-cols-2">
          <p className="eyebrow sm:col-span-2">Editorial block {i + 1}</p>
          <L label="Title"><input className="input-luxe" value={e.title} onChange={(ev) => ed(i, "title", ev.target.value)} /></L>
          <L label="Link (e.g. /collections/festive-edit)"><input className="input-luxe" value={e.link} onChange={(ev) => ed(i, "link", ev.target.value)} /></L>
          <div className="sm:col-span-2"><L label="Text"><input className="input-luxe" value={e.text} onChange={(ev) => ed(i, "text", ev.target.value)} maxLength={400} /></L></div>
          <L label="Button label"><input className="input-luxe" value={e.cta} onChange={(ev) => ed(i, "cta", ev.target.value)} /></L>
          <L label="Image"><ImagePick value={e.image} onChange={(v) => ed(i, "image", v)} /></L>
        </div>
      ))}
      <button className="btn-primary" onClick={save} data-testid="settings-save-button">Save settings</button>
    </div>
  );
}

function Pages() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-pages"], queryFn: () => api.get("/admin/pages").then((r) => r.data) });
  const [p, setP] = useState(null);
  const save = async () => {
    try { await api.put(`/admin/pages/${p.slug}`, { title: p.title, body: p.body, meta_description: p.meta_description || "", reviewed: !!p.reviewed }); toast.success("Page saved"); qc.invalidateQueries({ queryKey: ["admin-pages"] }); qc.invalidateQueries({ queryKey: ["page", p.slug] }); setP(null); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div data-testid="admin-pages">
      {p ? (
        <div className="space-y-4 border border-line bg-ivory p-6">
          <L label="Title"><input className="input-luxe" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></L>
          <L label="Body (blank line = new paragraph, “## ” = heading)"><textarea rows={18} className="input-luxe h-auto py-3 font-mono text-xs" value={p.body} onChange={(e) => setP({ ...p, body: e.target.value })} data-testid="page-body-input" /></L>
          <L label="Meta description"><input className="input-luxe" value={p.meta_description || ""} onChange={(e) => setP({ ...p, meta_description: e.target.value })} /></L>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#1A1918]" checked={!!p.reviewed} onChange={(e) => setP({ ...p, reviewed: e.target.checked })} /> Reviewed & approved by owner</label>
          <div className="flex gap-3"><button className="btn-primary" onClick={save} data-testid="page-save-button">Save page</button><button className="btn-outline" onClick={() => setP(null)}>Cancel</button></div>
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line bg-ivory">{data?.map((pg) => <li key={pg.slug} className="flex items-center justify-between p-4 text-sm"><span>{pg.title} <span className="text-xs text-taupe">/{pg.slug}</span> {!pg.reviewed && <Badge tone="warn">Needs review</Badge>}</span><button className="underline" onClick={() => setP(pg)} data-testid={`edit-page-${pg.slug}`}>Edit</button></li>)}</ul>
      )}
    </div>
  );
}

function Taxonomy({ kind }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: [`admin-${kind}`], queryFn: () => api.get(`/admin/${kind}`).then((r) => r.data) });
  const [f, setF] = useState({ name: "", slug: "", description: "" });
  const save = async () => { try { await api.put(`/admin/${kind}/${f.slug}`, { ...f, order: (data?.length || 0) + 1, active: true, image: "" }); setF({ name: "", slug: "", description: "" }); qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (slug) => { try { await api.delete(`/admin/${kind}/${slug}`); qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="border border-line bg-ivory p-6">
      <ul className="mb-5 space-y-2 text-sm">{data?.map((c) => <li key={c.slug} className="flex justify-between"><span>{c.name} <span className="text-xs text-taupe">/{c.slug}</span></span><button className="text-xs underline" onClick={() => del(c.slug)}>Delete</button></li>)}</ul>
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="input-luxe h-10" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} data-testid={`${kind}-name-input`} />
        <input className="input-luxe h-10" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <button className="btn-outline h-10 py-0" disabled={!f.slug} onClick={save} data-testid={`${kind}-add-button`}>Add</button>
      </div>
    </div>
  );
}

function Messages() {
  const { data } = useQuery({ queryKey: ["admin-messages"], queryFn: () => api.get("/admin/messages").then((r) => r.data) });
  if (!data?.length) return <p className="text-sm text-taupe">No messages yet.</p>;
  return <ul className="divide-y divide-line border border-line bg-ivory">{data.map((m) => <li key={m.id} className="p-4 text-sm"><p className="font-semibold">{m.name} · <a className="underline" href={`mailto:${m.email}`}>{m.email}</a> {m.order_number && `· ${m.order_number}`}</p><p className="mt-1 whitespace-pre-wrap text-taupe">{m.message}</p></li>)}</ul>;
}

const TABS = [["settings", "Store & homepage"], ["pages", "Policy pages"], ["categories", "Categories"], ["collections", "Collections"], ["messages", "Messages"]];

export default function AdminContent() {
  const [tab, setTab] = useState("settings");
  return (
    <div data-testid="admin-content">
      <AdminH1>Content & Pages</AdminH1>
      <div className="no-scrollbar mb-8 flex gap-6 overflow-x-auto border-b border-line">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b py-3 text-[11px] font-semibold uppercase tracking-[0.18em] ${tab === k ? "border-ink" : "border-transparent text-taupe"}`} data-testid={`admin-content-tab-${k}`}>{l}</button>)}</div>
      {tab === "settings" && <Settings />}
      {tab === "pages" && <Pages />}
      {tab === "categories" && <Taxonomy kind="categories" />}
      {tab === "collections" && <Taxonomy kind="collections" />}
      {tab === "messages" && <Messages />}
    </div>
  );
}
