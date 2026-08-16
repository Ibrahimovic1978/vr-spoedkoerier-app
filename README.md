# VR Spoedkoerier PWA

Werkende mobiele prototype/PWA gebaseerd op vrspoedkoerier.com.

## Starten
Open `index.html` via een lokale webserver, bijvoorbeeld:
`python -m http.server 8080`
en bezoek `http://localhost:8080`.

Voor installatie als PWA en service worker is HTTPS nodig wanneer hij online staat.

## Wat werkt
- Mobiele onboarding
- Dashboard
- Directe zending boeken
- Geplande zending boeken
- Indicatieve prijsberekening (€15 start + €1,30/km)
- Nacht/weekend toeslag van 50%
- Lokale opslag van zendingen
- Zendingenoverzicht
- Bel- en WhatsApp-knoppen
- PWA manifest + offline shell

## Productie-koppelingen die nog nodig zijn
Voor een echte publieke bestelapp moeten deze gegevens server-side worden opgeslagen en doorgestuurd:
1. Backend/database (bijv. Supabase/Firebase)
2. Adresvalidatie + routekilometers (Google Maps/Mapbox)
3. Login/klantaccounts
4. Betalingen (bijv. Mollie)
5. ePOD (foto, handtekening, GPS/tijd)
6. Chauffeurs-/beheeromgeving en pushmeldingen
7. E-mail/SMS bevestigingen

De huidige versie is direct bruikbaar als interactieve PWA-demo en functioneel boekingsprototype.
