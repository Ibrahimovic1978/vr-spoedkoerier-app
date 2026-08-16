# VR Spoedkoerier PWA v2

## Nieuw in v2
- Google Places adres-autocomplete
- Automatische autoroute, kilometers en reistijd
- Automatische prijsberekening op basis van route
- Centrale orderopslag via Supabase
- Ordernummers
- Klantgegevens
- Adminlogin via Supabase Auth
- Adminorderlijst
- Statusupdates: Aangevraagd, Geaccepteerd, Onderweg naar ophalen, Opgehaald, Onderweg, Afgeleverd, Geannuleerd
- Lokale fallback wanneer backend nog niet gekoppeld is

## 1. Supabase koppelen
Maak een Supabase project. Open de SQL Editor en voer `supabase_setup.sql` uit.

Maak daarna in Supabase Authentication een beheerdersgebruiker voor jezelf.

Neem uit Supabase:
- Project URL
- Publishable/anon key

Vul beide in `config.js`.

## 2. Google Maps koppelen
Maak een Google Maps Platform API key en activeer de Maps JavaScript API en Places API.
Beperk de browser key tot je eigen domein(en), bijvoorbeeld:
- https://ibrahimovic1978.github.io/*
- https://app.vrspoedkoerier.com/*

Vul de key in `config.js`.

## 3. GitHub bijwerken
Vervang in je repository de oude bestanden door de bestanden uit deze versie.
Voeg ook `config.js` en `supabase_setup.sql` toe.

Na commit zal GitHub Pages de gewijzigde versie opnieuw publiceren.

## Belangrijk
Zet nooit een Supabase service_role key in `config.js`. In een browser hoort alleen de publishable/anon key te staan. De RLS-policies in `supabase_setup.sql` bepalen wat anonieme en ingelogde gebruikers mogen doen.
