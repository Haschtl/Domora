server-seitig, wo deployen? 
push-notifications sicher machen


list-input popups in breite des inputs

texte frecher machen


Hoch: Unautorisierter Household-Join möglich
schema.sql (line 1339)
household_members_insert prüft nur auth.uid() = user_id. Es fehlt eine Bedingung, die den Join an Invite/Owner/Server-Flow bindet. Wenn jemand eine household_id kennt, kann er sich vermutlich selbst eintragen.

Hoch: Rollen-Eskalation in household_members_update
schema.sql (line 1351)
Policy erlaubt Update für auth.uid() = user_id. Ohne Spaltenrestriktion kann ein Mitglied wahrscheinlich role='owner' auf der eigenen Zeile setzen.

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