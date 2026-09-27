import { categories as demoCategories } from "./data.js";

export async function fetchCatalog(client) {
  const [{ data: categoryRows, error: categoryError }, { data: productRows, error: productError }] = await Promise.all([
    client.from("categories").select("id,parent_id,name,slug,sort_order").eq("is_active", true).order("sort_order").limit(200),
    client.from("products")
      .select("id,name,description,price,compare_at_price,average_rating,review_count,category_id,brand,status,created_at,category:categories!products_category_id_fkey(id,parent_id,name,slug),vendor:vendor_profiles!products_vendor_id_fkey(id,shop_name,status),images:product_images(storage_path,alt_text,sort_order),variants:product_variants(id,name,options,is_active,inventory(quantity))")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(60)
  ]);
  if (categoryError) throw categoryError;
  if (productError) throw productError;

  const categoryById = new Map((categoryRows ?? []).map(category => [category.id, category]));
  const imagePaths = [...new Set((productRows ?? []).flatMap(product => (product.images ?? []).map(image => image.storage_path)).filter(Boolean))];
  const signedImages = new Map();
  if (imagePaths.length) {
    const { data, error } = await client.storage.from("product-images").createSignedUrls(imagePaths, 3600);
    if (error) console.warn("Some catalog images could not be signed; using category photography.", error);
    for (const item of data ?? []) if (item.path && item.signedUrl) signedImages.set(item.path, item.signedUrl);
  }

  const categories = (categoryRows ?? [])
    .map(category => ({ ...category, image: demoCategories.find(item => item.name.toLowerCase() === category.name.toLowerCase())?.image ?? demoCategories.at(-1)?.image }));

  const products = (productRows ?? []).map(row => mapProduct(row, categoryById, signedImages));
  return { categories, products };
}

export async function fetchPublishedReels(client) {
  const { data: rows, error } = await client.from("reels")
    .select("id,caption,video_path,thumbnail_path,view_count,created_at,vendor:vendor_profiles!reels_vendor_id_fkey(id,shop_name),products:reel_products(product:products(id,name,price,brand,images:product_images(storage_path,alt_text,sort_order)))")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return withSignedMedia(client, "reel-videos", "reel-thumbnails", rows ?? [], "video_path", "thumbnail_path").then(items => items.map(reel => ({
    ...reel,
    maker: reel.vendor?.shop_name ?? "Independent maker",
    products: (reel.products ?? []).map(item => item.product).filter(Boolean)
  })));
}

export async function fetchLiveStreams(client) {
  const { data: rows, error } = await client.from("live_streams")
    .select("id,title,provider,provider_room_id,status,thumbnail_path,started_at,vendor:vendor_profiles!live_streams_vendor_id_fkey(id,shop_name),products:live_stream_products(is_pinned,pinned_at,product:products(id,name,price,brand,images:product_images(storage_path,alt_text,sort_order)))")
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return withSignedMedia(client, "live-thumbnails", null, rows ?? [], "thumbnail_path", null).then(items => items.map(stream => ({
    ...stream,
    maker: stream.vendor?.shop_name ?? "Independent maker",
    viewers: 0,
    pinnedProduct: stream.products?.find(item => item.is_pinned)?.product ?? null
  })));
}

async function withSignedMedia(client, primaryBucket, secondaryBucket, rows, primaryKey, secondaryKey) {
  const pathsByBucket = new Map([[primaryBucket, rows.map(row => row[primaryKey]).filter(Boolean)]]);
  if (secondaryBucket && secondaryKey) pathsByBucket.set(secondaryBucket, rows.map(row => row[secondaryKey]).filter(Boolean));
  const signedByBucket = new Map();
  for (const [bucket, paths] of pathsByBucket) {
    const uniquePaths = [...new Set(paths)];
    if (!uniquePaths.length) continue;
    const { data, error } = await client.storage.from(bucket).createSignedUrls(uniquePaths, 3600);
    if (error) throw error;
    signedByBucket.set(bucket, new Map((data ?? []).filter(item => item.path && item.signedUrl).map(item => [item.path, item.signedUrl])));
  }
  return rows.map(row => ({
    ...row,
    videoUrl: signedByBucket.get(primaryBucket)?.get(row[primaryKey]) ?? "",
    thumbnailUrl: secondaryBucket
      ? signedByBucket.get(secondaryBucket)?.get(row[secondaryKey]) ?? ""
      : signedByBucket.get(primaryBucket)?.get(row[primaryKey]) ?? ""
  }));
}

export function mapSearchProducts(rows, categories = []) {
  const categoryById = new Map(categories.map(category => [category.id, category]));
  return (rows ?? []).map(row => mapProduct(row, categoryById, new Map()));
}

function mapProduct(row, categoryById, signedImages) {
  const category = row.category ?? categoryById.get(row.category_id);
  const parentCategory = category?.parent_id ? categoryById.get(category.parent_id) : null;
  const rootCategory = parentCategory ?? category;
  const categoryName = rootCategory?.name ?? "Objects";
  const categoryPhoto = demoCategories.find(item => item.name.toLowerCase() === categoryName.toLowerCase())?.image ?? demoCategories.at(-1)?.image;
  const imageRow = (row.images ?? []).find(image => signedImages.has(image.storage_path));
  const variants = (row.variants ?? []).map(variant => {
    const inventory = Array.isArray(variant.inventory) ? variant.inventory : variant.inventory ? [variant.inventory] : [];
    return {
      ...variant,
      stock: inventory.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
    };
  });
  const stock = variants.reduce((total, variant) => {
    const inventory = variant.inventory;
    const quantities = Array.isArray(inventory) ? inventory : inventory ? [inventory] : [];
    return total + quantities.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);
  }, 0);
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor?.shop_name ?? row.brand ?? "Independent maker",
    category: categoryName,
    categoryDetail: category?.id !== rootCategory?.id ? category?.name ?? "" : "",
    categoryId: rootCategory?.id ?? row.category_id,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
    rating: Number(row.average_rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    badge: row.status === "active" ? "IN THE SHORTLIST" : "",
    image: imageRow ? signedImages.get(imageRow.storage_path) : categoryPhoto,
    description: row.description ?? "",
    color: "Maker's choice",
    stock,
    variants: variants.filter(variant => variant.is_active)
  };
}

export async function loadCustomerCommerce(client, userId) {
  const [{ error: cartCreateError }, { error: wishlistCreateError }] = await Promise.all([
    client.from("carts").upsert({ customer_id: userId }, { onConflict: "customer_id", ignoreDuplicates: true }),
    client.from("wishlists").upsert({ customer_id: userId }, { onConflict: "customer_id", ignoreDuplicates: true })
  ]);
  if (cartCreateError) throw cartCreateError;
  if (wishlistCreateError) throw wishlistCreateError;

  const [{ data: cart, error: cartError }, { data: wishlist, error: wishlistError }] = await Promise.all([
    client.from("carts").select("id").eq("customer_id", userId).single(),
    client.from("wishlists").select("id").eq("customer_id", userId).single()
  ]);
  if (cartError) throw cartError;
  if (wishlistError) throw wishlistError;

  const [{ data: items, error: itemsError }, { data: saved, error: savedError }] = await Promise.all([
    client.from("cart_items").select("id,product_id,variant_id,quantity,product:products(id,name,description,price,compare_at_price,average_rating,review_count,category_id,brand,status,category:categories!products_category_id_fkey(id,parent_id,name,slug),vendor:vendor_profiles!products_vendor_id_fkey(id,shop_name),variants:product_variants(id,name,options,is_active,inventory(quantity)))").eq("cart_id", cart.id).limit(100),
    client.from("wishlist_items").select("product_id").eq("wishlist_id", wishlist.id).limit(200)
  ]);
  if (itemsError) throw itemsError;
  if (savedError) throw savedError;
  return {
    cartId: cart.id,
    wishlistId: wishlist.id,
    cart: (items ?? []).map(item => ({ id: item.id, productId: item.product_id, variantId: item.variant_id, quantity: item.quantity })),
    products: mapSearchProducts((items ?? []).map(item => item.product).filter(Boolean)),
    saved: (saved ?? []).map(item => item.product_id)
  };
}

export async function upsertCartLine(client, cartId, productId, quantity, variantId = null) {
  const { data, error } = await client.from("cart_items")
    .upsert({ cart_id: cartId, product_id: productId, variant_id: variantId, quantity }, { onConflict: "cart_id,product_id,variant_id" })
    .select("id,product_id,variant_id,quantity")
    .single();
  if (error) throw error;
  return { id: data.id, productId: data.product_id, variantId: data.variant_id, quantity: data.quantity };
}

export async function deleteCartLine(client, cartId, lineId) {
  const { error } = await client.from("cart_items").delete().eq("cart_id", cartId).eq("id", lineId);
  if (error) throw error;
}

export async function setWishlistProduct(client, wishlistId, productId, shouldSave) {
  if (shouldSave) {
    const { error } = await client.from("wishlist_items").upsert({ wishlist_id: wishlistId, product_id: productId }, { onConflict: "wishlist_id,product_id", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await client.from("wishlist_items").delete().eq("wishlist_id", wishlistId).eq("product_id", productId);
    if (error) throw error;
  }
}