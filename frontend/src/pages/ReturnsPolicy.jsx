import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { PageHero } from "@/components/Common";

export default function ReturnsPolicy() {
  useSeo({ title: "Return & Exchange Policy", description: "DRESSELLA guidance for exchange requests, item condition, review, and return shipping." });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["exchange-policy"],
    queryFn: () => api.get("/exchanges/policy").then((r) => r.data),
  });

  return (
    <div data-testid="returns-policy-page">
      <PageHero eyebrow="Client care" title="Return & Exchange Policy">
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-taupe">
          We want you to feel confident in your DRESSELLA purchase. Please review the guidance below before contacting us or submitting an exchange request.
        </p>
      </PageHero>
      <div className="container-luxe max-w-3xl space-y-10 py-12 sm:py-16">
        <section className="border border-line bg-ivory p-6 sm:p-8">
          <h2 className="font-serif text-2xl">Exchange window</h2>
          {isLoading && <p className="mt-3 h-6 w-2/3 animate-pulse bg-linen" aria-busy="true" />}
          {isError && <p role="alert" className="mt-3 text-sm text-destructive">The exchange window could not be loaded. Please contact client care to confirm eligibility.</p>}
          {!isLoading && !isError && data?.configured
            ? <p className="mt-3 text-sm leading-relaxed">You may submit an exchange request within <strong>{data.exchange_window_days} calendar days</strong> after the order is marked delivered. The order must be linked to your account. DRESSELLA reviews each request; submission is not an approval or a stock reservation.</p>
            : !isLoading && !isError && <p className="mt-3 text-sm leading-relaxed">DRESSELLA has not yet configured an exchange window. Please <Link to="/contact" className="underline">contact client care</Link> to confirm whether your order can be considered. Requests cannot be submitted until the window is configured.</p>}
        </section>

        <section>
          <h2 className="font-serif text-2xl">Item condition</h2>
          <p className="mt-3 text-sm leading-relaxed text-charcoal">Please keep the garment unworn, unwashed, unaltered, and in its original condition. Original product tags, labels, and packaging should remain with the item. DRESSELLA may ask for photographs or additional details to assess the request. A request may be declined if the item does not meet the condition requirements.</p>
        </section>

        <section>
          <h2 className="font-serif text-2xl">Request and approval</h2>
          <p className="mt-3 text-sm leading-relaxed text-charcoal">For an exchange, sign in and open <Link to="/account?tab=exchanges" className="underline">My Account → Returns & exchanges</Link>, choose the delivered order and item, and provide the reason and requested available variant. You may add comments and an optional image. Our team will review the request and update its status in your account. Only submitted requests can be approved or declined.</p>
        </section>

        <section>
          <h2 className="font-serif text-2xl">Shipping and fulfilment</h2>
          <p className="mt-3 text-sm leading-relaxed text-charcoal">Pickup or return-shipping instructions, carrier arrangements, and any applicable charges will be confirmed by DRESSELLA after review. Pickup is not automatically booked and is not represented as free. Approval does not create a replacement order; replacement stock will be checked again before fulfilment. Please wait for instructions before sending an item.</p>
        </section>

        <section>
          <h2 className="font-serif text-2xl">Returns and refunds</h2>
          <p className="mt-3 text-sm leading-relaxed text-charcoal">The online request flow currently supports exchanges only. For a return or refund question, contact client care with your order number. A request does not issue a refund, change an order, or trigger a payment transaction. Any return, inspection, payment adjustment, or refund is handled manually and separately.</p>
        </section>

        <p className="border-t border-line pt-6 text-sm text-taupe">Need help? <Link to="/contact" className="underline">Contact DRESSELLA client care</Link> and include your order number.</p>
      </div>
    </div>
  );
}
