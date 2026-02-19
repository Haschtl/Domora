# Supabase Setup (Domora)

Diese Anleitung richtet ein neues Supabase-Projekt so ein, dass Domora inkl. Push auf Web funktioniert.

## 1. Voraussetzungen

- Supabase-Projekt
- Supabase CLI installiert und eingeloggt
- Firebase-Projekt fuer FCM/Web-Push

## 2. Datenbank-Schema anwenden

- `supabase/schema.sql` komplett im Supabase SQL Editor ausfuehren.
- Bei Updates dieselbe Datei erneut ausfuehren (enthaelt idempotente Upgrade-Bloecke).

## 3. Edge-Function-Secrets setzen

Empfohlen ist ein einzelnes JSON-Secret fuer die oeffentliche Firebase-Web-Clientkonfiguration.

```bash
supabase secrets set \
  --project-ref <YOUR_PROJECT_REF> \
  SUPABASE_URL=https://<YOUR_PROJECT_REF>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY> \
  SUPABASE_ANON_KEY=<YOUR_ANON_KEY> \
  CRON_SECRET=<YOUR_CRON_SECRET> \
  FCM_PROJECT_ID=<YOUR_FCM_PROJECT_ID> \
  FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  FIREBASE_WEB_CONFIG_JSON='{"firebase":{"apiKey":"...","authDomain":"...","projectId":"...","messagingSenderId":"...","appId":"...","storageBucket":"...","measurementId":"..."},"vapidKey":"..."}'
```

Alternative zu `FIREBASE_WEB_CONFIG_JSON`:

- `FIREBASE_WEB_API_KEY`
- `FIREBASE_WEB_AUTH_DOMAIN`
- `FIREBASE_WEB_PROJECT_ID`
- `FIREBASE_WEB_MESSAGING_SENDER_ID`
- `FIREBASE_WEB_APP_ID`
- `FIREBASE_WEB_VAPID_KEY`
- optional: `FIREBASE_WEB_STORAGE_BUCKET`, `FIREBASE_WEB_MEASUREMENT_ID`

## 4. Edge Functions deployen

```bash
supabase functions deploy register-push-token --project-ref <YOUR_PROJECT_REF>
supabase functions deploy dispatch-push-jobs --project-ref <YOUR_PROJECT_REF>
supabase functions deploy schedule-task-due --project-ref <YOUR_PROJECT_REF>
supabase functions deploy schedule-member-of-month --project-ref <YOUR_PROJECT_REF>
supabase functions deploy firebase-public-config --project-ref <YOUR_PROJECT_REF>
```

Optional (alle Funktionen auf einmal):

```bash
SUPABASE_PROJECT_REF=<YOUR_PROJECT_REF> pnpm supabase:functions:deploy:all
```

## 5. Cron/Scheduler

- Der Cron-Block fuer Push steckt in `supabase/schema.sql` (pg_cron + pg_net erforderlich).
- `dispatch-push-jobs` wird ohne JWT per Cron aufgerufen (`verify_jwt = false` ist in den Function-Configs gesetzt).
- `CRON_SECRET` muss mit dem in der DB verwendeten Secret (`domora_cron_secret`/`app.supabase_cron_secret`) uebereinstimmen.

## 6. Frontend-Variablen

Im App-Frontend werden nur diese Variablen benoetigt:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Firebase-Clientkonfiguration wird zur Laufzeit vom aktiven Backend ueber `firebase-public-config` geladen.

## 7. Smoke-Test

1. In Domora einloggen und Haushalt oeffnen.
2. Unter Login/Backend-Konfiguration auf `Verbindung testen` klicken.
3. Push erlauben und in den Settings pruefen, dass Push-Support nicht auf `nicht konfiguriert` steht.
