create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','vendor','admin')),
  display_name text not null default 'New member', avatar_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.vendor_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
  shop_name text not null, slug text not null unique, bio text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade, phone text,
  default_address jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.categories(id) on delete set null,
  name text not null, slug text not null unique, sort_order integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), vendor_id uuid references public.vendor_profiles(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null, name text not null check (char_length(name) between 1 and 180),
  description text not null default '', sku text, brand text, price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  status text not null default 'draft' check (status in ('draft','active','out_of_stock','archived','pending_moderation','rejected')),
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5), review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (vendor_id, sku)
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null, alt_text text not null default '', sort_order integer not null default 0, created_at timestamptz not null default now(), unique (product_id, storage_path)
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  sku text, name text not null, options jsonb not null default '{}', price_adjustment numeric(12,2) not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now(), unique (product_id, sku), unique (product_id, id)
);
create table public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0), low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0), updated_at timestamptz not null default now()
);
create table public.carts (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, variant_id uuid not null,
  quantity integer not null check (quantity > 0), created_at timestamptz not null default now(), unique (cart_id, product_id, variant_id),
  foreign key (product_id, variant_id) references public.product_variants(product_id, id) on delete cascade
);
create function public.lock_cart_before_item_change() returns trigger language plpgsql set search_path = '' as $$
declare parent_cart uuid;
begin
  parent_cart := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;
  perform 1 from public.carts where id = parent_cart for update;
  if not found then raise exception 'Cart does not exist'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger serialize_cart_item_mutations before insert or update or delete on public.cart_items
for each row execute function public.lock_cart_before_item_change();
create table public.wishlists (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null unique references public.profiles(id) on delete cascade, created_at timestamptz not null default now()
);
create table public.wishlist_items (
  wishlist_id uuid not null references public.wishlists(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (wishlist_id, product_id)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique default ('ZV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  customer_id uuid not null references public.profiles(id), status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  currency char(3) not null default 'USD', subtotal numeric(12,2) not null check (subtotal >= 0), delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0), shipping_address jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, vendor_id uuid references public.vendor_profiles(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null, quantity integer not null check (quantity > 0), unit_price numeric(12,2) not null check (unit_price >= 0), created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null, provider_reference text, status text not null default 'pending' check (status in ('pending','authorized','paid','failed','refunded')),
  provider_event_id text,
  amount numeric(12,2) not null check (amount >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index payments_provider_event_unique_idx on public.payments(provider_event_id) where provider_event_id is not null;
create table public.payment_webhook_events (
  provider_event_id text primary key,
  created_at timestamptz not null default now()
);
create table public.payouts (
  id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.vendor_profiles(id), amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'USD', status text not null default 'pending' check (status in ('pending','processing','paid','failed')),
  period_start date not null, period_end date not null, created_at timestamptz not null default now(), check (period_end >= period_start)
);
create table public.reels (
  id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.vendor_profiles(id), caption text not null default '',
  video_path text not null, thumbnail_path text, status text not null default 'pending_moderation' check (status in ('draft','published','pending_moderation','rejected','removed')),
  view_count bigint not null default 0 check (view_count >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.reel_products (
  reel_id uuid not null references public.reels(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (reel_id, product_id)
);
create table public.reel_likes (
  reel_id uuid not null references public.reels(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (reel_id, user_id)
);
create table public.reel_comments (
  id uuid primary key default gen_random_uuid(), reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'visible' check (status in ('visible','hidden','removed')), created_at timestamptz not null default now()
);
create table public.reel_saves (
  reel_id uuid not null references public.reels(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (reel_id, user_id)
);
create table public.reel_shares (
  id uuid primary key default gen_random_uuid(), reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.vendor_follows (
  customer_id uuid not null references public.profiles(id) on delete cascade, vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (customer_id, vendor_id)
);
create table public.live_streams (
  id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.vendor_profiles(id), title text not null,
  category_id uuid references public.categories(id) on delete set null, provider text not null default 'demo', provider_room_id text,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','suspended')), thumbnail_path text,
  started_at timestamptz, ended_at timestamptz, created_at timestamptz not null default now(), check (ended_at is null or started_at is null or ended_at >= started_at)
);
create table public.live_stream_products (
  stream_id uuid not null references public.live_streams(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade,
  is_pinned boolean not null default false, pinned_at timestamptz, primary key (stream_id, product_id)
);
create unique index one_pinned_product_per_stream on public.live_stream_products(stream_id) where is_pinned;
create table public.live_chat_messages (
  id uuid primary key default gen_random_uuid(), stream_id uuid not null references public.live_streams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, body text not null check (char_length(body) between 1 and 500),
  status text not null default 'visible' check (status in ('visible','hidden','removed')), created_at timestamptz not null default now()
);
create table public.live_reactions (
  id uuid primary key default gen_random_uuid(), stream_id uuid not null references public.live_streams(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null, reaction text not null check (reaction in ('heart','fire','thumbs_up','clap')), created_at timestamptz not null default now()
);
create table public.live_viewers (
  stream_id uuid not null references public.live_streams(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), primary key (stream_id, user_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id), target_type text not null,
  target_id uuid not null, reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.disputes (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), customer_id uuid not null references public.profiles(id),
  reason text not null, status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  resolution text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, title text not null, body text not null default '', payload jsonb not null default '{}', read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text, target_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.user_interactions (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade, reel_id uuid references public.reels(id) on delete cascade,
  interaction_type text not null check (interaction_type in ('view','like','save','purchase','follow','search')), created_at timestamptz not null default now()
);
create table public.recommendation_events (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade, event_type text not null, created_at timestamptz not null default now()
);
create table public.ai_search_logs (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  query text not null check (char_length(query) <= 1000), filters jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.ai_support_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null default gen_random_uuid(), role text not null check (role in ('user','assistant')),
  body text not null check (char_length(body) <= 5000), created_at timestamptz not null default now()
);

create index products_public_category_idx on public.products(category_id, created_at desc) where status = 'active';
create index products_vendor_idx on public.products(vendor_id, created_at desc);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index order_items_vendor_idx on public.order_items(vendor_id, order_id);
create index reels_public_idx on public.reels(created_at desc) where status = 'published';
create index live_streams_public_idx on public.live_streams(created_at desc) where status = 'live';
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, role) values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name',''),'New member'), 'customer');
  insert into public.customer_profiles (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;
create function public.owns_vendor(target_vendor uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor_profiles where id = target_vendor and user_id = (select auth.uid()) and status = 'approved')
$$;
create function public.protect_profile_role() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then raise exception 'Only an administrator can change account roles'; end if;
  return new;
end;
$$;
create trigger protect_profile_role before update of role on public.profiles for each row execute function public.protect_profile_role();
create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger vendors_updated before update on public.vendor_profiles for each row execute function public.set_updated_at();
create trigger customers_updated before update on public.customer_profiles for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger carts_updated before update on public.carts for each row execute function public.set_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();
create trigger reels_updated before update on public.reels for each row execute function public.set_updated_at();
alter table public.payment_webhook_events enable row level security;

create function public.start_checkout(p_shipping_address jsonb)
returns table (checkout_order_id uuid, checkout_order_number text, checkout_total numeric, checkout_currency char(3))
language plpgsql security definer set search_path = '' as $$
declare
  customer uuid := auth.uid();
  customer_cart uuid;
  cart_line record;
  new_order_id uuid := gen_random_uuid();
  order_subtotal numeric(12,2) := 0;
  line_count integer := 0;
  new_order_number text;
begin
  if customer is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_shipping_address) <> 'object'
     or length(trim(coalesce(p_shipping_address ->> 'recipient',''))) < 2
     or length(trim(coalesce(p_shipping_address ->> 'address',''))) < 4
     or length(trim(coalesce(p_shipping_address ->> 'city',''))) < 2
     or length(trim(coalesce(p_shipping_address ->> 'postal_code',''))) < 2
     or length(trim(coalesce(p_shipping_address ->> 'country',''))) <> 2 then
    raise exception 'A complete shipping address is required';
  end if;

  select c.id into customer_cart from public.carts c where c.customer_id = customer for update;
  if customer_cart is null then raise exception 'Cart is empty'; end if;

  for cart_line in
    select ci.product_id, ci.variant_id, ci.quantity, p.name, p.vendor_id, p.price, i.quantity as available
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.product_variants v on v.id = ci.variant_id and v.product_id = p.id
    join public.inventory i on i.variant_id = v.id
    where ci.cart_id = customer_cart and p.status = 'active' and v.is_active
    order by ci.variant_id
    for update of i
  loop
    if cart_line.available < cart_line.quantity then raise exception 'Insufficient stock for %', cart_line.name; end if;
    order_subtotal := order_subtotal + cart_line.price * cart_line.quantity;
    line_count := line_count + 1;
  end loop;
  if line_count = 0 then raise exception 'Cart has no purchasable items'; end if;

  insert into public.orders (id, customer_id, status, currency, subtotal, delivery_fee, total, shipping_address)
  values (new_order_id, customer, 'pending', 'USD', order_subtotal, 0, order_subtotal, p_shipping_address)
  returning order_number into new_order_number;

  for cart_line in
    select ci.product_id, ci.variant_id, ci.quantity, p.name, p.vendor_id, p.price
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = customer_cart order by ci.variant_id
  loop
    update public.inventory set quantity = quantity - cart_line.quantity, updated_at = now()
    where variant_id = cart_line.variant_id and quantity >= cart_line.quantity;
    if not found then raise exception 'Inventory changed while starting checkout'; end if;
    insert into public.order_items (order_id, product_id, vendor_id, variant_id, product_name, quantity, unit_price)
    values (new_order_id, cart_line.product_id, cart_line.vendor_id, cart_line.variant_id, cart_line.name, cart_line.quantity, cart_line.price);
  end loop;

  insert into public.payments (order_id, provider, status, amount)
  values (new_order_id, 'stripe', 'pending', order_subtotal);
  delete from public.cart_items where cart_id = customer_cart;
  return query select new_order_id, new_order_number, order_subtotal, 'USD'::char(3);
end;
$$;

create function public.attach_checkout_session(p_order_id uuid, p_session_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_session_id,''))) < 8 or length(p_session_id) > 255 then raise exception 'Invalid payment session'; end if;
  update public.payments pay set provider_reference = p_session_id, updated_at = now()
  from public.orders o
  where pay.order_id = o.id and o.id = p_order_id and o.customer_id = auth.uid()
    and o.status = 'pending' and pay.status = 'pending' and pay.provider_reference is null;
  if not found then raise exception 'Checkout session cannot be attached'; end if;
end;
$$;

create function public.release_checkout_reservation(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare line record;
declare owner_id uuid;
declare owner_cart uuid;
begin
  if (select auth.role()) <> 'service_role' and auth.uid() is null then raise exception 'Authentication required'; end if;
  select customer_id into owner_id from public.orders where id = p_order_id
    and ((select auth.role()) = 'service_role' or customer_id = auth.uid()) and status = 'pending' for update;
  if owner_id is null then raise exception 'Checkout reservation cannot be released'; end if;
  if not exists (select 1 from public.payments where order_id = p_order_id and status = 'pending') then
    raise exception 'Payment is already finalized';
  end if;
  for line in select variant_id, sum(quantity)::integer as quantity from public.order_items where order_id = p_order_id and variant_id is not null group by variant_id loop
    update public.inventory set quantity = quantity + line.quantity, updated_at = now() where variant_id = line.variant_id;
  end loop;
  select id into owner_cart from public.carts where customer_id = owner_id for update;
  if owner_cart is not null then
    insert into public.cart_items (cart_id, product_id, variant_id, quantity)
    select owner_cart, oi.product_id, oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null and oi.variant_id is not null
    on conflict (cart_id, product_id, variant_id) do update
      set quantity = least(public.cart_items.quantity + excluded.quantity,
        coalesce((select i.quantity from public.inventory i where i.variant_id = excluded.variant_id), public.cart_items.quantity));
  end if;
  update public.payments set status = 'failed', updated_at = now() where order_id = p_order_id and status = 'pending';
  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
end;
$$;

create function public.finalize_stripe_checkout(p_event_id text, p_session_id text, p_paid boolean, p_amount_total bigint, p_currency text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_order uuid;
declare claimed_order uuid;
declare expected_cents bigint;
declare expected_currency text;
declare line record;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if length(trim(coalesce(p_event_id,''))) < 8 or length(trim(coalesce(p_session_id,''))) < 8 then raise exception 'Invalid webhook reference'; end if;
  insert into public.payment_webhook_events(provider_event_id) values (p_event_id) on conflict do nothing;
  if not found then return true; end if;
  select pay.order_id, round(pay.amount * 100)::bigint, lower(o.currency)
    into target_order, expected_cents, expected_currency
  from public.payments pay join public.orders o on o.id = pay.order_id
  where pay.provider = 'stripe' and pay.provider_reference = p_session_id for update of pay;
  if target_order is null then raise exception 'Payment session was not found'; end if;
  if p_paid then
    if p_amount_total is distinct from expected_cents or lower(p_currency) is distinct from expected_currency then
      raise exception 'Stripe payment amount does not match reserved order';
    end if;
    update public.payments set status = 'paid', provider_event_id = p_event_id, updated_at = now()
    where order_id = target_order and status = 'pending' and provider_reference = p_session_id returning order_id into claimed_order;
    if claimed_order is not null then
      update public.orders set status = 'confirmed', updated_at = now() where id = target_order and status = 'pending';
    end if;
  else
    update public.payments set status = 'failed', provider_event_id = p_event_id, updated_at = now()
    where order_id = target_order and status = 'pending' and provider_reference = p_session_id returning order_id into claimed_order;
    if claimed_order is null then return true; end if;
    for line in select variant_id, sum(quantity)::integer as quantity from public.order_items where order_id = target_order and variant_id is not null group by variant_id loop
      update public.inventory set quantity = quantity + line.quantity, updated_at = now() where variant_id = line.variant_id;
    end loop;
    insert into public.cart_items (cart_id, product_id, variant_id, quantity)
    select c.id, oi.product_id, oi.variant_id, oi.quantity
    from public.orders o join public.carts c on c.customer_id = o.customer_id
    join public.order_items oi on oi.order_id = o.id
    where o.id = target_order and oi.product_id is not null and oi.variant_id is not null
    on conflict (cart_id, product_id, variant_id) do update
      set quantity = least(public.cart_items.quantity + excluded.quantity,
        coalesce((select i.quantity from public.inventory i where i.variant_id = excluded.variant_id), public.cart_items.quantity));
    update public.orders set status = 'cancelled', updated_at = now() where id = target_order and status = 'pending';
  end if;
  return true;
end;
$$;

revoke all on function public.start_checkout(jsonb) from public, anon;
revoke all on function public.attach_checkout_session(uuid, text) from public, anon;
revoke all on function public.release_checkout_reservation(uuid) from public, anon;
revoke all on function public.finalize_stripe_checkout(text, text, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.start_checkout(jsonb) to authenticated;
grant execute on function public.attach_checkout_session(uuid, text) to authenticated;
grant execute on function public.release_checkout_reservation(uuid) to authenticated, service_role;
grant execute on function public.finalize_stripe_checkout(text, text, boolean, bigint, text) to service_role;