# Konfigurera integrationerna

Det här är stegen utanför Navet: appregistrering hos Microsoft och LinkedIn, redirect-URI:er,
behörigheter och miljövariabler. Arkitekturen beskrivs i `docs/arkitektur.md`.

Sidan **Integrationer** i Navet visar hela tiden vad som saknas. Ett kort med status
*Ej konfigurerad* listar exakt vilka miljövariabler servern inte har.

## Grundkrav

| Miljövariabel | Varför |
|---|---|
| `APP_PASSWORD` | Krävs på publik adress. Utan lösenord stängs alla integrationer av |
| `SESSION_SECRET` | Minst 32 tecken. Krypterar de sparade nycklarna. Generera med `openssl rand -base64 48` |
| `APP_URL` | Exakt adress utan avslutande snedstreck, till exempel `https://navet-orcin.vercel.app` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Varaktig lagring. På Vercel försvinner fillagringen |

Byter du `SESSION_SECRET` går de sparade anslutningarna inte längre att läsa. Anslut då kontona igen.

## Microsoft Outlook och Microsoft Kalender

Båda korten använder samma appregistrering i Microsoft Entra ID. Du ansluter dem var för sig.

### 1. Registrera appen (en gång)

Logga in på <https://entra.microsoft.com> med ditt administratörskonto.

1. **Applications → App registrations → New registration**
   - Name: `Navet`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: plattform **Web**, adress enligt tabellen nedan
2. Kopiera **Application (client) ID** och **Directory (tenant) ID** från översikten.
3. **Certificates & secrets → New client secret.** Kopiera **Value** direkt, det visas bara en gång.
4. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, lägg till
   behörigheterna i tabellen nedan och tryck **Grant admin consent**.

Har du redan gjort detta för den tidigare Outlook-kopplingen behöver du inte ändra något i
Entra för fas 1. Behörigheterna är desamma.

### Redirect-URI:er

| Miljö | Redirect-URI (plattform Web) |
|---|---|
| Produktion | `https://navet-orcin.vercel.app/api/auth/microsoft/callback` |
| Lokalt | `http://localhost:3000/api/auth/microsoft/callback` |

Adressen måste stämma tecken för tecken med `APP_URL` + `/api/auth/microsoft/callback`.

### Behörigheter (delegerade, Microsoft Graph)

| Behörighet | Används till | Begärs |
|---|---|---|
| `openid`, `profile`, `offline_access` | Inloggning och varaktig anslutning | Vid anslutning |
| `User.Read` | Visa vilket konto som är anslutet | Vid anslutning |
| `Mail.Read` | Inkorg, olästa, flaggade och viktiga mejl, trådar | När du ansluter Outlook |
| `Calendars.Read` | Möten, mötesinformation, lediga tider | När du ansluter Kalender |
| `Mail.ReadWrite` | Flagga och avflagga, spara utkast | Fas 2, när funktionen slås på |
| `Mail.Send` | Skicka mejl efter ditt godkännande | Fas 2, när funktionen slås på |
| `Calendars.ReadWrite` | Skapa, flytta och avboka möten, Teams-möten, inbjudningar | Fas 3, när funktionen slås på |

Navet ber aldrig om en behörighet som inte används än. När en ny funktion kräver mer får du
en fråga från Microsoft för just den behörigheten, på det konto som redan är anslutet. De tre
sista raderna kan du lägga till i Entra redan nu eller vänta med till respektive fas.

Teams-möten skapas via kalendern och kräver ingen egen behörighet, men kontot behöver en
Teams-licens.

### 2. Miljövariabler

Vercel → projektet **navet** → **Settings → Environment Variables**, sedan **Redeploy**.

| Variabel | Värde |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Klienthemlighetens **Value** |
| `MICROSOFT_TENANT_ID` | Directory (tenant) ID |

### 3. Anslut och kontrollera

1. Navet → **Integrationer** → **Anslut konto** på kortet Microsoft Outlook. Logga in och godkänn.
2. Tryck **Testa anslutningen**. Du ska få svaret *Anslutningen fungerar för …* med antal mejl
   i inkorgen. Det är ett riktigt anrop mot Microsoft Graph.
3. Gör samma sak på kortet Microsoft Kalender.
4. Öppna startsidan. Nästa möte, olästa mejl och flaggade mejl ska nu komma från ditt konto.

En anslutning som gjordes med den tidigare versionen fortsätter att fungera och räknas som
ansluten för både mejl och kalender.

### Om något går fel

| Det du ser | Orsak och åtgärd |
|---|---|
| *Ej konfigurerad* | Miljövariabler saknas. Kortet listar vilka. Glöm inte Redeploy |
| *Avstängd* | `APP_PASSWORD` saknas på en publik adress |
| *Behöver anslutas igen* | Microsoft godkänner inte längre inloggningen (lösenordsbyte, återkallat samtycke, 90 dagar utan användning). Tryck **Anslut igen** |
| *Fel*, saknar behörighet | Behörigheten finns inte i Entra eller saknar samtycke. Lägg till den och tryck Grant admin consent |
| Klienthemligheten godkänns inte | Den har gått ut. Skapa en ny i Entra, byt `MICROSOFT_CLIENT_SECRET`, Redeploy |
| Inloggningen kunde inte verifieras | Det gick mer än 10 minuter, eller så byttes webbläsare under inloggningen. Försök igen |
| Microsoft avvisade begäran | Redirect-URI:n i Entra stämmer inte exakt med `APP_URL` |

### Koppla från

**Koppla från** på ett kort gör att Navet slutar använda den delen och hämtar en ny nyckel utan
den delens behörighet. När både mejl och kalender är frånkopplade raderas de sparade nycklarna. Själva samtycket ligger kvar hos Microsoft tills
du tar bort appen under **Enterprise applications** i Entra.

### Kända begränsningar i den här versionen

- **Att följa upp** räknar flaggade mejl i alla mappar, även Skickat och Borttaget.
- **Viktiga** visar mejl som avsändaren har markerat med hög prioritet de senaste 30 dagarna,
  högst fem. Navets egen bedömning av vilka mejl som kräver en åtgärd kommer i fas 2.
- **Möten** i sammanfattningen är tidsatta händelser. Heldagshändelser, till exempel en
  kursvecka, visas i agendan men räknas inte som möten.
- Återkallar du samtycket hos Microsoft märker Navet det först vid nästa förnyelse av nyckeln,
  inom ungefär en timme.

## LinkedIn

Navet hämtar dina LinkedIn-kontakter via LinkedIns officiella **Member Data Portability API
(Member)**. API:et finns för medlemmar i EES och Schweiz och ger dig dina egna data. Navet
läser bara: ingenting skickas, publiceras, ändras eller tas bort på LinkedIn.

Det finns ingen Anslut-knapp för LinkedIn. Åtkomsttoken skapas för hand i LinkedIns eget
tokenverktyg och läggs in som miljövariabel, eftersom det är den väg LinkedIn dokumenterar
för det här API:et.

### 1. Skapa appen (en gång)

1. <https://www.linkedin.com/developers/apps> → **Create app**. Välj standardsidan
   **Member Data Portability (Member) Default Company** som företagssida. Med en egen
   företagssida går det inte att begära åtkomst, och valet kan inte ändras efteråt.
2. Fliken **Products** → **Member Data Portability API (Member)** → **Request access**.
   Åtkomsten aktiveras direkt.

### 2. Skapa en åtkomsttoken

1. <https://www.linkedin.com/developers/tools/oauth/token-generator> → välj appen.
2. Kryssa i behörigheten `r_dma_portability_self_serve` och rutan om att verktyget lägger till
   sin egen redirect-adress i appen.
3. **Request access token** → **Allow**. Kopiera token. Den gäller i upp till ett år.

### 3. Miljövariabel

Vercel → projektet **navet** → **Settings → Environment Variables**, sedan **Redeploy**.

| Variabel | Värde |
|---|---|
| `LINKEDIN_ACCESS_TOKEN` | Token från tokenverktyget, i ett stycke utan citattecken och utan ordet Bearer |

Token läses bara på servern. Den sparas inte i databasen, skickas aldrig till webbläsaren och
skrivs aldrig i loggar. Klistra inte in den någon annanstans.

### 4. Hämta och kontrollera

1. Navet → **Integrationer** → kortet LinkedIn → **Testa anslutningen**. Testet läser första
   sidan av kontaktlistan och visar hur många rader som kom och vilka fältnamn LinkedIn använder.
2. **Hämta kontakter** läser alla sidor och sparar kontakterna i Navet.
3. Öppna **Kontakter** i menyn och sök på namn eller företag.

Direkt efter att en token har skapats kan LinkedIn svara att det inte finns någon data.
LinkedIn sammanställer en ögonblicksbild när token utfärdas och det kan dröja. Navet visar då
*inte klart än*, inte ett fel. Försök igen senare.

### Så fungerar hämtningen

- Anropet är `GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria&domain=CONNECTIONS`
  med `Linkedin-Version: 202312`, den enda version som stöds. Sidorna numreras med `start`, och
  Navet fortsätter tills LinkedIn svarar att det inte finns mer data.
- Varje kontakt sparas med namn, titel, företag, kontaktdatum och profiladress. Andra fält,
  till exempel e-postadress, sparas inte.
- LinkedIn dokumenterar inte de exakta fältnamnen. Navet läser dem ur svaret, visar dem i
  resultatet av testet och hämtningen och skriver dem (bara namnen, aldrig några värden) i
  serverloggen första gången. Ett fält som inte känns igen nämns uttryckligen och gissas inte.
- En ny hämtning uppdaterar befintliga kontakter i stället för att skapa dubbletter. En
  fullständig hämtning ersätter listan, så kontakter som inte längre finns på LinkedIn
  försvinner. Är listan från LinkedIn mindre än hälften så lång som den sparade behålls de
  sparade kontakterna, eftersom LinkedIn då troligen har svarat innan sammanställningen var klar.
- Navet hämtar på egen hand högst en gång per dygn, när du öppnar sidan Kontakter, och annars
  bara när du trycker **Hämta om**. LinkedIn anger varken hur ofta ögonblicksbilden uppdateras
  eller vilka anropsgränser som gäller, så listan är inte i realtid.
- Kontakterna sparas i den befintliga tabellen `navet_kv`. Ingen ny tabell behövs.

### Om något går fel

| Det du ser | Orsak och åtgärd |
|---|---|
| *Ej konfigurerad* | `LINKEDIN_ACCESS_TOKEN` saknas. Glöm inte Redeploy |
| *Avstängd* | `APP_PASSWORD` saknas på en publik adress |
| *Behöver anslutas igen* | LinkedIn svarade 401 eller 403: token är ogiltig, har gått ut eller saknar behörigheten. Skapa en ny i tokenverktyget, byt `LINKEDIN_ACCESS_TOKEN`, Redeploy |
| Varning om citattecken, Bearer, mellanslag eller för kort värde | Värdet i `LINKEDIN_ACCESS_TOKEN` är felklistrat. Kopiera token igen |
| *Fel*, API-versionen accepteras inte (426) | LinkedIn har slutat stödja `Linkedin-Version: 202312`. Navet behöver uppdateras |
| *Fel*, Navet känner inte igen något namnfält | LinkedIn använder fältnamn som Navet inte känner till. Meddelandet listar namnen. Lägg till dem i `src/lib/integrations/linkedin/connections.ts` |
| *Inte klart än* | LinkedIn har inte sammanställt kontaktlistan. Försök igen senare |

Kortet påminner när token har varit i bruk i ungefär elva månader. LinkedIn har inget
dokumenterat sätt att förnya den utan att skapa en ny i tokenverktyget.

### Koppla från

Ta bort `LINKEDIN_ACCESS_TOKEN` i Vercel och gör en ny deploy. Återkalla också token under
**Permitted services** i LinkedIns inställningar, eller ta bort appen på LinkedIn Developers.

### Vad LinkedIns officiella API tillåter

| Funktion | Går det? |
|---|---|
| Hämta dina kontakter (namn, titel, företag, kontaktdatum) | Ja, med Member Data Portability API (Member). Byggt |
| Publicera inlägg i ditt namn | Ja, med Share on LinkedIn (`w_member_social`), efter ditt godkännande. Inte byggt än |
| Utkast och planerade inlägg | Ja, de sparas i Navet. LinkedIn har inget API för utkast. Inte byggt än |
| Statistik för dina inlägg | Nej för egna appar. Kräver att LinkedIn godkänner appen som partner |
| Meddelanden och aktivitetsflöde i realtid | Nej. Finns inte i det öppna API:et |

Att publicera inlägg kräver en egen LinkedIn-app med inloggning (Sign In with LinkedIn using
OpenID Connect och Share on LinkedIn), knuten till en företagssida som verifierar appen.
Appen för Member Data Portability kan inte användas till det. Variablerna `LINKEDIN_CLIENT_ID`
och `LINKEDIN_CLIENT_SECRET` och redirect-adressen `<APP_URL>/api/auth/linkedin/callback` är
förberedda för den delen och behövs inte för kontakterna.

Navet använder inte scraping eller inofficiella API:er. Där API:et saknar en funktion visar
Navet det tydligt och länkar till LinkedIn i stället.

## Databasen

Kör migrationerna i `supabase/migrations/` i ordning. Ny i den här versionen:

- `0003_in_progress.sql`: lägger till statusen Pågår. Den vidgar bara vilka värden som är
  tillåtna och ändrar inga befintliga rader.

Anslutningar, deras status och de hämtade LinkedIn-kontakterna sparas i den befintliga tabellen
`navet_kv`. Inga nya tabeller behövs.
