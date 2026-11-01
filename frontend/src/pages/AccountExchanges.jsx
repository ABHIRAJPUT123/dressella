import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Field } from "@/components/Common";

const REASONS = ["Wrong size", "Wrong item", "Damaged item", "Defective item", "Other"];
const STATUS = { submitted: "Submitted — awaiting review", approved: "Approved — manual processing required", rejected: "Rejected" };

function deliveredDate(order) {
  if (order.status !== "delivered") return null;
  const event = [...(order.timeline || [])].reverse().find((item) => item.status === "delivered");
  return event?.at ? new Date(event.at) : null;
}

function StatusBadge({ status }) {
  const tone = status === "approved" ? "bg-[#E4EBDD] text-[#33461F]" : status === "rejected" ? "bg-[#F3DAD7] text-[#7A2219]" : "bg-[#F4E7CF] text-[#6B4A12]";
  return <span className={`inline-block px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{STATUS[status] || status}</span>;
}

export default function AccountExchanges() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState(searchParams.get("order_id") || "");
  const [lineIndex, setLineIndex] = useState(searchParams.get("line_index") || "");
  const [replacementProduct, setReplacementProduct] = useState("");
  const [replacementSize, setReplacementSize] = useState("");
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: policy, isLoading: policyLoading, isError: policyError } = useQuery({
    queryKey: ["exchange-policy"],
    queryFn: () => api.get("/exchanges/policy").then((r) => r.data),
  });
  const { data: orders, isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => api.get("/account/orders").then((r) => r.data),
  });
  const { data: requests, isLoading: requestsLoading, isError: requestsError } = useQuery({
    queryKey: ["my-exchanges"],
    queryFn: () => api.get("/exchanges").then((r) => r.data),
  });
  const { data: options, isLoading: optionsLoading, error: optionsError } = useQuery({
    queryKey: ["exchange-options", orderId, lineIndex],
    queryFn: () => api.get("/exchanges/options", { params: { order_id: orderId, line_index: Number(lineIndex) } }).then((r) => r.data),
    enabled: !!orderId && lineIndex !== "" && !!policy?.configured,
    retry: false,
  });

  const eligibleOrders = (orders || []).filter((order) => {
    const delivered = deliveredDate(order);
    return policy?.configured && delivered && !Number.isNaN(delivered.getTime())
      && Date.now() <= delivered.getTime() + policy.exchange_window_days * 86400000;
  });
  const selectedOrder = eligibleOrders.find((order) => order.id === orderId);
  const selectedLine = lineIndex !== "" ? selectedOrder?.lines?.[Number(lineIndex)] : null;
  const activeRequest = (requests || []).find((request) => request.order_id === orderId
    && request.line_index === Number(lineIndex) && ["submitted", "approved"].includes(request.status));
  const chosenVariant = options?.variants?.find((variant) => variant.product_id === replacementProduct);

  useEffect(() => {
    const variants = options?.variants || [];
    if (!variants.some((variant) => variant.product_id === replacementProduct)) {
      setReplacementProduct(variants[0]?.product_id || "");
      setReplacementSize(variants[0]?.sizes?.[0]?.size || "");
    }
  }, [options, replacementProduct]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedOrder || !selectedLine || !reason || !replacementProduct || !replacementSize) {
      toast.error("Choose an eligible order item, replacement variant, and reason.");
      return;
    }
    const body = new FormData();
    body.append("order_id", orderId);
    body.append("line_index", String(lineIndex));
    body.append("replacement_product_id", replacementProduct);
    body.append("replacement_size", replacementSize);
    body.append("reason", reason);
    body.append("comments", comments);
    if (image) body.append("image", image);
    setBusy(true);
    try {
      const { data } = await api.post("/exchanges", body);
      toast.success(`Exchange request ${data.request_id} submitted`);
      setReason("");
      setComments("");
      setImage(null);
      await queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]" data-testid="account-exchanges">
      <div>
        <p className="eyebrow">Client care</p>
        <h2 className="mt-2 font-serif text-3xl">Request an exchange</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-taupe">
          Choose a delivered order and item. Requests are reviewed by DRESSELLA; submission does not reserve stock or create a replacement order.
        </p>
        <Link to="/returns" className="mt-3 inline-block text-sm underline">Read the Return & Exchange Policy</Link>

        {(policyLoading || ordersLoading) && <div className="mt-8 h-24 animate-pulse bg-linen" aria-busy="true" />}
        {policyError && <p role="alert" className="mt-6 text-sm text-destructive">The exchange policy could not be loaded. Please refresh or contact client care.</p>}
        {ordersError && <p role="alert" className="mt-6 text-sm text-destructive">Your orders could not be loaded. Please refresh and try again.</p>}
        {!policyLoading && policy && !policy.configured && (
          <p role="status" className="mt-6 border-l-2 border-gold bg-linen p-4 text-sm">
            DRESSELLA has not configured the exchange window yet, so requests are not currently available. Please <Link to="/contact" className="underline">contact client care</Link>.
          </p>
        )}
        {!ordersLoading && policy?.configured && !eligibleOrders.length && (
          <p className="mt-6 border border-line p-5 text-sm text-taupe">There are no delivered orders currently within the configured {policy.exchange_window_days}-day exchange window.</p>
        )}

        {!policyLoading && !ordersLoading && policy?.configured && eligibleOrders.length > 0 && (
          <form onSubmit={submit} className="mt-8 space-y-5" data-testid="exchange-request-form">
            <Field label="Delivered order" id="exchange-order">
              <select id="exchange-order" className="input-luxe" value={orderId} onChange={(event) => { setOrderId(event.target.value); setLineIndex(""); setReplacementProduct(""); setReplacementSize(""); }}>
                <option value="">Choose an order</option>
                {eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {new Date(order.created_at).toLocaleDateString("en-IN")}</option>)}
              </select>
            </Field>
            {selectedOrder && <Field label="Item to exchange" id="exchange-item">
              <select id="exchange-item" className="input-luxe" value={lineIndex} onChange={(event) => { setLineIndex(event.target.value); setReplacementProduct(""); setReplacementSize(""); }}>
                <option value="">Choose an item</option>
                {selectedOrder.lines.map((line, index) => <option key={`${line.product_id}-${line.size}-${index}`} value={index}>{line.title} · {line.color || "Colour"} · {line.size} × {line.qty}</option>)}
              </select>
            </Field>}
            {optionsLoading && <div className="h-12 animate-pulse bg-linen" aria-busy="true" />}
            {optionsError && <p role="alert" className="text-sm text-destructive">{errMsg(optionsError, "Replacement options could not be loaded.")}</p>}
            {selectedLine && options && (
              <>
                <p className="text-xs text-taupe">Delivered {new Date(options.delivery_date).toLocaleDateString("en-IN")} · Request within {options.exchange_window_days} days of delivery.</p>
                {!options.variants.length && <p role="alert" className="text-sm text-destructive">No in-stock replacement variants are currently available for this item.</p>}
                {options.variants.length > 0 && <>
                  <Field label="Replacement colour / item" id="exchange-variant">
                    <select id="exchange-variant" className="input-luxe" value={replacementProduct} onChange={(event) => { setReplacementProduct(event.target.value); setReplacementSize(options.variants.find((variant) => variant.product_id === event.target.value)?.sizes?.[0]?.size || ""); }}>
                      {options.variants.map((variant) => <option key={variant.product_id} value={variant.product_id}>{variant.title} · {variant.color || "Original colour"}</option>)}
                    </select>
                  </Field>
                  <Field label="Replacement size" id="exchange-size">
                    <select id="exchange-size" className="input-luxe" value={replacementSize} onChange={(event) => setReplacementSize(event.target.value)}>
                      {(chosenVariant?.sizes || []).map((size) => <option key={size.size} value={size.size}>{size.size} · {size.stock} in stock</option>)}
                    </select>
                  </Field>
                </>}
              </>
            )}
            <Field label="Reason for exchange" id="exchange-reason">
              <select id="exchange-reason" className="input-luxe" value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="">Choose a reason</option>{REASONS.map((value) => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Comments (optional)" id="exchange-comments">
              <textarea id="exchange-comments" rows={4} maxLength={1000} className="input-luxe h-auto py-3" value={comments} onChange={(event) => setComments(event.target.value)} />
            </Field>
            <Field label="Photo (optional, JPG / PNG / WebP up to 2 MB)" id="exchange-image">
              <input id="exchange-image" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(event) => setImage(event.target.files?.[0] || null)} />
            </Field>
            {activeRequest && <p role="status" className="text-sm text-taupe">An exchange request for this item is already {activeRequest.status}. View it in your requests.</p>}
            <button className="btn-primary" disabled={busy || !reason || !selectedLine || !chosenVariant || !replacementSize || !!activeRequest}>
              {busy ? "Submitting…" : "Submit exchange request"}
            </button>
            <p className="text-xs leading-relaxed text-taupe">Submission does not arrange pickup, guarantee approval, adjust payment, refund, or reserve replacement stock. DRESSELLA will confirm next steps.</p>
          </form>
        )}
      </div>

      <div>
        <p className="eyebrow">Your account</p>
        <h2 className="mt-2 font-serif text-3xl">Exchange requests</h2>
        {requestsLoading && <div className="mt-6 h-32 animate-pulse bg-linen" aria-busy="true" />}
        {requestsError && <p role="alert" className="mt-6 text-sm text-destructive">Your exchange requests could not be loaded. Please refresh.</p>}
        {!requestsLoading && !requestsError && !requests?.length && <p className="mt-6 text-sm text-taupe">You have not submitted an exchange request.</p>}
        {!!requests?.length && <ul className="mt-6 divide-y divide-line border-y border-line">
          {requests.map((request) => (
            <li key={request.request_id} className="space-y-3 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{request.request_id}</p><StatusBadge status={request.status} /></div>
              <p className="text-sm">{request.item.title} · {request.item.color} · {request.item.size} → {request.replacement.color} · {request.replacement.size}</p>
              <p className="text-xs text-taupe">Order {request.order_number} · {new Date(request.created_at).toLocaleDateString("en-IN")} · {request.reason}</p>
              {request.admin_note && <p className="border-l-2 border-line pl-3 text-sm text-taupe">DRESSELLA: {request.admin_note}</p>}
            </li>
          ))}
        </ul>}
      </div>
    </section>
  );
}
