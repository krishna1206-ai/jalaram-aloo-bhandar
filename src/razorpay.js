// Online wallet top-up with Razorpay Checkout (UPI, cards, net banking).
// Card and UPI details are typed into Razorpay's own window, never into this site.
import { api } from "./api.js";

let loading = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't open the payment window. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  return loading;
}

// Resolves with the server's answer ({ status: "paid"|"processing", wallet, transaction }).
// Rejects if the user closes the window without paying.
export async function payOnline(amount) {
  const { checkout } = await api("/me/wallet/payments", { method: "POST", body: { amount } });
  await loadCheckout();

  const result = await new Promise((resolve, reject) => {
    let lastError = "";
    const rzp = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: "Add money to wallet",
      prefill: checkout.prefill,
      theme: { color: "#1f5c3a" },
      handler: resolve,
      modal: { ondismiss: () => reject(new Error(lastError || "Payment cancelled. No money was taken.")) },
    });
    // Razorpay lets the user retry inside the window, so only remember the reason
    rzp.on("payment.failed", (r) => {
      lastError = r?.error?.description ? `Payment failed: ${r.error.description}` : "Payment failed.";
    });
    rzp.open();
  });

  return api("/me/wallet/payments/verify", {
    method: "POST",
    body: { orderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature },
  });
}
