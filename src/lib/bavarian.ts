const applyReplacementCase = (original: string, replacement: string) => {
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original[0] && original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
};

const phraseReplacements: Array<[RegExp, string]> = [
  [/\bbitte bestätige die e-mail\b/gi, "bittschee bestätig de E-Post, gell"],
  [/\bsession wird geladen\b/gi, "dei Sitzung werd grod zamgschraubt"],
  [/\berfolgreich eingeloggt\b/gi, "sauba, du bist drin wia a junga God"],
  [/\baccount erstellt\b/gi, "dei Konto is jetzad zamgschustert"],
  [/\bzahlung abgeschlossen\b/gi, "de Zahlerei is sauber durchganga"],
  [/\bzahlung abgebrochen\b/gi, "de Zahlerei host aufgschmissn"],
  [/\bzur finanzübersicht\b/gi, "zruck zum Geld-Gschwerl"],
  [/\bpush-benachrichtigungen aktiviert\b/gi, "de Schubser-Meldinga san jetzad scharf"],
  [/\bpush-benachrichtigungen wurden nicht erlaubt\b/gi, "de Schubser-Meldinga host abgwatscht"],
  [/\bhaushaltsdaten konnten nicht geladen werden\b/gi, "de Wohngmoa-Daten ham si ned aufdrängt"],
  [/\bbitte netzwerk, dns oder supabase-erreichbarkeit prüfen\b/gi, "schau da bittschee des Netz, des DNS und den Supabase-Krempel o"],
  [/\bunbekannter fehler\b/gi, "irgends a rechter Schmarrn"],
  [/\bmehr laden\b/gi, "no a Schaufel draufladn"],
  [/\bpush-test\b/gi, "Schubser-Probealarm"],
  [/\baufgaben erledigt\b/gi, "Aufgabn abgschafft"],
  [/\bheute fällige aufgaben\b/gi, "de heit fällign Aufgabn"],
  [/\bfällige aufgaben für dich\b/gi, "de heit dir eigscheinktn Aufgabn"],
  [/\bshared flat\b/gi, "Wohngmoa"],
  [/\bhousehold\b/gi, "Wohngmoa"],
  [/\bsettings\b/gi, "Eistellunga"],
];

const wordReplacements: Array<[RegExp, string]> = [
  [/\bbitte\b/gi, "bittschee"],
  [/\bnicht\b/gi, "ned"],
  [/\bkeine\b/gi, "koane"],
  [/\bkeinen\b/gi, "koan"],
  [/\bkeinem\b/gi, "koam"],
  [/\bkeiner\b/gi, "koana"],
  [/\bkein\b/gi, "koa"],
  [/\bund\b/gi, "und aa"],
  [/\bist\b/gi, "is"],
  [/\bsind\b/gi, "san"],
  [/\bseid\b/gi, "seids"],
  [/\bhaben\b/gi, "ham"],
  [/\bhabt\b/gi, "habts"],
  [/\bhat\b/gi, "hod"],
  [/\bwerden\b/gi, "wern"],
  [/\bwird\b/gi, "werd"],
  [/\bwir\b/gi, "mia"],
  [/\bich\b/gi, "i"],
  [/\bihr\b/gi, "es"],
  [/\bmir\b/gi, "mia"],
  [/\bdir\b/gi, "dea"],
  [/\bdein\b/gi, "dei"],
  [/\bdeine\b/gi, "dei"],
  [/\bdeiner\b/gi, "deina"],
  [/\bdeinem\b/gi, "deim"],
  [/\beuer\b/gi, "eana"],
  [/\beure\b/gi, "eana"],
  [/\bjetzt\b/gi, "etz"],
  [/\bgerade\b/gi, "grod"],
  [/\bsofort\b/gi, "auf da Stell"],
  [/\bwirklich\b/gi, "narrisch wirklich"],
  [/\bsehr\b/gi, "sakrisch"],
  [/\bnatürlich\b/gi, "freili"],
  [/\bschon\b/gi, "eh scho"],
  [/\bmal\b/gi, "amoi"],
  [/\bzurück\b/gi, "zruck"],
  [/\bweiter\b/gi, "weida"],
  [/\bfertig\b/gi, "ferd"],
  [/\blöschen\b/gi, "wegschmeißn"],
  [/\bschließen\b/gi, "zumacha"],
  [/\bbestätigen\b/gi, "basst so"],
  [/\babbrechen\b/gi, "bleim lassn"],
  [/\bhinzufügen\b/gi, "dazua doa"],
  [/\bbearbeiten\b/gi, "herrichtn"],
  [/\böffnen\b/gi, "aufmacha"],
  [/\bsenden\b/gi, "losschicka"],
  [/\banzeigen\b/gi, "herzeign"],
  [/\berstellen\b/gi, "zamzimmern"],
  [/\beinstellungen\b/gi, "eistellunga"],
  [/\bfehler\b/gi, "schmarrn"],
  [/\blädt\b/gi, "ladt"],
  [/\bspeichern\b/gi, "sichern"],
  [/\blogout\b/gi, "ausloggn"],
  [/\blogin\b/gi, "Eineloggn"],
  [/\bpasswort\b/gi, "Kennwortl"],
  [/\be-mail\b/gi, "E-Post"],
  [/\bbenachrichtigungen\b/gi, "Meldinga"],
  [/\baufgaben\b/gi, "Aufgabn"],
  [/\baufgabe\b/gi, "Aufgab"],
  [/\bfinanzen\b/gi, "Geldzeigs"],
  [/\beinkaufen\b/gi, "Eikaffa"],
  [/\beinkaufsliste\b/gi, "Eikaffazettl"],
  [/\bkalender\b/gi, "Kalendarium"],
  [/\bversion\b/gi, "Standl"],
];

export const bavarianizeText = (value: string) => {
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
    .replace(/\bWG\b/g, "Wohngmoa")
    .replace(/\bDashboard\b/g, "Schaltzentrale")
    .replace(/\bHome\b/g, "Dahoam")
    .replace(/\bStatistik\b/g, "Zoidlwerk")
    .replace(/\bHistorie\b/g, "Gschichtn")
    .replace(/\bÜbersicht\b/g, "Überblickerl")
    .replace(/\bArchiv\b/g, "Oidazeigs-Ladl")
    .replace(/\bVerträge\b/g, "Papierkrom")
    .replace(/\bBucket\b/g, "Wunschkastl")
    .replace(/\bFinanzübersicht\b/g, "Geld-Gschwerl")
    .replace(/\bProfil\b/g, "Gfries")
    .replace(/\bMitglied\b/g, "Leit")
    .replace(/\bThema\b/g, "Gschichtl")
    .replace(/\bTheme\b/g, "Gwandl")
    .replace(/\bHell\b/g, "gleißad")
    .replace(/\bDunkel\b/g, "zappendusta")
    .replace(/\bSystem\b/g, "wias Kastl mog");

  if (next.length > 18) {
    next = next.replace(/\.$/, ", fei.");
    next = next.replace(/\?$/, ", odá?");
  }

  return next;
};

export const bavarianizeTranslations = <T>(value: T): T => {
  if (typeof value === "string") return bavarianizeText(value) as T;
  if (Array.isArray(value)) return value.map((entry) => bavarianizeTranslations(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, bavarianizeTranslations(entry)])
    ) as T;
  }
  return value;
};

export const mergeTranslationOverrides = <T extends Record<string, unknown>, U extends Record<string, unknown>>(
  base: T,
  overrides: U
): T & U => {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    if (
      current &&
      value &&
      typeof current === "object" &&
      typeof value === "object" &&
      !Array.isArray(current) &&
      !Array.isArray(value)
    ) {
      result[key] = mergeTranslationOverrides(
        current as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result as T & U;
};
