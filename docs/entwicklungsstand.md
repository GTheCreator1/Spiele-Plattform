# Entwicklungsstand und Prüfprotokoll

Die Entwicklung wurde am 25. November 2026 ab Commit `cb970fd` wieder aufgenommen. Der Peer-to-Peer-Stand für die Veröffentlichung integriert Xeri und ab6super6 ohne Konto in die statische Plattform. Die frühere Cloudflare-Implementierung liegt in der Git-Historie. [Gesicherter Ausgangsstand](https://github.com/GTheCreator1/Spiele-Plattform/commit/cb970fdce682fa5a08cbe41d841a4c133431013b)

## Funktionen

| Bereich | Umsetzung |
| --- | --- |
| Xeri | Solo mit drei Schwierigkeitsgraden. 1 gegen 1 sowie 2 gegen 2 online. Freie Plätze im Teammodus können Bots übernehmen. Die bestehende Xeri-Engine ist im ursprünglichen Repository und in der lokalen Referenz unverändert. |
| ab6super6 | Private Räume für zwei bis sechs Personen mit verdeckter Startsicht, Spezialeffekten, chronologischen Reinwürfen, Klopfen, letzter Reaktionsfrist und Wertung. Ausstehende Strafkarten werden ausgegeben, sobald Karten wieder verfügbar sind. Am Spielende zählen die tatsächlich ausgeteilten Karten. |
| Private Lobbys | Erstellen und Beitreten per Spitzname und zufälligem Link. Spiel- und Plätzeauswahl, Teilnehmerübersicht, Bereitschaft, Link kopieren oder teilen, Start, Verbindungsmeldungen, Revanche und Rückkehr zum Hauptmenü. |
| Chat und Wiederverbindung | Flüchtiger Raumchat, Größen- und Frequenzgrenzen, zuggebundene Aktions-IDs und Wiedereinstieg auf dem ursprünglichen Gast-Sitz. Der Host-Tab hält die Partie im Arbeitsspeicher. |
| Kartenzufall | Gleichverteilte Indexauswahl im Fisher–Yates-Algorithmus. Gemeinsame Zufallszusagen für Online-Partien und Nachrechnung nach Spielende. Gäste erhalten nur ihre erlaubte Sicht. Der Host-Browser kann intern das gesamte Deck lesen. |
| Lügen | Kachel und Seite mit „Mach ich bald“ und „Zurück zum Hauptmenü“. |
| MindSync | Einheitlicher Status „In Entwicklung“. Die gewünschte Level- und Belohnungsmechanik und Schutzrechtsfragen sind dokumentiert. |

[Architektur](architektur.md) · [PeerJS, Sicherheit und GitHub Pages](backend-entscheidung.md) · [ab6super6-Hausregeln](ab6super6-regeln.md) · [MindSync](mindsync-regeln.md)

## Überprüfte Fehler und Korrekturen

- Eine Lücke zwischen Transport und Spielansicht ließ widersprüchliche Sitzprojektionen durch. Die Wire-Prüfung verwirft nun unter anderem doppelte öffentliche Xeri-Karten und versehentlich offengelegte fremde ab6super6-Karten. Der Produktionsbuild beschränkt externe Skripte und Verbindungen mit einer Content Security Policy.
- Ein verlorener Signalisierungssocket konnte laufende Spielkanäle blockieren. Der Host kann auf vorhandenen WebRTC-Kanälen weiterspielen und seine Signalisierung separat wiederherstellen. Verliert er seine Netzverbindung, warten reguläre Züge auf die Wiederverbindung. Beim Wechsel eines Gast-Sitzes in einen anderen Tab beendet der alte Tab seine Wiederverbindungsversuche.
- Ein leerer Ziehstapel ohne wiederverwendbare Ablagen war nach 30 Fehlwürfen bei sechs Personen erreichbar. Die Oberfläche zeigt an, wann Ziehen vorübergehend unmöglich ist. Ein passender eigener Reinwurf kann Karten für den Stapel freigeben. Offene Strafkarten haben dabei weiterhin Vorrang.
- Die Endwertung und die Revanche könnten mit der Übertragung des Prüfprotokolls überlappen. Die neue Runde wartet auf das Senden der Prüfdaten an die aktuell verbundenen Spieler. Die Nachprüfung begrenzt den Speicherbedarf bei langen Partien.
- Die Tische animieren Austeilen, ab6super6-Ziehen und reguläre Ablagen zusätzlich zum bestehenden Kartenflug beim Reinwerfen und Xeri-Aufnehmen. Bei schnellen Zustandswechseln folgt der Kartenflug dem neuesten sichtbaren Ereignis. Positionsmessungen laufen bei relevanten Änderungen. Die Einstellung für reduzierte Bewegung greift auch bei den neuen Animationen.

## Prüfungen

| Prüfumfang | Ergebnis |
| --- | --- |
| Automatisiert · Regeln, Raumzustand, Sicherheit | `npm test` bestand mit **43 Tests**. Darunter sind 4.000 vollständige Mischvorgänge, 55.000 Zufallsindex-Prüfwerte, 120 automatisch gespielte vollständige Xeri-Partien aus der unveränderten Referenz, Ablehnung alter oder ungültiger Nachrichten, private Sitzprojektionen und Zufallsbeiträge. ab6super6 deckt Effekte in Reihenfolge, Klopfen, Gleichstand, Neumischen, fehlende Strafkarten nach Ablauf des Schlussfensters und die Erholung bei vollständig erschöpftem Stapel während der Partie ab. |
| Automatisiert · Produktionsbuild | **9 Chromium-Tests** bestanden. Sie prüfen Desktop- und iPhone-Viewport, Spielansichten und Platzhalter, Fragmentnavigation, Solo-Xeri bis zur Wertung, Größenwechsel, reduzierte Bewegung und Offline-Start. |
| Automatisiert · echte WebRTC-Datenkanäle lokal | **4 Szenarien** bestanden über lokalen TURN/TCP. Enthalten sind Xeri-Duell und Teamspiel mit Bots in separaten Browser-Prozessen, Vierer-Xeri mit vier Menschen, ein Signalisierungs- und ein Host-Netzausfall, Gast-Neuladen, Verlassen und Chat. ab6super6 wurde mit sechs Personen bis zur geprüften Endwertung und mit drei Personen bei zwei fast gleichzeitigen Würfen getestet. Die Oberfläche wurde bei 320 und 390 Pixeln Breite und im Querformat geprüft. |
| Automatisiert · weitere Netzpfade | Die verwaltete Chromium-Richtlinie begrenzt lokale Direkt-ICE-Verbindungen und der Entwicklungsproxy sperrt den öffentlichen PeerJS-Endpunkt. GitHub Actions führt die Direkt-Variante und einen Produktionscheck über den öffentlichen Dienst aus. Der Workflow zeigt deren jeweilige Ergebnisse. |
| Abhängigkeiten | `npm audit --audit-level=high` und `npm audit --omit=dev --audit-level=high` meldeten keine bekannten Schwachstellen. |
| Manuell und über getrennte Netze | Kein Test auf physischen Mobilgeräten, in Safari oder Firefox und keine vollständige Partie von zwei unabhängigen Internetanschlüssen. Hintergrunddrosselung und längerer Lastbetrieb sind ungeprüft. |

[Build, direkte Verbindungen, PeerJS und Pages im GitHub-Workflow](https://github.com/GTheCreator1/Spiele-Plattform/actions/workflows/pages.yml)

## Technische Grenzen

- Der öffentliche PeerJS-Dienst vermittelt Verbindungen für kleine Gruppen. Der konkrete Verbindungsaufbau hängt vom jeweiligen Netz, NAT und Relay ab. Es gibt keine garantierte Relay-Verfügbarkeit.
- Der Host kann seinen Browser verändern und interne Karten auslesen. Commit-Reveal und Nachrechnung erschweren nachträgliche Änderungen an Karten und Ergebnis. Sie erkennen Widersprüche zu empfangenen Zuständen und bestätigten Zügen. Der Host kontrolliert Zugang, tatsächliche Eingangsuhr und Abbruch.
- Neuladen oder Schließen des Host-Tabs verliert die Partie. Ein neuer Raum hat einen neuen Einladungslink. Der Browser kann ein verborgenes oder schlafendes Gerät zeitweise drosseln.
- Die Veröffentlichung braucht einmalig die Pages-Quelle **GitHub Actions**, sofern sie noch nicht eingerichtet ist. Die URL ist nach erfolgreichem Workflow verfügbar. [Einrichtung](backend-entscheidung.md#github-pages-einrichten)
