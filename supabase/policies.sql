alter table public.profiles enable row level security;
alter table public.vendor_profiles enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.payouts enable row level security;
alter table public.reels enable row level security;
alter table public.reel_products enable row level security;
alter table public.reel_likes enable row level security;
alter table public.reel_comments enable row level security;
alter table public.reel_saves enable row level security;
alter table public.reel_shares enable row level security;
alter table public.vendor_follows enable row level security;
alter table public.live_streams enable row level security;
alter table public.live_stream_products enable row level security;
alter table public.live_chat_messages enable row level security;
alter table public.live_reactions enable row level security;
alter table public.live_viewers enable row level security;
alter table public.reports enable row level security;
alter table public.disputes enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.user_interactions enable row level security;
alter table public.recommendation_events enable row level security;
alter table public.ai_search_logs enable row level security;
alter table public.ai_support_messages enable row level security;

create policy "Read own profile and admin profiles" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy "Users edit their profile, not role" on public.profiles for update to authenticated using (id = (select auth.uid()) or public.is_admin()) with check (id = (select auth.uid()) or public.is_admin());
create policy "Admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Read approved shops and own application" on public.vendor_profiles for select to anon, authenticated using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());
create policy "Apply to become a vendor" on public.vendor_profiles for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');
create policy "Applicants edit pending profile only" on public.vendor_profiles for update to authenticated using (user_id = (select auth.uid()) and status = 'pending') with check (user_id = (select auth.uid()) and status = 'pending');
create policy "Approved vendors edit shop details" on public.vendor_profiles for update to authenticated using (user_id = (select auth.uid()) and status = 'approved') with check (user_id = (select auth.uid()) and status = 'approved');
create policy "Admins manage vendor applications" on public.vendor_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Customers manage private profile" on public.customer_profiles for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
create policy "Read active categories" on public.categories for select to anon, authenticated using (is_active or public.is_admin());
create policy "Admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Read active products" on public.products for select to anon, authenticated using (status = 'active' or public.owns_vendor(vendor_id) or public.is_admin());
create policy "Approved vendors create own products" on public.products for insert to authenticated with check (public.owns_vendor(vendor_id));
create policy "Vendors edit own products" on public.products for update to authenticated using (public.owns_vendor(vendor_id) or public.is_admin()) with check (public.owns_vendor(vendor_id) or public.is_admin());
create policy "Vendors delete own products" on public.products for delete to authenticated using (public.owns_vendor(vendor_id) or public.is_admin());
create policy "Read visible product images" on public.product_images for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'active' or public.owns_vendor(p.vendor_id) or public.is_admin())));
create policy "Vendors manage own product images" on public.product_images for all to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.owns_vendor(p.vendor_id)) or public.is_admin()) with check (exists (select 1 from public.products p where p.id = product_id and public.owns_vendor(p.vendor_id)) or public.is_admin());
create policy "Read active variants" on public.product_variants for select to anon, authenticated using (is_active or exists (select 1 from public.products p where p.id = product_id and (public.owns_vendor(p.vendor_id) or public.is_admin())));
create policy "Vendors manage own variants" on public.product_variants for all to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.owns_vendor(p.vendor_id)) or public.is_admin()) with check (exists (select 1 from public.products p where p.id = product_id and public.owns_vendor(p.vendor_id)) or public.is_admin());
create policy "Read stock for visible products" on public.inventory for select to anon, authenticated using (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and (p.status = 'active' or public.owns_vendor(p.vendor_id) or public.is_admin())));
create policy "Vendors manage own inventory" on public.inventory for all to authenticated using (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and public.owns_vendor(p.vendor_id)) or public.is_admin()) with check (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and public.owns_vendor(p.vendor_id)) or public.is_admin());

create policy "Own cart only" on public.carts for all to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy "Read and delete own cart lines" on public.cart_items for select to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = (select auth.uid())));
create policy "Insert active products into own cart" on public.cart_items for insert to authenticated with check (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = (select auth.uid())) and exists (select 1 from public.products p join public.product_variants v on v.product_id = p.id join public.inventory i on i.variant_id = v.id where p.id = cart_items.product_id and v.id = cart_items.variant_id and p.status = 'active' and v.is_active and i.quantity >= cart_items.quantity));
create policy "Update active products in own cart" on public.cart_items for update to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = (select auth.uid()))) with check (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = (select auth.uid())) and exists (select 1 from public.products p join public.product_variants v on v.product_id = p.id join public.inventory i on i.variant_id = v.id where p.id = cart_items.product_id and v.id = cart_items.variant_id and p.status = 'active' and v.is_active and i.quantity >= cart_items.quantity));
create policy "Delete own cart lines" on public.cart_items for delete to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = (select auth.uid())));
create policy "Own wishlist only" on public.wishlists for all to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy "Own wishlist items only" on public.wishlist_items for all to authenticated using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.customer_id = (select auth.uid()))) with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.customer_id = (select auth.uid())));
create policy "Customers and admins read orders" on public.orders for select to authenticated using (customer_id = (select auth.uid()) or public.is_admin());
create policy "Vendors and customers read their order lines" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_admin())) or public.owns_vendor(vendor_id));
create policy "Only admins directly manage orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Read own payment status" on public.payments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())) or public.is_admin());
create policy "Vendors read own payouts" on public.payouts for select to authenticated using (public.owns_vendor(vendor_id) or public.is_admin());

create policy "Read published reels" on public.reels for select to anon, authenticated using (status = 'published' or public.owns_vendor(vendor_id) or public.is_admin());
create policy "Vendors create own reels" on public.reels for insert to authenticated with check (public.owns_vendor(vendor_id));
create policy "Vendors edit own reels" on public.reels for update to authenticated using (public.owns_vendor(vendor_id) or public.is_admin()) with check (public.owns_vendor(vendor_id) or public.is_admin());
create policy "Read visible reel product tags" on public.reel_products for select to anon, authenticated using (exists (select 1 from public.reels r where r.id = reel_id and (r.status = 'published' or public.owns_vendor(r.vendor_id) or public.is_admin())));
create policy "Vendors tag own reels" on public.reel_products for all to authenticated using (exists (select 1 from public.reels r where r.id = reel_id and public.owns_vendor(r.vendor_id))) with check (exists (select 1 from public.reels r where r.id = reel_id and public.owns_vendor(r.vendor_id)));
create policy "Users manage own reel likes" on public.reel_likes for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
create policy "Read visible reel comments" on public.reel_comments for select to anon, authenticated using (status = 'visible' or user_id = (select auth.uid()) or public.is_admin());
create policy "Comment as self" on public.reel_comments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Delete own reel comments" on public.reel_comments for delete to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Users manage own saved reels" on public.reel_saves for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
create policy "Read reel shares" on public.reel_shares for select to anon, authenticated using (true);
create policy "Share as self" on public.reel_shares for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Read follows" on public.vendor_follows for select to anon, authenticated using (true);
create policy "Customers manage own follows" on public.vendor_follows for all to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

create policy "Read live rooms" on public.live_streams for select to anon, authenticated using (status = 'live' or public.owns_vendor(vendor_id) or public.is_admin());
create policy "Vendors manage own live rooms" on public.live_streams for all to authenticated using (public.owns_vendor(vendor_id) or public.is_admin()) with check (public.owns_vendor(vendor_id) or public.is_admin());
create policy "Read live product pins" on public.live_stream_products for select to anon, authenticated using (exists (select 1 from public.live_streams s where s.id = stream_id and (s.status = 'live' or public.owns_vendor(s.vendor_id) or public.is_admin())));
create policy "Stream owners manage pins" on public.live_stream_products for all to authenticated using (exists (select 1 from public.live_streams s where s.id = stream_id and public.owns_vendor(s.vendor_id))) with check (exists (select 1 from public.live_streams s where s.id = stream_id and public.owns_vendor(s.vendor_id)));
create policy "Read visible live chat" on public.live_chat_messages for select to anon, authenticated using (status = 'visible' or user_id = (select auth.uid()) or exists (select 1 from public.live_streams s where s.id = stream_id and public.owns_vendor(s.vendor_id)) or public.is_admin());
create policy "Signed-in viewers send chat" on public.live_chat_messages for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.live_streams s where s.id = stream_id and s.status = 'live'));
create policy "Stream owners moderate chat" on public.live_chat_messages for update to authenticated using (exists (select 1 from public.live_streams s where s.id = stream_id and public.owns_vendor(s.vendor_id)) or public.is_admin()) with check (exists (select 1 from public.live_streams s where s.id = stream_id and public.owns_vendor(s.vendor_id)) or public.is_admin());
create policy "Read live reactions" on public.live_reactions for select to anon, authenticated using (true);
create policy "Signed-in viewers react as self" on public.live_reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Manage own viewer presence" on public.live_viewers for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()));

create policy "Create own reports" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "Read own reports" on public.reports for select to authenticated using (reporter_id = (select auth.uid()) or public.is_admin());
create policy "Admins review reports" on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Open disputes for own orders" on public.disputes for insert to authenticated with check (customer_id = (select auth.uid()) and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())));
create policy "Read own disputes" on public.disputes for select to authenticated using (customer_id = (select auth.uid()) or public.is_admin());
create policy "Admins manage disputes" on public.disputes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Mark own notifications read" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Admins read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());
create policy "Read own interactions" on public.user_interactions for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Record own interactions" on public.user_interactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Read own recommendations" on public.recommendation_events for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Read own search logs" on public.ai_search_logs for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Log own searches" on public.ai_search_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Read own support messages" on public.ai_support_messages for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Send user support messages" on public.ai_support_messages for insert to authenticated with check (user_id = (select auth.uid()) and role = 'user');

-- Media paths use the authenticated vendor user id as their first folder segment.
create policy "Read visible product media" on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images' and exists (
	select 1 from public.product_images pi join public.products p on p.id = pi.product_id
	where pi.storage_path = name and (p.status = 'active' or public.owns_vendor(p.vendor_id) or public.is_admin())
));
create policy "Manage own product media" on storage.objects for all to authenticated
using (bucket_id = 'product-images' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text))
with check (bucket_id = 'product-images' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "Read published reel videos" on storage.objects for select to anon, authenticated
using (bucket_id = 'reel-videos' and exists (select 1 from public.reels where video_path = name and (status = 'published' or public.owns_vendor(vendor_id) or public.is_admin())));
create policy "Manage own reel videos" on storage.objects for all to authenticated
using (bucket_id = 'reel-videos' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text))
with check (bucket_id = 'reel-videos' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "Read published reel thumbnails" on storage.objects for select to anon, authenticated
using (bucket_id = 'reel-thumbnails' and exists (select 1 from public.reels where thumbnail_path = name and (status = 'published' or public.owns_vendor(vendor_id) or public.is_admin())));
create policy "Manage own reel thumbnails" on storage.objects for all to authenticated
using (bucket_id = 'reel-thumbnails' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text))
with check (bucket_id = 'reel-thumbnails' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "Read live thumbnails" on storage.objects for select to anon, authenticated
using (bucket_id = 'live-thumbnails' and exists (select 1 from public.live_streams where thumbnail_path = name and (status = 'live' or public.owns_vendor(vendor_id) or public.is_admin())));
create policy "Manage own live thumbnails" on storage.objects for all to authenticated
using (bucket_id = 'live-thumbnails' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text))
with check (bucket_id = 'live-thumbnails' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));