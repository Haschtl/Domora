const applyReplacementCase = (original: string, replacement: string) => {
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original[0] && original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
};

const protectInterpolationTokens = (value: string) => {
  const tokens: string[] = [];
  const text = value.replace(/\{\{[^}]+\}\}/g, (match) => {
    const token = `__I18N_TOKEN_${tokens.length}__`;
    tokens.push(match);
    return token;
  });

  return {
    text,
    restore: (next: string) =>
      tokens.reduce((result, token, index) => result.replace(`__I18N_TOKEN_${index}__`, token), next)
  };
};

const phraseReplacements: Array<[RegExp, string]> = [
  [/\bbitte bestätige die e-mail\b/gi, "будь ласка, підтвердь електронну пошту"],
  [/\bsession wird geladen\b/gi, "сеанс завантажується"],
  [/\berfolgreich eingeloggt\b/gi, "вхід виконано успішно"],
  [/\baccount erstellt\b/gi, "акаунт створено"],
  [/\bzahlung abgeschlossen\b/gi, "оплату завершено"],
  [/\bzahlung abgebrochen\b/gi, "оплату скасовано"],
  [/\bzur finanzübersicht\b/gi, "до фінансового огляду"],
  [/\bpush-benachrichtigungen aktiviert\b/gi, "push-сповіщення ввімкнено"],
  [/\bpush-benachrichtigungen wurden nicht erlaubt\b/gi, "push-сповіщення не дозволені"],
  [/\bhaushaltsdaten konnten nicht geladen werden\b/gi, "дані квартири не вдалося завантажити"],
  [/\bbitte netzwerk, dns oder supabase-erreichbarkeit prüfen\b/gi, "перевір мережу, DNS або доступність Supabase"],
  [/\bunbekannter fehler\b/gi, "невідома помилка"],
  [/\bmehr laden\b/gi, "завантажити ще"],
  [/\bpush-test\b/gi, "тест push"],
  [/\baufgaben erledigt\b/gi, "завдання виконано"],
  [/\bheute fällige aufgaben\b/gi, "завдання на сьогодні"],
  [/\bfällige aufgaben für dich\b/gi, "завдання для тебе"],
  [/\beinkaufsliste\b/gi, "список покупок"],
  [/\bfinanzübersicht\b/gi, "фінансовий огляд"],
];

const wordReplacements: Array<[RegExp, string]> = [
  [/\bbitte\b/gi, "будь ласка"],
  [/\bnicht\b/gi, "не"],
  [/\bkeine\b/gi, "немає"],
  [/\bkeinen\b/gi, "немає"],
  [/\bkein\b/gi, "немає"],
  [/\bund\b/gi, "і"],
  [/\bist\b/gi, "є"],
  [/\bsind\b/gi, "є"],
  [/\bhat\b/gi, "має"],
  [/\bwerden\b/gi, "будуть"],
  [/\bwird\b/gi, "буде"],
  [/\bwir\b/gi, "ми"],
  [/\bich\b/gi, "я"],
  [/\bdir\b/gi, "тобі"],
  [/\bdein\b/gi, "твій"],
  [/\bdeine\b/gi, "твоя"],
  [/\bjetzt\b/gi, "зараз"],
  [/\bgerade\b/gi, "зараз"],
  [/\bsofort\b/gi, "одразу"],
  [/\bwirklich\b/gi, "дійсно"],
  [/\bsehr\b/gi, "дуже"],
  [/\bnatürlich\b/gi, "звісно"],
  [/\bschon\b/gi, "вже"],
  [/\bmal\b/gi, "раз"],
  [/\bzurück\b/gi, "назад"],
  [/\bweiter\b/gi, "далі"],
  [/\bfertig\b/gi, "готово"],
  [/\blöschen\b/gi, "видалити"],
  [/\bschließen\b/gi, "закрити"],
  [/\bbestätigen\b/gi, "підтвердити"],
  [/\babbrechen\b/gi, "скасувати"],
  [/\bhinzufügen\b/gi, "додати"],
  [/\bbearbeiten\b/gi, "редагувати"],
  [/\böffnen\b/gi, "відкрити"],
  [/\bsenden\b/gi, "надіслати"],
  [/\banzeigen\b/gi, "показати"],
  [/\berstellen\b/gi, "створити"],
  [/\beinstellungen\b/gi, "налаштування"],
  [/\bfehler\b/gi, "помилка"],
  [/\blädt\b/gi, "завантажується"],
  [/\bspeichern\b/gi, "зберегти"],
  [/\blogout\b/gi, "вийти"],
  [/\blogin\b/gi, "увійти"],
  [/\bpasswort\b/gi, "пароль"],
  [/\be-mail\b/gi, "електронна пошта"],
  [/\bbenachrichtigungen\b/gi, "сповіщення"],
  [/\baufgaben\b/gi, "завдання"],
  [/\baufgabe\b/gi, "завдання"],
  [/\bfinanzen\b/gi, "фінанси"],
  [/\beinkaufen\b/gi, "покупки"],
  [/\beinkaufsliste\b/gi, "список покупок"],
  [/\bkalender\b/gi, "календар"],
  [/\bversion\b/gi, "версія"],
];

export const ukrainianizeText = (value: string) => {
  if (!value.trim()) return value;
  if (/https?:\/\/|www\.|@/.test(value)) return value;

  const protectedValue = protectInterpolationTokens(value);
  let next = protectedValue.text;

  for (const [pattern, replacement] of phraseReplacements) {
    next = next.replace(pattern, (match) => applyReplacementCase(match, replacement));
  }

  for (const [pattern, replacement] of wordReplacements) {
    next = next.replace(pattern, (match) => applyReplacementCase(match, replacement));
  }

  next = next
    .replace(/\bWG\b/g, "квартира")
    .replace(/\bDashboard\b/g, "панель")
    .replace(/\bHome\b/g, "Головна")
    .replace(/\bStatistik\b/g, "Статистика")
    .replace(/\bHistorie\b/g, "Історія")
    .replace(/\bÜbersicht\b/g, "Огляд")
    .replace(/\bArchiv\b/g, "Архів")
    .replace(/\bVerträge\b/g, "Договори")
    .replace(/\bBucket\b/g, "Список бажань")
    .replace(/\bProfil\b/g, "Профіль")
    .replace(/\bMitglied\b/g, "Учасник")
    .replace(/\bThema\b/g, "Тема")
    .replace(/\bTheme\b/g, "Тема")
    .replace(/\bHell\b/g, "Світла")
    .replace(/\bDunkel\b/g, "Темна")
    .replace(/\bSystem\b/g, "Система");

  return protectedValue.restore(next);
};

export const ukrainianizeTranslations = <T>(value: T): T => {
  if (typeof value === "string") return ukrainianizeText(value) as T;
  if (Array.isArray(value)) return value.map((entry) => ukrainianizeTranslations(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, ukrainianizeTranslations(entry)])
    ) as T;
  }
  return value;
};
