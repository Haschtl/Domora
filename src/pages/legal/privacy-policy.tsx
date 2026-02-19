import { Link } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

export const PrivacyPolicyPage = () => {
  return (
    <Card className="mx-auto mt-2 border-brand-200/80 bg-white/95 dark:border-slate-700 dark:bg-slate-900/90">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl sm:text-3xl">
              Datenschutzerklärung
            </CardTitle>
            <CardDescription className="mt-2">
              Stand: 19. Februar 2026
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Zurück zur App</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-sm leading-6 text-slate-700 dark:text-slate-200">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            1. Verantwortliche Stelle
          </h2>
          <p>
            <br />
            Sebastian Keller
            <br />
            domoraplay.google.co.veggie537@passmail.net
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            2. Welche Daten wir verarbeiten
          </h2>
          <p>
            Bei der Nutzung der App können insbesondere folgende Daten
            verarbeitet werden:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Kontodaten (z. B. E-Mail-Adresse, Auth-Provider-ID)</li>
            <li>
              Nutzungsinhalte innerhalb der Haushalte (Aufgaben, Einkäufe,
              Finanzeinträge, Whiteboard-Inhalte)
            </li>
            <li>
              Technische Protokolldaten (z. B. Zeitstempel, Geräte- oder
              App-Informationen)
            </li>
            <li>Push-Token für Benachrichtigungen (sofern aktiviert)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            3. Zwecke der Verarbeitung
          </h2>
          <p>
            Die Verarbeitung erfolgt, um die Kernfunktionen der App
            bereitzustellen, insbesondere:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Benutzeranmeldung und Kontoverwaltung</li>
            <li>Organisation von Haushalten und gemeinsamen Inhalten</li>
            <li>Synchronisierung von Daten zwischen Geräten</li>
            <li>
              Versand von Benachrichtigungen bei aktivierter Push-Funktion
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            4. Rechtsgrundlagen
          </h2>
          <p>
            Die Verarbeitung erfolgt regelmäßig auf Basis von Art. 6 Abs. 1 lit.
            b DSGVO (Vertragserfüllung), ggf. Art. 6 Abs. 1 lit. a DSGVO
            (Einwilligung, z. B. bei Push-Benachrichtigungen) sowie Art. 6 Abs.
            1 lit. f DSGVO (berechtigtes Interesse an sicherem und stabilem
            App-Betrieb).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            5. Empfänger und Hosting
          </h2>
          <p>
            Für Betrieb und Bereitstellung der App können externe technische
            Dienstleister eingesetzt werden (z. B. Datenbank-,
            Authentifizierungs- und Push-Infrastruktur). Mit diesen
            Dienstleistern sollten Auftragsverarbeitungsverträge abgeschlossen
            sein, soweit erforderlich.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            6. Speicherdauer
          </h2>
          <p>
            Personenbezogene Daten werden nur so lange gespeichert, wie es für
            die genannten Zwecke erforderlich ist oder gesetzliche
            Aufbewahrungspflichten bestehen.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            7. Deine Rechte
          </h2>
          <p>Du hast nach DSGVO insbesondere folgende Rechte:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Auskunft (Art. 15 DSGVO)</li>
            <li>Berichtigung (Art. 16 DSGVO)</li>
            <li>Löschung (Art. 17 DSGVO)</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerspruch (Art. 21 DSGVO)</li>
            <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            8. Kontakt
          </h2>
          <p>
            Bei Datenschutzfragen wende dich bitte an die oben genannte
            verantwortliche Stelle oder an den/die zuständige/n
            Datenschutzbeauftragte/n (falls bestellt).
          </p>
        </section>
      </CardContent>
    </Card>
  );
};
