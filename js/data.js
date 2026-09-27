const photo = (id, width = 700) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=82`;

export const categories = [
  { name: "Style", image: photo("photo-1490481651871-ab68de25d43d") },
  { name: "Home", image: photo("photo-1616486338812-3dadae4b4ace") },
  { name: "Beauty", image: photo("photo-1608248543803-ba4f8c70ae0b") },
  { name: "Tech", image: photo("photo-1505740420928-5e560c06d30e") },
  { name: "Outdoors", image: photo("photo-1472396961693-142e6e269027") },
  { name: "Objects", image: photo("photo-1490312278390-ab64016e0aa9") }
];

export const products = [
  { id: "p1", name: "Cloudline Everyday Sneaker", vendor: "Common Ground", category: "Style", price: 84, rating: 4.9, badge: "COMMUNITY FAVORITE", image: photo("photo-1542291026-7eec264c27ff"), description: "A soft-footed everyday sneaker designed for long walks, late trains and whatever comes next.", color: "Poppy / Chalk", stock: 18 },
  { id: "p2", name: "Sunday Market Tote", vendor: "Good Measure Studio", category: "Style", price: 42, rating: 4.8, badge: "MADE TO LAST", image: photo("photo-1590874103328-eac38a683ce7"), description: "A sturdy, considered carryall cut from heavyweight organic cotton with room for the whole day.", color: "Natural", stock: 26 },
  { id: "p3", name: "Soft Landing Ceramic Set", vendor: "Morrow Objects", category: "Home", price: 68, rating: 4.9, badge: "SMALL BATCH", image: photo("photo-1490312278390-ab64016e0aa9"), description: "Hand-finished stoneware for slow mornings. Each glaze is a little different, by design.", color: "Oat / Sea salt", stock: 9 },
  { id: "p4", name: "Daybreak Face Oil", vendor: "Field Notes Skin", category: "Beauty", price: 36, rating: 4.7, badge: "MAKER PICK", image: photo("photo-1608248543803-ba4f8c70ae0b"), description: "A light, botanical face oil with meadowfoam and rosehip for a comfortable, dewy finish.", color: "30 ml", stock: 31 },
  { id: "p5", name: "Little Light Table Lamp", vendor: "Morrow Objects", category: "Home", price: 119, rating: 4.8, badge: "JUST FOUND", image: photo("photo-1507473885765-e6ed057f782c"), description: "A warm, portable glow in a compact powder-coated silhouette. USB-C rechargeable.", color: "Marigold", stock: 7 },
  { id: "p6", name: "Studio Headphones No. 2", vendor: "Kindred Audio", category: "Tech", price: 149, rating: 4.9, badge: "MAKER PICK", image: photo("photo-1505740420928-5e560c06d30e"), description: "Clear, easy-listening sound and all-day comfort, tuned by a small independent audio team.", color: "Ink", stock: 14 },
  { id: "p7", name: "Weekend Field Bottle", vendor: "Outside In", category: "Outdoors", price: 34, rating: 4.6, badge: "GOOD OUTSIDE", image: photo("photo-1602143407151-7111542de6e8"), description: "A double-wall stainless bottle that keeps your coffee hot and your cold water cold.", color: "Sage", stock: 42 },
  { id: "p8", name: "Slow Sunday Knit", vendor: "Common Ground", category: "Style", price: 128, rating: 4.8, badge: "SMALL BATCH", image: photo("photo-1576566588028-4147f3842f27"), description: "A softly structured cotton knit for open windows, good books and taking your time.", color: "Clementine", stock: 11 },
  { id: "p9", name: "Everyday Face Wash", vendor: "Field Notes Skin", category: "Beauty", price: 24, rating: 4.7, badge: "GENTLE BY DESIGN", image: photo("photo-1556229010-6c3f2c9ca5f8"), description: "A gentle, fragrance-free gel cleanser for a fresh start without the tight feeling.", color: "150 ml", stock: 35 },
  { id: "p10", name: "Sunday Stacking Tray", vendor: "Good Measure Studio", category: "Objects", price: 49, rating: 4.8, badge: "MADE BY HAND", image: photo("photo-1618221195710-dd6b41faaea6"), description: "A tactile catch-all in hand-cast Jesmonite, made in small batches in Bristol.", color: "Terracotta", stock: 16 },
  { id: "p11", name: "Trail Notes Daypack", vendor: "Outside In", category: "Outdoors", price: 96, rating: 4.7, badge: "FIELD TESTED", image: photo("photo-1553062407-98eeb64c6a62"), description: "A weather-ready 18L daypack with thoughtful pockets for the long way round.", color: "Moss", stock: 12 },
  { id: "p12", name: "Pocket Speaker Mini", vendor: "Kindred Audio", category: "Tech", price: 72, rating: 4.6, badge: "GOOD SOUND", image: photo("photo-1608043152269-423dbba4e7e1"), description: "A surprisingly full sound in a pocket-sized speaker, made for kitchen dancing.", color: "Butter", stock: 20 }
];

const demoProductNames = {
  Style: ["Ribbed Everyday Tee", "Weekender Canvas Cap", "Studio Linen Shirt", "Soft Form Crossbody", "Archive Leather Belt", "Everyday Slip-On", "Colorblock Wool Scarf", "Soft Sunday Midi Dress"],
  Home: ["Stackable Stoneware Mugs", "Ripple Glass Carafe", "Linen Table Runner", "Soft Glow Wall Sconce", "Handwoven Storage Basket", "Sculptural Candle Holder", "Modular Side Table", "Cotton Percale Throw"],
  Beauty: ["Cloudberry Hand Cream", "Mineral SPF Face Veil", "Botanical Shower Oil", "Night Garden Serum", "Gentle Scalp Rinse", "Lip Balm Trio", "Daily Body Polish", "Fig Leaf Deodorant"],
  Tech: ["Compact Film Camera", "Braided USB-C Cable", "Desk Speaker Pair", "Analog Alarm Clock", "Portable Reading Light", "Mechanical Keyboard", "Wireless Charging Stand", "Travel Power Bank"],
  Outdoors: ["Ridge Hike Socks", "Packable Rain Shell", "Camp Brew Kettle", "Trail Running Belt", "Recycled Day Blanket", "Climbing Chalk Bag", "Foldable Picnic Seat", "Lightweight Hammock"],
  Objects: ["Hand-poured Reed Diffuser", "Ceramic Incense Dish", "Brass Key Hook", "Handblown Bud Vase", "Reclaimed Wood Catchall", "Textured Planter Pot", "Woven Wall Hanging", "Enamel Pin Set"]
};

const demoProductImages = {
  Style: ["photo-1542291026-7eec264c27ff", "photo-1590874103328-eac38a683ce7", "photo-1576566588028-4147f3842f27", "photo-1490481651871-ab68de25d43d", "photo-1483985988355-763728e1935b", "photo-1529139574466-a303027c1d8b", "photo-1539109136881-3be0616acf4b", "photo-1551232864-3f0890e580d9"],
  Home: ["photo-1490312278390-ab64016e0aa9", "photo-1507473885765-e6ed057f782c", "photo-1618221195710-dd6b41faaea6", "photo-1616486338812-3dadae4b4ace", "photo-1600210492486-724fe5c67fb0", "photo-1513519245088-0e12902e5a38", "photo-1600607687939-ce8a6c25118c", "photo-1616486338812-3dadae4b4ace"],
  Beauty: ["photo-1608248543803-ba4f8c70ae0b", "photo-1556229010-6c3f2c9ca5f8", "photo-1598440947619-2c35fc9aa908", "photo-1611930022073-b7a4ba5fcccd", "photo-1556228720-195a672e8a03", "photo-1570172619644-dfd03ed5d881", "photo-1608248543803-ba4f8c70ae0b", "photo-1598440947619-2c35fc9aa908"],
  Tech: ["photo-1505740420928-5e560c06d30e", "photo-1608043152269-423dbba4e7e1", "photo-1498049794561-7780e7231661", "photo-1519389950473-47ba0277781c", "photo-1516321318423-f06f85e504b3", "photo-1523206489230-c012c64b2b48", "photo-1517336714731-489689fd1ca8", "photo-1598327105666-5b89351aff97"],
  Outdoors: ["photo-1602143407151-7111542de6e8", "photo-1472396961693-142e6e269027", "photo-1553062407-98eeb64c6a62", "photo-1500530855697-b586d89ba3ee", "photo-1470770841072-f978cf4d019e", "photo-1500534623283-312aade485b7", "photo-1441974231531-c6227db76b6e", "photo-1551632811-561732d1e306"],
  Objects: ["photo-1618221195710-dd6b41faaea6", "photo-1490312278390-ab64016e0aa9", "photo-1494438639946-1ebd1d20bf85", "photo-1586023492125-27b2c045efd7", "photo-1600210492486-724fe5c67fb0", "photo-1616486338812-3dadae4b4ace", "photo-1578500494198-246f612d3b3d", "photo-1618221195710-dd6b41faaea6"]
};

const demoMakers = {
  Style: ["Common Ground", "Good Measure Studio", "Sunday People"],
  Home: ["Morrow Objects", "Good Measure Studio", "Soft Corner Works"],
  Beauty: ["Field Notes Skin", "Daybreak Formulas", "Kindred Botanics"],
  Tech: ["Kindred Audio", "Good Signal Studio", "Small Hours Tech"],
  Outdoors: ["Outside In", "North Loop Supply", "Open Field Goods"],
  Objects: ["Morrow Objects", "Good Measure Studio", "Little Foundry"]
};

export const demoProducts = Object.entries(demoProductNames).flatMap(([category, names], categoryIndex) =>
  names.map((name, index) => {
    const vendor = demoMakers[category][index % demoMakers[category].length];
    return {
      id: `demo-${category.toLowerCase()}-${index + 1}`,
      name,
      vendor,
      category,
      price: 24 + categoryIndex * 11 + index * 7,
      rating: Number((4.5 + ((index * 3 + categoryIndex) % 5) / 10).toFixed(1)),
      badge: "DEMO FIND",
      image: photo(demoProductImages[category][index]),
      description: `${name} from ${vendor}, made to bring a thoughtful detail to the everyday.`,
      color: "Maker's choice",
      stock: 8 + ((index * 5 + categoryIndex) % 35)
    };
  })
);

export const demoCatalog = [...products, ...demoProducts];

const reelVideoByProductId = {
  p1: "https://videos.pexels.com/video-files/8738293/8738293-hd_720_1280_25fps.mp4",
  p2: "https://videos.pexels.com/video-files/9595337/9595337-uhd_4096_2160_25fps.mp4",
  p3: "https://videos.pexels.com/video-files/8903486/8903486-hd_1920_1080_30fps.mp4",
  p4: "https://videos.pexels.com/video-files/9474154/9474154-uhd_2160_3840_24fps.mp4",
  p5: "https://videos.pexels.com/video-files/4177952/4177952-hd_1920_1080_30fps.mp4",
  p6: "https://videos.pexels.com/video-files/8005694/8005694-uhd_2160_3840_25fps.mp4",
  p7: "https://videos.pexels.com/video-files/3755388/3755388-uhd_4096_2160_25fps.mp4",
  p8: "https://videos.pexels.com/video-files/12719018/12719018-hd_1080_1920_60fps.mp4",
  p9: "https://videos.pexels.com/video-files/6666360/6666360-uhd_2160_3744_30fps.mp4",
  p10: "https://videos.pexels.com/video-files/8165704/8165704-uhd_4096_2160_25fps.mp4",
  p11: "https://videos.pexels.com/video-files/5945469/5945469-uhd_3840_2160_25fps.mp4",
  p12: "https://videos.pexels.com/video-files/6177022/6177022-uhd_2160_4096_30fps.mp4",
  "demo-style-8": "https://videos.pexels.com/video-files/12719018/12719018-uhd_2160_3840_60fps.mp4"
};

export const reels = demoCatalog.slice(0, 12).map((product, index) => ({
  id: `demo-reel-${product.id}`,
  maker: product.vendor.toUpperCase(),
  title: `${product.name} · ${product.category} maker pick.`,
  product: product.id,
  image: product.image,
  videoUrl: reelVideoByProductId[product.id],
  isDemo: true,
  likes: 48 + ((index * 37) % 280)
}));

const dress = demoCatalog.find(item => item.id === "demo-style-8");
const sneaker = demoCatalog.find(item => item.id === "p1");

export const liveRooms = [
  {
    id: "demo-live-dress",
    maker: dress.vendor.toUpperCase(),
    title: `Dress styling room · ${dress.name}`,
    viewers: 42,
    image: dress.image,
    product: dress.id,
    videoUrl: reelVideoByProductId[dress.id],
    isDemo: true
  },
  {
    id: "demo-live-shoes",
    maker: sneaker.vendor.toUpperCase(),
    title: `Sneaker try-on room · ${sneaker.name}`,
    viewers: 36,
    image: sneaker.image,
    product: sneaker.id,
    videoUrl: reelVideoByProductId[sneaker.id],
    isDemo: true
  }
];