export function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export async function openRazorpay({ rz, order, prefill, onSuccess, onDismiss, onFail }) {
  const ok = await loadRazorpay();
  if (!ok) return onFail("Could not load the payment window. Please check your connection and try again.");
  const r = new window.Razorpay({
    key: rz.key_id,
    amount: rz.amount,
    currency: rz.currency,
    name: "DRESSELLA",
    description: `Order ${order.order_number}`,
    order_id: rz.order_id,
    prefill,
    theme: { color: "#1A1918" },
    handler: onSuccess,
    modal: { ondismiss: onDismiss },
  });
  r.on("payment.failed", (resp) => onFail(resp?.error?.description || "Payment failed."));
  r.open();
}
