import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "null" } });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request);

  const appUrl = Deno.env.get("PUBLIC_APP_URL");
  const origin = request.headers.get("Origin");
  if (!appUrl || !origin || new URL(appUrl).origin !== origin) return json({ error: "This app origin is not allowed." }, 403, request);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in before checking out." }, 401, request);

  let orderId: string | null = null;
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Secure checkout is not configured." }, 503, request);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Your session has expired. Sign in again." }, 401, request);
    const { shipping_address: address } = await request.json();
    if (!address || typeof address !== "object" || Array.isArray(address)) return json({ error: "Enter a complete delivery address." }, 400, request);

    const { data: reservation, error: reserveError } = await supabase.rpc("start_checkout", { p_shipping_address: address });
    if (reserveError) return json({ error: safeCheckoutMessage(reserveError.message) }, 400, request);
    const order = reservation?.[0];
    if (!order) throw new Error("Order reservation returned no order.");
    orderId = order.checkout_order_id;

    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("product_name,quantity,unit_price")
      .eq("order_id", orderId);
    if (itemsError || !orderItems?.length) throw new Error("Reserved order lines could not be loaded.");

    const baseUrl = new URL(appUrl);
    const success = new URL(baseUrl.pathname || "/", baseUrl.origin);
    success.searchParams.set("payment", "success");
    success.hash = "workspace";
    const successUrl = `${success.origin}${success.pathname}${success.search}&session_id={CHECKOUT_SESSION_ID}${success.hash}`;
    const cancel = new URL(baseUrl.pathname || "/", baseUrl.origin);
    cancel.searchParams.set("payment", "cancelled");
    cancel.hash = "home";
    const form = new URLSearchParams({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancel.toString(),
      client_reference_id: orderId,
      "metadata[order_id]": orderId,
      "payment_intent_data[metadata][order_id]": orderId
    });
    for (const [index, item] of orderItems.entries()) {
      form.set(`line_items[${index}][quantity]`, String(item.quantity));
      form.set(`line_items[${index}][price_data][currency]`, String(order.checkout_currency).trim().toLowerCase());
      form.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(Number(item.unit_price) * 100)));
      form.set(`line_items[${index}][price_data][product_data][name]`, item.product_name);
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    const stripeSession = await stripeResponse.json();
    if (!stripeResponse.ok || !stripeSession.url || !stripeSession.id) {
      console.error("Stripe session creation failed", stripeSession.error?.type ?? stripeResponse.status);
      throw new Error("A secure payment session could not be started.");
    }

    const { error: attachError } = await supabase.rpc("attach_checkout_session", { p_order_id: orderId, p_session_id: stripeSession.id });
    if (attachError) {
      await expireStripeSession(stripeKey, stripeSession.id);
      throw new Error("The payment session could not be attached to the order.");
    }
    return json({ checkout_url: stripeSession.url }, 200, request);
  } catch (error) {
    console.error("Checkout setup failed", error);
    if (orderId) {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authorization } }
      });
      const { error: releaseError } = await userClient.rpc("release_checkout_reservation", { p_order_id: orderId });
      if (releaseError) console.error("Checkout stock reservation release failed", releaseError.message);
    }
    return json({ error: error instanceof Error ? error.message : "Secure checkout could not be started." }, 502, request);
  }
});

async function expireStripeSession(secret: string, sessionId: string) {
  await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: ""
  });
}

function safeCheckoutMessage(message: string) {
  if (message.toLowerCase().includes("insufficient stock")) return "An item in your bag just sold out. Review your bag and try again.";
  if (message.toLowerCase().includes("shipping address")) return "Enter a complete delivery address before checkout.";
  if (message.toLowerCase().includes("cart")) return "Your bag is empty or has no available items.";
  return "Your bag could not be reserved. Refresh it and try again.";
}

function json(body: unknown, status: number, request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = Deno.env.get("PUBLIC_APP_URL");
  const corsOrigin = origin && allowedOrigin && new URL(allowedOrigin).origin === origin ? origin : "null";
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Access-Control-Allow-Origin": corsOrigin, "Content-Type": "application/json" } });
}