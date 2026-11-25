# Architektur

React und TypeScript setzen Hauptmenü, Katalog, Einstellungen, Lobby und Spieltische um. Fragment-Routing trägt Ansichten und Einladungslinks über Neuladen hinweg. Vite trennt die Startseite von den Spielansichten und lädt PeerJS erst bei einem Online-Raum. Der Produktionsbuild speichert öffentliche Ressourcen im Service-Worker-Cache. Nach dem ersten vollständigen Laden kann Xeri offline starten.

## Verantwortlichkeiten

| Schicht | Ort | Aufgabe |
| --- | --- | --- |
| Spielregeln | `vendor/xeri/game/`, `src/games/ab6super6/engine.ts`, `src/games/theslibbi/engine.ts` | Austeilung, erlaubte Züge, Effekte, Fristen und Wertung. Separate Kartenansicht für jeden Sitz. |
| Spieladapter | `shared/game-match.ts`, `shared/random.ts` | Bindet Engines an Zufallsströme, Bots, verbindliche Zeitpunkte und nachrechenbare Ereignisse. |
| Raum | `shared/room.ts`, `shared/online.ts` | Besetzung, Bereitschaft, Spielwahl, Chatlimits, Zufallszusagen, befristete Vorgänge, Versionen und Sitzrechte. |
| Transport und Prüfung | `src/platform/peer-client.ts`, `host-peers.ts`, `secure-link.ts`, `peer-audit.ts`, `shared/wire.ts` | PeerJS-Signalisierung, WebRTC-Datenkanal, authentifizierte Frames, Schema-Prüfung, Sitzprojektionen und Nachrechnung nach Spielende. |
| Identität und Speicherung | `src/platform/peer-storage.ts`, `preferences.tsx` | Flüchtiger Sitz und Wiederanmeldung im Gast-Tab. Gerätepräferenzen bleiben lokal. Der Host verwaltet die Partie im Arbeitsspeicher. |
| Benutzeroberfläche | `src/features/`, `src/games/`, `src/ui/` | Raumablauf, Status, Kartenaktionen und getrennte Animationsebenen. Bei reduzierter Bewegung wird der bestätigte Zustand direkt dargestellt. |

Ein späterer Backend-Adapter kann Raumautorität und Speicherung austauschen und weiterhin die Spieladapter und Oberflächen verwenden. Der aktuelle Veröffentlichungsbuild ist statisch.

## Autoritative Aktionen und Fristen

Host und Gäste verwenden dieselbe Spielzugprüfung. Beginn, Abbruch der Zufallsphase, Raumwahl und Bots sind Verwaltungsrechte des Raumerstellers. Jeder Spielzug enthält eine Partiekennung, die Ausgangsversion und eine Aktions-ID. Akzeptierte Wiederholungen mit identischer ID und identischen Daten werden übersprungen. Reinwürfe aus demselben Fenster können nach einem bereits bestätigten Reinwurf verarbeitet werden, sofern ihr Ziel noch besteht. Die Spielinstanz verarbeitet jede Aktion in Registrierungsreihenfolge.

ab6super6 stempelt die Reaktionsfrist beim Ziehen und nach der letzten Ablage auf der Uhr des Host-Browsers. Dessen Timer verarbeitet das letzte Fenster und die Endwertung, sobald die Spezialeffekte abgeschlossen sind. Die Anzeige im Gast-Tab dient als Orientierung. Latenz und Browser-Drosselung können die praktisch verfügbare Reaktionszeit verkürzen.

THESLIBBI verarbeitet Ausspielversuche ohne Zugfolge. Der erste gültige Versuch für den aktuellen Spielstand ändert entweder die Ablage oder die gemeinsamen Leben. Weitere Eingaben für dieselbe Version werden ohne Lebensabzug abgewiesen. Im Spielstand enthält nur die eigene Hand Werte. Für alle anderen Sitze enthält er nur die Anzahl ihrer Handkarten.

## Xeri-Referenz

Die bestehende Xeri-Engine stammt aus dem Referenzstand `68eb675`. Engine, KI und Ton sind bytegleich übernommen. Die Plattform verwendet die Engine für Solo-Xeri sowie Duell und Teamspiel. Der lokale Modus bietet Leicht, Normal und Schwer. Im Teammodus liegen Partner einander gegenüber. Die übernommene KI erhält eine Sitzansicht mit eigenen Karten und öffentlichen Informationen. [Unveränderter Referenzstand](https://github.com/GTheCreator1/xeri-card-game-/tree/68eb675bf2ff049fa4f6970d64405f125cb4f5d1)

| Pfad unter `vendor/xeri/` | Verwendung |
| --- | --- |
| `game/engine.js`, `game/ai.js`, `game/audio.js` | Regeln, Computergegner und Sound. |
| `game/room.js`, `game/online.js` | Referenz für die vorhandenen Regressionstests mit simulierten Verbindungen. |
| `tests/engine.test.js`, `tests/online.test.js` | Unveränderte Originaltests in `npm test`. |
