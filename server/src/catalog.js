// Products and mandis the platform trades. The frontend loads this from GET /api/market/catalog.

export const PRODUCTS = [
  { key: "potato", name: "Potato", pack: "20 kg bag", kgPerBag: 20, base: 420 },
  { key: "onion", name: "Onion", pack: "20 kg bag", kgPerBag: 20, base: 560 },
  { key: "garlic", name: "Garlic", pack: "5 kg bag", kgPerBag: 5, base: 680 },
];

// f = typical price level of the city compared to the national base (used only to seed demo rates)
export const CITIES = [
  { name: "Ahmedabad", state: "Gujarat", mandi: "Jamalpur APMC", f: 1.02 },
  { name: "Rajkot", state: "Gujarat", mandi: "Rajkot APMC", f: 0.99 },
  { name: "Surat", state: "Gujarat", mandi: "Sardar Market APMC", f: 1.07 },
  { name: "Vadodara", state: "Gujarat", mandi: "Vadodara APMC", f: 1.01 },
  { name: "Deesa", state: "Gujarat", mandi: "Deesa APMC", f: 0.8 },
  { name: "Mumbai", state: "Maharashtra", mandi: "Vashi APMC", f: 1.15 },
  { name: "Pune", state: "Maharashtra", mandi: "Gultekdi Market Yard", f: 0.98 },
  { name: "Nashik", state: "Maharashtra", mandi: "Lasalgaon APMC", f: 0.95 },
  { name: "Delhi", state: "Delhi", mandi: "Azadpur Mandi", f: 1.11 },
  { name: "Agra", state: "Uttar Pradesh", mandi: "Agra Mandi", f: 0.83 },
  { name: "Lucknow", state: "Uttar Pradesh", mandi: "Dubagga Mandi", f: 0.93 },
  { name: "Indore", state: "Madhya Pradesh", mandi: "Devi Ahilya Bai Holkar Mandi", f: 0.93 },
  { name: "Mandsaur", state: "Madhya Pradesh", mandi: "Mandsaur APMC", f: 0.96 },
  { name: "Jaipur", state: "Rajasthan", mandi: "Muhana Mandi", f: 1.04 },
  { name: "Kolkata", state: "West Bengal", mandi: "Posta Bazar", f: 0.92 },
  { name: "Bengaluru", state: "Karnataka", mandi: "Yeshwanthpur APMC", f: 1.0 },
  { name: "Hyderabad", state: "Telangana", mandi: "Bowenpally Market", f: 1.12 },
  { name: "Chennai", state: "Tamil Nadu", mandi: "Koyambedu Market", f: 1.08 },
];

export const productByKey = (key) => PRODUCTS.find((p) => p.key === key);
export const cityByName = (name) => CITIES.find((c) => c.name === name);

export const publicCatalog = () => ({
  products: PRODUCTS.map(({ base, ...p }) => p),
  cities: CITIES.map(({ f, ...c }) => c),
});
