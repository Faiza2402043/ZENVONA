import assert from "node:assert/strict";
import { fetchCatalog } from "../js/catalog-service.js";
import { demoCatalog, liveRooms, reels } from "../js/data.js";

const category = { id: "cat-style", parent_id: null, name: "Style", slug: "style", sort_order: 1 };
const product = {
  id: "product-1",
  name: "Test Sneaker",
  description: "A useful shoe",
  price: "84.00",
  compare_at_price: null,
  average_rating: "4.8",
  review_count: 3,
  category_id: category.id,
  brand: "Maker",
  status: "active",
  category,
  vendor: { shop_name: "Good Maker" },
  images: [],
  variants: [{ id: "variant-1", name: "Standard", is_active: true, inventory: [{ quantity: 7 }] }]
};

const client = {
  from(table) {
    const query = {
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return this; },
      then(resolve, reject) {
        return Promise.resolve({ data: table === "categories" ? [category] : [product], error: null }).then(resolve, reject);
      }
    };
    return query;
  }
};

const result = await fetchCatalog(client);
assert.equal(result.categories.length, 1);
assert.equal(result.products.length, 1);
assert.equal(result.products[0].id, "product-1");
assert.equal(result.products[0].price, 84);
assert.equal(result.products[0].stock, 7);
assert.equal(result.products[0].category, "Style");
assert.equal(result.products[0].vendor, "Good Maker");
assert.equal(result.products[0].variants[0].id, "variant-1");
assert.equal(demoCatalog.length, 60);
assert.equal(new Set(demoCatalog.map(item => item.id)).size, 60);
assert.equal(reels.length, 12);
assert.equal(new Set(reels.map(reel => reel.product)).size, reels.length);
assert.equal(new Set(reels.map(reel => reel.image)).size, reels.length);
assert.equal(new Set(reels.map(reel => reel.videoUrl)).size, reels.length);
assert.ok(reels.every(reel => reel.videoUrl?.endsWith(".mp4")));
assert.ok(reels.every(reel => reel.isDemo && demoCatalog.some(item => item.id === reel.product && item.image === reel.image)));
assert.equal(liveRooms.length, 2);
assert.equal(new Set(liveRooms.map(room => room.product)).size, liveRooms.length);
assert.equal(new Set(liveRooms.map(room => room.image)).size, liveRooms.length);
assert.equal(new Set(liveRooms.map(room => room.videoUrl)).size, liveRooms.length);
assert.ok(liveRooms.every(room => room.isDemo && room.videoUrl?.endsWith(".mp4") && room.image && demoCatalog.some(item => item.id === room.product && item.image === room.image)));
assert.ok(liveRooms.some(room => room.product === "p1"));
assert.ok(liveRooms.some(room => room.product === "demo-style-8"));
assert.ok(liveRooms.every(room => /dress|sneaker/i.test(room.title)));

console.log("Catalog normalization and demo content passed.");