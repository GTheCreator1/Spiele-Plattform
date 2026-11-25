# Stichrunde · Spiele-Plattform

Stichrunde ist ein privater Kartenspielraum für Freundesgruppen. Xeri ist lokal gegen den Computer spielbar. Der Peer-to-Peer-Zwischenstand bringt private Räume für Xeri und ab6super6 in die Anwendung. Lügen zeigt „Mach ich bald“. MindSync trägt den Status „In Entwicklung“.

## Entwicklungsstand

Der Peer-to-Peer-Umbau ist pausiert und auf einem separaten Branch gesichert. Xeri im Solomodus und die Spielregeln sind geprüft. Die Online-Partien brauchen noch die vollständige Browser- und Internetabnahme. Die Veröffentlichung erfolgt später über GitHub Actions vom Branch `main`. [Stand, Testergebnisse und Wiedereinstieg](docs/entwicklungsstand.md)

## Lokal starten und prüfen

Node.js 24 und npm werden empfohlen. Der Mindeststand ist Node.js 22.12.

```sh
npm ci
npm run dev
```

Vite zeigt die Adresse mit dem Pfad `/Spiele-Plattform/` an. Normale Online-Räume verwenden den öffentlichen PeerJS-Dienst. [Betrieb, Kosten und Vertrauensmodell](docs/backend-entscheidung.md)

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:online
```

`npm test` führt Regel-, Raum- und Transporttests aus. `npm run test:e2e` prüft den Produktionsbuild. `npm run test:online` startet Vite und eine lokale PeerJS-Signalisierung für Browser-Tests mit WebRTC. Mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` lässt sich eine installierte Chromium-Binärdatei auswählen.

## Projektdokumentation

- [Architektur und Xeri-Referenz](docs/architektur.md)
- [PeerJS-Grenzen, Fairness und GitHub Pages](docs/backend-entscheidung.md)
- [ab6super6-Hausregeln](docs/ab6super6-regeln.md)
- [MindSync-Spezifikationsstand](docs/mindsync-regeln.md)

Die Titelbilder sind für Stichrunde erstellt. DM Sans wird lokal geladen. [SIL Open Font License](src/assets/dm-sans-OFL.txt)
