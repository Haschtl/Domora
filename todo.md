server-seitig, wo deployen? 
push-notifications sicher machen



texte frecher machen


Niedrig (Ops): Cron-Setup-Fehler werden vollständig geschluckt
schema.sql (line 1266)
when others then null macht Deploy-Probleme unsichtbar (kein Alert/Log).


Push-Notifications sicher machen
Aktuell sind es vor allem clientseitige Browser-Notifications.
Für „täglich fällig + assigned Person zuverlässig“ fehlt noch ein robuster serverseitiger Flow (z. B. Supabase Edge Function + Scheduler + Push-Token-Verwaltung).

Kassensturz Email an alle
In der DB wird der Request angelegt (cash_audit_requests), aber der echte Mailversand-Worker/Edge-Function ist noch nicht angebunden.

Server-seitig deployen
Das steht noch offen (todo.md: „server-seitig, wo deployen?“).