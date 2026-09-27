import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const signature = request.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) return new Response("Webhook is not configured", { status: 503 });

  const rawBody = await request.text();
  if (!await verifyStripeSignature(rawBody, signature, webhookSecret)) return new Response("Invalid signature", { status: 400 });

  try {
    const event = JSON.parse(rawBody);
    const session = event.data?.object;
    if (!session?.id) return new Response("Invalid event payload", { status: 400 });

    let paid: boolean | null = null;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (session.payment_status !== "paid") return new Response(JSON.stringify({ received: true, awaiting_payment: true }), { headers: { "Content-Type": "application/json" } });
      paid = true;
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      paid = false;
    } else {
      return new Response(JSON.stringify({ received: true, ignored: true }), { headers: { "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.rpc("finalize_stripe_checkout", {
      p_event_id: event.id,
      p_session_id: session.id,
      p_paid: paid,
      p_amount_total: session.amount_total,
      p_currency: session.currency
    });
    if (error) {
      console.error("Stripe event finalization failed", error.message);
      return new Response("Payment event could not be finalized", { status: 500 });
    }
    return new Response(JSON.stringify({ received: true, finalized: Boolean(data) }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return new Response("Payment event could not be processed", { status: 500 });
  }
});

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const values = header.split(",").map(part => {
    const separator = part.indexOf("=");
    return [part.slice(0, separator), part.slice(separator + 1)];
  });
  const timestamp = values.find(([key]) => key === "t")?.[1];
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some(signature => constantTimeEqual(expected, signature));
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}