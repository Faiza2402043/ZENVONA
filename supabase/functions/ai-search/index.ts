import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { query } = await request.json();
    if (typeof query !== "string" || query.trim().length < 2 || query.length > 300) {
      return json({ error: "Enter a search between 2 and 300 characters." }, 400);
    }

    const aiKey = Deno.env.get("AI_API_KEY");
    if (!aiKey) return json({ error: "AI search is not configured." }, 503);

    const interpretationResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Turn the shopping query into JSON with keys terms (string array, max 8), max_price (number or null), and category (string or null). Extract constraints only when clearly stated. No prose." },
          { role: "user", content: query.trim() }
        ],
        max_tokens: 180
      })
    });
    if (!interpretationResponse.ok) return json({ error: "Smart search could not interpret that query." }, 502);

    const completion = await interpretationResponse.json();
    const intent = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}");
    const terms = Array.isArray(intent.terms) ? intent.terms.filter((term: unknown) => typeof term === "string").slice(0, 8) : [];
    const maxPrice = typeof intent.max_price === "number" && intent.max_price >= 0 ? intent.max_price : null;
    const authorization = request.headers.get("Authorization");
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: authorization ? { headers: { Authorization: authorization } } : undefined
    });

    let productQuery = client.from("products").select("id,name,description,price,compare_at_price,average_rating,review_count,category_id,vendor_id,category:categories!products_category_id_fkey(id,parent_id,name,slug),vendor:vendor_profiles!products_vendor_id_fkey(id,shop_name),variants:product_variants(id,name,options,is_active,inventory(quantity))").eq("status", "active").limit(24);
    if (maxPrice !== null) productQuery = productQuery.lte("price", maxPrice);
    if (intent.category && typeof intent.category === "string") {
      const { data: category } = await client.from("categories").select("id").ilike("name", intent.category).limit(1).maybeSingle();
      if (category) productQuery = productQuery.eq("category_id", category.id);
    }
    if (terms.length) {
      const safeTerms = terms.map((term: string) => term.replace(/[^a-zA-Z0-9 -]/g, " ").slice(0, 40).trim()).filter(Boolean);
      if (safeTerms.length) productQuery = productQuery.or(safeTerms.map((term: string) => `name.ilike.%${term}%,description.ilike.%${term}%`).join(","));
    }
    const { data: products, error } = await productQuery.order("average_rating", { ascending: false });
    if (error) return json({ error: "Search results are temporarily unavailable." }, 500);
    return json({ intent: { terms, max_price: maxPrice, category: intent.category ?? null }, products: products ?? [] });
  } catch (error) {
    console.error("AI search failed", error);
    return json({ error: "Smart search is temporarily unavailable." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}