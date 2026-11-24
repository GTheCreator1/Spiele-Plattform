# Backend ohne laufende Kosten

Stichrunde verwendet **Cloudflare Workers Free mit einem SQLite Durable Object**. GitHub Pages liefert die SPA aus. Ein Durable Object hält die Daten der Freundesgruppe und verarbeitet Lobbys, Spielzüge und Fristen in einer eindeutigen Reihenfolge. Hibernierende WebSockets melden Änderungen an den Browser. Die Browser laden danach ihren jeweils berechtigten Zustand.

| Option | Betrieb bei 0 € | Eignung |
| --- | --- | --- |
| Workers Free und SQLite Durable Objects | Verwaltete Laufzeit, SQLite und WebSockets im Freikontingent. | Serverseitig autoritative Partien, persistierte Lobbys und eigene Anmeldung per Benutzername. SQLite und Echtzeit laufen zusammen. |
| Workers Free, D1 und ein separater Echtzeitdienst | D1 ist im Freikontingent verfügbar. | Geeignet für eine getrennte zentrale Datenbank. Für WebSockets und geordnete Spielaktionen wäre weiterhin ein Durable Object nötig. Die kleine Gruppe kann beides in einem Object nutzen. |
| Supabase Free | Verwaltete Datenbank und Realtime. Free-Projekte können nach einer Woche Inaktivität pausieren. | Die eingebaute Passwortanmeldung setzt E-Mail oder Telefonnummer voraus. |
| PocketBase | Software kostenlos. Der öffentliche Betrieb braucht einen eigenen laufenden Host. | Benutzernamen sind möglich. Dauerbetrieb, Updates und Sicherung hängen vom vorhandenen Server ab. |

[Cloudflare Workers Free](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Objects-Kontingente](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Supabase Auth](https://supabase.com/docs/guides/auth/passwords) · [Supabase-Tarife](https://supabase.com/pricing) · [PocketBase-Betrieb](https://pocketbase.io/docs/going-to-production/)

## Kontingente und Daten

- Das Freikontingent umfasst 100.000 Worker-Anfragen pro Tag, 100.000 Durable-Object-Anfragen pro Tag, 5 Millionen gelesene und 100.000 geschriebene SQLite-Zeilen pro Tag. Hinzu kommen 13.000 GB-Sekunden Object-Laufzeit pro Tag und 5 GB Gesamtspeicher, mit 1 GB pro Object. Eine Überschreitung im Free-Tarif führt zu abgewiesenen Anfragen bis zum Reset. [Cloudflare Preise und Reset](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Objektgrenzen](https://developers.cloudflare.com/durable-objects/platform/limits/)
- Produktionsdatenbank und Object werden mit EU-Datenjurisdiktion adressiert. Das Frontend liegt separat auf GitHub Pages. Cloudflare beschreibt die Wiederherstellung des SQLite-Inhalts zu einem Zeitpunkt innerhalb der letzten 30 Tage. Ein praktisch getesteter Wiederherstellungslauf und ein unabhängiger Export gehören zur späteren Betriebsabnahme. [Datenstandort](https://developers.cloudflare.com/durable-objects/reference/data-location/) · [SQLite und Wiederherstellung](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- Gespeichert werden Benutzername, Konto-ID, Passwort-Hash, gehashte Recovery-Codes und Gerätesitzungen, Freundschaften, Lobby-Einladungen, private Spielzustände und Lobby-Nachrichten. Nachrichten sind 30 Tage sichtbar und werden beim nächsten Bereinigungslauf entfernt. Konto-Löschung entzieht Sitzungen und entfernt zugehörige Datensätze. [DSGVO, Art. 2, 5, 13, 17 und 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj/?locale=de)
- Die Passwortprüfung verwendet Argon2id mit 19 MiB Speicher, zwei Durchgängen, Parallelität eins und individuellem Salt. Anmeldeversuche sind begrenzt. Der Worker speichert ein langlebiges Cookie mit `Secure`, `HttpOnly` und `SameSite=Lax` auf seiner eigenen HTTPS-Adresse. Die SPA erhält über eine Navigation zu diesem Ursprung einen an den Tab gebundenen einmaligen Code und danach ein kurzlebiges Zugriffstoken im Speicher. [OWASP Passwortspeicherung](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Private Nutzung im Freundeskreis und öffentliche Erreichbarkeit der statischen Seite betreffen unterschiedliche Aspekte des Betriebs. Ein gemeinsamer Registrierungscode begrenzt neue Konten. Vor Nutzung mit echten Konten sind Datenschutzhinweise, Löschfristen und gegebenenfalls Auftragsverarbeitung sowie der Umgang mit Browser-Speicher zu klären. [DSGVO](https://eur-lex.europa.eu/eli/reg/2016/679/oj/?locale=de) · [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html)

## Einmalige Einrichtung

1. Ein kostenloses Cloudflare-Konto öffnen und bei **Workers & Pages** den **Workers Free**-Tarif sowie eine kostenlose `workers.dev`-Adresse wählen.
2. Unter **Create application** das GitHub-Repository `GTheCreator1/Spiele-Plattform` über die GitHub-Integration verbinden. Den Worker-Namen `stichrunde-api`, den Branch `main` und den Deploy-Befehl `npx wrangler deploy` verwenden. Die SQLite-Klasse entsteht über die Migration in `wrangler.jsonc`.
3. Beim Worker unter **Settings → Variables and Secrets** ein eigenes zufälliges Secret `INVITE_CODE` setzen, beispielsweise mit einem Passwortmanager. Den Code nur im Freundeskreis teilen.
4. Unter **Settings → Secrets and variables → Actions → Variables** im GitHub-Repository `VITE_API_URL` auf die vom Worker angezeigte HTTPS-Adresse setzen. Unter **Settings → Pages** als Quelle **GitHub Actions** wählen.
5. Den Workflow **Prüfen und auf GitHub Pages veröffentlichen** unter **Actions** starten. Danach die Registrierung, Anmeldung und eine Partie zwischen zwei Geräten auf der veröffentlichten Adresse prüfen.

Falls die GitHub-Integration unpassend ist, lässt sich der Worker im angemeldeten eigenen Terminal mit `npm ci`, `npx wrangler login`, `npm run deploy:api` und `npx wrangler secret put INVITE_CODE` einrichten. Die Berechtigung wird im Cloudflare-Browserfenster erteilt. Der API-Endpunkt ist öffentlich erreichbar und seine Funktionen verlangen überprüfte Sitzungen.

[Cloudflare GitHub-Integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) · [Worker-Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [GitHub-Pages-Auslieferung](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
