type CategoryDefinition = {
  id: string;
  labels: { de: string; en: string };
  keywords: string[];
};

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: "groceries",
    labels: { de: "Lebensmittel", en: "Groceries" },
    keywords: [
      "lebensmittel",
      "supermarkt",
      "obst",
      "gemuese",
      "gemüse",
      "brot",
      "milch",
      "kaese",
      "käse",
      "fleisch",
      "fisch",
      "rewe",
      "edeka",
      "aldi",
      "lidl",
      "kaufland",
      "penny",
      "netto",
      "spar",
      "billa",
      "migros",
      "coop",
      "tesco",
      "carrefour",
      "whole foods",
      "trader joe",
      "walmart",
      "target",
      "costco"
    ]
  },
  {
    id: "dining",
    labels: { de: "Essen & Trinken", en: "Dining" },
    keywords: [
      "restaurant",
      "imbiss",
      "lieferando",
      "wolt",
      "uber eats",
      "takeaway",
      "take away",
      "pizza",
      "döner",
      "doener",
      "burger",
      "cafe",
      "café",
      "bar",
      "bier",
      "wein"
    ]
  },
  {
    id: "household",
    labels: { de: "Haushalt", en: "Household" },
    keywords: [
      "haushalt",
      "küche",
      "kueche",
      "bad",
      "toilettenpapier",
      "kuechenrolle",
      "küchenrolle",
      "zewa",
      "müllbeutel",
      "muellbeutel",
      "müll",
      "muell",
      "papier",
      "folie",
      "tüte",
      "tuete",
      "beutel",
      "lappen"
    ]
  },
  {
    id: "cleaning",
    labels: { de: "Reinigung", en: "Cleaning" },
    keywords: [
      "putz",
      "reiniger",
      "reinigung",
      "wischen",
      "mopp",
      "bürste",
      "buerste",
      "schwamm",
      "spülmittel",
      "spuelmittel",
      "kloreiniger",
      "desinfektion"
    ]
  },
  {
    id: "drugstore",
    labels: { de: "Drogerie", en: "Toiletries" },
    keywords: [
      "drogerie",
      "dm",
      "rossmann",
      "müller",
      "mueller",
      "shampoo",
      "seife",
      "deo",
      "deodorant",
      "zahnpasta",
      "creme",
      "rasierer",
      "tampon",
      "binden"
    ]
  },
  {
    id: "utilities",
    labels: { de: "Nebenkosten", en: "Utilities" },
    keywords: [
      "strom",
      "gas",
      "wasser",
      "heizung",
      "energie",
      "nebenkosten",
      "abfall",
      "müllabfuhr",
      "muellabfuhr"
    ]
  },
  {
    id: "rent",
    labels: { de: "Miete", en: "Rent" },
    keywords: ["miete", "kaltmiete", "warmmiete", "vermieter", "hausverwaltung"]
  },
  {
    id: "internet",
    labels: { de: "Internet", en: "Internet" },
    keywords: ["internet", "wlan", "wifi", "dsl", "kabel", "router", "vodafone", "telekom", "o2", "1und1", "freenet"]
  },
  {
    id: "mobility",
    labels: { de: "Mobilität", en: "Transport" },
    keywords: [
      "benzin",
      "tanken",
      "diesel",
      "park",
      "parkhaus",
      "ticket",
      "bahn",
      "db",
      "flixbus",
      "uber",
      "bolt",
      "bus",
      "tram",
      "ubahn",
      "u-bahn",
      "sbahn",
      "s-bahn",
      "carsharing",
      "mvg",
      "bvg"
    ]
  },
  {
    id: "subscriptions",
    labels: { de: "Abos", en: "Subscriptions" },
    keywords: [
      "abo",
      "subscription",
      "netflix",
      "spotify",
      "disney",
      "prime",
      "youtube premium",
      "icloud",
      "dropbox",
      "google one"
    ]
  },
  {
    id: "health",
    labels: { de: "Gesundheit", en: "Health" },
    keywords: ["arzt", "apotheke", "medikament", "rezept", "vitamin", "kranken", "klinikum"]
  },
  {
    id: "furniture",
    labels: { de: "Möbel & Baumarkt", en: "Home & DIY" },
    keywords: [
      "möbel",
      "moebel",
      "ikea",
      "sofa",
      "lampe",
      "schrank",
      "bauhaus",
      "obi",
      "hornbach",
      "farbe",
      "bohrer",
      "werkzeug",
      "baumarkt"
    ]
  },
  {
    id: "electronics",
    labels: { de: "Elektronik", en: "Electronics" },
    keywords: ["elektronik", "handy", "laptop", "kabel", "mediamarkt", "media markt", "saturn", "apple", "samsung"]
  },
  {
    id: "pets",
    labels: { de: "Haustiere", en: "Pets" },
    keywords: ["hund", "katze", "tier", "tierarzt", "futter", "haustier"]
  },
  {
    id: "travel",
    labels: { de: "Reisen", en: "Travel" },
    keywords: ["hotel", "flug", "airbnb", "reise", "booking", "bahncard"]
  },
  {
    id: "gifts",
    labels: { de: "Geschenke", en: "Gifts" },
    keywords: ["geschenk", "geburtstag", "party", "überraschung", "ueberraschung"]
  }
];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const scoreCategory = (normalized: string, keywords: string[]) => {
  let score = 0;
  keywords.forEach((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) return;
    if (normalized.includes(` ${normalizedKeyword} `) || normalized.startsWith(`${normalizedKeyword} `) || normalized.endsWith(` ${normalizedKeyword}`) || normalized === normalizedKeyword) {
      score += normalizedKeyword.length >= 6 ? 3 : 2;
    } else if (normalized.includes(normalizedKeyword)) {
      score += normalizedKeyword.length >= 6 ? 2 : 1;
    }
  });
  return score;
};

export const suggestCategoryLabel = (text: string, locale: string | undefined) => {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  let best: { def: CategoryDefinition; score: number } | null = null;
  CATEGORY_DEFINITIONS.forEach((def) => {
    const score = scoreCategory(normalized, def.keywords);
    if (score <= 0) return;
    if (!best || score > best.score) {
      best = { def, score };
    }
  });
  if (!best || best.score < 2) return null;
  const useGerman = !locale || locale.toLowerCase().startsWith("de");
  return useGerman ? best.def.labels.de : best.def.labels.en;
};
