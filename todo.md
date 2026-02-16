benachrichtigungen testen

Haupt‑Ineffizienzen (konkret)

Viele select("*") statt Spalten‑Selektion. Siehe api.ts (z. B. getHouseholdMembers, getHouseholdMemberPimpers, getHouseholdTasks, getHouseholdFinances etc.).
Einige Seiten machen Mehrfach‑Queries, z. B. getHouseholdMembers lädt Mitglieder und danach Profile separat. Das ist ok, aber könnte als View/Function zusammengeführt werden.
Realtime: in use-workspace-data.ts invalidiert ihr bei jedem Change die komplette Query (event *). Das kann zu häufigen Re‑Fetches führen.
Keine Pagination/Limits bei Listen (Tasks, Events, Finance etc.). Potenziell große Datenmengen.
Pragmatische Verbesserungen

Spalten selektieren statt * in Hot‑Paths.
Beispiel: nur die Felder, die die UI braucht.
Pagination/Limit für große Tabellen (Events, Finance, Completions).
Erstes Load minimal, dann „Load more“.
Views/RPC für zusammengesetzte Reads (Members + Profiles) statt 2 Queries.
Realtime‑Invalidation feiner
Nur bei INSERT/UPDATE/DELETE spezifische Queries invalidieren.
Optional diff‑based updates statt Full refetch.
Batching von parallelen Queries (z. B. Promise.all) wenn mehrere Abfragen auf einer Seite nötig sind.