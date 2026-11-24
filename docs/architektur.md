# Architektur

## Aktueller Stand

- React und TypeScript bilden die Anwendungsoberfläche. Die Adressen hängen am URL-Fragment, etwa `#/spiele/xeri`, damit der GitHub-Pages-Server auch bei Neuladen dieselbe Einstiegsdatei liefert.
- Die Startseite und der Katalog nutzen dieselben Spielmetadaten. Spielansicht und soziale Bereiche haben eigene JavaScript-Pakete. Hover und Tastaturfokus laden verfügbare Spielansichten vor.
- Der Produktionsbuild versioniert den Cache aus dem Build-Inhalt. Er speichert nach dem Laden öffentliche App-Ressourcen im Geltungsbereich `/Spiele-Plattform/`. Das ermöglicht einen erneuten Offline-Start, sobald der Browser die Dateien gespeichert hat.
- Einstellungen für Bewegung und Ton liegen lokal. Die Verbindungsanzeige nutzt Browserstatus und WebSocket-Zustand. Die Presence-Daten anderer Geräte kommen vom Backend.
- Zustand, Ansicht, Kartenbewegung und Ton sind beim lokalen Xeri getrennt. Die Engine bestätigt einen Zug vor der Darstellung. Ein eigener Animationsebenen-Layer liegt außerhalb der Ansicht. Bei Größenwechsel, Scrollen oder verborgenem Tab wird der aktuelle Zustand sofort dargestellt. Der lokale Spielstand gilt für die geöffnete Tischansicht.

## Xeri-Referenz

Quelle ist der unveränderte Upstream-Stand [`68eb675`](https://github.com/GTheCreator1/xeri-card-game-/tree/68eb675bf2ff049fa4f6970d64405f125cb4f5d1). Die alte Anwendung besteht aus HTML, CSS, JavaScript und Tests mit Node. Im Referenz-Checkout liefen alle 16 Originaltests.

| Pfad unter `vendor/xeri/` | Verwendung |
| --- | --- |
| `game/engine.js` | Bytegleiche Übernahme für Kartenausgabe, Zugprüfung, Xeri und Endwertung. |
| `game/ai.js` | Bytegleiche Übernahme. Die KI sieht die Sitzprojektion mit eigenen Karten, öffentlichen Karten und fremden Kartenzahlen. Leicht, Normal und Schwer sind verfügbar. |
| `game/audio.js` | Bytegleiche Übernahme der Soundeffekte. Die Plattform stellt die Schalter bereit und schließt den Audiokontext beim Verlassen. |
| `game/room.js`, `game/online.js` | Bytegleiche Referenz für Regressionstests. Diese Dateien werden vom Frontend nicht geladen. |
| `tests/engine.test.js`, `tests/online.test.js` | Bytegleiche Referenztests, ausgeführt über `npm test`. Die Online-Tests verwenden simulierte Datenkanäle. |

Die React-Ansicht und der Worker greifen über ergänzte Typdeklarationen auf die übernommenen Module zu. Das separat geprüfte `card-motion.js` animiert das Top-Karten-Element der alten DOM-Ansicht. Die Plattform verwendet eigene Animationen für die neue Renderstruktur. Die PeerJS-Referenz hält die Partie im offenen Host-Tab. Der Worker speichert die Plattform-Lobby und jeden Spielzustand unabhängig vom geöffneten Browser.

## Online-Dienst

| Funktion | Schnittstelle |
| --- | --- |
| Konten und Sitzungen | Server gibt öffentliche Profilfelder und eine widerrufbare Sitzung für ein Gerät aus. Identitätsfelder in Aktionen werden aus der geprüften Sitzung abgeleitet. |
| Soziale Änderungen | Freundschaftsanfrage, Entscheidung und Entfernung sind serverseitige Aktionen. Einladungen sind einer Lobby und einem Zielkonto zugeordnet. Annahme, Prüfung freier Plätze und Mitgliedschaft werden in einer Transaktion verarbeitet. |
| Lobby | Zustände `offen`, `läuft` und `beendet`. Die leere Lobby wird geschlossen. Start ausschließlich durch berechtigten Host bei vollständiger, bereiter und verbundener Besetzung. Bei Abbruch eines Geräts behält das Mitglied seinen Sitz. Bei absichtlichem Verlassen wechselt die Host-Rolle zum ersten verbleibenden Menschen. Laufende Partien kehren dann in die Lobby zurück. |
| Spielaktion | Die Mitgliedschaft ermittelt die aktuelle Lobby. Partiekennung, Aktions-ID, erwartete Version und Nutzdaten werden geprüft. Wiederholte IDs führen zu einem aktuellen Snapshot ohne Ausführung des Zuges. Gleichzeitige Reinwürfe verwenden die Kennung des Zeitfensters und den serverseitig aktuellen Kartenplatz. |
| Spielansicht | Berechtigtes Konto erhält einen öffentlichen Snapshot und den zugehörigen privaten Ausschnitt. Reconnect lädt einen neuen Snapshot. Chat-Sequenz und Spielzustandsversion ändern sich unabhängig voneinander. |

Für Xeri liefert `viewFor(game, seat)` die Sitzprojektion. ab6super6 verwendet ein eigenes Zustandsmodell und eine getrennte Ansicht je Sitz. Der Server stempelt die Frist beim Ziehen und nach der letzten Ablage. Ein Alarm öffnet nach Ende des letzten Fensters die Wertung, sobald auch alle Effekte abgeschlossen sind. Die Uhr im Browser ist eine Orientierung. Verbindlich ist die Ankunft am Server, sodass hohe Netzlatenz das praktisch verfügbare Fenster verkürzen kann.
