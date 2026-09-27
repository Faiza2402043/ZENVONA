insert into public.categories (name, slug, sort_order) values
  ('Style','style',1),('Home','home',2),('Beauty','beauty',3),('Tech','tech',4),('Outdoors','outdoors',5),('Objects','objects',6)
on conflict (slug) do nothing;

insert into public.categories (parent_id,name,slug,sort_order)
select parent.id, child.name, child.slug, child.sort_order
from (values ('style','Clothing','clothing',1),('style','Bags','bags',2),('home','Lighting','lighting',1),('home','Ceramics','ceramics',2),('beauty','Skincare','skincare',1),('tech','Audio','audio',1),('outdoors','Day trips','day-trips',1),('objects','Desk & storage','desk-storage',1)) as child(parent_slug,name,slug,sort_order)
join public.categories parent on parent.slug=child.parent_slug on conflict (slug) do nothing;

-- Public seed catalog entries have no vendor owner. Real vendor listings must belong to an approved shop.
insert into public.products (name,description,category_id,brand,price,status,average_rating,review_count)
select sample.name,sample.description,c.id,sample.brand,sample.price,'active',sample.rating,sample.reviews
from (values
('Cloudline Everyday Sneaker','A soft-footed everyday sneaker for long walks and whatever comes next.','style','Common Ground',84::numeric,4.9::numeric,28),
('Sunday Market Tote','A sturdy organic-cotton carryall with room for the whole day.','bags','Good Measure Studio',42,4.8,19),
('Soft Landing Ceramic Set','Hand-finished stoneware for slow mornings. Every glaze is a little different.','ceramics','Morrow Objects',68,4.9,32),
('Daybreak Face Oil','A light botanical face oil with meadowfoam and rosehip.','skincare','Field Notes Skin',36,4.7,14),
('Little Light Table Lamp','A warm portable glow in a powder-coated silhouette.','lighting','Morrow Objects',119,4.8,21),
('Studio Headphones No. 2','Clear, easy-listening sound tuned by an independent audio team.','audio','Kindred Audio',149,4.9,43),
('Weekend Field Bottle','A double-wall steel bottle for hot coffee and cold water.','day-trips','Outside In',34,4.6,17),
('Slow Sunday Knit','A softly structured cotton knit for taking your time.','clothing','Common Ground',128,4.8,23),
('Everyday Face Wash','A gentle fragrance-free gel cleanser for a fresh start.','skincare','Field Notes Skin',24,4.7,29),
('Sunday Stacking Tray','A tactile catch-all, hand-cast in a small Bristol studio.','desk-storage','Good Measure Studio',49,4.8,12),
('Trail Notes Daypack','A weather-ready daypack with thoughtful pockets for the long way round.','day-trips','Outside In',96,4.7,18),
('Pocket Speaker Mini','Surprisingly full sound in a pocket-sized speaker made for kitchen dancing.','audio','Kindred Audio',72,4.6,26),
('Window Seat Throw','A soft recycled-cotton throw for one more chapter by the window.','home','Sunday Assembly',88,4.8,13),
('Cloud Study Vase','A hand-thrown sculptural vase made in thoughtful small batches.','ceramics','Morrow Objects',76,4.9,9),
('Bright Side SPF 30','Everyday mineral sunscreen with a sheer finish and no added fragrance.','skincare','Field Notes Skin',29,4.6,31),
('Good Company Cap','An easy cotton cap with a low profile and a good point of view.','clothing','Common Ground',38,4.7,16),
('All Day Crossbody','A compact durable crossbody with room for the essentials.','bags','Good Measure Studio',64,4.8,25),
('Amber Desk Light','An adjustable task lamp with a warm cast and long-life LED.','lighting','Morrow Objects',132,4.8,11),
('Studio Listening Stand','A balanced hardwood stand for your headphones.','audio','Kindred Audio',44,4.5,8),
('Ridge Trail Mug','A lightweight enamel mug for the overlook or kitchen counter.','day-trips','Outside In',27,4.7,22)
) as sample(name,description,category_slug,brand,price,rating,reviews)
join public.categories c on c.slug=sample.category_slug
where not exists (select 1 from public.products p where p.vendor_id is null and p.name=sample.name);

insert into public.product_variants (product_id,sku,name,options,is_active)
select p.id,coalesce(p.sku,'seed-' || left(replace(p.id::text,'-',''),12)),'Standard','{"finish":"Maker choice"}'::jsonb,true
from public.products p
where p.vendor_id is null
  and not exists (select 1 from public.product_variants v where v.product_id=p.id);

insert into public.inventory (variant_id,quantity,low_stock_threshold)
select v.id,12,3
from public.product_variants v
join public.products p on p.id=v.product_id
where p.vendor_id is null
on conflict (variant_id) do nothing;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
('product-images','product-images',false,10485760,array['image/jpeg','image/png','image/webp']),
('reel-videos','reel-videos',false,104857600,array['video/mp4','video/webm']),
('reel-thumbnails','reel-thumbnails',false,10485760,array['image/jpeg','image/png','image/webp']),
('live-thumbnails','live-thumbnails',false,10485760,array['image/jpeg','image/png','image/webp']),
('vendor-assets','vendor-assets',false,10485760,array['image/jpeg','image/png','image/webp']),
('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;