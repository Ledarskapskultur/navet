# Arkitektur: Navet som arbetsnav

Navet är huvudsystemet. Outlook, kalendern och LinkedIn är integrationer som kopplas in
bakom ett gemensamt gränssnitt. Det här dokumentet beskriver hur delarna hänger ihop, vad
som är byggt och i vilken ordning resten byggs.

## Utgångsläge

Projektet fanns redan och återanvänds fullt ut:

| Del | Val |
|---|---|
| Ramverk | Next.js 16 (App Router), React 19, TypeScript strict |
| Design | Tailwind CSS 4 med egna designtokens i `src/app/globals.css` |
| Lagring | `NavetStore`: Supabase (Postgres) i drift, JSON-fil lokalt |
| Inloggning | Ett lösenord för hela appen (`APP_PASSWORD`), kontrolleras i `src/proxy.ts` |
| Drift | Vercel, produktionsgrenen deployas automatiskt |
| Tester | Vitest |

Navet är en arbetsyta för en person. Därför finns inga användarkonton i databasen.
Lösenordet låser hela appen, och anslutna konton hör till arbetsytans ägare.

## Lager

```
Webbläsare (React)                       src/app, src/components, src/hooks
    │  bara JSON, aldrig nycklar
    ▼
API-routes (Next.js-servern)             src/app/api
    │
    ├─ Navets egen data                  src/lib/server      (service, store, session)
    │
    └─ Integrationer                     src/lib/integrations
         ├─ types.ts                     gemensam modell för alla integrationer
         ├─ status.ts                    status, behörigheter och funktioner per integration
         ├─ test.ts                      "Testa anslutningen"
         ├─ microsoft/
         │    ├─ scopes.ts               behörighetsgrupper och stegvis samtycke
         │    ├─ oauth.ts                Entra ID: auktorisering, kodbyte, förnyelse
         │    ├─ connection.ts           krypterad lagring av nycklar, hälsa, förnyelse
         │    ├─ graph.ts                Microsoft Graph: mejl och kalender
         │    └─ providers.ts            väljer Outlook, demo eller ingenting
         ├─ google/                      Google Tasks (fanns sedan tidigare)
         └─ linkedin/
              ├─ api.ts                  Member Snapshot API (Member Data Portability), enbart läsning
              ├─ connections.ts          fältmappning och normalisering av kontakter
              └─ sync.ts                 hämtning, lagring, status och sökning
```

Frontend, backend, API-integrationer och autentisering ligger i var sin del. Webbläsaren
talar bara med Navets egna API-routes och ser aldrig en åtkomstnyckel.

## Integrationsmodellen

Varje integration beskrivs med samma form (`IntegrationStatus` i
`src/lib/integrations/types.ts`):

- **state**: `not_configured`, `locked`, `disconnected`, `connected`, `needs_reauth` eller `error`
- **account**, **connectedAt**, **lastSyncAt**, **lastError**
- **permissions**: varje behörighet hos tjänsten, om den är beviljad och vad den används till
- **capabilities**: varje funktion, om den fungerar, är planerad eller saknas i tjänstens API,
  och om den bara läser (`read`) eller ändrar något (`write`)

Sidan Integrationer, startsidan och senare AI-assistenten läser alla samma status via
`GET /api/integrations`.

| Route | Gör |
|---|---|
| `GET /api/integrations` | Status för alla integrationer |
| `POST /api/integrations/{id}/test` | Gör ett riktigt anrop mot tjänsten och rapporterar resultatet |
| `POST /api/integrations/{id}/disconnect` | Kopplar från. Nycklarna raderas när ingen del använder dem |
| `GET /api/auth/microsoft?grant=…` | Startar inloggning hos Microsoft |
| `GET /api/auth/microsoft/callback` | Tar emot svaret, byter kod mot nycklar, sparar krypterat |
| `GET /api/mail/summary` | Olästa, flaggade, viktiga och senaste mejl till startsidan |
| `GET /api/mail` | Flaggade mejl till sidan Mail att hantera |
| `GET /api/calendar?from=&to=` | Kalenderhändelser |
| `POST /api/integrations/linkedin/sync` | Hämtar LinkedIn-kontakterna på nytt. Med `{ "auto": true }` högst en gång per dygn |
| `GET /api/contacts?q=&limit=&offset=` | Sparade LinkedIn-kontakter, sökbara på namn och företag |

## Säkerhet

- **OAuth, aldrig lösenord.** Authorization code med PKCE (S256) och `state`. Navet ser aldrig
  lösenordet till Microsoft eller LinkedIn.
- **LinkedIn-token som miljövariabel.** Åtkomsttoken för LinkedIns Member Data Portability API
  skapas i LinkedIns tokenverktyg och ligger i `LINKEDIN_ACCESS_TOKEN`. Den läses bara på
  servern, sparas inte i databasen och skrivs aldrig i loggar. I databasen finns bara ett
  förkortat kontrollvärde, så att Navet märker när token byts.
- **Nycklar bara på servern.** Access token och refresh token krypteras med AES-256-GCM
  (nyckel härledd ur `SESSION_SECRET`) och sparas i databasen. De skickas aldrig till
  webbläsaren och finns inte i någon cookie.
- **Inga hemligheter i frontend eller Git.** Klient-ID och klienthemligheter läses bara ur
  miljövariabler på servern. `.env*` är undantaget i `.gitignore`.
- **Minsta behörighet.** Navet ber bara om behörigheter som används. Skrivbehörigheter begärs
  först när funktionen som behöver dem är byggd, och då stegvis för det konto som redan är
  anslutet. Kopplar du från en del begär Navet nya nycklar utan den delens behörighet.
- **Anslutning startas bara från Navet.** En länk på en annan webbplats kan inte starta en
  anslutning, och efter inloggningen går det bara att hamna på en sida inom Navet.
- **Lås på publik adress.** Ligger Navet på internet utan `APP_PASSWORD` stängs integrationerna
  av helt. Annars skulle vem som helst med länken kunna läsa mejl och kalender.
- **Godkännande.** Allt som skickar, publicerar, ändrar eller raderar något hos en tjänst är
  märkt `write` och kräver ett uttryckligt godkännande i gränssnittet.
- **Ingen simulerad data.** Utan anslutning visas ingenting, bara en uppmaning att ansluta.
  Exempeldata finns enbart i demoläget (`NAVET_DEMO=1`) och är då tydligt märkt.

## AI-assistent (förberett)

Assistenten ska inte få egna nycklar eller fri tillgång till kontona. Den ska anropa samma
funktioner som gränssnittet, via listan över `capabilities`:

- `read` får assistenten köra direkt (till exempel "visa mina viktigaste mejl idag").
- `write` blir ett förslag som du godkänner innan något händer (till exempel skicka ett mejl,
  boka ett möte eller publicera ett inlägg).

Det regelbaserade röst-API:t (`/api/assistant`) och tolkningen av mejl
(`src/lib/mail-interpret.ts`) returnerar redan strukturerade svar som en språkmodell kan
ersätta utan att resten av appen ändras. Kopplingen byggs i fas 5.

## Faser

| Fas | Innehåll | Status |
|---|---|---|
| 1 | Teknisk grund: integrationsmodell, sidan Integrationer, ny startsida, status Att göra, Pågår och Klart, ljus och mörk vy | Klar |
| 2 a | Microsoft-inloggning: behörighetsgrupper, stegvis samtycke, förnyelse, återanslutning, anslutningstest, felhantering | Klar, verifieras mot ditt konto |
| 2 b | Outlook: hela inkorgen, läsa mejl, sök och filter, trådar, flagga, utkast, skicka efter godkännande | Nästa steg |
| 3 | Kalender: dag, vecka, månad, lediga tider, skapa och flytta bokningar, Teams-möten, bokningsbara luckor | Planerad |
| 4 a | LinkedIn: hämta kontakter via Member Data Portability API, kontaktvy med sökning | Klar, verifieras mot ditt konto |
| 4 b | LinkedIn: utkast och publicera efter godkännande | Planerad |
| 5 | Gemensamt flöde: mejl till uppgifter fullt ut, dagsöversikt, AI-assistent | Planerad |

## Vad som fungerar på riktigt i dag

| Funktion | Läge |
|---|---|
| Uppgifter, inkorg, projekt, åtaganden, förfrågningar, röst | Fungerar, egen data i Supabase |
| Status Att göra, Pågår, Klart med deadline och prioritet | Fungerar. Kräver migration `0003_in_progress.sql` i Supabase |
| Ljus och mörk vy, mobil och dator | Fungerar |
| Anslut och koppla från Outlook och kalender, var för sig | Fungerar när Entra-appen är konfigurerad |
| Startsidan: nästa möte, olästa mejl, flaggade mejl, dagens agenda, kommande möten | Riktig data från Microsoft Graph när kontot är anslutet |
| Viktiga, flaggade och senaste mejl, skapa uppgift från mejl | Riktig data, läsbehörighet |
| Boka nytt möte | Öppnar Outlooks bokningsformulär. Bokning direkt i Navet kommer i fas 3 |
| Läsa hela mejl, söka, flagga, utkast, skicka | Inte byggt, fas 2 b |
| Skapa och flytta möten, Teams-möten, lediga tider | Inte byggt, fas 3 |
| LinkedIn-kontakter: hämta, spara och söka på namn och företag | Riktig data från LinkedIns Member Data Portability API när token är inlagd. Enbart läsning |
| LinkedIn-inlägg: utkast och publicering | Inte byggt, fas 4 b. Kortet visar vad som krävs och vad API:et inte tillåter |

## Test

- `npm test`: enhetstester, bland annat behörighetslogik, kryptering av nycklar, förnyelse,
  återanslutning, felstatus, låsning på publik adress och att ingen simulerad data visas.
  För LinkedIn: sidbläddring, fältmappning, dubbletter, felkoder, "inte klart än", högst en
  automatisk hämtning per dygn och att token aldrig lämnar servern. Testerna körs mot en lokal
  ersättare för LinkedIns API. Den sista kontrollen, vilka fältnamn LinkedIn faktiskt skickar,
  görs mot ditt konto med Testa anslutningen.
- Hela anslutningsflödet är dessutom genomklickat i webbläsare mot en lokal ersättare för
  Microsofts inloggning och Graph (60 kontroller). Det verifierar Navets logik, inte Microsofts
  tjänst. Den sista kontrollen gör du själv mot ditt konto, se `docs/integrationer.md`.
