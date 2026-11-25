# Entwicklungsstand und Prüfprotokoll

Die Entwicklung wurde am 25. November 2026 ab Commit `cb970fd` wieder aufgenommen. Der aktuelle Peer-to-Peer-Stand integriert Xeri, ab6super6 und THESLIBBI ohne Konto in die statische Plattform. Die frühere Cloudflare-Implementierung liegt in der Git-Historie. [Gesicherter Ausgangsstand](https://github.com/GTheCreator1/Spiele-Plattform/commit/cb970fdce682fa5a08cbe41d841a4c133431013b)

## Funktionen

| Bereich | Umsetzung |
| --- | --- |
| Xeri | Solo mit drei Schwierigkeitsgraden. 1 gegen 1 sowie 2 gegen 2 online. Freie Plätze im Teammodus können Bots übernehmen. Die bestehende Xeri-Engine ist im ursprünglichen Repository und in der lokalen Referenz unverändert. |
| ab6super6 | Private Räume für zwei bis sechs Personen mit verdeckter Startsicht, Spezialeffekten, chronologischen Reinwürfen, Klopfen, letzter Reaktionsfrist und Wertung. Ausstehende Strafkarten werden ausgegeben, sobald Karten wieder verfügbar sind. Am Spielende zählen die tatsächlich ausgeteilten Karten. |
| Private Lobbys | Erstellen und Beitreten per Spitzname und zufälligem Link. Spiel- und Plätzeauswahl, Teilnehmerübersicht, Bereitschaft, Link kopieren oder teilen, Start, Verbindungsmeldungen, Revanche und Rückkehr zum Hauptmenü. |
| Chat und Wiederverbindung | Flüchtiger Raumchat, Größen- und Frequenzgrenzen, zuggebundene Aktions-IDs und Wiedereinstieg auf dem ursprünglichen Gast-Sitz. Der Host-Tab hält die Partie im Arbeitsspeicher. |
| Kartenzufall | Gleichverteilte Indexauswahl im Fisher–Yates-Algorithmus. Gemeinsame Zufallszusagen für Online-Partien und Nachrechnung nach Spielende. Gäste erhalten nur ihre erlaubte Sicht. Der Host-Browser kann intern das gesamte Deck lesen. |
| Lügen | Kachel und Seite mit „Mach ich bald“ und „Zurück zum Hauptmenü“. |
| THESLIBBI | Vollständige Sortierrunden für zwei bis vier Personen mit privaten Händen, gemeinsamem Zufall, freier Zugfolge, Leben, Sieg oder Niederlage und Neuausteilung. Der Chat pausiert während des Spiels. Die dokumentierte Originalkampagne mit Levelstaffel, Impulsen, Belohnungen und Entfernen übersprungener Karten ist nicht Teil des Spielmodus. |

[Architektur](architektur.md) · [PeerJS, Sicherheit und GitHub Pages](backend-entscheidung.md) · [ab6super6-Hausregeln](ab6super6-regeln.md) · [THESLIBBI](theslibbi-regeln.md)

## Überprüfte Fehler und Korrekturen

- Eine Lücke zwischen Transport und Spielansicht ließ widersprüchliche Sitzprojektionen durch. Die Wire-Prüfung verwirft nun unter anderem doppelte öffentliche Xeri-Karten und versehentlich offengelegte fremde ab6super6-Karten. Der Produktionsbuild beschränkt externe Skripte und Verbindungen mit einer Content Security Policy.
- Ein verlorener Signalisierungssocket konnte laufende Spielkanäle blockieren. Der Host kann auf vorhandenen WebRTC-Kanälen weiterspielen und seine Signalisierung separat wiederherstellen. Verliert er seine Netzverbindung, warten reguläre Züge auf die Wiederverbindung. Beim Wechsel eines Gast-Sitzes in einen anderen Tab beendet der alte Tab seine Wiederverbindungsversuche.
- Ein leerer Ziehstapel ohne wiederverwendbare Ablagen war nach 30 Fehlwürfen bei sechs Personen erreichbar. Die Oberfläche zeigt an, wann Ziehen vorübergehend unmöglich ist. Ein passender eigener Reinwurf kann Karten für den Stapel freigeben. Offene Strafkarten haben dabei weiterhin Vorrang.
- Die Endwertung und die Revanche könnten mit der Übertragung des Prüfprotokolls überlappen. Die neue Runde wartet auf das Senden der Prüfdaten an die aktuell verbundenen Spieler. Die Nachprüfung begrenzt den Speicherbedarf bei langen Partien.
- Die Tische animieren Austeilen, ab6super6-Ziehen und reguläre Ablagen zusätzlich zum bestehenden Kartenflug beim Reinwerfen und Xeri-Aufnehmen. Bei schnellen Zustandswechseln folgt der Kartenflug dem neuesten sichtbaren Ereignis. Positionsmessungen laufen bei relevanten Änderungen. Die Einstellung für reduzierte Bewegung greift auch bei den neuen Animationen.

## Prüfungen

Der Prüfstand für THESLIBBI liegt auf `development/theslibbi`. Die ursprüngliche Xeri-Referenz und die ab6super6-Engine entsprechen weiterhin `main`.

| Prüfumfang | Ergebnis |
| --- | --- |
| Automatisiert · Regeln, Raumzustand, Sicherheit | `npm test` bestand mit **51 Tests**. THESLIBBI deckt 240 zufällige Austeilungen ohne Duplikate, vollständige Siege mit zwei, drei und vier Personen, Fehler und Niederlage, private Sicht beim Wiedereinstieg, doppelte und überholte Züge sowie die Ablehnung fehlerhafter Spielansichten ab. Die Regel- und Regressionstests von Xeri und ab6super6 sind enthalten. |
| Automatisiert · Produktionsbuild | `npm run build` und **11 Chromium-Tests** bestanden. Sie prüfen Desktop- und iPhone-Viewport, Spielauswahl, Raumformular und Regeln von THESLIBBI, Platzhalter, Fragmentnavigation, Solo-Xeri bis zur Wertung, Größenwechsel und Offline-Start. |
| Automatisiert · echte WebRTC-Datenkanäle lokal | **8 Szenarien** bestanden über lokalen TURN/TCP. THESLIBBI wurde bis zum Sieg mit zwei, drei und vier Personen sowie bis zur Niederlage mit anschließendem Neustart gespielt. Die Viererrunde prüft zwei Chromium-Prozesse, iPhone- und iPad-Ansichten, reduzierte Bewegung, Chatpause und Wiederverbindung mit derselben Hand. Die bestehenden Szenarien decken Xeri-Duell, Teamspiel, Netz- und Signalisierungsausfall sowie ab6super6 bis zur Schlusswertung und parallele Reinwürfe ab. |
| Weitere Netzpfade | Der THESLIBBI-Direkttest scheiterte beim Gastbeitritt. Das verwaltete Chromium sperrt UDP ohne Proxy. Der Produktionscheck über den öffentlichen PeerJS-Dienst scheiterte bereits beim Öffnen des Raums. Der Entwicklungsproxy beantwortete den Zugriff auf den Signalisierungsendpunkt mit HTTP 403. |
| Abhängigkeiten | `npm audit --audit-level=high` und `npm audit --omit=dev --audit-level=high` meldeten keine bekannten Schwachstellen. |
| Offene Prüfungen | Direkte WebRTC-Verbindung, physische Mobilgeräte, Safari, Firefox, zwei unabhängige Internetanschlüsse, Hintergrunddrosselung und längerer Lastbetrieb. |

[Build, direkte Verbindungen, PeerJS und Pages im GitHub-Workflow](https://github.com/GTheCreator1/Spiele-Plattform/actions/workflows/pages.yml)

## Technische Grenzen

- Der öffentliche PeerJS-Dienst vermittelt Verbindungen für kleine Gruppen. Der konkrete Verbindungsaufbau hängt vom jeweiligen Netz, NAT und Relay ab. Es gibt keine garantierte Relay-Verfügbarkeit.
- Der Host kann seinen Browser verändern und interne Karten auslesen. Commit-Reveal und Nachrechnung erschweren nachträgliche Änderungen an Karten und Ergebnis. Sie erkennen Widersprüche zu empfangenen Zuständen und bestätigten Zügen. Der Host kontrolliert Zugang, tatsächliche Eingangsuhr und Abbruch.
- Neuladen oder Schließen des Host-Tabs verliert die Partie. Ein neuer Raum hat einen neuen Einladungslink. Der Browser kann ein verborgenes oder schlafendes Gerät zeitweise drosseln.
- Die Veröffentlichung braucht einmalig die Pages-Quelle **GitHub Actions**, sofern sie noch nicht eingerichtet ist. Die URL ist nach erfolgreichem Workflow verfügbar. [Einrichtung](backend-entscheidung.md#github-pages-einrichten)
