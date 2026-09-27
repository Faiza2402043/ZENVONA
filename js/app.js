import { categories, demoCatalog, reels, liveRooms } from "./data.js?v=15";
import { getSupabase, isSupabaseConfigured } from "./supabase.js";
import { dashboardUrl } from "./auth-router.js";
import { deleteCartLine, fetchCatalog, fetchLiveStreams, fetchPublishedReels, loadCustomerCommerce, mapSearchProducts, setWishlistProduct, upsertCartLine } from "./catalog-service.js";

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const supabaseEnabled = isSupabaseConfigured();
const guestCart = read("zenvora-guest-cart", read("zenvora-cart", []));
const guestSaved = read("zenvora-guest-saved", read("zenvora-saved", []));
let catalogLoadPromise;
let mediaLoadPromise;
let authEpoch = 0;
const mediaObservers = new WeakMap();
const dashboardRoles = {
  "admin-dashboard": "admin",
  "vendor-dashboard": "vendor",
  "customer-dashboard": "customer"
};

const store = {
  cart: supabaseEnabled ? guestCart : read("zenvora-cart", []),
  guestCart,
  saved: supabaseEnabled ? guestSaved : read("zenvora-saved", []),
  guestSaved,
  likes: read("zenvora-likes", []),
  role: isSupabaseConfigured() ? "" : read("zenvora-demo-role", ""),
  user: null,
  profile: null,
  vendorProfile: null,
  cartId: null,
  wishlistId: null,
  catalogCategories: supabaseEnabled ? [] : categories,
  catalogProducts: supabaseEnabled ? [] : demoCatalog,
  catalogState: supabaseEnabled ? "loading" : "demo",
  catalogPreview: false,
  catalogError: "",
  reels: supabaseEnabled ? [] : reels,
  liveStreams: supabaseEnabled ? [] : liveRooms,
  mediaState: supabaseEnabled ? "loading" : "demo",
  mediaError: "",
  commerceError: "",
  authReady: !isSupabaseConfigured(),
  authError: "",
  extraProducts: read("zenvora-extra-products", []),
  orders: read("zenvora-demo-orders", []),
  previewCart: read("zenvora-preview-cart", []),
  previewSaved: read("zenvora-preview-saved", []),
  previewOrders: read("zenvora-preview-orders", []),
  following: read("zenvora-demo-following", ["Common Ground", "Morrow Objects", "Field Notes Skin", "Outside In"]),
  settings: read("zenvora-dashboard-settings", { autoplayVideos: true }),
  route: "home",
  pendingRoute: null,
  category: "All",
  query: "",
  sort: "featured",
  selectedProduct: null,
  quantity: 1,
  paymentSessionId: ""
};

const allProducts = () => [...store.catalogProducts, ...(supabaseEnabled ? [] : store.extraProducts)];
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const byId = id => allProducts().find(product => product.id === id);
const isDashboardRoute = route => route === "workspace" || Object.hasOwn(dashboardRoles, route);
const dashboardRouteForRole = role => Object.entries(dashboardRoles).find(([, routeRole]) => routeRole === role)?.[0] ?? "customer-dashboard";

function productCard(product) {
  const saved = store.saved.includes(product.id);
  const saveControl = store.catalogPreview
    ? `<button class="save-button ${saved ? "is-saved" : ""}" data-action="save" data-id="${escapeHtml(product.id)}" aria-label="${saved ? "Remove from" : "Add to"} demo wishlist" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>`
    : `<button class="save-button ${saved ? "is-saved" : ""}" data-action="save" data-id="${escapeHtml(product.id)}" aria-label="${saved ? "Remove from" : "Add to"} saved finds" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>`;
  const addControl = store.catalogPreview
    ? `<button class="quick-add" data-action="add" data-id="${escapeHtml(product.id)}">DEMO ADD +</button>`
    : `<button class="quick-add" data-action="add" data-id="${escapeHtml(product.id)}">QUICK ADD +</button>`;
  return `<article class="product-card"><div class="product-image-wrap" data-action="product" data-id="${escapeHtml(product.id)}"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy"><span class="product-badge">${escapeHtml(product.badge)}</span>${saveControl}${addControl}</div><div class="product-meta"><span class="product-vendor">${escapeHtml(product.vendor)} · ${escapeHtml(product.category)}</span><h3 class="product-title" data-action="product" data-id="${escapeHtml(product.id)}">${escapeHtml(product.name)}</h3><div class="product-bottom"><span class="product-price">${money(product.price)}</span><span class="product-rating">★ ${product.rating.toFixed(1)}</span></div></div></article>`;
}

function renderCategories() {
  const categoryRows = store.catalogCategories;
  document.querySelector("#category-list").innerHTML = categoryRows.filter(category => !category.parent_id).map(category => `<button class="category-card" data-action="category" data-category="${escapeHtml(category.name)}"><img src="${escapeHtml(category.image ?? "")}" alt="" loading="lazy"><span>${escapeHtml(category.name)} ↗</span></button>`).join("");
  document.querySelector("#shop-categories").innerHTML = ["All", ...categoryRows.map(category => category.name)].map(category => `<button class="filter-chip ${store.category === category ? "is-selected" : ""}" data-action="filter" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
}

function productMatches(product, query) {
  const haystack = `${product.name} ${product.vendor} ${product.category} ${product.description} ${product.color}`.toLowerCase();
  const normalized = query.toLowerCase();
  const under = normalized.match(/\b(?:under|below|less than|max(?:imum)?)\s*\$?([\d.]+)/);
  const over = normalized.match(/\b(?:over|above|more than|min(?:imum)?)\s*\$?([\d.]+)/);
  const between = normalized.match(/\bbetween\s*\$?([\d.]+)\s*(?:and|-)\s*\$?([\d.]+)/);
  if (under && product.price > Number(under[1])) return false;
  if (over && product.price < Number(over[1])) return false;
  if (between && (product.price < Number(between[1]) || product.price > Number(between[2]))) return false;
  const exactPrice = normalized.match(/^\s*\$?([\d.]+)\s*$/);
  if (exactPrice && product.price !== Number(exactPrice[1])) return false;
  const words = normalized.split(/\s+/).filter(word => word.length > 2 && !["under", "below", "less", "than", "over", "above", "more", "max", "min", "between", "price", "show", "find", "with", "for", "the", "and", "affordable"].includes(word) && !/^\$?[\d.]+$/.test(word));
  return words.length === 0 || words.some(word => haystack.includes(word));
}

function closeSearchSuggestions() {
  const panel = document.querySelector("#search-suggestions");
  panel.hidden = true;
  document.querySelector("#search-input").setAttribute("aria-expanded", "false");
}

function renderSearchSuggestions(query) {
  const input = document.querySelector("#search-input");
  const panel = document.querySelector("#search-suggestions");
  const term = query.trim();
  if (term.length < 2) return closeSearchSuggestions();
  const matches = allProducts().filter(product => productMatches(product, term)).slice(0, 5);
  const productRows = matches.map(product => `<button class="search-suggestion" type="button" role="option" data-action="product" data-id="${escapeHtml(product.id)}"><img src="${escapeHtml(product.image)}" alt="" loading="lazy"><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.vendor)} · ${escapeHtml(product.category)}</small></span><b>${money(product.price)}</b></button>`).join("");
  const loading = store.catalogState === "loading" && matches.length === 0 ? `<p class="search-empty">Finding matching products…</p>` : `<p class="search-empty">No matching finds yet.</p>`;
  panel.innerHTML = `${productRows || loading}<button class="search-all" type="button" data-action="search-all" data-query="${escapeHtml(term)}">See all results for “${escapeHtml(term)}” ↗</button>`;
  panel.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function filteredProducts() {
  let result = allProducts().filter(product => (store.category === "All" || product.category === store.category || product.categoryDetail === store.category) && productMatches(product, store.query));
  if (store.sort === "price-low") result.sort((a, b) => a.price - b.price);
  if (store.sort === "price-high") result.sort((a, b) => b.price - a.price);
  if (store.sort === "rating") result.sort((a, b) => b.rating - a.rating);
  return result;
}

function renderProducts() {
  renderCategories();
  const searchInput = document.querySelector("#search-input");
  if (searchInput.value.trim().length >= 2) renderSearchSuggestions(searchInput.value);
  if (store.catalogState === "loading") {
    document.querySelector("#home-products").innerHTML = `<p class="catalog-message">Finding the good things…</p>`;
    document.querySelector("#shop-products").innerHTML = `<p class="catalog-message">Finding the good things…</p>`;
    document.querySelector("#shop-empty").hidden = true;
    return;
  }
  const previewNotice = store.catalogPreview
    ? `<p class="catalog-message" role="status">${escapeHtml(store.catalogError)} <button class="text-button" data-action="reload-catalog">Retry catalog ↻</button></p>`
    : "";
  document.querySelector("#home-products").innerHTML = `${previewNotice}${allProducts().slice(0, 8).map(productCard).join("")}`;
  const results = filteredProducts();
  const grouped = new Map();
  for (const product of results) {
    const category = product.category || "Other";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(product);
  }
  const categoryOrder = [
    ...store.catalogCategories.map(category => category.name).filter(name => grouped.has(name)),
    ...[...grouped.keys()].filter(name => !store.catalogCategories.some(category => category.name === name))
  ];
  const categorySections = categoryOrder.map(category => {
    const products = grouped.get(category);
    return `<div class="section-heading" style="grid-column:1/-1"><div><p class="eyebrow">SHOP BY CATEGORY</p><h2>${escapeHtml(category)}</h2></div><span class="product-vendor">${products.length} ${products.length === 1 ? "FIND" : "FINDS"}</span></div>${products.map(productCard).join("")}`;
  }).join("");
  document.querySelector("#shop-products").innerHTML = `${previewNotice}${categorySections}`;
  document.querySelector("#shop-empty").hidden = results.length > 0;
}

function renderReels() {
  document.querySelector("#reels-mode-label").textContent = store.mediaState === "demo" ? "DEMO STORIES" : "REELS";
  if (store.mediaState === "loading") {
    document.querySelector("#home-reels").innerHTML = `<p class="catalog-message">Loading maker stories...</p>`;
    document.querySelector("#reels-feed").innerHTML = `<p class="catalog-message">Loading Reels...</p>`;
    return;
  }
  if (store.mediaState === "error") {
    const message = `<p class="catalog-message" role="status">${escapeHtml(store.mediaError || "Reels could not be loaded.")} <button class="text-button" data-action="reload-media">Try again</button></p>`;
    document.querySelector("#home-reels").innerHTML = message;
    document.querySelector("#reels-feed").innerHTML = message;
    return;
  }
  const card = reel => {
    const product = reel.products?.[0] ?? byId(reel.product) ?? demoCatalog.find(item => item.id === reel.product);
    const media = reel.videoUrl
      ? `<video data-auto-play data-video-src="${escapeHtml(reel.videoUrl)}" poster="${escapeHtml(reel.thumbnailUrl ?? reel.image ?? "")}" muted playsinline loop controls preload="none"></video>`
      : `<img src="${escapeHtml(reel.image ?? "")}" alt="${escapeHtml(reel.caption ?? reel.title ?? "Reel")}" loading="lazy">`;
    const liked = store.likes.includes(reel.id);
    return `<article class="reel-card">${media}<span class="reel-demo-pill">${reel.isDemo ? "DEMO REEL" : reel.videoUrl ? "PUBLISHED REEL" : "DEMO PREVIEW"}</span><div class="reel-copy"><span class="maker-name">${escapeHtml(reel.maker ?? reel.vendor ?? "Independent maker")}</span><h3>${escapeHtml(reel.caption ?? reel.title ?? "A maker story")}</h3><p>${product ? `Shop ${escapeHtml(product.name)}.` : "Discover the maker behind this find."}</p><div class="reel-actions"><button data-action="like" data-id="${escapeHtml(reel.id)}">${liked ? "♥ Liked" : "♡ Like"}</button><button data-action="share" data-id="${escapeHtml(reel.id)}">Share</button>${product ? `<button class="reel-buy" data-action="product" data-id="${escapeHtml(product.id)}">Shop ${money(product.price)} ↗</button>` : ""}</div></div></article>`;
  };
  const feed = store.reels;
  const demoNotice = supabaseEnabled && store.mediaState === "demo" ? `<p class="catalog-message" role="status">${escapeHtml(store.mediaError)}</p>` : "";
  document.querySelector("#home-reels").innerHTML = `${demoNotice}${feed.slice(0, 3).map(reel => `<div class="mini-reel">${reel.videoUrl ? `<video data-auto-play data-video-src="${escapeHtml(reel.videoUrl)}" poster="${escapeHtml(reel.thumbnailUrl ?? reel.image ?? "")}" muted playsinline loop preload="none"></video>` : `<img src="${escapeHtml(reel.image)}" alt="" loading="lazy">`}<button data-action="route" data-route="reels">${escapeHtml(reel.maker ?? reel.vendor ?? "Independent maker")}<br>${escapeHtml(reel.caption ?? reel.title ?? "Maker story")}</button></div>`).join("") || `<p class="catalog-message">No published Reels available.</p>`}`;
  document.querySelector("#reels-feed").innerHTML = `${demoNotice}${feed.map(card).join("") || `<p class="catalog-message">No published Reels available.</p>`}`;
  observeMediaPlayback(document.querySelector("#home-reels"));
  observeMediaPlayback(document.querySelector("#reels-feed"));
}

function observeMediaPlayback(container) {
  if (!container || !("IntersectionObserver" in window)) return;
  mediaObservers.get(container)?.disconnect();
  const videos = [...container.querySelectorAll("video[data-auto-play]")];
  if (!videos.length) return;
  const visibility = new Map(videos.map(video => [video, 0]));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      visibility.set(entry.target, entry.intersectionRatio);
    }
    const activeVideo = videos
      .filter(video => visibility.get(video) >= 0.25)
      .sort((first, second) => visibility.get(second) - visibility.get(first))[0];
    for (const video of videos) {
      if (video === activeVideo) {
        if (!video.src && video.dataset.videoSrc) {
          video.src = video.dataset.videoSrc;
          video.load();
        }
        if (store.settings.autoplayVideos) void video.play().catch(() => {});
        else video.pause();
      } else {
        video.pause();
        if (visibility.get(video) < 0.05 && video.hasAttribute("src")) {
          video.removeAttribute("src");
          video.load();
        }
      }
    }
  }, { threshold: [0, 0.15, 0.25, 0.5, 0.75, 1] });
  mediaObservers.set(container, observer);
  videos.forEach(video => observer.observe(video));
}

function renderLive() {
  document.querySelector("#live-mode-label").textContent = store.mediaState === "demo" ? "DEMO ROOMS" : "LIVE SHOPPING";
  if (store.mediaState === "loading") {
    document.querySelector("#home-live").innerHTML = `<p class="catalog-message">Checking live shopping...</p>`;
    document.querySelector("#live-rooms").innerHTML = `<p class="catalog-message">Loading live streams...</p>`;
    return;
  }
  if (store.mediaState === "error") {
    const message = `<p class="catalog-message" role="status">${escapeHtml(store.mediaError || "Live streams could not be loaded.")} <button class="text-button" data-action="reload-media">Try again</button></p>`;
    document.querySelector("#home-live").innerHTML = message;
    document.querySelector("#live-rooms").innerHTML = message;
    return;
  }
  const card = room => {
    const image = room.thumbnailUrl ?? room.image;
    const media = room.videoUrl
      ? `<video data-auto-play data-video-src="${escapeHtml(room.videoUrl)}" poster="${escapeHtml(image ?? "")}" muted playsinline loop controls preload="none"></video>`
      : image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(room.title)}" loading="lazy">` : `<div class="live-card-placeholder">Live video preview unavailable</div>`;
    const label = room.isDemo ? "FASHION LIVE · DEMO" : `LIVE · ${escapeHtml(room.provider ?? "VIDEO PROVIDER").toUpperCase()}`;
    return `<article class="live-card">${media}<span class="live-label">${label}</span><div class="live-info"><span>${escapeHtml(room.maker)} · ${room.viewers} VIEWERS</span><h3>${escapeHtml(room.title)}</h3><button data-action="live" data-id="${escapeHtml(room.id)}">${room.isDemo ? "Join live room ↗" : "Watch live ↗"}</button></div></article>`;
  };
  const streams = store.liveStreams;
  const demoNotice = supabaseEnabled && store.mediaState === "demo" ? `<p class="catalog-message" role="status">${escapeHtml(store.mediaError)}</p>` : "";
  document.querySelector("#home-live").innerHTML = `${demoNotice}${streams.slice(0, 3).map(card).join("") || `<p class="catalog-message">No live streams currently.</p>`}`;
  document.querySelector("#live-rooms").innerHTML = `${demoNotice}${streams.map(card).join("") || `<p class="catalog-message">No live streams currently.</p>`}`;
  observeMediaPlayback(document.querySelector("#home-live"));
  observeMediaPlayback(document.querySelector("#live-rooms"));
}

async function loadSupabaseMedia() {
  if (!supabaseEnabled) return;
  store.mediaState = "loading";
  store.mediaError = "";
  renderReels();
  renderLive();
  mediaLoadPromise = (async () => {
    try {
      const client = await getSupabase();
      const [reelResult, streamResult] = await Promise.allSettled([
        fetchPublishedReels(client),
        fetchLiveStreams(client)
      ]);
      store.reels = reelResult.status === "fulfilled" ? reelResult.value : reels;
      store.liveStreams = streamResult.status === "fulfilled" ? streamResult.value : liveRooms;
      store.mediaState = reelResult.status === "fulfilled" && streamResult.status === "fulfilled" ? "ready" : "demo";
      if (store.mediaState === "demo") {
        store.mediaError = "Some connected media is unavailable. Product-focused demo stories and rooms are shown for those sections.";
      }
    } catch (error) {
      console.error("Reels and live streams load failed", error);
      store.reels = reels;
      store.liveStreams = liveRooms;
      store.mediaState = "demo";
      store.mediaError = "Connected Reels and live streams are unavailable. Unique product-focused demo stories and shopping rooms are shown instead.";
    }
    renderReels();
    renderLive();
  })().finally(() => { mediaLoadPromise = null; });
  return mediaLoadPromise;
}

function renderCartCount() {
  const count = store.cart.reduce((total, line) => total + line.quantity, 0);
  document.querySelector("#cart-count").textContent = count;
}

function persistGuestCart() {
  if (store.catalogPreview) {
    store.previewCart = store.cart;
    save("zenvora-preview-cart", store.previewCart);
    return;
  }
  if (supabaseEnabled && store.user) return;
  store.guestCart = store.cart;
  save("zenvora-guest-cart", store.guestCart);
  if (!supabaseEnabled) save("zenvora-cart", store.cart);
}

async function refreshCustomerCommerce(client, userId, requestEpoch) {
  if (store.catalogPreview) return;
  try {
    const commerce = await loadCustomerCommerce(client, userId);
    if (requestEpoch !== authEpoch) return;
    store.cartId = commerce.cartId;
    store.wishlistId = commerce.wishlistId;
    for (const product of commerce.products) {
      if (!store.catalogProducts.some(item => item.id === product.id)) store.catalogProducts.push(product);
    }
    const merged = new Map(commerce.cart.map(line => [`${line.productId}:${line.variantId ?? ""}`, line]));
    for (const guestLine of [...store.guestCart]) {
      const product = allProducts().find(item => item.id === guestLine.productId);
      const variant = product?.variants?.[0];
      if (!product || !variant || !Number.isInteger(guestLine.quantity) || guestLine.quantity < 1) {
        continue;
      }
      const key = `${product.id}:${variant.id}`;
      const existing = merged.get(key);
      const quantity = Math.min(Number(variant.stock ?? product.stock), (existing?.quantity ?? 0) + guestLine.quantity);
      if (quantity < 1) continue;
      const savedLine = await upsertCartLine(client, store.cartId, product.id, quantity, variant.id);
      if (requestEpoch !== authEpoch) return;
      merged.set(key, savedLine);
      store.guestCart = store.guestCart.filter(item => item !== guestLine);
      save("zenvora-guest-cart", store.guestCart);
    }
    const unmergedGuestLines = store.guestCart.filter(item => !merged.has(`${item.productId}:${allProducts().find(product => product.id === item.productId)?.variants?.[0]?.id ?? ""}`));
    store.cart = [...merged.values(), ...unmergedGuestLines];
    store.saved = commerce.saved;
    for (const productId of [...store.guestSaved]) {
      if (!allProducts().some(product => product.id === productId)) {
        continue;
      }
      await setWishlistProduct(client, store.wishlistId, productId, true);
      if (requestEpoch !== authEpoch) return;
      if (!store.saved.includes(productId)) store.saved.push(productId);
      store.guestSaved = store.guestSaved.filter(id => id !== productId);
      save("zenvora-guest-saved", store.guestSaved);
    }
    renderCartCount();
    renderProducts();
  } catch (error) {
    if (requestEpoch !== authEpoch) return;
    console.error("Unable to load the account cart and wishlist", error);
    store.commerceError = "Your saved bag could not be loaded. Refresh or check your Supabase cart and wishlist policies.";
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

async function addToCart(productId, quantity = 1) {
  if (supabaseEnabled && store.user && !store.catalogPreview && !store.cartId) return showToast("Your saved bag is still loading. Try again in a moment.");
  const product = byId(productId);
  if (!product) return showToast("That find is no longer available.");
  const line = store.cart.find(item => item.productId === productId);
  const variant = product.variants?.find(item => item.id === line?.variantId) ?? product.variants?.[0];
  const available = supabaseEnabled && !store.catalogPreview ? Number(variant?.stock ?? 0) : Number(product.stock ?? 0);
  if (available < 1) return showToast("That find is currently out of stock.");
  const nextQuantity = (line?.quantity ?? 0) + quantity;
  if (nextQuantity > available) return showToast(`Only ${available} available.`);
  if (supabaseEnabled && !store.catalogPreview && store.user && store.cartId) {
    try {
      const client = await getSupabase();
      if (!variant) return showToast("This item has no purchasable variant yet.");
      const savedLine = await upsertCartLine(client, store.cartId, productId, nextQuantity, variant.id);
      if (line) Object.assign(line, savedLine);
      else store.cart.push(savedLine);
    } catch (error) {
      console.error("Cart update failed", error);
      return showToast("Could not update your saved bag. Please try again.");
    }
  } else {
    if (line) line.quantity = nextQuantity;
    else store.cart.push({ productId, quantity });
    persistGuestCart();
  }
  renderCartCount();
  showToast(`${product.name} added to your bag.`);
}

function openModal(content, className = "") {
  document.querySelector("#modal-root").innerHTML = `<div class="overlay" data-action="overlay"><section class="dialog ${className}" role="dialog" aria-modal="true">${content}<button class="dialog-close" data-action="close" aria-label="Close dialog">×</button></section></div>`;
  document.querySelector(".dialog-close").focus();
}

function openProduct(productId) {
  const product = byId(productId);
  if (!product) return;
  store.selectedProduct = productId;
  store.quantity = 1;
  openModal(`<div class="product-dialog"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"><div><p class="eyebrow">${escapeHtml(product.vendor)} · ${escapeHtml(product.category)}</p><h2>${escapeHtml(product.name)}</h2><p class="dialog-price">${money(product.price)} <span class="product-rating"> · ★ ${product.rating}</span></p><p>${escapeHtml(product.description)}</p><p>Color / finish: ${escapeHtml(product.color)}<br>${product.stock} available in demo inventory.</p><div class="quantity-control"><span>QUANTITY</span><button data-action="quantity" data-delta="-1" aria-label="Decrease quantity">−</button><b id="quantity-value">1</b><button data-action="quantity" data-delta="1" aria-label="Increase quantity">+</button></div><div class="dialog-actions"><button class="button button-dark" data-action="modal-add">Add to bag · ${money(product.price)}</button><button class="button" data-action="save" data-id="${escapeHtml(product.id)}">${store.saved.includes(product.id) ? "♥ Saved" : "♡ Save"}</button></div></div></div>`);
}

function openCart() {
  const lines = store.cart.map(line => {
    const product = byId(line.productId);
    if (!product) return "";
    return `<div class="cart-line"><img src="${escapeHtml(product.image)}" alt=""><div><h3>${escapeHtml(product.name)}</h3><p>${line.quantity} × ${money(product.price)} · ${escapeHtml(product.vendor)}</p><button data-action="quantity-cart" data-delta="-1" data-id="${escapeHtml(product.id)}" aria-label="Decrease quantity">−</button> ${line.quantity} <button data-action="quantity-cart" data-delta="1" data-id="${escapeHtml(product.id)}" aria-label="Increase quantity">+</button> · <button data-action="remove" data-id="${escapeHtml(product.id)}">Remove</button></div><b>${money(product.price * line.quantity)}</b></div>`;
  }).join("");
  const subtotal = store.cart.reduce((sum, line) => sum + (byId(line.productId)?.price ?? 0) * line.quantity, 0);
  const checkoutMessage = store.catalogPreview
    ? `<p class="payment-note">Demo preview only. Your order stays in this browser; no payment or delivery is created.</p><button class="button button-dark" data-action="checkout">Continue with demo order ↗</button>`
    : supabaseEnabled
    ? `<p class="payment-note">Payment is handled on Stripe's secure checkout page. Your bag is reserved only after server-side stock validation.</p><button class="button button-dark" data-action="checkout">Continue to secure checkout ↗</button>`
    : `<p class="payment-note">Demo checkout only. No payment details are collected and no real order is placed.</p><button class="button button-dark" data-action="checkout">Continue to demo checkout ↗</button>`;
  openModal(`<p class="eyebrow">THE GOOD-FIND BAG</p><h2>Your bag <span class="product-rating">(${store.cart.reduce((sum, line) => sum + line.quantity, 0)})</span></h2>${store.commerceError ? `<p class="auth-feedback" role="alert">${escapeHtml(store.commerceError)}</p>` : ""}${lines || `<p>Your bag is taking a quiet moment. Go find something good.</p>`}${lines ? `<div class="cart-summary"><span>Subtotal</span><span>${money(subtotal)}</span></div>${checkoutMessage}` : `<button class="button button-dark" data-action="route" data-route="shop">Explore the edit ↗</button>`}`);
}

async function setSavedProduct(productId) {
  if (supabaseEnabled && !store.catalogPreview && store.user && !store.wishlistId) return showToast("Your saved finds are still loading. Try again in a moment.");
  const shouldSave = !store.saved.includes(productId);
  if (supabaseEnabled && !store.catalogPreview && store.user && store.wishlistId) {
    try {
      await setWishlistProduct(await getSupabase(), store.wishlistId, productId, shouldSave);
    } catch (error) {
      console.error("Wishlist update failed", error);
      return showToast("Could not update your saved finds. Please try again.");
    }
  }
  store.saved = shouldSave ? [...store.saved, productId] : store.saved.filter(id => id !== productId);
  if (store.catalogPreview) {
    store.previewSaved = store.saved;
    save("zenvora-preview-saved", store.previewSaved);
  } else if (supabaseEnabled && !store.user) {
    store.guestSaved = store.saved;
    save("zenvora-guest-saved", store.guestSaved);
  } else if (!supabaseEnabled) save("zenvora-saved", store.saved);
  renderProducts();
  renderReels();
  document.querySelectorAll(`#modal-root [data-action="save"][data-id="${CSS.escape(productId)}"]`).forEach(button => {
    button.textContent = shouldSave ? "♥ Saved" : "♡ Save";
    button.setAttribute("aria-pressed", String(shouldSave));
  });
  showToast(shouldSave ? "Saved to your finds." : "Removed from saved finds.");
}

async function updateCartQuantity(productId, delta) {
  const product = byId(productId);
  const line = store.cart.find(item => item.productId === productId);
  if (!product || !line) return;
  const quantity = line.quantity + delta;
  const variantStock = Number(product.variants?.find(item => item.id === line.variantId)?.stock ?? product.stock ?? 0);
  if (quantity > variantStock) return showToast(`Only ${variantStock} available.`);
  try {
    if (supabaseEnabled && !store.catalogPreview && store.user && store.cartId) {
      const client = await getSupabase();
      if (quantity < 1) await deleteCartLine(client, store.cartId, line.id);
      else await upsertCartLine(client, store.cartId, productId, quantity, line.variantId);
    }
    if (quantity < 1) store.cart = store.cart.filter(item => item.productId !== productId);
    else line.quantity = quantity;
    persistGuestCart();
    renderCartCount();
    openCart();
  } catch (error) {
    console.error("Cart quantity update failed", error);
    showToast("Could not update your bag. Please try again.");
  }
}

async function removeCartProduct(productId) {
  const line = store.cart.find(item => item.productId === productId);
  if (!line) return;
  try {
    if (supabaseEnabled && !store.catalogPreview && store.user && store.cartId) await deleteCartLine(await getSupabase(), store.cartId, line.id);
    store.cart = store.cart.filter(item => item.productId !== productId);
    persistGuestCart();
    renderCartCount();
    openCart();
  } catch (error) {
    console.error("Cart removal failed", error);
    showToast("Could not remove that item. Please try again.");
  }
}

function openCheckout() {
  const subtotal = store.cart.reduce((sum, line) => sum + (byId(line.productId)?.price ?? 0) * line.quantity, 0);
  const itemSummary = store.cart.map(line => {
    const product = byId(line.productId);
    return product ? `<li>${escapeHtml(product.name)} · ${line.quantity} × ${money(product.price)}</li>` : "";
  }).join("");
  const orderSummary = `<section class="checkout-summary"><h3>Review your bag</h3><ul>${itemSummary}</ul><div class="cart-summary"><strong>Total</strong><strong>${money(subtotal)}</strong></div></section>`;
  if (supabaseEnabled && !store.catalogPreview) {
    if (!store.user || store.profile?.role !== "customer") {
      showToast("Sign in with a customer account to check out.");
      openAccount("sign-in");
      return;
    }
    const customer = store.profile.full_name ?? store.profile.display_name ?? "";
    openModal(`<p class="eyebrow">CHECKOUT · 1 OF 2</p><h2>Delivery details</h2><p>Review the items, enter delivery details, then pay securely with Stripe. Stock and pricing are checked again before reservation.</p>${orderSummary}<form class="checkout-form" data-form="secure-checkout"><label>Recipient<input name="recipient" required maxlength="120" autocomplete="name" value="${escapeHtml(customer)}"></label><label>Street address<input name="address" required maxlength="240" autocomplete="street-address" placeholder="12 Market Street"></label><label>City<input name="city" required maxlength="120" autocomplete="address-level2" placeholder="Bristol"></label><label>Postal code<input name="postal_code" required maxlength="32" autocomplete="postal-code" placeholder="BS1 1AA"></label><label>Country code<input name="country" required minlength="2" maxlength="2" pattern="[A-Za-z]{2}" autocomplete="country" placeholder="GB"></label><p class="auth-feedback" id="checkout-feedback" role="status"></p><p class="payment-note">You'll be redirected to Stripe. No payment details are entered on Zenvora.</p><button class="button button-dark" type="submit">Continue to Stripe ↗</button></form>`);
    return;
  }
  openModal(`<p class="eyebrow">ORDER DETAILS</p><h2>${store.catalogPreview ? "Demo order" : "Demo checkout"}</h2><p>${store.catalogPreview ? "Sample products only. This order is stored in this browser and will not be paid or delivered." : "Submitting creates a demo order in this browser only; it does not charge you."}</p>${orderSummary}<form class="checkout-form" data-form="checkout"><label>Recipient name<input name="recipient" required maxlength="120" autocomplete="name" placeholder="Your full name"></label><label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Street address<input name="address" required maxlength="240" autocomplete="street-address" placeholder="12 Market Street"></label><label>City<input name="city" required maxlength="120" autocomplete="address-level2" placeholder="Your city"></label><label>Postal code<input name="postal_code" required maxlength="32" autocomplete="postal-code" placeholder="Postal code"></label><label>Country<select name="country" required><option value="">Select country</option><option value="BD">Bangladesh</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label><p class="payment-note">${store.catalogPreview || !supabaseEnabled ? "Demo only. No payment is taken and no fulfillment will happen." : "Payment is unavailable in demo mode."}</p><button class="button button-dark" type="submit">${store.catalogPreview ? "Save demo order" : "Place demo order"} · ${money(subtotal)}</button></form>`);
}

async function beginSecureCheckout(form) {
  const button = form.querySelector("button[type=submit]");
  const feedback = form.querySelector("#checkout-feedback");
  if (button) button.disabled = true;
  if (feedback) feedback.textContent = "Reserving your bag and contacting Stripe…";
  try {
    const client = await getSupabase();
    const values = new FormData(form);
    const shippingAddress = Object.fromEntries(["recipient", "address", "city", "postal_code", "country"].map(key => [key, String(values.get(key)).trim()]));
    shippingAddress.country = shippingAddress.country.toUpperCase();
    const { data, error } = await client.functions.invoke("create-checkout-session", { body: { shipping_address: shippingAddress } });
    if (error) throw error;
    const checkoutUrl = data?.checkout_url ? new URL(data.checkout_url) : null;
    if (!checkoutUrl || checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") throw new Error("Stripe did not return a valid checkout destination.");
    location.assign(checkoutUrl.toString());
  } catch (error) {
    console.error("Secure checkout could not start", error);
    if (feedback) feedback.textContent = error?.message?.includes("not configured")
      ? "Secure payment is not configured yet. Your bag has not been charged."
      : error?.message?.includes("sold out") || error?.message?.includes("reserved")
        ? error.message
        : "Secure checkout could not start. Your bag is still saved; please try again.";
    if (button) button.disabled = false;
  }
}

function completeDemoOrder(form) {
  if (supabaseEnabled && !store.catalogPreview) return showToast("Demo checkout is disabled while the connected catalog is active.");
  const values = new FormData(form);
  const order = { id: `ZV-${Date.now().toString().slice(-7)}`, date: new Date().toLocaleDateString(), total: store.cart.reduce((sum, line) => sum + (byId(line.productId)?.price ?? 0) * line.quantity, 0), email: String(values.get("email")).trim(), recipient: String(values.get("recipient")).trim(), shippingAddress: Object.fromEntries(["address", "city", "postal_code", "country"].map(key => [key, String(values.get(key)).trim()])), status: "Demo order · unpaid", items: store.cart.map(line => ({ ...line, name: byId(line.productId)?.name })) };
  store.orders.unshift(order);
  store.cart = [];
  if (store.catalogPreview) {
    store.previewOrders = store.orders;
    save("zenvora-preview-orders", store.previewOrders);
  } else save("zenvora-demo-orders", store.orders);
  persistGuestCart();
  renderCartCount();
  const itemSummary = order.items.map(item => `<li>${escapeHtml(item.name ?? "Find")} · ${item.quantity} × ${money(byId(item.productId)?.price ?? 0)}</li>`).join("");
  openModal(`<span class="success-mark">✓</span><p class="eyebrow">DEMO ORDER SAVED</p><h2>Thanks, ${escapeHtml(order.recipient)}.</h2><p>Order <strong>${escapeHtml(order.id)}</strong> is recorded in this browser as unpaid demo data.</p><ul>${itemSummary}</ul><p>Order total: <strong>${money(order.total)}</strong></p><p class="payment-note">No payment was taken and no goods will be shipped.</p><button class="button button-dark" data-action="close">Continue shopping</button>`);
}

async function handleCheckoutReturn() {
  const returnUrl = new URL(window.location.href);
  const result = returnUrl.searchParams.get("payment");
  const sessionId = store.paymentSessionId || returnUrl.searchParams.get("session_id");
  if (result === "cancelled") {
    returnUrl.searchParams.delete("payment");
    returnUrl.searchParams.delete("session_id");
    history.replaceState(null, "", returnUrl.toString());
    openModal(`<p class="eyebrow">CHECKOUT CANCELLED</p><h2>Your order was not paid.</h2><p>No charge was completed. Return to the shop to review your bag and start again when you are ready.</p><button class="button button-dark" data-action="route" data-route="shop">Return to shop ↗</button>`);
    return;
  }
  if (result !== "success" && !store.paymentSessionId) return;
  if (!store.user) return openAccount("sign-in");
  store.paymentSessionId = sessionId ?? "";
  returnUrl.searchParams.delete("payment");
  returnUrl.searchParams.delete("session_id");
  history.replaceState(null, "", returnUrl.toString());
  if (!store.paymentSessionId) {
    openModal(`<p class="eyebrow">PAYMENT STATUS</p><h2>Checking your order</h2><p>Stripe returned you to Zenvora, but the order reference is missing. Check Orders before trying checkout again.</p><button class="button button-dark" data-action="workspace">Open dashboard ↗</button>`);
    return;
  }
  try {
    const { data: payment, error } = await (await getSupabase()).from("payments")
      .select("status,amount,currency,order:orders!payments_order_id_fkey(order_number,status,total,order_items(product_name,quantity,unit_price))")
      .eq("provider_reference", store.paymentSessionId)
      .maybeSingle();
    if (error) throw error;
    const order = Array.isArray(payment?.order) ? payment.order[0] : payment?.order;
    if (payment?.status === "paid" && order?.status === "confirmed") {
      store.paymentSessionId = "";
      const items = (order.order_items ?? []).map(item => `<li>${escapeHtml(item.product_name)} · ${item.quantity} × ${money(Number(item.unit_price))}</li>`).join("");
      openModal(`<span class="success-mark">✓</span><p class="eyebrow">PAYMENT CONFIRMED</p><h2>Your order is in.</h2><p>Order <strong>${escapeHtml(order.order_number)}</strong> is confirmed.</p><ul>${items}</ul><p>Order total: <strong>${money(Number(order.total))}</strong></p><button class="button button-dark" data-action="workspace">View your orders ↗</button>`);
      return;
    }
    if (payment?.status === "failed" || order?.status === "cancelled") {
      store.paymentSessionId = "";
      openModal(`<p class="eyebrow">PAYMENT NOT COMPLETED</p><h2>Your order was not charged.</h2><p>The payment provider did not confirm this order. Review your bag and try again if you still want these items.</p><button class="button button-dark" data-action="route" data-route="shop">Return to shop ↗</button>`);
      return;
    }
    openModal(`<p class="eyebrow">PAYMENT PROCESSING</p><h2>We are confirming your order.</h2><p>Payment is not marked complete until Stripe's signed webhook confirms it. Please do not submit another payment while this status is pending.</p><button class="button button-dark" data-action="payment-status">Check status ↻</button>`);
  } catch (error) {
    console.error("Unable to verify returned checkout", error);
    openModal(`<p class="eyebrow">ORDER STATUS</p><h2>Payment returned safely.</h2><p>We could not load the order confirmation yet. Your payment status must be confirmed by Stripe; do not pay again. Check Orders or retry shortly.</p><button class="button button-dark" data-action="payment-status">Retry status ↻</button>`);
  }
}

function setAuthError(message) {
  store.authError = message;
  const feedback = document.querySelector("#auth-feedback");
  if (feedback) feedback.textContent = message;
}

function openAccount(mode = "sign-in") {
  if (isSupabaseConfigured()) {
    if (store.user) {
      const role = store.profile?.role ?? "customer";
      const vendorStatus = store.vendorProfile?.status;
      const vendorSummary = vendorStatus === "pending"
        ? "Your vendor application is awaiting review. Your account remains a customer until approval."
        : vendorStatus === "rejected"
          ? "Your vendor application was not approved. You can update your shop details and contact platform support."
          : vendorStatus === "suspended"
            ? "Your vendor access is suspended. Contact platform support for help."
            : vendorStatus === "approved"
              ? "Your vendor application is approved. Vendor workspace access is enabled."
              : "Apply to open a vendor shop; an administrator must approve the application.";
      openModal(`<p class="eyebrow">YOUR ZENVORA SPACE</p><h2>Welcome back.</h2><p>Signed in as <strong>${escapeHtml(store.user.email ?? "")}</strong></p><p>Account role: <strong>${escapeHtml(role)}</strong></p>${role === "vendor" || vendorStatus ? `<div class="demo-warning">${escapeHtml(vendorSummary)}</div>` : ""}<p id="auth-feedback" class="auth-feedback" role="status">${escapeHtml(store.authError)}</p>${vendorStatus ? "" : `<button class="button" data-action="auth-mode" data-mode="vendor-application">Become a vendor</button>`}<div class="dialog-actions"><button class="button button-dark" data-action="workspace">Open my space ↗</button><button class="button" data-action="logout">Sign out</button></div>`);
      return;
    }
    if (!store.authReady) {
      openModal(`<p class="eyebrow">YOUR ZENVORA SPACE</p><h2>Checking your session.</h2><p id="auth-feedback" class="auth-feedback" role="status">${escapeHtml(store.authError || "Connecting to Supabase Auth…")}</p>`);
      return;
    }
    if (mode === "vendor-application") {
      if (!store.user) return openAccount("sign-in");
      openModal(`<p class="eyebrow">A SHOP OF YOUR OWN</p><h2>Become a maker.</h2><p>Your account stays a customer account until an administrator reviews and approves your application.</p><form class="login-form" data-form="vendor-application"><label>Shop name<input name="shop_name" required maxlength="100" autocomplete="organization" placeholder="Common Ground"></label><label>Shop URL name<input name="slug" required pattern="[a-z0-9-]{3,60}" maxlength="60" placeholder="common-ground"></label><label>A little about your shop<input name="bio" maxlength="500" placeholder="What do you make, and what matters to you?"></label><p id="auth-feedback" class="auth-feedback" role="status">${escapeHtml(store.authError)}</p><button class="button button-dark" type="submit">Send for review ↗</button></form>`);
      return;
    }
    if (mode === "forgot-password") {
      openModal(`<p class="eyebrow">BACK TO YOUR GOOD FINDS</p><h2>Reset your password.</h2><form class="login-form" data-form="auth-reset-request"><label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><p id="auth-feedback" class="auth-feedback" role="status">${escapeHtml(store.authError)}</p><button class="button button-dark" type="submit">Send reset link</button></form><button class="text-button" data-action="auth-mode" data-mode="sign-in">Back to sign in</button>`);
      return;
    }
    if (mode === "reset-password") {
      openModal(`<p class="eyebrow">A FRESH START</p><h2>Choose a new password.</h2><form class="login-form" data-form="auth-password-update"><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><p id="auth-feedback" class="auth-feedback" role="status">${escapeHtml(store.authError)}</p><button class="button button-dark" type="submit">Update password</button></form>`);
      return;
    }
    const signingUp = mode === "sign-up";
    openModal(`<p class="eyebrow">YOUR ZENVORA SPACE</p><h2>${signingUp ? "Join the good-find community." : "Come on in."}</h2><p>${signingUp ? "Create a customer account. Vendor access is requested and reviewed separately." : "Sign in to see your saved finds and account."}</p><form class="login-form" data-form="${signingUp ? "auth-sign-up" : "auth-sign-in"}">${signingUp ? `<label>Your name<input name="display_name" required maxlength="80" autocomplete="name" placeholder="Your name"></label>` : ""}<label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Password<input name="password" type="password" minlength="8" required autocomplete="${signingUp ? "new-password" : "current-password"}" placeholder="At least 8 characters"></label><p class="auth-feedback" id="auth-feedback" role="status">${escapeHtml(store.authError)}</p><button class="button button-dark" type="submit">${signingUp ? "Create customer account" : "Sign in"} ↗</button></form>${signingUp ? `<button class="text-button" data-action="auth-mode" data-mode="sign-in">Already have an account? Sign in</button>` : `<button class="text-button" data-action="auth-mode" data-mode="forgot-password">Forgot password?</button><button class="text-button" data-action="auth-mode" data-mode="sign-up">Create an account</button>`}`);
    return;
  }
  const active = store.role;
  openModal(`<p class="eyebrow">YOUR ZENVORA SPACE</p><h2>${active ? `Demo ${escapeHtml(active)} session` : "Come on in."}</h2><div class="demo-warning">Demo identity only. This does not create an account, authenticate a user or grant real permissions. Supabase Auth is not configured.</div><form class="login-form" data-form="demo-login"><label>Demo role<select name="role"><option value="customer" ${active === "customer" ? "selected" : ""}>Customer preview</option><option value="vendor" ${active === "vendor" ? "selected" : ""}>Vendor workspace preview</option><option value="admin" ${active === "admin" ? "selected" : ""}>Admin workspace preview</option></select></label><button class="button button-dark" type="submit">${active ? "Switch demo view" : "Enter demo preview"}</button></form>${active ? `<button class="text-button" data-action="logout">Clear demo session</button><button class="text-button" data-action="workspace">Open workspace ↗</button>` : ""}`);
}

function renderWorkspace() {
  if (isSupabaseConfigured()) {
    renderAuthenticatedWorkspace();
    return;
  }
  const role = store.role || "customer";
  const vendor = role === "vendor";
  const admin = role === "admin";
  const heading = admin ? "Platform overview" : vendor ? "Your maker workspace" : "Your good-find account";
  const metrics = admin ? [["GROSS MERCHANDISE VALUE", "$28.4K"], ["DEMO ORDERS", store.orders.length], ["MAKERS", "24"], ["LIVE ROOMS", "3"]] : vendor ? [["DEMO SALES", "$1,284"], ["DEMO ORDERS", store.orders.length], ["YOUR FINDS", store.extraProducts.length], ["FOLLOWERS", "286"]] : [["DEMO ORDERS", store.orders.length], ["BAG ITEMS", store.cart.reduce((sum, line) => sum + line.quantity, 0)], ["SAVED FINDS", store.saved.length], ["FOLLOWING", "4 makers"]];
  const orderRows = store.orders.length ? `<ul>${store.orders.map(order => `<li>${escapeHtml(order.id)} · ${escapeHtml(order.date)} · ${money(order.total)} · ${escapeHtml(order.status)}</li>`).join("")}</ul>` : `<p>No local demo orders yet. Your next good find could change that.</p>`;
  document.querySelector("#workspace-content").innerHTML = `<div class="workspace-shell"><aside class="workspace-sidebar"><h2>${admin ? "Platform" : vendor ? "Maker" : "My space"}</h2><p>LOCAL DEMO WORKSPACE · NOT AN AUTHORIZED ACCOUNT</p><button class="text-button" data-action="account">Switch demo role</button></aside><div class="workspace-main"><p class="eyebrow">${admin ? "THE WHOLE PICTURE" : vendor ? "YOUR SMALL CORNER OF ZENVORA" : "A LITTLE HOUSEKEEPING"}</p><h1>${heading}</h1><p>Numbers and actions below are sample data or saved only in this browser.</p><div class="demo-warning">This workspace is a UI preview, not a secured dashboard. Configure Supabase Auth and RLS before using any role-specific data.</div><div class="metric-grid">${metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><b>${value}</b></div>`).join("")}</div><section class="workspace-panel"><h2>${admin ? "Moderation preview" : vendor ? "Your demo products" : "Your recent demo orders"}</h2>${admin ? `<p>Vendor approvals, reports, payouts and platform analytics require the secured Supabase schema and admin policies. No admin actions are enabled in this preview.</p><button class="button" data-action="route" data-route="shop">Browse public catalog</button>` : vendor ? `<form class="add-product-form" data-form="add-product"><label>Product name<input name="name" required maxlength="70" placeholder="A very good thing"></label><label>Price (USD)<input name="price" type="number" min="1" max="50000" required placeholder="48"></label><button class="button button-dark" type="submit">Add demo product +</button></form><p>Added products are saved to this browser only. Image uploads and publishing are not connected.</p><ul>${store.extraProducts.map(product => `<li>${escapeHtml(product.name)} · ${money(product.price)}</li>`).join("") || "No products added yet."}</ul>` : `<p>Recent demo orders</p>${orderRows}<h2>Saved finds</h2><ul>${store.saved.map(id => byId(id)?.name).filter(Boolean).map(name => `<li>${escapeHtml(name)}</li>`).join("") || "Nothing saved yet."}</ul>`}</section><button class="text-button" data-action="logout">Clear demo session</button></div></div>`;
}

function renderAuthenticatedWorkspace() {
  const profile = store.profile;
  if (!store.user || !profile) {
    document.querySelector("#workspace-content").innerHTML = `<div class="workspace-main"><p class="eyebrow">YOUR ZENVORA SPACE</p><h1>Sign in to continue.</h1><p>Your account area is available after Supabase verifies your session.</p><button class="button button-dark" data-action="account">Sign in ↗</button></div>`;
    return;
  }
  const role = profile.role;
  const navigation = {
    admin: [["Dashboard", "⌂"], ["Vendors", "♢"], ["Customers", "◉"], ["Products", "□"], ["Categories", "◇"], ["Orders", "▣"], ["Reels", "▷"], ["Live Streams", "◌"], ["Analytics", "◈"], ["Messages", "✦"]],
    vendor: [["Dashboard", "⌂"], ["Products", "□"], ["Orders", "▣"], ["Reels", "▷"], ["Live", "◌"], ["Messages", "✦"], ["Analytics", "◈"]],
    customer: [["Home", "⌂"], ["Products", "□"], ["Reels", "▷"], ["Live", "◌"], ["Cart", "▣"], ["Wishlist", "♡"], ["Orders", "▤"], ["Following", "♧"], ["AI Assistant", "✦"]]
  }[role] ?? [];
  const copy = {
    admin: { label: "ADMIN DASHBOARD", heading: "Platform overview", title: "Marketplace operations", body: "Manage vendors, customers, products, orders, moderation and platform analytics from the administrator workspace." },
    vendor: { label: "VENDOR DASHBOARD", heading: "Your maker workspace", title: "Your shop at a glance", body: "Manage your products, orders, Reels, live shopping and vendor performance." },
    customer: { label: "CUSTOMER DASHBOARD", heading: "Your good-find account", title: "Your shopping space", body: "Browse products, manage your bag and wishlist, follow vendors, and track your orders." }
  }[role];
  document.querySelector("#workspace-content").innerHTML = `<div class="workspace-shell"><aside class="workspace-sidebar"><div class="workspace-brand"><span class="workspace-brand-mark">Z</span><span>ZENVORA</span></div><div class="workspace-group"><span class="workspace-label">WORKSPACE</span><nav aria-label="${escapeHtml(role)} navigation">${navigation.map(([item, icon], index) => `<button class="workspace-nav-item ${index === 0 ? "is-active" : ""}" type="button"><span class="workspace-nav-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(item)}</span></button>`).join("")}</nav></div><div class="workspace-group workspace-account"><span class="workspace-label">ACCOUNT</span><button class="workspace-nav-item" type="button" data-action="account"><span class="workspace-nav-icon" aria-hidden="true">◉</span><span>Profile</span></button><button class="workspace-nav-item" type="button" data-action="account"><span class="workspace-nav-icon" aria-hidden="true">⚙</span><span>Settings</span></button><button class="workspace-nav-item" type="button" data-action="logout"><span class="workspace-nav-icon" aria-hidden="true">↪</span><span>Logout</span></button></div></aside><div class="workspace-main"><p class="eyebrow">${copy.label}</p><h1>${copy.heading}</h1><p>Signed in as ${escapeHtml(store.user.email ?? "")}</p><div class="metric-grid"><div class="metric"><span>ROLE</span><b>${escapeHtml(role.toUpperCase())}</b></div><div class="metric"><span>SESSION</span><b>VERIFIED</b></div><div class="metric"><span>ACCESS</span><b>PRIVATE</b></div></div><section class="workspace-panel"><h2>${copy.title}</h2><p>${copy.body}</p><p class="auth-feedback" role="status">Access is granted from the authenticated user's public.profiles role.</p></section></div></div>`;
}

async function refreshAuthenticatedUser(user) {
  const requestEpoch = ++authEpoch;
  store.user = user;
  store.profile = null;
  store.vendorProfile = null;
  if (!user) {
    store.cart = store.guestCart;
    store.saved = store.guestSaved;
    store.cartId = null;
    store.wishlistId = null;
    store.commerceError = "";
    store.authReady = true;
    renderAccountButton();
    renderCartCount();
    renderProducts();
    const pendingRoute = store.pendingRoute ?? (isDashboardRoute(store.route) ? store.route : null);
    if (pendingRoute) {
      store.pendingRoute = null;
      navigate(pendingRoute, false);
    }
    return;
  }
  try {
    const client = await getSupabase();
    if (requestEpoch !== authEpoch) return;
    await loadSupabaseCatalog(client);
    if (requestEpoch !== authEpoch) return;
    const { data: profile, error } = await client.from("profiles").select("id,role").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (requestEpoch !== authEpoch) return;
    store.profile = profile;
    if (profile) {
      const { data: vendorProfile, error: vendorError } = await client.from("vendor_profiles").select("id,shop_name,slug,status,bio").eq("user_id", user.id).maybeSingle();
      if (vendorError) throw vendorError;
      if (requestEpoch !== authEpoch) return;
      store.vendorProfile = vendorProfile;
    }
    if (profile?.role === "customer") await refreshCustomerCommerce(client, user.id, requestEpoch);
    else {
      store.cart = [];
      store.saved = [];
      store.cartId = null;
      store.wishlistId = null;
      renderCartCount();
      renderProducts();
    }
  } catch (error) {
    if (requestEpoch !== authEpoch) return;
    console.error("Unable to load the signed-in profile", error);
    store.authError = "We could not load your account details. Check the Supabase profile trigger and RLS policies.";
  } finally {
    if (requestEpoch !== authEpoch) return;
    store.authReady = true;
    renderAccountButton();
    if (store.pendingRoute) {
      const pendingRoute = store.pendingRoute;
      store.pendingRoute = null;
      navigate(pendingRoute, false);
    } else if (isDashboardRoute(store.route)) {
      renderWorkspace();
    }
  }
}

async function loadSupabaseCatalog(clientPromise) {
  if (!supabaseEnabled) return;
  if (catalogLoadPromise) return catalogLoadPromise;
  catalogLoadPromise = (async () => {
    store.catalogState = "loading";
    store.catalogPreview = false;
    renderProducts();
    try {
      const client = clientPromise ?? await getSupabase();
      const catalog = await fetchCatalog(client);
      store.catalogCategories = catalog.categories;
      store.catalogProducts = catalog.products;
      store.catalogState = "ready";
      store.catalogPreview = false;
      store.catalogError = "";
    } catch (error) {
      console.error("Catalog load failed", error);
      store.catalogCategories = categories;
      store.catalogProducts = demoCatalog;
      store.catalogState = "preview";
      store.catalogPreview = true;
      store.catalogError = "The connected catalog is unavailable. Sample products use a local demo bag and wishlist; checkout will not take payment or ship goods.";
      store.cart = store.previewCart;
      store.saved = store.previewSaved;
      store.orders = store.previewOrders;
      store.cartId = null;
      store.wishlistId = null;
      renderCartCount();
    }
    renderProducts();
  })().finally(() => { catalogLoadPromise = null; });
  return catalogLoadPromise;
}

function renderAccountButton() {
  const button = document.querySelector(".account-button");
  if (!button) return;
  button.textContent = isSupabaseConfigured() && store.user ? "MY SPACE" : "ACCOUNT";
  button.setAttribute("aria-label", isSupabaseConfigured() && store.user ? "Open my account" : "Open account");
}

async function initializeAuth() {
  if (!isSupabaseConfigured()) return;
  try {
    const client = await getSupabase();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    await refreshAuthenticatedUser(session?.user ?? null);
    const { data: { subscription } } = client.auth.onAuthStateChange((event, sessionState) => {
      setTimeout(async () => {
        await refreshAuthenticatedUser(sessionState?.user ?? null);
        if (event === "SIGNED_IN" && store.profile) window.location.replace(dashboardUrl(store.profile.role));
        if (event === "PASSWORD_RECOVERY") openAccount("reset-password");
      }, 0);
    });
    store.authSubscription = subscription;
  } catch (error) {
    console.error("Supabase Auth initialization failed", error);
    store.authReady = true;
    store.authError = "Supabase Auth is unavailable. Check the project URL and publishable key.";
    renderAccountButton();
  }
}

async function submitAuthForm(form) {
  const client = await getSupabase();
  const values = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  setAuthError("");
  try {
    if (form.dataset.form === "auth-sign-up") {
      const { data, error } = await client.auth.signUp({
        email: String(values.get("email")).trim(),
        password: String(values.get("password")),
        options: { data: { display_name: String(values.get("display_name")).trim() } }
      });
      if (error) throw error;
      if (data.session) {
        await refreshAuthenticatedUser(data.user);
        document.querySelector("#modal-root").innerHTML = "";
        window.location.replace(dashboardUrl(store.profile?.role ?? "customer"));
        showToast("Customer account created and signed in.");
      } else {
        setAuthError("Check your email to confirm your account, then sign in. New accounts start as customers.");
        if (button) button.disabled = false;
      }
    } else if (form.dataset.form === "auth-sign-in") {
      const { data, error } = await client.auth.signInWithPassword({ email: String(values.get("email")).trim(), password: String(values.get("password")) });
      if (error) throw error;
      await refreshAuthenticatedUser(data.user);
      document.querySelector("#modal-root").innerHTML = "";
      window.location.replace(dashboardUrl(store.profile?.role ?? "customer"));
    } else if (form.dataset.form === "auth-reset-request") {
      const redirectTo = `${location.origin}${location.pathname}#reset-password`;
      const { error } = await client.auth.resetPasswordForEmail(String(values.get("email")).trim(), { redirectTo });
      if (error) throw error;
      setAuthError("If the address is registered, a password reset link is on its way.");
      if (button) button.disabled = false;
    } else if (form.dataset.form === "auth-password-update") {
      const { error } = await client.auth.updateUser({ password: String(values.get("password")) });
      if (error) throw error;
      document.querySelector("#modal-root").innerHTML = "";
      showToast("Password updated.");
    } else if (form.dataset.form === "vendor-application") {
      if (!store.user || store.profile?.role !== "customer") throw new Error("Sign in with a customer account to apply for a shop.");
      const application = {
        user_id: store.user.id,
        shop_name: String(values.get("shop_name")).trim(),
        slug: String(values.get("slug")).trim().toLowerCase(),
        bio: String(values.get("bio")).trim(),
        status: "pending"
      };
      const { data, error } = await client.from("vendor_profiles").insert(application).select("id,shop_name,slug,status,bio").single();
      if (error) throw error;
      store.vendorProfile = data;
      document.querySelector("#modal-root").innerHTML = "";
      navigate("workspace", false);
      showToast("Vendor application sent for review.");
    }
  } catch (error) {
    console.error("Account action failed", error);
    const message = error?.message?.includes("duplicate key") || error?.code === "23505"
      ? "That shop URL is already in use. Choose another."
      : error?.message?.includes("Invalid login credentials")
        ? "That email and password combination was not recognized."
        : error?.message?.includes("already registered")
          ? "An account with this email already exists. Try signing in."
          : error?.message?.includes("Failed to fetch")
            ? "Could not reach Supabase. Check the project URL and your connection."
            : "That request could not be completed. Check the details and try again.";
    setAuthError(message);
    if (button) button.disabled = false;
  }
}

function navigate(route, focus = true) {
  const requestedRole = dashboardRoles[route];
  if (requestedRole && isSupabaseConfigured() && !store.authReady) {
    store.pendingRoute = route;
    return;
  }
  if (requestedRole && isSupabaseConfigured() && (!store.user || !store.profile)) {
    showToast("Sign in to open your account.");
    openAccount();
    return;
  }
  if (isDashboardRoute(route) && isSupabaseConfigured()) {
    const actualRole = store.profile?.role;
    if (!actualRole) {
      showToast("Your account role could not be verified.");
      openAccount();
      return;
    }
    if (requestedRole && actualRole !== requestedRole) {
      showToast(`Access denied. Opening your ${actualRole} dashboard.`);
      route = dashboardRouteForRole(actualRole);
    } else if (route === "workspace") {
      route = dashboardRouteForRole(actualRole);
    }
  }
  if (!document.querySelector(`[data-view="${route}"]`) && !isDashboardRoute(route)) route = "home";
  store.route = route;
  document.querySelectorAll(".view").forEach(view => { view.hidden = view.dataset.view !== route && !(isDashboardRoute(route) && view.dataset.view === "workspace"); });
  document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("is-active", link.dataset.route === route || (isDashboardRoute(route) && link.dataset.route === "home")));
  if (isDashboardRoute(route)) renderWorkspace();
  if (route === "shop") renderProducts();
  if (focus) document.querySelector("#app").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", `#${route}`);
}

async function search(query) {
  closeSearchSuggestions();
  store.query = query.trim();
  store.category = "All";
  navigate("shop", false);
  renderProducts();
  if (!store.query) return;
  if (isSupabaseConfigured()) {
    try {
      const client = await getSupabase();
      const { data, error } = await client.functions.invoke("ai-search", { body: { query: store.query } });
      if (error) throw error;
      if (data?.products) {
        const matchedProducts = mapSearchProducts(data.products, store.catalogCategories);
        document.querySelector("#shop-products").innerHTML = matchedProducts.map(productCard).join("");
        document.querySelector("#shop-empty").hidden = matchedProducts.length > 0;
        return;
      }
    } catch (error) {
      console.warn("Smart search unavailable; showing local catalog matches.", error);
      showToast("Smart search is offline. Showing local catalog matches.");
    }
  }
}

function openLive(roomId) {
  const room = store.liveStreams.find(item => item.id === roomId) ?? liveRooms.find(item => item.id === roomId);
  if (!room) return;
  const product = room.pinnedProduct ?? byId(room.product) ?? demoCatalog.find(item => item.id === room.product);
  if (supabaseEnabled && !room.isDemo && !room.videoUrl) {
    openModal(`<div class="live-dialog"><div class="live-stage">${room.provider === "livekit" ? `<div class="live-stage-placeholder">LiveKit room: ${escapeHtml(room.provider_room_id ?? "pending")}</div>` : `<div class="live-stage-placeholder">Live video is not configured for this stream.</div>`}<span class="live-stage-label">${escapeHtml(room.provider ?? "VIDEO PROVIDER").toUpperCase()} ROOM</span></div><div><p class="eyebrow">${escapeHtml(room.maker)} · ${room.viewers} VIEWERS</p><h2>${escapeHtml(room.title)}</h2><p>Stream metadata is live in Supabase. A LiveKit or Agora token function is required before this browser can join the video room.</p>${product ? `<div class="pinned-product"><strong>PINNED FIND</strong><br>${escapeHtml(product.name)} · ${money(product.price)}<button class="text-button" data-action="product" data-id="${escapeHtml(product.id)}">Shop this find ↗</button></div>` : ""}<p class="auth-feedback" role="status">Live chat and reactions will be available after the video provider connection is configured.</p></div></div>`);
    return;
  }
  openModal(`<div class="live-dialog"><div class="live-stage">${room.videoUrl ? `<video src="${escapeHtml(room.videoUrl)}" poster="${escapeHtml(room.image)}" muted autoplay loop playsinline controls preload="metadata"></video>` : `<img src="${escapeHtml(room.image)}" alt="${escapeHtml(product.name)}">`}<span class="live-stage-label">${room.isDemo ? "FASHION LIVE · DEMO ROOM" : "DEMO ROOM · NO VIDEO STREAM"}</span><div class="pinned-product"><strong>PINNED FIND</strong><br>${escapeHtml(product.name)} · ${money(product.price)}<button class="text-button" data-action="product" data-id="${escapeHtml(product.id)}">Shop this find ↗</button></div></div><div><p class="eyebrow">${escapeHtml(room.maker)} · ${room.viewers} VIEWERS</p><h2>${escapeHtml(room.title)}</h2><p>${room.videoUrl ? "Looped fashion video and local demo chat. Camera, microphone and live broadcasting are not connected." : "Product preview and local demo chat. Camera, microphone and live broadcasting are not connected."}</p><div class="chat-box" id="chat-box"><p><strong>Studio team:</strong> Welcome in. Ask us about this find.</p><p><strong>June:</strong> Can you tell me more about the materials?</p></div><form class="live-chat-form" data-form="chat"><input name="message" maxlength="240" required placeholder="Say hello in the demo chat" aria-label="Chat message"><button type="submit">Send</button></form><div class="dialog-actions"><button class="button" data-action="react">♥ Send a heart</button><button class="button button-dark" data-action="product" data-id="${escapeHtml(product.id)}">Shop pinned find ↗</button></div></div></div>`);
}

async function openOrders() {
  if (supabaseEnabled && !store.catalogPreview && !store.user) return openAccount("sign-in");
  if (supabaseEnabled && !store.catalogPreview) {
    try {
      const client = await getSupabase();
      let rows;
      if (store.profile?.role === "vendor" && store.vendorProfile?.id) {
        const { data, error } = await client.from("order_items")
          .select("id,order_id,product_name,quantity,unit_price,created_at")
          .eq("vendor_id", store.vendorProfile.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        rows = (data ?? []).map(item => `<li>${escapeHtml(item.product_name)} · ${item.quantity} × ${money(Number(item.unit_price))} · ${escapeHtml(item.order_id)}</li>`).join("");
      } else {
        const { data, error } = await client.from("orders")
          .select("id,order_number,status,currency,total,created_at,order_items(product_name,quantity,unit_price)")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        rows = (data ?? []).map(order => `<li><strong>${escapeHtml(order.order_number)}</strong> · ${escapeHtml(order.status)} · ${money(Number(order.total))}<ul>${(order.order_items ?? []).map(item => `<li>${escapeHtml(item.product_name)} · ${item.quantity} × ${money(Number(item.unit_price))}</li>`).join("")}</ul></li>`).join("");
      }
      openModal(`<p class="eyebrow">YOUR PURCHASES</p><h2>Orders</h2>${rows ? `<ul>${rows}</ul>` : "<p>No orders found for this account yet.</p>"}`);
    } catch (error) {
      console.error("Order history load failed", error);
      openModal(`<p class="eyebrow">YOUR PURCHASES</p><h2>Orders</h2><p class="auth-feedback" role="status">Order history could not be loaded. Check the orders table and your account read policy.</p><button class="button button-dark" data-action="reload-orders">Retry ↻</button>`);
    }
    return;
  }
  const rows = store.orders.map(order => `<li>${escapeHtml(order.id)} · ${escapeHtml(order.date)} · ${money(order.total)} · ${escapeHtml(order.status)}</li>`).join("");
  const content = rows ? `<p>${store.catalogPreview ? "Local preview orders only." : "Browser-only demo order history."}</p><ul>${rows}</ul>` : "<p>No demo orders yet. Browse the catalog when you are ready.</p>";
  openModal(`<p class="eyebrow">YOUR PURCHASES</p><h2>Orders</h2>${content}<button class="button button-dark" data-action="route" data-route="shop">Browse products ↗</button>`);
}

function openCategories() {
  const names = [...new Set(store.catalogCategories.map(category => category.name))];
  const items = names.map(name => `<li><button class="text-button" data-action="category" data-category="${escapeHtml(name)}">${escapeHtml(name)} · Browse finds ↗</button></li>`).join("");
  openModal(`<p class="eyebrow">SHOP THE EDIT</p><h2>Categories</h2><ul>${items || "<li>No categories available yet.</li>"}</ul>`);
}

function openFollowing() {
  const makers = [...new Set([...store.following, ...allProducts().map(product => product.vendor)])];
  const rows = makers.map(maker => {
    const following = store.following.includes(maker);
    return `<li><span>${escapeHtml(maker)}</span><button class="text-button" data-action="follow" data-vendor="${escapeHtml(maker)}">${following ? "Following · Unfollow" : "Follow maker +"}</button></li>`;
  }).join("");
  openModal(`<p class="eyebrow">MAKERS YOU LIKE</p><h2>Following</h2><p>Demo follows are saved in this browser.</p><ul class="maker-follow-list">${rows}</ul>`);
}

function openAssistant() {
  openModal(`<p class="eyebrow">A LITTLE HELP FINDING</p><h2>AI Assistant</h2><form class="login-form" data-form="workspace-search"><label>What are you looking for?<input name="query" required maxlength="160" placeholder="A lightweight bag for weekends"></label><button class="button button-dark" type="submit">Search finds ↗</button></form><p class="auth-feedback" role="status">Uses smart search when available, with catalog search as a fallback.</p>`);
}

function openSettings() {
  openModal(`<p class="eyebrow">YOUR PREFERENCES</p><h2>Settings</h2><form class="login-form" data-form="workspace-settings"><label>Video previews<select name="autoplayVideos"><option value="on" ${store.settings.autoplayVideos ? "selected" : ""}>Autoplay when muted</option><option value="off" ${store.settings.autoplayVideos ? "" : "selected"}>Play manually</option></select></label><button class="button button-dark" type="submit">Save settings</button></form><p class="auth-feedback" role="status">Preferences are saved in this browser.</p>`);
}

function openMakerDirectory() {
  const makers = [...new Set(allProducts().map(product => product.vendor))];
  const rows = makers.map(maker => `<li><button class="text-button" data-action="maker-products" data-vendor="${escapeHtml(maker)}">${escapeHtml(maker)} · Browse finds ↗</button></li>`).join("");
  openModal(`<p class="eyebrow">INDEPENDENT MAKERS</p><h2>Vendors</h2><ul>${rows}</ul>`);
}

function openCustomers() {
  const customers = ["Avery Ellis", "Jordan Kim", "Morgan Reed", "Sam Rivera"];
  openModal(`<p class="eyebrow">DEMO DIRECTORY</p><h2>Customers</h2><p>Sample names only. No customer account data is connected.</p><ul>${customers.map(name => `<li>${name} <span class="product-vendor">DEMO CUSTOMER</span></li>`).join("")}</ul>`);
}

function openAnalytics() {
  const makers = new Set(allProducts().map(product => product.vendor));
  openModal(`<p class="eyebrow">DEMO SNAPSHOT</p><h2>Analytics</h2><div class="metric-grid"><div class="metric"><span>PRODUCTS</span><b>${allProducts().length}</b></div><div class="metric"><span>MAKERS</span><b>${makers.size}</b></div><div class="metric"><span>REELS</span><b>${store.reels.length}</b></div><div class="metric"><span>LIVE ROOMS</span><b>${store.liveStreams.length}</b></div></div><p class="auth-feedback" role="status">Sample counts only. Connected marketplace analytics are not configured.</p>`);
}

function toggleFollowing(maker) {
  store.following = store.following.includes(maker)
    ? store.following.filter(item => item !== maker)
    : [...store.following, maker];
  save("zenvora-demo-following", store.following);
  openFollowing();
}

function handleWorkspaceNavigation(control) {
  const label = control.querySelectorAll("span")[1]?.textContent.trim();
  if (!label) return;
  if (label === "Home") return navigate("home");
  if (label === "Products") return navigate("shop");
  if (label === "Categories") return openCategories();
  if (label === "Reels") return navigate("reels");
  if (["Live", "Live Streams"].includes(label)) return navigate("live");
  if (label === "Cart") return openCart();
  if (label === "Orders") { void openOrders(); return; }
  if (label === "Following") return openFollowing();
  if (label === "AI Assistant") return openAssistant();
  if (label === "Vendors") return openMakerDirectory();
  if (label === "Customers") return openCustomers();
  if (label === "Analytics") return openAnalytics();
  if (label === "Messages") {
    navigate("live");
    if (store.liveStreams[0]) openLive(store.liveStreams[0].id);
    return;
  }
  if (label === "Wishlist") {
    const saved = store.saved.map(id => byId(id)).filter(Boolean);
    const items = saved.map(product => `<p><button class="text-button" data-action="product" data-id="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${money(product.price)}</button></p>`).join("");
    openModal(`<p class="eyebrow">YOUR GOOD FINDS</p><h2>Wishlist</h2>${items || "<p>No saved finds yet. Save a product to see it here.</p>"}<button class="button button-dark" data-action="route" data-route="shop">Browse products ↗</button>`);
    return;
  }
  if (label === "Dashboard") return navigate(dashboardRouteForRole(store.profile?.role ?? store.role ?? "customer"));
  openModal(`<p class="eyebrow">${escapeHtml(label.toUpperCase())}</p><h2>${escapeHtml(label)}</h2><p>This dashboard section is not connected yet. No account or marketplace data has been changed.</p><button class="button button-dark" data-action="close">Back to dashboard</button>`);
}

document.addEventListener("click", event => {
  const control = event.target.closest("[data-action], [data-route], .workspace-nav-item");
  if (!control) {
    if (!event.target.closest(".search-wrap")) closeSearchSuggestions();
    return;
  }
  if (!control.closest(".search-wrap")) closeSearchSuggestions();
  if (control.classList.contains("workspace-nav-item") && !control.dataset.action) {
    handleWorkspaceNavigation(control);
    return;
  }
  if (control.dataset.route) { navigate(control.dataset.route); return; }
  const { action, id, category } = control.dataset;
  if (action === "route") navigate(control.dataset.route);
  if (action === "product") { closeSearchSuggestions(); openProduct(id); }
  if (action === "search-all") { void search(control.dataset.query); return; }
  if (action === "add") void addToCart(id);
  if (action === "cart") openCart();
  if (action === "account") {
    const itemLabel = control.querySelectorAll("span")[1]?.textContent.trim();
    if (itemLabel === "Settings") openSettings();
    else openAccount();
  }
  if (action === "auth-mode") openAccount(control.dataset.mode);
  if (action === "category") { store.category = category; document.querySelector("#modal-root").innerHTML = ""; navigate("shop"); renderProducts(); }
  if (action === "filter") { store.category = category; renderProducts(); }
  if (action === "save") {
    void setSavedProduct(id);
  }
  if (action === "reload-catalog") void loadSupabaseCatalog();
  if (action === "reload-media") void loadSupabaseMedia();
  if (action === "reload-orders") void openOrders();
  if (action === "payment-status") void handleCheckoutReturn();
  if (action === "follow") { toggleFollowing(control.dataset.vendor); return; }
  if (action === "maker-products") {
    store.query = control.dataset.vendor;
    store.category = "All";
    document.querySelector("#modal-root").innerHTML = "";
    navigate("shop");
    renderProducts();
    return;
  }
  if (action === "save-local-old") {
    store.saved = store.saved.includes(id) ? store.saved.filter(value => value !== id) : [...store.saved, id];
    save("zenvora-saved", store.saved);
    renderProducts();
    renderReels();
    showToast(store.saved.includes(id) ? "Saved to your finds." : "Removed from saved finds.");
  }
  if (action === "reload-catalog") void loadSupabaseCatalog();
  if (action === "like") {
    store.likes = store.likes.includes(id) ? store.likes.filter(value => value !== id) : [...store.likes, id];
    save("zenvora-likes", store.likes);
    renderReels();
  }
  if (action === "share") {
    const url = `${location.origin}${location.pathname}#reels`;
    if (navigator.share) navigator.share({ title: "A good find on Zenvora", url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => showToast("Reel link copied."), () => showToast("Share this page with a friend."));
  }
  if (action === "live") openLive(id);
  if (action === "close" || (action === "overlay" && event.target === control)) document.querySelector("#modal-root").innerHTML = "";
  if (action === "quantity") {
    const product = byId(store.selectedProduct);
    store.quantity = Math.max(1, Math.min(product.stock, store.quantity + Number(control.dataset.delta)));
    document.querySelector("#quantity-value").textContent = store.quantity;
  }
  if (action === "modal-add") { void addToCart(store.selectedProduct, store.quantity); document.querySelector("#modal-root").innerHTML = ""; }
  if (action === "quantity-cart") void updateCartQuantity(id, Number(control.dataset.delta));
  if (action === "remove") void removeCartProduct(id);
  if (action === "checkout") openCheckout();
  if (action === "logout") {
    if (isSupabaseConfigured()) {
      getSupabase().then(client => client.auth.signOut()).then(({ error }) => {
        if (error) throw error;
        document.querySelector("#modal-root").innerHTML = "";
        window.location.replace("login.html");
      }).catch(error => { console.error("Sign-out failed", error); showToast("We could not sign you out. Try again."); });
    } else {
      store.role = "";
      save("zenvora-demo-role", "");
      document.querySelector("#modal-root").innerHTML = "";
      navigate("home");
      showToast("Demo session cleared.");
    }
  }
  if (action === "workspace") {
    document.querySelector("#modal-root").innerHTML = "";
    if (store.profile?.role) window.location.replace(dashboardUrl(store.profile.role));
    else navigate("workspace");
  }
  if (action === "react") showToast("♥ Reaction added to this local demo.");
});

document.addEventListener("submit", async event => {
  const form = event.target;
  if (form.dataset.form === "workspace-search") {
    event.preventDefault();
    const query = String(new FormData(form).get("query") ?? "").trim();
    document.querySelector("#modal-root").innerHTML = "";
    await search(query);
    return;
  }
  if (form.dataset.form === "workspace-settings") {
    event.preventDefault();
    store.settings.autoplayVideos = new FormData(form).get("autoplayVideos") === "on";
    save("zenvora-dashboard-settings", store.settings);
    document.querySelector("#modal-root").innerHTML = "";
    ["#home-reels", "#reels-feed", "#home-live", "#live-rooms"]
      .map(selector => document.querySelector(selector))
      .forEach(observeMediaPlayback);
    showToast("Video preference saved.");
    return;
  }
  if (["auth-sign-in", "auth-sign-up", "auth-reset-request", "auth-password-update", "vendor-application"].includes(form.dataset.form)) {
    event.preventDefault();
    await submitAuthForm(form);
    return;
  }
  if (form.dataset.form === "checkout") { event.preventDefault(); completeDemoOrder(form); }
  if (form.dataset.form === "secure-checkout") {
    event.preventDefault();
    await beginSecureCheckout(form);
  }
  if (form.dataset.form === "demo-login") {
    event.preventDefault();
    store.role = new FormData(form).get("role");
    save("zenvora-demo-role", store.role);
    document.querySelector("#modal-root").innerHTML = "";
    navigate("workspace");
    showToast(`Demo ${store.role} preview opened.`);
  }
  if (form.dataset.form === "add-product") {
    event.preventDefault();
    const values = new FormData(form);
    const name = String(values.get("name")).trim();
    const price = Number(values.get("price"));
    if (!name || !Number.isFinite(price) || price <= 0) return showToast("Enter a product name and valid price.");
    store.extraProducts.push({ id: `demo-${Date.now()}`, name, vendor: "Your demo shop", category: "Objects", price, rating: 5, badge: "LOCAL DEMO", image: "https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=700&q=82", description: "A locally created demo product.", color: "Maker's choice", stock: 5 });
    save("zenvora-extra-products", store.extraProducts);
    renderWorkspace();
    showToast("Demo product saved in this browser.");
  }
  if (form.dataset.form === "chat") {
    event.preventDefault();
    const input = form.elements.message;
    const message = input.value.trim();
    if (!message) return;
    const box = document.querySelector("#chat-box");
    const line = document.createElement("p");
    const name = document.createElement("strong");
    name.textContent = "You (demo): ";
    line.append(name, document.createTextNode(message));
    box.append(line);
    box.scrollTop = box.scrollHeight;
    input.value = "";
  }
});

document.querySelector("#search-input").addEventListener("input", event => renderSearchSuggestions(event.currentTarget.value));
document.querySelector("#search-input").addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); void search(event.currentTarget.value); }
  if (event.key === "ArrowDown") {
    const firstSuggestion = document.querySelector("#search-suggestions [data-action]");
    if (firstSuggestion) { event.preventDefault(); firstSuggestion.focus(); }
  }
  if (event.key === "Escape") closeSearchSuggestions();
});
document.querySelector("#sort-select").addEventListener("change", event => { store.sort = event.target.value; renderProducts(); });
document.addEventListener("keydown", event => {
  if (event.key === "Escape") document.querySelector("#modal-root").innerHTML = "";
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); document.querySelector("#search-input").focus(); }
});

renderProducts();
renderReels();
renderLive();
renderCartCount();
void loadSupabaseCatalog();
void loadSupabaseMedia();
void initializeAuth().then(handleCheckoutReturn);
const requestedRoute = location.hash.slice(1);
if (["shop", "reels", "live", "workspace", ...Object.keys(dashboardRoles)].includes(requestedRoute)) navigate(requestedRoute, false);