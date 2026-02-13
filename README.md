# Domora

Domora ist ein WG-Organizer mit React, Tailwind, Radix-UI-Primitives, Supabase und PWA-Support.

## Stack

- React + TypeScript + Vite
- TanStack Router (Navigation)
- TailwindCSS
- Custom UI components auf Basis von Radix UI
- Framer Motion (Route-Transitions)
- Chart.js (History-Plots)
- Supabase (Auth + Postgres)
- PWA via `vite-plugin-pwa`

## Features (MVP)

- WG erstellen
- WG per Einladungscode beitreten
- Login / Registrierung via Supabase Auth
- Dark / Light / System Theme Umschaltung mit Persistenz
- i18n mit Deutsch / Englisch Umschaltung
- Home Tab (WG-Uebersicht)
- Einkaufen Tab (Shopping-Liste mit Tags + optionaler Wiederholung)
  - Completion-Historie mit Zeitstempel, User und Tag-Snapshot
- Aufgaben Tab:
  - Frequenz in Tagen + Startdatum
  - Description + Aufwand in Pimpers
  - Rotationsreihenfolge mit WG-Mitgliedern
  - Pimpers-Sammlung pro Mitglied und bevorzugte Zuteilung an User mit wenig Pimpers
  - Lokale taegliche Push-Erinnerung fuer die aktuell faellige, zugewiesene Person
  - Completion-Historie mit erspielten Pimpers
- Finanzen Tab
  - Eintraege mit Kategorie
  - Historie mit Filtern (Zeitraum, Person, Kategorie, Suchtext)
  - Kassensturz-Request
- Settings Tab
  - Client-Settings (Theme + Sprache)
  - WG-Verwaltung (Ausziehen, WG-Bild-Upload, User-Bild-Upload, Adresse, Waehrung, Wohnungs-qm, Warm-Miete)
  - Mitglied-Werte (Zimmer-qm + Gemeinschaftsfaktor)

## Setup

1. Dependencies installieren:

```bash
pnpm install
```

2. Env-Datei anlegen:

```bash
cp .env.example .env
```

3. In `.env` eintragen:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Hinweis:
- Im Frontend nur `publishable` verwenden.
- `secret` Key nur serverseitig (z. B. Edge Functions), niemals als `VITE_` Variable.

4. Supabase Schema ausfuehren:

```bash
# SQL im Supabase SQL editor ausfuehren
supabase/schema.sql
```

Wenn du das Schema bereits frueher ausgefuehrt hast:
- Neues `supabase/schema.sql` erneut im SQL Editor ausfuehren, damit die neuen Felder/Funktionen/Tables angelegt werden.

5. Starten:

```bash
pnpm dev
```

## PWA

- Service Worker wird automatisch registriert.
- Manifest und Icons liegen in `public/`.
- App kann auf mobilen Geraeten als Homescreen-App installiert werden.

## Tests

Unit-Tests (Vitest):

```bash
pnpm test:unit
```

E2E-Tests (Playwright):

```bash
pnpm playwright install
pnpm test:e2e
```

Nuetzliche Varianten:

```bash
pnpm test:unit:watch
pnpm test:e2e:ui
pnpm test
```

## CI/CD

GitHub Actions Workflows:

- `CI` (`.github/workflows/ci.yml`)
  - lint
  - typecheck
  - unit tests (Vitest)
  - e2e tests (Playwright, Chromium)
  - build
- `CD` (`.github/workflows/cd.yml`)
  - bei Push auf `main`
  - baut `dist/` und laedt ein Delivery-Artefakt hoch

## Push und Email Benachrichtigungen

- Aufgaben-Reminders sind browser-lokale Push-Notifications (wenn erlaubt).
- Beim Kassensturz wird ein Eintrag in `cash_audit_requests` angelegt.
- Fuer echten Email-Versand kann darauf eine Supabase Edge Function oder ein DB Trigger aufsetzen.

## Production Notes

- Die Household-Select-Policy ist aktuell bewusst prototype-freundlich (authenticated read).
- Fuer Produktion sollte Invite-Flow restriktiver abgesichert werden.
