import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useMeta } from "@/lib/queries";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BagDrawer } from "@/components/BagDrawer";
import { CookieConsent } from "@/components/CookieConsent";

function Announcement() {
  const { data } = useMeta();
  const text = data?.settings?.announcement;
  if (!text) return null;
  return <div className="bg-umber py-2.5 text-center text-[10px] font-normal uppercase tracking-[0.3em] text-cream sm:text-[10.5px]" data-testid="announcement-bar">{text}</div>;
}

export function Layout() {
  const { pathname } = useLocation();
  const { isError } = useMeta();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">Skip to content</a>
      <Announcement />
      <Header />
      {isError && <div role="alert" className="bg-linen py-3 text-center text-xs text-taupe" data-testid="degraded-banner">We're experiencing a temporary issue loading the store. Some content may be unavailable — please try again shortly.</div>}
      <main id="main" className="min-h-[60vh]"><Outlet /></main>
      <Footer />
      <BagDrawer />
      <CookieConsent />
    </>
  );
}
