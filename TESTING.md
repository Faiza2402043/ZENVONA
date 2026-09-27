# ZENVORA Manual Test Checklist

## Phase 1 — Authentication and role-aware account

Status: implementation added; Supabase end-to-end checks are **not run** because this workspace has no project URL or publishable key. The local demo fallback was browser-tested in the previous implementation; it is not evidence of real authentication or RLS.

Before testing, create a disposable Supabase project, apply `schema.sql` and `policies.sql`, set the project Auth site/redirect URLs, and configure `js/config.js` with that project's URL and publishable key. Never use a service-role key in the browser.

- [ ] Create an account with email/password. Confirm the auth user is created and `profiles.role` is `customer`, even if signup metadata is manipulated to request `admin` or `vendor`.
- [ ] With email confirmation enabled, confirm signup shows the check-email state; confirm the email, then sign in.
- [ ] Sign in with valid credentials; refresh the page and confirm the session remains active through Supabase Auth.
- [ ] Sign in with an incorrect password; confirm a human-readable error and no raw database details.
- [ ] Request a password reset, follow the email link back to the configured site, set a new password and sign in with it.
- [ ] Sign out and confirm `getSession()` has no active user; visit `#workspace` and confirm the account gate appears.
- [ ] While signed in as a customer, submit a vendor application. Confirm one `vendor_profiles` row exists with the current user's ID and `status='pending'`; confirm the profile role remains `customer` and the pending state is shown.
- [ ] Attempt to insert a vendor application for another user's ID or with `status='approved'`; confirm RLS denies it.
- [ ] Attempt to change your own `profiles.role` to `admin` or `vendor` through the Supabase client; confirm the role guard rejects the update.
- [ ] Using a separately provisioned administrator account, approve the vendor application and set the profile role using a trusted admin workflow. Sign in as that user and confirm the approved state is shown.
- [ ] Confirm a customer cannot select admin data or read/update another customer's profile; confirm a non-admin cannot approve/reject vendor applications.
- [ ] Remove Supabase settings and reload. Confirm the local demo account selector still clearly labels itself as a demo and does not claim to authenticate.

## Later phases

- [ ] Phase 1 catalog: With a configured project and the schema/policies/seed applied, verify active categories/products load from Postgres and product images resolve when Storage policies permit. Break the public catalog policy and confirm an explicit retryable error is shown instead of local seed data.
- [ ] Phase 1 commerce: Add a product as a guest, sign in, and confirm valid variant lines merge into that user's cart; repeat for saved finds. Sign out and confirm remote cart/wishlist contents do not remain in the next session. Use two customer accounts to confirm neither can read or modify the other's cart/wishlist.
- [ ] Phase 1 security: Attempt cart insertion for another user's cart and wishlist insertion into another user's wishlist; confirm RLS denial. Verify catalog writes are rejected for customers and pending vendors.
- [ ] Phase 1 checkout guard: In configured mode confirm an unsigned/unauthenticated visitor cannot create a local demo order and the bag remains intact until a secure session is returned.
- [ ] Stripe test checkout: Configure Stripe test secrets, apply the updated schema, deploy both checkout functions, place a test order, and confirm only a valid signed webhook with matching amount/currency marks it paid. Expire/cancel a Checkout Session and confirm the stock reservation is restored once. Not run: no Stripe account/secrets are configured.
- [ ] Phase 2: Verify vendor A cannot mutate vendor B products; each customer sees only their own orders; checkout rejects stale prices and insufficient stock under concurrent requests.
- [ ] Phase 3: Upload a valid vendor-owned reel and thumbnail; confirm public viewers can read published metadata while unapproved vendors cannot publish; verify likes/comments persist and update through Realtime.
- [ ] Phase 4: Confirm the host receives a short-lived LiveKit/Agora token; viewers cannot publish; chat and pinned-product updates arrive through Supabase Realtime; ending a room updates stream status.
- [ ] Phase 5: Verify AI credentials are only Edge Function secrets; AI search, recommendations, product-tag suggestions and support gracefully report unconfigured service and never bypass caller RLS.
- [ ] Phase 6: Apply Storage path policies and attempt cross-user uploads/deletes; verify Realtime publication contains only reviewed tables; record customer/customer, vendor/vendor, pending-vendor and customer/admin denial results here after running them.

## Browser checks run in this workspace

- [x] Static page loads over local HTTP and renders the home catalog, category tiles, Reel previews and Live room previews.
- [x] Local demo cart and checkout produce a browser-only demo order without requesting payment credentials.
- [x] Reel product and simulated Live pinned product open the purchase modal.
- [x] At 390px mobile width, the page has no horizontal overflow and the account entry remains available.
- [x] Local vendor preview can add a browser-only sample product.
- [x] JavaScript parses; all schema tables have RLS enabled in `policies.sql`.
- [x] Unconfigured browser fallback still renders the seeded local catalog and explicit demo account flow after catalog adapter wiring.
- [x] `node tests/catalog-service.test.mjs`: mocked PostgREST catalog rows normalize category/vendor labels, numeric price, and inventory-backed variant stock.
- [ ] Configured Supabase catalog, cart, wishlist and guest merge: not run; no project URL/key is configured.