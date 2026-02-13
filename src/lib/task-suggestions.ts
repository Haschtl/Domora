export interface TaskLibrarySuggestion {
  key: string;
  title: {
    de: string;
    en: string;
  };
  description: {
    de: string;
    en: string;
  };
  tags: {
    de: string[];
    en: string[];
  };
  frequencyDays: number;
  effortPimpers: number;
}

const taskLibrary: TaskLibrarySuggestion[] = [
  {
    key: "clean_bathroom",
    title: { de: "Bad putzen", en: "Clean bathroom" },
    description: { de: "Waschbecken, Dusche, WC und Spiegel reinigen.", en: "Clean sink, shower, toilet and mirrors." },
    tags: { de: ["bad", "putzen"], en: ["bathroom", "cleaning"] },
    frequencyDays: 7,
    effortPimpers: 3
  },
  {
    key: "vacuum_common_area",
    title: { de: "Gemeinschaftsbereich saugen", en: "Vacuum common area" },
    description: { de: "Flur, Wohnzimmer und Küche saugen.", en: "Vacuum hallway, living room and kitchen." },
    tags: { de: ["putzen", "boden"], en: ["cleaning", "floor"] },
    frequencyDays: 7,
    effortPimpers: 2
  },
  {
    key: "take_out_trash",
    title: { de: "Müll rausbringen", en: "Take out trash" },
    description: { de: "Restmüll und Bio rausbringen, Tüten ersetzen.", en: "Take out waste and replace bags." },
    tags: { de: ["muell"], en: ["trash"] },
    frequencyDays: 3,
    effortPimpers: 1
  },
  {
    key: "clean_kitchen",
    title: { de: "Küche aufräumen", en: "Tidy kitchen" },
    description: { de: "Arbeitsflächen, Herd und Spüle sauber machen.", en: "Clean counters, stove and sink." },
    tags: { de: ["kueche", "putzen"], en: ["kitchen", "cleaning"] },
    frequencyDays: 2,
    effortPimpers: 2
  },
  {
    key: "mop_floor",
    title: { de: "Boden wischen", en: "Mop floor" },
    description: { de: "Küche, Bad und Flur feucht wischen.", en: "Mop kitchen, bathroom and hallway." },
    tags: { de: ["boden", "putzen"], en: ["floor", "cleaning"] },
    frequencyDays: 7,
    effortPimpers: 2
  },
  {
    key: "water_plants",
    title: { de: "Pflanzen gießen", en: "Water plants" },
    description: { de: "Alle WG-Pflanzen gießen und prüfen.", en: "Water and check all shared plants." },
    tags: { de: ["pflanzen"], en: ["plants"] },
    frequencyDays: 4,
    effortPimpers: 1
  },
  {
    key: "dishwasher",
    title: { de: "Spülmaschine ausräumen", en: "Empty dishwasher" },
    description: { de: "Sauberes Geschirr einräumen.", en: "Put clean dishes away." },
    tags: { de: ["kueche"], en: ["kitchen"] },
    frequencyDays: 2,
    effortPimpers: 1
  },
  {
    key: "fridge_check",
    title: { de: "Kühlschrank checken", en: "Check fridge" },
    description: { de: "Abgelaufene Lebensmittel entsorgen.", en: "Remove expired food." },
    tags: { de: ["kueche", "lebensmittel"], en: ["kitchen", "groceries"] },
    frequencyDays: 7,
    effortPimpers: 1
  }
];

export const getTaskLibrarySuggestions = (language: string) =>
  taskLibrary.map((entry) => ({
    key: entry.key,
    title: language.startsWith("de") ? entry.title.de : entry.title.en,
    description: language.startsWith("de") ? entry.description.de : entry.description.en,
    tags: language.startsWith("de") ? entry.tags.de : entry.tags.en,
    frequencyDays: entry.frequencyDays,
    effortPimpers: entry.effortPimpers
  }));
