# Peer-to-Peer-Zwischenstand vom 25. November 2026

Die Entwicklung ist auf ausdrücklichen Wunsch pausiert. Dieser Branch sichert den Stand nach der Integration der Spiel-Engines in den PeerJS-Raum und nach der ersten lokalen WebRTC-Abnahme. Die bestehende Veröffentlichungsfassung auf `main` bleibt separat. Der Zwischenstand wurde nicht über GitHub Pages veröffentlicht.

## Implementiert

| Bereich | Stand |
| --- | --- |
| Statische Plattform | Konten, Passwortanmeldung, Freundesliste, dauerhaft gespeicherte Direktnachrichten und Cloudflare wurden aus dem aktiven Projekt entfernt. Der Produktionsbuild enthält die statische Oberfläche. Die frühere Implementierung liegt in der Git-Historie. |
| Private Spielräume | Spitznamen, zufällige Einladungslinks, Kopieren und geräteeigenes Teilen, Spiel- und Plätzeauswahl, Bereitschaft, Host-Start, Verbindungsstatus und Rückkehr zum Menü. Ein neuer Raum braucht kein Konto. |
| Xeri | Solo gegen den Computer mit drei Schwierigkeitsgraden. Peer-Raum für 1 gegen 1 oder 2 gegen 2 mit optionalen Bots im Teammodus. Die Engine im ursprünglichen Xeri-Repository und die vendorte Referenz blieben unverändert. |
| ab6super6 | Peer-Raum für zwei bis sechs Personen. Startsicht, Effekte, chronologische Reinwürfe, Klopfen, vollständige Schlussrunde, letzte Reaktionsfrist und Endwertung. Können am Ende keine weiteren Strafkarten ausgeteilt werden, wertet die Engine die tatsächlich ausgeteilten Karten. |
| Chat und Wiederverbindung | Flüchtiger Raumchat mit Längen- und Frequenzgrenzen. Sitzgebundene Gast-Wiederverbindung, Spielstandabgleich und Schutz vor doppelter Zugausführung. Beim Neuladen des Host-Tabs geht die Partie verloren. |
| Karten und Nachprüfung | Sichere Fisher–Yates-Mischung, gemeinsame Zufallszusagen, private Sitzansichten und Nachrechnung nach Spielende. Der Host-Browser kennt intern alle Karten. Die vollständigen Grenzen stehen in der Betriebsdokumentation. |
| Lügen | Spielfreie Platzhalterseite mit „Mach ich bald“ und „Zurück zum Hauptmenü“. |
| MindSync | Katalog und Detailseite mit dem Status „In Entwicklung“. Wunschmechanik und Schutzrechtsfragen sind dokumentiert. Es gibt keine spielbare Engine und keine abweichende Ersatzvariante. |
| Bereitstellung | GitHub-Actions-Konfiguration für Tests, Build und Pages auf `main`. Der vorliegende Branch dient der Sicherung. |

[Technische Architektur](architektur.md) · [PeerJS, Sicherheitsgrenzen und Veröffentlichung](backend-entscheidung.md) · [ab6super6-Hausregeln](ab6super6-regeln.md) · [MindSync](mindsync-regeln.md)

## Tatsächlich durchgeführte Prüfungen

| Art | Ergebnis |
| --- | --- |
| Automatisierte Regel-, Integrations- und Simulationsprüfungen | `npm test` bestand mit **39 Tests**. Darunter sind 4.000 durchgeführte Deckmischungen mit 52 bzw. 55 Karten, Rejection Sampling mit 55.000 Vergleichswerten, Xeri-Sonderfälle, zugesicherte Zufallsbeiträge, aufgedeckte Manipulationen im Prüfprotokoll, ungültige und wiederholte Aktionen, Chatlimits, verdeckte Karten, ab6super6-Spezialeffekte und der Endwertungsfall mit nicht verfügbaren Strafkarten. Die originalen Xeri-Onlinetests und die Protokolltests verwenden simulierte Verbindungen. |
| Automatisierte Browserprüfung des Produktionsbuilds | `npm run build` und `npm run test:e2e` bestanden. Die **9 Chromium-Tests** umfassen Desktop- und Mobilansichten, den Einstieg in die Spiele, Lügen, Fragment-Navigation, vollständiges Solo-Xeri, reduzierte Bewegung, Größenwechsel beim Kartenflug und Offline-Start. |
| Automatisierte Browserprüfung mit tatsächlichem WebRTC | **2 Szenarien bestanden** auf demselben Entwicklungsrechner über echte Browserdatenkanäle und lokalen TURN/TCP. Xeri lief in zwei getrennten Chromium-Prozessen als Duell und als Teamspiel mit zwei Bots bis zur geprüften Endwertung. Der Test deckte Kopieren, Chat mit als Text angezeigten HTML-Zeichen, Gast-Abbruch, Wiederverbindung, Gast-Neuladen und „Raum verlassen“ beim Host ab. ab6super6 lief mit sechs getrennten Kontexten einschließlich iPhone-Viewport bis zur geprüften Endwertung. Startsicht, kleine Quer- und Hochformate und ein sichtbarer Reinwurf-Flug wurden geprüft. |
| Standardmäßige lokale Direktverbindung | Die zwei unveränderten `npm run test:online`-Szenarien erreichten die PeerJS-Signalisierung. In der verwalteten Chromium-Installation entstanden wegen `disable_non_proxied_udp` ohne Relay keine ICE-Kandidaten. Für den Gegencheck lief kurze Zeit ein lokaler TURN/TCP-Dienst mit temporären Testzugängen. Eine temporäre Kopie derselben Szenarien gab dessen ICE-Konfiguration an die Browser weiter. Der Relay ist nicht Teil der Anwendung. |
| Abhängigkeiten | `npm audit --omit=dev --audit-level=high` und `npm audit --audit-level=high` meldeten jeweils 0 bekannte Schwachstellen. |
| Manuell und öffentlich | Kein manueller Test auf physischen Mobilgeräten. Die öffentliche Mehrspielerroute sowie Safari, Firefox, unabhängige Internetanschlüsse, Hintergrund-Tabs und längerer Betrieb sind für diesen Stand ungeprüft. Die Provider-Statusseite wurde separat ausgewertet. Der Umgebungsproxy blockierte den direkten Abruf der Signalisierungs- und vorgesehenen Pages-Adresse. |

Vor dem Zwischenstand wurden ungültige Wire-Typen, Fehler im TypeScript-Teststart und die Wiederherstellung des Gast-Tabs unter React Strict Mode korrigiert. Der Host räumt auch WebRTC-Verbindungen ab, deren Handshake vor dem Öffnen endet. Die lokale Direktverbindung bleibt in der verwalteten Testumgebung eingeschränkt. Die Endwertung bei fehlenden Strafkarten ist in `tests/unit/ab6super6.test.ts` als eigener Regressionstest enthalten.

## Wiedereinstieg nach „Mach mit der Spiele-Plattform weiter“

1. Den gesicherten Branch `checkpoint/p2p-2026-11-25` und das aktuelle `main` vergleichen. Änderungen seit der Pause übernehmen, ohne den Sicherungsbranch oder das ursprüngliche Xeri-Repository zu überschreiben. Danach `npm ci`, `npm test`, `npm run build` und `npm run test:e2e` ausführen.
2. Die bestehende Mehrspieler-Suite auf einem Runner mit erlaubter lokaler ICE-Direktverbindung ausführen und wiederholen. Bei Bedarf einen reproduzierbaren, ausschließlich lokalen Relay-Test ergänzen. Anschließend echte Geräte über getrennte Netze, den öffentlichen PeerJS-Dienst, Browser-Hintergrundwechsel sowie kurzzeitige und endgültige Host-Ausfälle prüfen. Die Bereitschafts-, Fehler- und Wiederverbindungsanzeigen mitprüfen.
3. Die Abnahme für beide Online-Engines abschließen. Dazu gehören vier menschliche Xeri-Sitze, gleichzeitige ab6super6-Reinwürfe in der Netzwerksuite, Endwertung nach Spezialeffekten, Nachmischen und Wiedereinstieg während der Zufallsphase. Prüfen, wie die bestehende Engine reagiert, wenn während eines regulären Zugs der Nachziehstapel und alle wiederverwendbaren Ablagekarten erschöpft sind. Eine benötigte zusätzliche Hausregel nur mit Entscheidung des Nutzers festlegen.
4. An den vorhandenen Animationen weiterarbeiten. Xeri hat Kartenflug und Aufnehmen, ab6super6 hat den Reinwurf-Flug. Austeilen, reguläres Ablegen bei ab6super6, schnelle aufeinanderfolgende Aktionen und Leistung auf kleineren Touchgeräten brauchen weitere Abnahme. Reduzierte Bewegung beibehalten.
5. Den Sicherheitstest vor der Freigabe abschließen. Dazu gehören ungültige Rohdatenrahmen, verspätete oder wiederholte Aktionen, Einladungsbesitz, Sitzwechsel, private Projektionen, inkonsistente Ergebnisse und überlastete Verbindungen. Die dokumentierten Grenzen des host-autoritativen Modells und der öffentlichen PeerJS-Infrastruktur dabei sichtbar halten.
6. Erst die geprüfte Fassung nach `main` übernehmen, den Pages-Workflow ausführen und dessen Ergebnis sowie die veröffentlichte URL tatsächlich prüfen. Falls die Berechtigung zum Ändern der Pages-Quelle fehlt, die dokumentierte einmalige Einrichtung an den Repository-Administrator übergeben. [GitHub-Pages-Schritte](backend-entscheidung.md#github-pages-nach-wiederaufnahme)

## Verbindliche Vorgaben für die Wiederaufnahme

- 0 € laufende Kosten, GitHub Pages und öffentlicher PeerJS-Dienst ohne zusätzlichen Account, hinterlegte Zahlungsdaten oder eigenes Dauer-Backend. Private Einladungslinks und Spitznamen bleiben der Einstieg.
- Host und Gäste spielen nach denselben Regeln. Verdeckte Karten bleiben aus fremden Sitzansichten heraus. Technische Grenzen für den Host offenlegen. Die gemeinsame Kartenmischung und spätere Nachprüfung bleiben erhalten.
- Die bestätigten Xeri- und ab6super6-Hausregeln bleiben maßgeblich. Am Ende zählen nur tatsächlich ausgeteilte Karten. Das ursprüngliche Xeri-Repository wird ausschließlich lesend verwendet.
- Lügen verbleibt bei „Mach ich bald“ und dem Rückweg ins Hauptmenü. MindSync bleibt als „In Entwicklung“ sichtbar. Die gewünschte ursprüngliche Level- und Belohnungsmechanik, die Anforderung einer eigenen Gestaltung und die Kommunikationsbeschränkungen bleiben festgehalten.
- Die Entwicklung wird ausschließlich nach ausdrücklicher Aufforderung fortgesetzt.
