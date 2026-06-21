const applyReplacementCase = (original: string, replacement: string) => {
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original[0] && original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
};

const phraseReplacements: Array<[RegExp, string]> = [
  [/\bsession wird geladen\b/gi, "dein Login-Film lädt noch kurz"],
  [/\berfolgreich eingeloggt\b/gi, "dick-dope eingeloggt, Brudi"],
  [/\baccount erstellt\b/gi, "Account is saft am Start"],
  [/\bzahlung abgeschlossen\b/gi, "Cashflow dick-dope durch"],
  [/\bzahlung abgebrochen\b/gi, "Zahlung is komplett auseinandergeflogen"],
  [/\bzur finanzübersicht\b/gi, "zur Cash-Übersicht zurück"],
  [/\bpush-benachrichtigungen aktiviert\b/gi, "Push ist jetzt saft am Start"],
  [/\bpush-benachrichtigungen wurden nicht erlaubt\b/gi, "Push wurde komplett weggedribbelt"],
  [/\bhaushaltsdaten konnten nicht geladen werden\b/gi, "WG-Daten sind komplett abgekackt"],
  [/\bbitte netzwerk, dns oder supabase-erreichbarkeit prüfen\b/gi, "check mal Netz, DNS und ob Supabase noch atmet"],
  [/\bunbekannter fehler\b/gi, "kompletter Atzen-Absturz"],
  [/\bmehr laden\b/gi, "mehr Stoff, rein da"],
  [/\bpush-test\b/gi, "Push-Probealarm"],
  [/\baufgaben erledigt\b/gi, "Missions erledigt"],
  [/\bheute fällige aufgaben\b/gi, "heute offene Missions"],
  [/\bfällige aufgaben für dich\b/gi, "deine offenen Missions"],
  [/\beinkaufsliste\b/gi, "Shopski-Liste"],
  [/\bfinanzübersicht\b/gi, "Cash-Übersicht"],
  [/\bmit google weiter\b/gi, "mit Google rein da"],
  [/\bbitte bestätige die e-mail\b/gi, "bestätig kurz die Mail, Bro"],
  [/\baktivieren\b/gi, "rein da"],
  [/\bgestartet\b/gi, "rein da geschickt"],
];

const wordReplacements: Array<[RegExp, string]> = [
  [/\bbitte\b/gi, "ey bitte mal"],
  [/\bnicht\b/gi, "nich"],
  [/\bkeine\b/gi, "keine"],
  [/\bkeinen\b/gi, "keinen"],
  [/\bkein\b/gi, "kein"],
  [/\bund\b/gi, "und"],
  [/\bist\b/gi, "is"],
  [/\bsind\b/gi, "sind"],
  [/\bhat\b/gi, "hat"],
  [/\bwerden\b/gi, "werden"],
  [/\bwird\b/gi, "wird"],
  [/\bwir\b/gi, "wir"],
  [/\bich\b/gi, "isch"],
  [/\bdu\b/gi, "du"],
  [/\bdir\b/gi, "dir"],
  [/\bdein\b/gi, "dein"],
  [/\bdeine\b/gi, "deine"],
  [/\bdeiner\b/gi, "deiner"],
  [/\bdeinem\b/gi, "deinem"],
  [/\beuer\b/gi, "euer"],
  [/\beure\b/gi, "eure"],
  [/\bjetzt\b/gi, "jetzt"],
  [/\bgerade\b/gi, "grad"],
  [/\bsofort\b/gi, "direkt"],
  [/\bwirklich\b/gi, "komplett"],
  [/\bsehr\b/gi, "maximal"],
  [/\bgeil\b/gi, "saft"],
  [/\bgut\b/gi, "dick-dope"],
  [/\bnatürlich\b/gi, "safe"],
  [/\bschon\b/gi, "schon"],
  [/\bmal\b/gi, "mal"],
  [/\bspäter\b/gi, "später"],
  [/\bzurück\b/gi, "zurück"],
  [/\bweiter\b/gi, "weiter"],
  [/\bfertig\b/gi, "durch"],
  [/\blöschen\b/gi, "wegflexen"],
  [/\bschließen\b/gi, "zumachen"],
  [/\bbestätigen\b/gi, "abnicken"],
  [/\babbrechen\b/gi, "abbrechen"],
  [/\bhinzufügen\b/gi, "reinorgeln"],
  [/\bbearbeiten\b/gi, "umbauen"],
  [/\böffnen\b/gi, "aufmachen"],
  [/\bsenden\b/gi, "rausschicken"],
  [/\banzeigen\b/gi, "zeigen"],
  [/\berstellen\b/gi, "bauen"],
  [/\beinstellungen\b/gi, "Settings"],
  [/\bfehler\b/gi, "Absturz"],
  [/\blädt\b/gi, "lädt"],
  [/\bspeichern\b/gi, "sichern"],
  [/\blogout\b/gi, "Ausloggen"],
  [/\blogin\b/gi, "Einloggen"],
  [/\bpasswort\b/gi, "Passwort"],
  [/\be-mail\b/gi, "Mail"],
  [/\bbenachrichtigungen\b/gi, "Pushes"],
  [/\baufgaben\b/gi, "Missions"],
  [/\baufgabe\b/gi, "Mission"],
  [/\bfinanzen\b/gi, "Cash"],
  [/\beinkaufen\b/gi, "shoppen"],
  [/\beinkaufsliste\b/gi, "Shopski-Liste"],
  [/\bkalender\b/gi, "Kalender"],
  [/\bwährung\b/gi, "Currency"],
  [/\burlaub\b/gi, "Chill-Modus"],
  [/\bprofil\b/gi, "Atzen-Profil"],
  [/\bhaushalt\b/gi, "Atzen-WG"],
  [/\bmitglieder\b/gi, "Atzen"],
  [/\bmitglied\b/gi, "Atze"],
  [/\bverlauf\b/gi, "Film"],
  [/\bhistorie\b/gi, "Film"],
  [/\bversion\b/gi, "Build"],
  [/\bstart\b/gi, "Rein da"],
];

export const atzenizeText = (value: string) => {
  if (!value.trim()) return value;
  if (/https?:\/\/|www\.|@/.test(value)) return value;

  let next = value;

  for (const [pattern, replacement] of phraseReplacements) {
    next = next.replace(pattern, (match) => applyReplacementCase(match, replacement));
  }

  for (const [pattern, replacement] of wordReplacements) {
    next = next.replace(pattern, (match) => applyReplacementCase(match, replacement));
  }

  next = next
    .replace(/\bWG\b/g, "Atzen-WG")
    .replace(/\bDashboard\b/g, "Babo-Board")
    .replace(/\bHome\b/g, "Block")
    .replace(/\bStatistik\b/g, "Flex-Stats")
    .replace(/\bHistorie\b/g, "Was-war-Phase")
    .replace(/\bÜbersicht\b/g, "Überblick")
    .replace(/\bArchiv\b/g, "Oldschool-Archiv")
    .replace(/\bVerträge\b/g, "Dauerdeals")
    .replace(/\bBucket\b/g, "Bock-Liste")
    .replace(/\bProfil\b/g, "Atzen-Profil")
    .replace(/\bMitglied\b/g, "Atze")
    .replace(/\bMitglieder\b/g, "Atzen")
    .replace(/\bThema\b/g, "Film")
    .replace(/\bTheme\b/g, "Vibe")
    .replace(/\bHell\b/g, "Daymode")
    .replace(/\bDunkel\b/g, "Nightmode")
    .replace(/\bSystem\b/g, "System");

  if (next.length > 24) {
    next = next.replace(/\.$/, ", saft, Diggi.");
    next = next.replace(/\?$/, ", Rein da oder was?");
  }

  if (next.length > 36 && !/[!?]$/.test(next)) {
    next = `${next} Rein da.`;
  }

  return next;
};

export const atzenizeTranslations = <T>(value: T): T => {
  if (typeof value === "string") return atzenizeText(value) as T;
  if (Array.isArray(value)) return value.map((entry) => atzenizeTranslations(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, atzenizeTranslations(entry)])
    ) as T;
  }
  return value;
};
