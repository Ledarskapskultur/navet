# Navet

**Navet** är en personlig arbetsyta som samlar uppgifter, löften, idéer, anteckningar och kalender på ett ställe. Senare kommer även flaggade Outlook-mail in här.

Grundprincipen är att **Navet är huvudsystemet**. Navet fungerar **fullt ut på egen hand, utan Google-konto** (personligt läge, standard). Google Tasks och senare Outlook är *valfria* integrationskällor.

## Snabbast i drift (utan Google)

1. Deploya till Vercel (se [Deploy](#8-deploy)).
2. Lägg in miljövariablerna `APP_PASSWORD` (ditt lösenord) samt `SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY` (databasen, se [6](#6-miljövariabler)). Gör en ny deploy.
3. Öppna Navet i Chrome på Android → ⋮ → **Installera app**.
4. **Inställningar → Röst → Starta röst när Navet öppnas.** Säg sedan *"Hey Google, öppna Navet"* och prata in det du vill komma ihåg.

| Läge | När | Vad du ser |
|---|---|---|
| **Personligt** (standard) | Inget Google-konto inloggat | Din egen arbetsyta. Inga Google-delar i menyn |
| **Google** | Du har kopplat Google under Inställningar | Som ovan + tvåvägssynk med Google Tasks |
| **Demo** | `NAVET_DEMO=1` | Exempeldata och simulerad Google Tasks |

Resten av den här README:n beskriver även den valfria Google-kopplingen:

```
"Hey Google, påminn mig att skicka brevet till Anna idag"
        ↓
   Google Tasks   ←──────── klar / titel / datum / lista synkas tillbaka
        ↓  (synk vid öppning + "Synka nu")
      Navet  →  Inkorg  →  uppgift · åtagande · idé · väntar på · projekt
```

---

## Innehåll

- [Funktioner](#funktioner)
- [Teknik och arkitektur](#teknik-och-arkitektur)
- [1. Starta lokalt](#1-starta-lokalt)
- [2. Skapa ett Google Cloud-projekt](#2-skapa-ett-google-cloud-projekt)
- [3. Aktivera Google Tasks API](#3-aktivera-google-tasks-api)
- [4. Skapa OAuth-credentials](#4-skapa-oauth-credentials)
- [5. Redirect-URL:er](#5-redirect-urler)
- [6. Miljövariabler](#6-miljövariabler)
- [7. Testa appen](#7-testa-appen)
- [8. Deploy](#8-deploy)
- [Datamodell](#datamodell)
- [Så fungerar synken](#så-fungerar-synken)
- [Säkerhet](#säkerhet)
- [Nästa steg: Outlook / Microsoft Graph](#nästa-steg-outlook--microsoft-graph)

---

## Funktioner

| Sektion | Vad den gör |
|---|---|
| **Idag** (startsida) | ”God morgon”, *Viktigast idag* (3–5 saker), kalendern för dagen som en kompakt tidslinje, *Behöver din uppmärksamhet* (försenade, flaggade mail, väntar på, nytt i inkorgen), inkorgen och projekten |
| **Inkorg** | Allt som inte är sorterat än. Du ändrar typ, projekt, deadline och status direkt i kortet och klickar på *Sorterad* |
| **Att göra** | Alla aktiva uppgifter. Filter: Idag, Kommande, Försenade, Utan datum, Projekt, Prioritet och Källa |
| **Väntar på** | Vad du väntar på, från vem, datum och senaste uppföljning. Knappar för *Följt upp idag* och *Mottaget* |
| **Åtaganden** | Det du har lovat andra, till exempel ”Jag lovade Martin att skicka presentationen på tisdag” |
| **Idéer** | Idéer och anteckningar. En idé kan göras om till uppgift, projekt eller anteckning |
| **Projekt** | UGL Sverige, Ledarskapsmetoden, YH / undervisning, Företaget och Privat. Varje projekt visar öppna uppgifter, idéer, åtaganden, väntar på och senaste aktivitet |
| **Kalender** | Veckovy med demomöten och dina riktiga deadlines från Navet. *Outlook-integration kommer senare* |
| **Mail att hantera** | Förhandsvisning av flaggade Outlook-mail med Navets tolkning (vad som ska göras, deadline, projekt, källa). Outlook är inte aktivt än |
| **Google Tasks** | Alla listor. Här kan du skapa, redigera, ändra datum, markera som klar, flytta och radera. Sidan visar synkstatus och har en knapp för *Synka nu* |
| **Röst & Google** | Flödet Hey Google → Google Tasks → Navet förklarat visuellt, plus de senaste objekten som kommit från Google Tasks |
| **+ Fånga** | Snabbfångst från alla sidor: knappen i menyn, den runda knappen på mobilen och tangenterna `N` eller `Ctrl/⌘+K`. Texten tolkas på svenska, tolkningen visas innan du sparar och du kan tala in text med mikrofonen |
| **PWA** | Appen kan installeras på hemskärmen på Android och iPhone och fungerar som ett enkelt offline-skal |

### Snabbfångst – regelbaserad tolkning

| Du skriver | Navet tolkar |
|---|---|
| `Ring Johan på torsdag` | Uppgift · torsdag · person: Johan |
| `Idé till UGL: gör en sida för HR` | Idé · projekt UGL Sverige · ”Gör en sida för HR” |
| `Jag lovade Anna att skicka presentationen på fredag` | Åtagande · fredag · lovat till Anna |
| `Väntar på Martin ska skicka avtalet` | Väntar på · Martin |
| `Påminn mig att betala hyran imorgon kl 9` | Påminnelse · imorgon 09:00 |
| `Viktigt: rätta inlämningar YH 12 okt` | Uppgift · hög prioritet · YH / undervisning · 12 okt |

Tolkningen ligger i `src/lib/parser.ts`. Den returnerar ett `ParsedCapture`-objekt och kan senare bytas ut mot eller kompletteras med ett AI-anrop som returnerar samma form.

---

## Teknik och arkitektur

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS 4** – designtokens finns i `src/app/globals.css`
- **Google OAuth 2.0** (authorization code + PKCE) och **Google Tasks REST API**, utan tunga SDK:er
- **Lagring** bakom ett gemensamt interface (`NavetStore`):
  - **Fil** (`.navet-data/store.json`) – standard lokalt och kräver ingen konfiguration
  - **Supabase/Postgres** – används automatiskt när `SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY` är satta
- **Vitest** för enhetstester

```
src/
├─ app/                      Sidor (svenska routes) + API-routes
│  ├─ api/auth/google/…      OAuth-inloggning, callback, utloggning
│  ├─ api/items, projects    CRUD (synkar mot Google vid behov)
│  ├─ api/sync               Tvåvägssynk med Google Tasks
│  ├─ api/calendar, mail     Demo-providers (Outlook senare)
│  └─ manifest.ts            PWA-manifest
├─ components/               App-skal, Fånga, editor, listor, UI
├─ lib/
│  ├─ types.ts               Datamodellen
│  ├─ parser.ts              Svensk regelbaserad tolkning
│  ├─ server/
│  │  ├─ service.ts          Affärslogik + synkalgoritm
│  │  ├─ session.ts, crypto  Krypterad session (tokens)
│  │  ├─ store.ts            Lagringsinterface
│  │  ├─ file-store.ts       JSON-fil
│  │  └─ supabase-store.ts   Postgres
│  └─ integrations/
│     ├─ google/             OAuth, Tasks-klient, mock för demoläge
│     └─ microsoft/          Graph-klient (förberedd) + demo-providers
supabase/migrations/         SQL-schema
public/sw.js, icons/         Service worker + appikoner
```

---

## 1. Starta lokalt

Krav: **Node.js 20.9+** (22 rekommenderas).

```bash
npm install
cp .env.example .env.local    # kan lämnas tom för demoläge
npm run dev
```

Öppna <http://localhost:3000>.

**Utan några credentials** startar appen i **personligt läge**: en tom arbetsyta med dina fem projekt, ingen Google-koppling. Vill du se exempeldata och en *simulerad* Google Tasks, starta med `NAVET_DEMO=1 npm run dev`.

Övriga kommandon:

```bash
npm test           # enhetstester (parser + synk)
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run build && npm start   # produktionsläge (krävs för att testa service worker/PWA)
```

---

## 2. Skapa ett Google Cloud-projekt

1. Gå till <https://console.cloud.google.com/>.
2. Klicka på projektväljaren högst upp och välj **New Project**.
3. Namnge projektet, till exempel `navet`, och klicka på **Create**.
4. Kontrollera att det nya projektet är valt i projektväljaren.

## 3. Aktivera Google Tasks API

1. Gå till **APIs & Services → Library**.
2. Sök efter **Google Tasks API**.
3. Klicka på **Enable**.

## 4. Skapa OAuth-credentials

**a) OAuth consent screen** (heter i nyare konsoler *Google Auth Platform → Branding / Audience / Data access*)

1. **User type: External** (eller *Internal* om du har Google Workspace och bara ska använda appen själv inom organisationen).
2. App name: `Navet`. Ange din e-post som support- och utvecklarkontakt.
3. **Scopes / Data access** – lägg till:
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/tasks`
4. **Test users / Audience** – lägg till ditt eget Google-konto. Så länge appen har status *Testing* kan bara testanvändare logga in.

> I läget *Testing* går refresh-tokens ut efter 7 dagar, och då behöver du logga in igen. För personligt bruk på längre sikt kan du välja **Publish app**. Appen behöver då inte granskas för eget bruk, men Google visar en varning om ”overifierad app” som du kan klicka dig förbi.

**b) OAuth Client ID**

1. Gå till **APIs & Services → Credentials → Create credentials → OAuth client ID** (eller *Google Auth Platform → Clients*).
2. Application type: **Web application**.
3. Name: `Navet web`.
4. Fyll i **Authorized JavaScript origins** och **Authorized redirect URIs** enligt nästa avsnitt.
5. Klicka på **Create** och kopiera **Client ID** och **Client secret**.

## 5. Redirect-URL:er

Callback-adressen är alltid `<APP_URL>/api/auth/google/callback`.

| Miljö | Authorized JavaScript origin | Authorized redirect URI |
|---|---|---|
| Lokalt | `http://localhost:3000` | `http://localhost:3000/api/auth/google/callback` |
| Produktion | `https://navet.dindomän.se` | `https://navet.dindomän.se/api/auth/google/callback` |
| Vercel-preview (valfritt) | `https://<projekt>.vercel.app` | `https://<projekt>.vercel.app/api/auth/google/callback` |

`APP_URL` måste exakt matcha den adress som är registrerad hos Google, med samma protokoll och port och utan avslutande `/`.

## 6. Miljövariabler

Kopiera `.env.example` till `.env.local`:

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `APP_PASSWORD` | Rekommenderas | Lösenord som skyddar hela appen. Anges en gång per enhet |
| `NAVET_DEMO` | Nej | `1` = visa exempeldata och simulerad Google Tasks |
| `APP_URL` | Ja (för Google) | Bas-URL, t.ex. `http://localhost:3000` |
| `SESSION_SECRET` | Ja i produktion | Minst 32 tecken. Krypterar sessionen med Google-tokens. Generera med `openssl rand -base64 48` |
| `GOOGLE_CLIENT_ID` | För riktig Google | Från steg 4 |
| `GOOGLE_CLIENT_SECRET` | För riktig Google | Från steg 4 |
| `SUPABASE_URL` | Rekommenderas i produktion | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Rekommenderas i produktion | *service_role*-nyckeln. Används bara på servern |
| `MICROSOFT_CLIENT_ID` / `_SECRET` / `_TENANT_ID` | Nej (nästa steg) | För Outlook via Microsoft Graph |
| `NAVET_DATA_DIR` | Nej | Annan katalog för den filbaserade lagringen |

**Supabase (valfritt):** skapa ett projekt på <https://supabase.com>. Kör sedan SQL:en i `supabase/migrations/0001_navet.sql` i *SQL Editor*, eller med `supabase db push` om du använder Supabase CLI, och sätt de två variablerna. Tabellerna har RLS påslaget utan policies, så `anon`-nyckeln kommer inte åt någon data. All åtkomst går via Next.js-servern.

## 7. Testa appen

**Demoläge (inga credentials):**

1. `npm run dev` och öppna <http://localhost:3000>.
2. Startsidan visar *God morgon*, *Viktigast idag*, kalendern och vad som behöver din uppmärksamhet. Demo-Google-uppgifter som ”Skicka brevet till Anna” har redan synkats in till inkorgen.
3. Tryck `N` eller **+ Fånga** och skriv `Jag lovade Anna att skicka presentationen på fredag`. Granska tolkningen och tryck Enter.
4. Gå till **Röst & Google** och klicka på *Skicka till Google Tasks → Navet*. Uppgiften skapas i den simulerade Google Tasks och dyker upp i inkorgen.
5. Gå till **Google Tasks**: markera som klar, byt titel, ändra datum, flytta till listan ”Jobb” och radera.

**Med riktig Google:**

1. Fyll i `.env.local` (steg 6) och starta om `npm run dev`.
2. Gå till **Inställningar → Logga in med Google** och godkänn åtkomst till Google Tasks.
3. Navet synkar automatiskt och dina listor och uppgifter visas. Nya uppgifter hamnar i **Inkorgen**.
4. Testa åt båda hållen:
   - Markera en uppgift som klar i Navet och kontrollera i Google Tasks-appen att den också är klar där.
   - Säg *”Hey Google, påminn mig att testa Navet idag”* på telefonen. Öppna Navet eller klicka på **Synka nu**, så hamnar uppgiften i inkorgen.
   - Ändra titel eller datum i Google Tasks och klicka på **Synka nu**. Ändringen syns då i Navet.

**Automatiska tester:** `npm test` testar parsern, tolkningen av mail och synkalgoritmen (import, ändringar på Google-sidan, raderingar, push och flytt mellan listor) mot demo-providern.

## 8. Deploy

**Vercel (rekommenderas):**

1. Pusha repot till GitHub och importera det i <https://vercel.com/new>.
2. Lägg in miljövariablerna under *Settings → Environment Variables*. Sätt `APP_URL` till den slutliga domänen, till exempel `https://navet.vercel.app`, och glöm inte `SESSION_SECRET`.
3. **Använd Supabase i produktion.** Vercels filsystem är tillfälligt, så den filbaserade lagringen (som där hamnar i `/tmp`) försvinner mellan körningar.
4. Lägg till produktionsdomänen som origin och redirect-URI i Google Cloud (steg 5).
5. Deploya och öppna sidan i Chrome på Android. Välj sedan menyn ⋮ → **Installera app**.

**Egen server/Docker:** `npm run build && npm start`. Servern behöver Node 20.9+ och HTTPS för PWA och säkra cookies. Med filbaserad lagring behöver du peka `NAVET_DATA_DIR` till en persistent volym.

---

## Datamodell

`NavetItem` (`src/lib/types.ts`):

| Fält | Typ | Kommentar |
|---|---|---|
| `id` | string | UUID |
| `title`, `description` | string | `description` ↔ Google `notes` |
| `type` | `task` · `idea` · `commitment` · `note` · `waiting` · `reminder` | |
| `status` | `inbox` · `open` · `waiting` · `done` · `archived` | `done` ↔ Google `completed` |
| `source` | `manual` · `voice` · `google_tasks` · `outlook_mail` · `outlook_calendar` | Varifrån objektet kom |
| `projectId` | string \| null | |
| `dueDate`, `dueTime` | `YYYY-MM-DD`, `HH:mm` | Google lagrar bara datum. Tiden finns bara i Navet |
| `priority` | `low` · `normal` · `high` | |
| `estimatedTime` | minuter | |
| `waitingFor`, `person`, `lastFollowUp` | | Väntar på, vem ett åtagande gäller och senaste uppföljning |
| `externalId`, `externalProvider`, `externalListId`, `externalUpdatedAt` | | Kopplingen till Google Tasks |
| `createdAt`, `updatedAt`, `completedAt` | ISO | |

Typ, projekt, prioritet, tid och tidsåtgång finns bara i Navet. Det är den extra metadata som Google Tasks inte har.

## Så fungerar synken

- **Navet → Google:** när du sparar något i Navet skickas det direkt till Google. Det gäller titel, beskrivning, datum, klarstatus, flytt mellan listor (`tasks.move` med `destinationTasklist`, och kopiera + radera som reserv) samt radering. Det `updated`-värde som Google returnerar sparas.
- **Google → Navet** (`POST /api/sync`) körs när appen öppnas, när fliken blir aktiv igen (om det gått mer än 2 minuter sedan senaste synk) och när du klickar på **Synka nu**:
  - Nya Google-uppgifter importeras till **Inkorgen**. Parsern föreslår typ, projekt och person.
  - Om Googles `updated` skiljer sig från det sparade värdet tillämpas ändringarna från Google.
  - Uppgifter som raderats i Google arkiveras i Navet och kopplas bort från Google.
  - Gamla klara uppgifter (äldre än 7 dagar) importeras inte.
- Konflikter löses med *last writer wins*. Ändringar i Navet går ut direkt, så normalt uppstår inga konflikter.

## Säkerhet

- Inga hemligheter finns i frontend. Allt som rör Google sköts av Next.js-servern.
- Google-tokens, både access och refresh, sparas **krypterade med AES-256-GCM** i en `httpOnly`-cookie med `SameSite=Lax` (och `Secure` i produktion). Nyckeln härleds från `SESSION_SECRET`.
- OAuth använder `state` och **PKCE** (S256). Access-token förnyas automatiskt med refresh-token.
- Supabase används bara på servern med service role-nyckeln, och RLS spärrar all annan åtkomst.
- Vid utloggning raderas sessionen. Med `POST /api/auth/logout?revoke=1` återkallas även token hos Google.

## Nästa steg: Outlook / Microsoft Graph

Arkitekturen är förberedd:

- `src/lib/integrations/microsoft/graph.ts` innehåller anrop till `/me/calendarView` och flaggade mail (`flag/flagStatus eq 'flagged'`).
- `src/lib/integrations/microsoft/providers.ts` innehåller interfacen `CalendarProvider` och `MailProvider` med demoimplementationer.

För att koppla in Outlook på riktigt:

1. Registrera en app i Entra ID (Azure AD). Redirect: `<APP_URL>/api/auth/microsoft/callback`. Scopes: `offline_access User.Read Calendars.Read Mail.Read`.
2. Lägg till en OAuth-route enligt samma mönster som Google och spara tokens i sessionen.
3. Låt `getCalendarProvider()` och `getMailProvider()` returnera Graph-implementationer när användaren är inloggad.
4. ”Skapa i Navet” på mailsidan skapar redan objekt med `source: "outlook_mail"`.

---

## Förfrågningar från landningssidor

Bokningsformulär på t.ex. UGLsverige.store och Ledarskapskulturs hemsida kan skicka förfrågningar direkt till Navet. De hamnar under **Förfrågningar** (och i Inkorgen) med kund, kontaktuppgifter, önskat datum och projekt, och följer flödet *Ny → Besvarad → Bokad / Avböjd*.

| Formulärets adress | Projekt i Navet |
|---|---|
| `https://DIN-NAVET/api/inbound/ugl` | UGL Sverige |
| `https://DIN-NAVET/api/inbound/ledarskapsmetoden` | Ledarskapsmetoden |
| `https://DIN-NAVET/api/inbound/dj` | Trolleri & DJ |
| `https://DIN-NAVET/api/inbound/allmant` | (inget projekt) |

Nya källor läggs till i `src/lib/server/inbound.ts`.

**Exempel på formulär** (fungerar på vilken sida som helst):

```html
<form data-navet action="https://navet-orcin.vercel.app/api/inbound/ugl" method="post">
  <input name="subject" type="hidden" value="Företagsintern UGL">
  <input name="name" placeholder="Namn" required>
  <input name="organization" placeholder="Organisation">
  <input name="email" type="email" placeholder="E-post" required>
  <input name="phone" type="tel" placeholder="Telefon">
  <input name="date" type="date">
  <input name="participants" type="number" placeholder="Antal deltagare">
  <textarea name="message" placeholder="Meddelande"></textarea>
  <!-- fälla för spam-robotar: ska vara dold och tom -->
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
  <button type="submit">Skicka förfrågan</button>
  <p data-navet-error hidden></p>
  <p data-navet-thanks hidden>Tack! Vi återkommer inom kort.</p>
</form>
<script src="https://navet-orcin.vercel.app/navet-form.js" defer></script>
```

Utan skriptet fungerar formuläret ändå: besökaren skickas tillbaka till sidan (eller till adressen i ett dolt fält `redirect`).

**Skydd:** formulärsadressen behöver inget lösenord, men har en spamfälla, gräns på 10 förfrågningar per 10 minuter och IP, samt valfri lista över tillåtna webbplatser i `FORM_ALLOWED_ORIGINS` (t.ex. `https://uglsverige.store,https://ledarskapskultur.se`).

> Koppla inte in formulären förrän Navet har en riktig databas (Supabase). Utan den kan förfrågningar försvinna på Vercel.

---

## Röst när telefonen är låst (Tasker)

Navet har ett röst-API (`POST /api/assistant`, skyddat med `NAVET_API_TOKEN`) som Tasker kan anropa i bakgrunden – du kan fråga Navet och spara saker utan att låsa upp telefonen. Steg-för-steg: [docs/tasker.md](docs/tasker.md).

---

## Outlook (kalender och flaggade mail)

Navet läser Outlook-kalendern och flaggade mail via Microsoft Graph (läsbehörighet). Kopplingen sparas krypterad på servern och gäller alla enheter. Steg-för-steg för Entra och Vercel: [docs/outlook.md](docs/outlook.md).
