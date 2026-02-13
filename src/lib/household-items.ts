export interface HouseholdItemSuggestion {
  key: string;
  tags: {
    de: string[];
    en: string[];
  };
  title: {
    de: string;
    en: string;
  };
}

const householdItems: HouseholdItemSuggestion[] = [
  {
    key: "toilet_paper",
    title: { de: "Toilettenpapier", en: "Toilet paper" },
    tags: { de: ["bad", "hygiene"], en: ["bathroom", "hygiene"] }
  },
  {
    key: "kitchen_roll",
    title: { de: "Kuechenrolle", en: "Kitchen roll" },
    tags: { de: ["kueche", "papier"], en: ["kitchen", "paper"] }
  },
  { key: "dish_soap", title: { de: "Spuelmittel", en: "Dish soap" }, tags: { de: ["kueche", "putzen"], en: ["kitchen", "cleaning"] } },
  { key: "garbage_bags", title: { de: "Muellbeutel", en: "Trash bags" }, tags: { de: ["muell", "haushalt"], en: ["trash", "household"] } },
  { key: "all_purpose_cleaner", title: { de: "Allzweckreiniger", en: "All-purpose cleaner" }, tags: { de: ["putzen"], en: ["cleaning"] } },
  { key: "bathroom_cleaner", title: { de: "Badreiniger", en: "Bathroom cleaner" }, tags: { de: ["bad", "putzen"], en: ["bathroom", "cleaning"] } },
  { key: "glass_cleaner", title: { de: "Glasreiniger", en: "Glass cleaner" }, tags: { de: ["putzen", "fenster"], en: ["cleaning", "windows"] } },
  { key: "laundry_detergent", title: { de: "Waschmittel", en: "Laundry detergent" }, tags: { de: ["waesche"], en: ["laundry"] } },
  { key: "fabric_softener", title: { de: "Weichspueler", en: "Fabric softener" }, tags: { de: ["waesche"], en: ["laundry"] } },
  { key: "sponges", title: { de: "Schwaemme", en: "Sponges" }, tags: { de: ["kueche", "putzen"], en: ["kitchen", "cleaning"] } },
  { key: "trash_can_paper", title: { de: "Backpapier", en: "Baking paper" }, tags: { de: ["kueche"], en: ["kitchen"] } },
  { key: "aluminum_foil", title: { de: "Alufolie", en: "Aluminum foil" }, tags: { de: ["kueche"], en: ["kitchen"] } },
  { key: "cling_film", title: { de: "Frischhaltefolie", en: "Cling film" }, tags: { de: ["kueche"], en: ["kitchen"] } },
  { key: "hand_soap", title: { de: "Handseife", en: "Hand soap" }, tags: { de: ["bad", "hygiene"], en: ["bathroom", "hygiene"] } },
  { key: "shower_gel", title: { de: "Duschgel", en: "Shower gel" }, tags: { de: ["bad", "hygiene"], en: ["bathroom", "hygiene"] } },
  { key: "shampoo", title: { de: "Shampoo", en: "Shampoo" }, tags: { de: ["bad", "hygiene"], en: ["bathroom", "hygiene"] } },
  { key: "toothpaste", title: { de: "Zahnpasta", en: "Toothpaste" }, tags: { de: ["bad", "hygiene"], en: ["bathroom", "hygiene"] } },
  { key: "coffee", title: { de: "Kaffee", en: "Coffee" }, tags: { de: ["kueche", "getraenke"], en: ["kitchen", "drinks"] } },
  { key: "milk", title: { de: "Milch", en: "Milk" }, tags: { de: ["kueche", "lebensmittel"], en: ["kitchen", "groceries"] } },
  { key: "oat_milk", title: { de: "Hafermilch", en: "Oat milk" }, tags: { de: ["kueche", "lebensmittel"], en: ["kitchen", "groceries"] } },
  { key: "salt", title: { de: "Salz", en: "Salt" }, tags: { de: ["kueche", "lebensmittel"], en: ["kitchen", "groceries"] } },
  { key: "pepper", title: { de: "Pfeffer", en: "Pepper" }, tags: { de: ["kueche", "lebensmittel"], en: ["kitchen", "groceries"] } },
  { key: "olive_oil", title: { de: "Olivenoel", en: "Olive oil" }, tags: { de: ["kueche", "lebensmittel"], en: ["kitchen", "groceries"] } },
  { key: "dishwasher_tabs", title: { de: "Spuelmaschinentabs", en: "Dishwasher tabs" }, tags: { de: ["kueche"], en: ["kitchen"] } },
  { key: "rinse_aid", title: { de: "Klarspueler", en: "Rinse aid" }, tags: { de: ["kueche"], en: ["kitchen"] } }
];

export const getHouseholdItemSuggestions = (language: string) =>
  householdItems.map((entry) => ({
    key: entry.key,
    title: language.startsWith("de") ? entry.title.de : entry.title.en,
    tags: language.startsWith("de") ? entry.tags.de : entry.tags.en
  }));
