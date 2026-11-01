import { Link } from "react-router-dom";
import { useConsent } from "@/context/ConsentContext";
import { useNavItems } from "@/components/Header";
import { NewsletterForm } from "@/components/NewsletterForm";

const Col = ({ title, links }) => (
  <div>
    <p className="mb-6 text-[10.5px] font-medium uppercase tracking-[0.3em] text-champagne">{title}</p>
    <ul className="space-y-3.5 text-sm font-light text-ivory/70">
      {links.map(([l, to]) => <li key={to}><Link to={to} className="link-u transition-colors hover:text-ivory">{l}</Link></li>)}
    </ul>
  </div>
);

export function Footer() {
  const { openPrefs } = useConsent();
  const { cats, cols, meta } = useNavItems();
  const email = meta?.settings?.contact_email;
  return (
    <footer className="bg-ink text-ivory" data-testid="site-footer">
      <div className="container-luxe grid gap-16 pb-16 pt-20 sm:pt-28 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.3em] text-champagne">The DRESSELLA letter</p>
          <p className="mt-6 max-w-xs font-serif text-3xl font-light leading-snug text-ivory/90">Fashion for her — rooted in Jaipur, edited for the world.</p>
          <div className="mt-8 max-w-sm"><NewsletterForm dark compact /></div>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:col-span-7 lg:col-start-6">
          <Col title="Shop" links={[["New In", "/new-in"], ["All Clothing", "/shop"], ...cats.map((c) => [c.name, `/category/${c.slug}`])]} />
          <Col title="Edits" links={[["All Collections", "/collections"], ...cols.map((c) => [c.name, `/collections/${c.slug}`])]} />
          <Col title="Client Care" links={[["Contact Us", "/contact"], ["Track Order", "/track-order"], ["FAQs", "/faq"], ["Size Guide", "/size-guide"], ["Shipping", "/shipping-policy"], ["Returns & Exchanges", "/returns"]]} />
          <Col title="DRESSELLA" links={[["About", "/about"], ["My Account", "/account"], ["Wishlist", "/wishlist"], ["Privacy Policy", "/privacy-policy"], ["Terms & Conditions", "/terms"]]} />
        </div>
      </div>
      <div className="container-luxe overflow-hidden" aria-hidden="true">
        <p className="select-none whitespace-nowrap text-center font-display text-[15vw] leading-[0.85] tracking-[0.12em] text-ivory/[0.07] lg:text-[11.5vw]">DRESSELLA</p>
      </div>
      <div className="border-t border-ivory/10">
        <div className="container-luxe flex flex-col gap-4 py-6 text-[11px] tracking-wide text-ivory/55 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="font-display text-base tracking-[0.34em] text-ivory/90" aria-label="DRESSELLA home" data-testid="footer-logo-link">DRESSELLA</Link>
          <p>© {new Date().getFullYear()} DRESSELLA. All rights reserved. Prices in INR.</p>
          <div className="flex flex-wrap items-center gap-6">
            {email && <a href={`mailto:${email}`} className="link-u">{email}</a>}
            <span>Secure payments by Razorpay</span>
            <button onClick={openPrefs} className="link-u text-ivory/80" data-testid="footer-cookie-settings-button">Cookie Settings</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
