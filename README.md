# Stichrunde · Spiele-Plattform

Stichrunde ist ein Kartenspielraum für Freundesgruppen. Xeri ist gegen den Computer oder online im Duell und im Team spielbar. ab6super6 unterstützt zwei bis sechs Mitspieler. THESLIBBI bietet eine private Lobby für zwei bis vier Personen. Der Spielmodus ist in Entwicklung. Lügen zeigt „Mach ich bald“.

## Mit Freunden spielen

Wähle ein Spiel, gib deinen Spitznamen ein und erstelle einen privaten Raum. Teile den Einladungslink mit deiner Runde. Alle Gäste geben ihren Spitznamen ein und bestätigen ihre Bereitschaft. Der Host lässt seinen Tab geöffnet. Bei Xeri und ab6super6 startet der Host die Partie. Sein Browser verwaltet das vollständige Deck und übermittelt Gästen nur die erlaubte Kartenansicht. [Betrieb, Kosten und Vertrauensmodell](docs/backend-entscheidung.md)

## Lokal starten und prüfen

Node.js 24 und npm werden empfohlen. Der Mindeststand ist Node.js 22.12.

```sh
npm ci
npm run dev
```

Vite zeigt die Adresse mit dem Pfad `/Spiele-Plattform/` an. Online-Räume verwenden standardmäßig den öffentlichen PeerJS-Dienst.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:online
```

`npm test` führt Regel-, Raum- und Transporttests aus. `npm run test:e2e` prüft den Produktionsbuild. `npm run test:online` startet eine lokale PeerJS-Signalisierung und einen lokalen TURN/TCP-Relay für echte Browserdatenkanäle. Der Test-Relay bindet nur Loopback-Adressen und verwendet pro Start zufällige Zugangsdaten. Mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` lässt sich eine installierte Chromium-Binärdatei auswählen.

```sh
STICHRUNDE_TEST_DIRECT=1 npm run test:online
STICHRUNDE_TEST_PUBLIC=1 npm run test:online
```

Der erste Befehl testet direkte WebRTC-Verbindungen im lokalen Netz und benötigt entsprechende ICE-Unterstützung des Browser-Netzwerks. Der zweite testet den gebauten Produktionsstand über den öffentlichen PeerJS-Dienst. Bei Bedarf kann hierfür mit `STICHRUNDE_TEST_URL` die vollständige GitHub-Pages-Adresse samt abschließendem Schrägstrich angegeben werden.

## Veröffentlichung

GitHub Actions prüft und veröffentlicht den Branch `main`, sobald **GitHub Actions** als Pages-Quelle im Repository eingerichtet ist. Der Workflow prüft nach einem erfolgreichen Deploy die ausgelieferte HTML-Datei. [Einmalige Pages-Einrichtung](docs/backend-entscheidung.md#github-pages-einrichten) · [Aktuelle Workflow-Ergebnisse](https://github.com/GTheCreator1/Spiele-Plattform/actions/workflows/pages.yml)

## Projektdokumentation

- [Entwicklungsstand und Prüfprotokoll](docs/entwicklungsstand.md)
- [Architektur und Xeri-Referenz](docs/architektur.md)
- [ab6super6-Hausregeln](docs/ab6super6-regeln.md)
- [THESLIBBI-Lobby, Regelstand und Schutzrechtsprüfung](docs/theslibbi-regeln.md)

Die Titelbilder sind für Stichrunde erstellt. DM Sans wird lokal geladen. [SIL Open Font License](src/assets/dm-sans-OFL.txt)
