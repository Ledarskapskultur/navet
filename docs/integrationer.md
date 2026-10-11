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

**Koppla från** på ett kort gör att Navet slutar använda den delen. När både mejl och kalender
är frånkopplade raderas de sparade nycklarna. Själva samtycket ligger kvar hos Microsoft tills
du tar bort appen under **Enterprise applications** i Entra.

## LinkedIn

Anslutningen byggs i fas 4. Förberedelserna kan du göra när som helst.

### 1. Skapa appen

1. <https://www.linkedin.com/developers/apps> → **Create app**. Appen måste knytas till en
   LinkedIn-företagssida, till exempel Ledarskapskulturs sida, och sidan ska verifiera appen.
2. Fliken **Products**, lägg till:
   - **Sign In with LinkedIn using OpenID Connect** (ger `openid`, `profile`, `email`)
   - **Share on LinkedIn** (ger `w_member_social`)
3. Fliken **Auth**: kopiera **Client ID** och **Client Secret** och lägg in redirect-adresserna.

| Miljö | Authorized redirect URL |
|---|---|
| Produktion | `https://navet-orcin.vercel.app/api/auth/linkedin/callback` |
| Lokalt | `http://localhost:3000/api/auth/linkedin/callback` |

### 2. Miljövariabler

| Variabel | Värde |
|---|---|
| `LINKEDIN_CLIENT_ID` | Client ID |
| `LINKEDIN_CLIENT_SECRET` | Client Secret |

### Vad LinkedIns officiella API tillåter

| Funktion | Går det? |
|---|---|
| Ansluta kontot, visa namn, bild och e-post | Ja, med Sign In with LinkedIn using OpenID Connect |
| Publicera inlägg i ditt namn | Ja, med Share on LinkedIn (`w_member_social`), efter ditt godkännande |
| Utkast och planerade inlägg | Ja, de sparas i Navet. LinkedIn har inget API för utkast |
| Statistik för dina inlägg | Nej för egna appar. Kräver att LinkedIn godkänner appen som partner |
| Meddelanden, kontakter, aktivitetsflöde | Nej. Finns inte i det öppna API:et |

Navet använder inte scraping eller inofficiella API:er. Där API:et saknar en funktion visar
Navet det tydligt och länkar till LinkedIn i stället.

Enligt LinkedIns dokumentation gäller en åtkomstnyckel i 60 dagar, och förnyelse utan ny
inloggning är förbehållen godkända partner. Räkna därför med att ansluta LinkedIn igen ungefär
varannan månad. Detta kontrolleras mot aktuell dokumentation som första steg i fas 4.

## Databasen

Kör migrationerna i `supabase/migrations/` i ordning. Ny i den här versionen:

- `0003_in_progress.sql`: lägger till statusen Pågår. Den vidgar bara vilka värden som är
  tillåtna och ändrar inga befintliga rader.

Anslutningar och deras status sparas i den befintliga tabellen `navet_kv`. Inga nya tabeller behövs.
