const BASE = 15;
const PER_KM = 1.30;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CFG = window.VR_CONFIG || {};

let supa = null;

let directRoute = {
  km: null,
  seconds: null
};

let plannedRoute = {
  km: null,
  seconds: null
};


/* =========================================
   ALGEMENE FUNCTIES
========================================= */

function money(v){
  return new Intl.NumberFormat(
    'nl-NL',
    {
      style: 'currency',
      currency: 'EUR'
    }
  ).format(
    Number(v || 0)
  );
}

function calc(km, surcharge = false){
  let p =
    BASE +
    Number(km || 0) *
    PER_KM;

  if(surcharge){
    p *= 1.5;
  }

  return p;
}

function escapeHtml(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function toast(t){
  const e = $('#toast');

  if(!e){
    return;
  }

  e.textContent = t;
  e.classList.add('show');

  setTimeout(
    () => {
      e.classList.remove('show');
    },
    2600
  );
}

function fmtDuration(sec){
  sec =
    Number(sec || 0);

  const min =
    Math.round(
      sec / 60
    );

  if(min < 60){
    return `${min} min`;
  }

  const h =
    Math.floor(
      min / 60
    );

  const m =
    min % 60;

  return `${h}u ${m}m`;
}

function orderNo(){
  const d =
    new Date();

  return (
    'VR-' +
    d.getFullYear() +
    String(
      d.getMonth() + 1
    ).padStart(2,'0') +
    String(
      d.getDate()
    ).padStart(2,'0') +
    '-' +
    Math.random()
      .toString(36)
      .slice(2,7)
      .toUpperCase()
  );
}


/* =========================================
   SUPABASE
========================================= */

function hasBackend(){
  return !!(
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_ANON_KEY
  );
}

function hasORS(){
  return !!CFG.ORS_API_KEY;
}

function initSupabase(){

  if(
    hasBackend() &&
    window.supabase &&
    window.supabase.createClient
  ){
    supa =
      window.supabase.createClient(
        CFG.SUPABASE_URL,
        CFG.SUPABASE_ANON_KEY
      );
  }

  const b =
    $('#backendBadge');

  if(b){
    b.className =
      'backend-badge ' +
      (
        supa
        ? 'ok'
        : 'warn'
      );

    b.textContent =
      supa
      ? 'Centrale orderdatabase: verbonden'
      : 'Centrale orderdatabase: lokaal';
  }
}


/* =========================================
   PAGINA'S
========================================= */

function show(id){

  const welcome =
    $('#welcome');

  const shell =
    $('#shell');

  if(welcome){
    welcome.classList.remove('active');
    welcome.classList.add('hidden');
  }

  if(shell){
    shell.classList.remove('hidden');
  }

  $$('.page').forEach(
    x => {
      x.classList.remove('active');
    }
  );

  const page =
    $('#' + id);

  if(page){
    page.classList.add('active');
  }

  if(id === 'admin'){
    refreshAdminState();
  }

  render();

  scrollTo(0,0);
}

$$('[data-go]').forEach(
  b => {

    b.addEventListener(
      'click',
      () => {
        show(
          b.dataset.go
        );
      }
    );

  }
);


/* =========================================
   LOKALE KLANTORDERS
========================================= */

function localShipments(){

  try{

    return JSON.parse(
      localStorage.getItem(
        'vr_shipments'
      ) || '[]'
    );

  }catch{

    return [];

  }
}

function saveLocal(s){

  const a =
    localShipments();

  const index =
    a.findIndex(
      x =>
        x.order_number ===
        s.order_number
    );

  if(index >= 0){

    a[index] = {
      ...a[index],
      ...s
    };

  }else{

    a.unshift(s);

  }

  localStorage.setItem(
    'vr_shipments',
    JSON.stringify(a)
  );

  render();
}

function updateLocalShipment(
  orderNumber,
  changes
){

  const a =
    localShipments();

  const updated =
    a.map(
      s => {

        if(
          s.order_number === orderNumber ||
          s.order === orderNumber
        ){

          return {
            ...s,
            ...changes
          };

        }

        return s;

      }
    );

  localStorage.setItem(
    'vr_shipments',
    JSON.stringify(updated)
  );

  render();
}

function removeLocalShipment(
  orderNumber
){

  const a =
    localShipments();

  const updated =
    a.filter(
      s =>
        (
          s.order_number ||
          s.order ||
          s.id
        ) !== orderNumber
    );

  localStorage.setItem(
    'vr_shipments',
    JSON.stringify(updated)
  );

  render();
}


/* =========================================
   ANNULERINGSREGELS
========================================= */

function customerCanCancel(s){

  return (
    s.status === 'Aangevraagd' ||
    s.status === 'Geaccepteerd'
  );
}

function estimatedCancellationFee(s){

  if(
    s.status === 'Aangevraagd'
  ){
    return 0;
  }

  if(
    s.status === 'Geaccepteerd'
  ){

    return Math.max(
      15,
      Number(
        s.price || 0
      ) * 0.25
    );

  }

  return null;
}


/* =========================================
   AFMETINGEN / OVERIGE
========================================= */

function shipmentDimensions(s){

  const l =
    Number(
      s.length_cm || 0
    );

  const w =
    Number(
      s.width_cm || 0
    );

  const h =
    Number(
      s.height_cm || 0
    );

  if(
    !l &&
    !w &&
    !h
  ){
    return '';
  }

  return `${l || '-'} × ${w || '-'} × ${h || '-'} cm`;
}

function toggleParcelDescription(
  prefix = ''
){

  const type =
    $(
      prefix
      ? '#pParcelType'
      : '#parcelType'
    );

  const box =
    $(
      prefix
      ? '#pParcelDescriptionBox'
      : '#parcelDescriptionBox'
    );

  if(
    !type ||
    !box
  ){
    return;
  }

  const isOther =
    type.value
      .trim()
      .toLowerCase() ===
    'overige';

  if(isOther){
    box.classList.remove(
      'hidden'
    );
  }else{
    box.classList.add(
      'hidden'
    );
  }
}

const parcelType =
  $('#parcelType');

if(parcelType){

  parcelType.addEventListener(
    'change',
    () => {
      toggleParcelDescription('');
    }
  );

}

const pParcelType =
  $('#pParcelType');

if(pParcelType){

  pParcelType.addEventListener(
    'change',
    () => {
      toggleParcelDescription('p');
    }
  );

}


/* =========================================
   ORDERKAART
========================================= */

function shipmentCard(
  s,
  admin = false
){

  const order =
    s.order_number ||
    s.order ||
    s.id ||
    '';

  const dist =
    s.distance_km ||
    s.km ||
    '';

  const status =
    s.status ||
    '';

  const fee =
    Number(
      s.cancellation_fee || 0
    );

  const dimensions =
    shipmentDimensions(s);

  let customerActions = '';

  if(!admin){

    if(
      status === 'Geannuleerd'
    ){

      customerActions = `
        <div class="customer-actions">

          <p>
            <b>Geannuleerd</b>
            ${
              fee > 0
              ? ` · Annuleringskosten ${money(fee)}`
              : ' · Geen annuleringskosten'
            }
          </p>

          <button
            type="button"
            class="delete-local"
            data-order="${escapeHtml(order)}"
          >
            Verwijderen uit Mijn zendingen
          </button>

        </div>
      `;

    }else if(
      customerCanCancel(s) &&
      s.customer_token
    ){

      const estimated =
        estimatedCancellationFee(s);

      customerActions = `
        <div class="customer-actions">

          <button
            type="button"
            class="cancel-order"
            data-order="${escapeHtml(order)}"
          >
            ${
              estimated === 0
              ? 'Zending gratis annuleren'
              : `Annuleren · ${money(estimated)}`
            }
          </button>

        </div>
      `;
    }
  }

  return `
    <div
      class="shipment"
      data-order="${escapeHtml(order)}"
    >

      <div class="shipment-top">

        <div>

          <b>
            ${escapeHtml(order)}
          </b>

          <div class="meta">

            <span>
              ${escapeHtml(
                s.when || ''
              )}
            </span>

            <span>
              ${
                dist
                ? Number(dist)
                    .toFixed(1) +
                  ' km'
                : ''
              }
            </span>

            <span>
              ${escapeHtml(status)}
            </span>

          </div>

        </div>

      </div>

      <div class="meta">

        <span>
          ${escapeHtml(
            s.pickup || ''
          )}
        </span>

        <span>→</span>

        <span>
          ${escapeHtml(
            s.dropoff || ''
          )}
        </span>

      </div>

      <div class="meta">

        ${
          s.weight_kg
          ? `
            <span>
              Gewicht:
              ${escapeHtml(
                s.weight_kg
              )} kg
            </span>
          `
          : ''
        }

        ${
          dimensions
          ? `
            <span>
              Afmetingen:
              ${escapeHtml(
                dimensions
              )}
            </span>
          `
          : ''
        }

      </div>

      ${
        s.parcel_type
        ? `
          <div class="meta">
            <span>
              Zending:
              ${escapeHtml(
                s.parcel_type
              )}
            </span>
          </div>
        `
        : ''
      }

      ${
        s.parcel_description
        ? `
          <div class="meta">
            <span>
              Omschrijving:
              ${escapeHtml(
                s.parcel_description
              )}
            </span>
          </div>
        `
        : ''
      }

      ${
        s.price
        ? `
          <div class="meta">
            <span>
              Ritprijs
              ${money(s.price)}
              excl. btw
            </span>
          </div>
        `
        : ''
      }

      ${
        admin
        ? `
          <div class="admin-actions">

            <select
              class="update-status"
              data-order="${escapeHtml(order)}"
            >

              ${
                [
                  'Aangevraagd',
                  'Geaccepteerd',
                  'Onderweg',
                  'Opgehaald',
                  'Afgeleverd',
                  'Geannuleerd'
                ]
                .map(
                  x => `
                    <option
                      ${
                        x === status
                        ? 'selected'
                        : ''
                      }
                    >
                      ${x}
                    </option>
                  `
                )
                .join('')
              }

            </select>

          </div>
        `
        : customerActions
      }

    </div>
  `;
}


/* =========================================
   KLANT ANNULEREN
========================================= */

async function cancelCustomerOrder(
  orderNumber
){

  const shipment =
    localShipments()
      .find(
        s =>
          s.order_number ===
          orderNumber
      );

  if(!shipment){

    toast(
      'Zending niet gevonden.'
    );

    return;
  }

  if(
    !customerCanCancel(
      shipment
    )
  ){

    toast(
      'Deze zending kan niet meer via de app worden geannuleerd.'
    );

    return;
  }

  const estimated =
    estimatedCancellationFee(
      shipment
    );

  let message = '';

  if(
    estimated === 0
  ){

    message =
      'Deze zending is nog niet geaccepteerd. Annuleren is gratis. Doorgaan?';

  }else{

    message =
      'Deze rit is al geaccepteerd. De annuleringskosten zijn 25% van de ritprijs met minimaal €15. Kosten: ' +
      money(estimated) +
      '. Doorgaan?';

  }

  if(
    !confirm(message)
  ){
    return;
  }

  if(!supa){

    updateLocalShipment(
      orderNumber,
      {
        status:
          'Geannuleerd',

        cancellation_fee:
          estimated || 0,

        cancelled_at:
          new Date()
            .toISOString()
      }
    );

    toast(
      'Zending geannuleerd.'
    );

    return;
  }

  if(
    !shipment.customer_token
  ){

    toast(
      'Deze oudere zending heeft geen beveiligde annuleringstoken.'
    );

    return;
  }

  try{

    const {
      data,
      error
    } =
      await supa.rpc(
        'cancel_customer_order',
        {
          p_order_number:
            orderNumber,

          p_customer_token:
            shipment.customer_token
        }
      );

    if(error){

      console.error(
        'Annuleren mislukt:',
        error
      );

      throw error;
    }

    const result =
      Array.isArray(data)
      ? data[0]
      : data;

    updateLocalShipment(
      orderNumber,
      {
        status:
          'Geannuleerd',

        cancellation_fee:
          Number(
            result?.cancellation_fee ??
            estimated ??
            0
          ),

        cancelled_at:
          result?.cancelled_at ||
          new Date()
            .toISOString()
      }
    );

    toast(
      Number(
        result?.cancellation_fee || 0
      ) > 0
      ? 'Zending geannuleerd. Annuleringskosten geregistreerd.'
      : 'Zending gratis geannuleerd.'
    );

  }catch(err){

    console.error(err);

    toast(
      'Annuleren kon niet worden verwerkt.'
    );

  }
}


/* =========================================
   RENDER
========================================= */

function render(){

  const a =
    localShipments();

  const shipmentList =
    $('#shipmentList');

  if(shipmentList){

    shipmentList.innerHTML =
      a.length
      ? a
          .map(
            s =>
              shipmentCard(
                s,
                false
              )
          )
          .join('')
      : '<p>Nog geen zendingen.</p>';

  }

  const recentList =
    $('#recentList');

  if(recentList){

    recentList.innerHTML =
      a.length
      ? a
          .slice(0,3)
          .map(
            s =>
              shipmentCard(
                s,
                false
              )
          )
          .join('')
      : '<p>Nog geen recente zendingen.</p>';

  }

  $$('.cancel-order')
    .forEach(
      btn => {

        btn.addEventListener(
          'click',
          () => {

            cancelCustomerOrder(
              btn.dataset.order
            );

          }
        );

      }
    );

  $$('.delete-local')
    .forEach(
      btn => {

        btn.addEventListener(
          'click',
          () => {

            const order =
              btn.dataset.order;

            if(
              confirm(
                'Deze geannuleerde zending uit Mijn zendingen verwijderen?'
              )
            ){

              removeLocalShipment(
                order
              );

              toast(
                'Zending verwijderd uit deze telefoon.'
              );

            }

          }
        );

      }
    );
}


/* =========================================
   ROUTE UI
========================================= */

function setRouteUI(
  prefix,
  route
){

  const box =
    $(
      prefix
      ? '#pRouteBox'
      : '#routeBox'
    );

  const stat =
    $(
      prefix
      ? '#pRouteStatus'
      : '#routeStatus'
    );

  const kmEl =
    $(
      prefix
      ? '#pRouteKm'
      : '#routeKm'
    );

  const timeEl =
    $(
      prefix
      ? '#pRouteTime'
      : '#routeTime'
    );

  const priceEl =
    $(
      prefix
      ? '#pPrice'
      : '#price'
    );

  if(
    !route ||
    !route.km
  ){
    return;
  }

  if(box){
    box.classList.remove(
      'hidden'
    );
  }

  if(kmEl){

    kmEl.textContent =
      Number(
        route.km
      ).toFixed(1) +
      ' km';

  }

  if(timeEl){

    timeEl.textContent =
      fmtDuration(
        route.seconds
      );

  }

  if(stat){

    stat.textContent =
      'Route berekend';

  }

  let surcharge =
    false;

  if(prefix){

    surcharge =
      plannedSurcharge(
        $('#pDate')?.value,
        $('#pTime')?.value
      );

  }else{

    surcharge =
      !!$('#afterHours')
        ?.checked;

  }

  if(priceEl){

    priceEl.textContent =
      money(
        calc(
          route.km,
          surcharge
        )
      );

  }
}


/* =========================================
   TOESLAG
========================================= */

function plannedSurcharge(
  d,
  t
){

  if(
    !d ||
    !t
  ){
    return false;
  }

  const hour =
    Number(
      t.split(':')[0]
    );

  const dow =
    new Date(
      d +
      'T12:00:00'
    ).getDay();

  return (
    hour >= 17 ||
    hour < 8 ||
    dow === 0 ||
    dow === 6
  );
}


/* =========================================
   OPENROUTESERVICE
========================================= */

async function orsGeocode(
  address
){

  const url =
    'https://api.heigit.org/pelias/v1/search' +
    '?api_key=' +
    encodeURIComponent(
      CFG.ORS_API_KEY
    ) +
    '&text=' +
    encodeURIComponent(
      address
    ) +
    '&boundary.country=NLD' +
    '&size=1';

  const res =
    await fetch(url);

  if(!res.ok){

    throw new Error(
      'Adres zoeken mislukt'
    );

  }

  const data =
    await res.json();

  if(
    !data.features ||
    !data.features.length
  ){

    throw new Error(
      'Adres niet gevonden'
    );

  }

  const coords =
    data.features[0]
      .geometry
      .coordinates;

  return {
    lng:
      coords[0],

    lat:
      coords[1]
  };
}


/* =========================================
   ROUTE BEREKENING
========================================= */

async function calculateRoute(
  origin,
  destination,
  prefix = ''
){

  if(
    !origin ||
    !destination
  ){
    return;
  }

  const stat =
    $(
      prefix
      ? '#pRouteStatus'
      : '#routeStatus'
    );

  if(!hasORS()){

    if(stat){

      stat.textContent =
        'Routeberekening is niet gekoppeld.';

    }

    return;
  }

  if(stat){

    stat.textContent =
      'Route wordt berekend...';

  }

  try{

    const from =
      await orsGeocode(
        origin
      );

    const to =
      await orsGeocode(
        destination
      );

    const url =
      'https://api.heigit.org/openrouteservice/v2/directions/driving-car' +
      '?api_key=' +
      encodeURIComponent(
        CFG.ORS_API_KEY
      ) +
      '&start=' +
      from.lng +
      ',' +
      from.lat +
      '&end=' +
      to.lng +
      ',' +
      to.lat;

    const res =
      await fetch(url);

    if(!res.ok){

      const msg =
        await res.text();

      console.error(
        'ORS route fout:',
        res.status,
        msg
      );

      throw new Error(
        'Routeberekening mislukt'
      );

    }

    const data =
      await res.json();

    if(
      !data.features ||
      !data.features.length
    ){

      throw new Error(
        'Geen route gevonden'
      );

    }

    const summary =
      data.features[0]
        .properties
        .summary;

    const route = {

      km:
        summary.distance /
        1000,

      seconds:
        summary.duration

    };

    if(prefix){

      plannedRoute =
        route;

    }else{

      directRoute =
        route;

    }

    setRouteUI(
      prefix,
      route
    );

  }catch(err){

    console.error(err);

    if(stat){

      stat.textContent =
        err.message ||
        'Route kon niet worden berekend';

    }

  }
}


/* =========================================
   DEBOUNCE
========================================= */

function debounce(
  fn,
  ms = 650
){

  let t;

  return (...args) => {

    clearTimeout(t);

    t =
      setTimeout(
        () =>
          fn(...args),
        ms
      );

  };
}

const routeDirectDeb =
  debounce(
    () => {

      calculateRoute(
        $('#pickup')?.value,
        $('#dropoff')?.value,
        ''
      );

    }
  );

const routePlannedDeb =
  debounce(
    () => {

      calculateRoute(
        $('#pPickup')?.value,
        $('#pDropoff')?.value,
        'p'
      );

    }
  );

[
  'pickup',
  'dropoff'
]
.forEach(
  id => {

    const e =
      $('#' + id);

    if(e){

      e.addEventListener(
        'input',
        routeDirectDeb
      );

      e.addEventListener(
        'change',
        routeDirectDeb
      );

    }

  }
);

[
  'pPickup',
  'pDropoff'
]
.forEach(
  id => {

    const e =
      $('#' + id);

    if(e){

      e.addEventListener(
        'input',
        routePlannedDeb
      );

      e.addEventListener(
        'change',
        routePlannedDeb
      );

    }

  }
);


/* =========================================
   PRIJS HERBEREKENEN
========================================= */

const afterHours =
  $('#afterHours');

if(afterHours){

  afterHours.addEventListener(
    'change',
    () => {

      if(
        directRoute.km
      ){

        setRouteUI(
          '',
          directRoute
        );

      }

    }
  );

}

const pDate =
  $('#pDate');

if(pDate){

  pDate.addEventListener(
    'change',
    () => {

      if(
        plannedRoute.km
      ){

        setRouteUI(
          'p',
          plannedRoute
        );

      }

    }
  );

}

const pTime =
  $('#pTime');

if(pTime){

  pTime.addEventListener(
    'change',
    () => {

      if(
        plannedRoute.km
      ){

        setRouteUI(
          'p',
          plannedRoute
        );

      }

    }
  );

}


/* =========================================
   ROUTE INIT
========================================= */

function loadMaps(){

  if(!hasORS()){

    if(
      $('#routeStatus')
    ){

      $('#routeStatus')
        .textContent =
        'Routeberekening is niet gekoppeld.';

    }

    if(
      $('#pRouteStatus')
    ){

      $('#pRouteStatus')
        .textContent =
        'Routeberekening is niet gekoppeld.';

    }

    return;
  }

  if(
    $('#routeStatus')
  ){

    $('#routeStatus')
      .textContent =
      'Vul beide adressen in om de route te berekenen.';

  }

  if(
    $('#pRouteStatus')
  ){

    $('#pRouteStatus')
      .textContent =
      'Vul beide adressen in om de route te berekenen.';

  }

}


/* =========================================
   ORDER OPSLAAN
========================================= */

async function createOrder(
  payload
){

  if(
    !payload.customer_token
  ){

    payload.customer_token =
      crypto.randomUUID();

  }

  if(!supa){

    saveLocal(
      payload
    );

    return {
      data:
        payload,

      local:
        true
    };

  }

  const {
    error
  } =
    await supa
      .from('orders')
      .insert({

        order_number:
          payload.order_number,

        pickup:
          payload.pickup,

        dropoff:
          payload.dropoff,

        distance_km:
          payload.distance_km,

        duration_minutes:
          payload.duration_minutes,

        price:
          payload.price,

        status:
          payload.status,

        parcel_type:
          payload.parcel_type || '',

        parcel_description:
          payload.parcel_description || '',

        weight_kg:
          payload.weight_kg || null,

        length_cm:
          payload.length_cm || null,

        width_cm:
          payload.width_cm || null,

        height_cm:
          payload.height_cm || null,

        customer_name:
          payload.customer_name || '',

        customer_phone:
          payload.customer_phone || '',

        customer_email:
          payload.customer_email || '',

        when:
          payload.when || '',

        customer_token:
          payload.customer_token,

        cancellation_fee:
          0

      });

  if(error){

    console.error(
      'Supabase order opslaan mislukt:',
      error
    );

    throw error;

  }

  saveLocal(
    payload
  );

  return payload;
}


/* =========================================
   DIRECTE ORDER
========================================= */

const bookingForm =
  $('#bookingForm');

if(bookingForm){

  bookingForm.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      if(
        !directRoute.km
      ){

        toast(
          'Bereken eerst de route door beide adressen in te vullen.'
        );

        return;
      }

      const surcharge =
        !!$('#afterHours')
          ?.checked;

      const parcelTypeValue =
        $('#parcelType')
          ?.value || '';

      const payload = {

        id:
          crypto.randomUUID(),

        order_number:
          orderNo(),

        customer_token:
          crypto.randomUUID(),

        pickup:
          $('#pickup')
            ?.value || '',

        dropoff:
          $('#dropoff')
            ?.value || '',

        distance_km:
          directRoute.km,

        duration_minutes:
          Math.round(
            directRoute.seconds /
            60
          ),

        price:
          calc(
            directRoute.km,
            surcharge
          ),

        status:
          'Aangevraagd',

        when:
          'Vandaag',

        weight_kg:
          Number(
            $('#weight')
              ?.value || 0
          ),

        length_cm:
          Number(
            $('#lengthCm')
              ?.value || 0
          ),

        width_cm:
          Number(
            $('#widthCm')
              ?.value || 0
          ),

        height_cm:
          Number(
            $('#heightCm')
              ?.value || 0
          ),

        parcel_type:
          parcelTypeValue,

        parcel_description:
          parcelTypeValue
            .trim()
            .toLowerCase() ===
          'overige'
          ? (
              $('#parcelDescription')
                ?.value || ''
            )
          : '',

        customer_name:
          $('#customerName')
            ?.value || '',

        customer_phone:
          $('#customerPhone')
            ?.value || '',

        customer_email:
          $('#customerEmail')
            ?.value || '',

        cancellation_fee:
          0

      };

      try{

        await createOrder(
          payload
        );

        toast(
          'Zending aangevraagd.'
        );

        show(
          'shipments'
        );

      }catch(err){

        console.error(err);

        toast(
          'Zending kon niet worden opgeslagen.'
        );

      }

    }
  );

}


/* =========================================
   GEPLANDE ORDER
========================================= */

const plannedForm =
  $('#plannedForm');

if(plannedForm){

  plannedForm.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      if(
        !plannedRoute.km
      ){

        toast(
          'Bereken eerst de route door beide adressen in te vullen.'
        );

        return;
      }

      const d =
        $('#pDate')
          ?.value || '';

      const t =
        $('#pTime')
          ?.value || '';

      const surcharge =
        plannedSurcharge(
          d,
          t
        );

      const parcelTypeValue =
        $('#pParcelType')
          ?.value || '';

      const payload = {

        id:
          crypto.randomUUID(),

        order_number:
          orderNo(),

        customer_token:
          crypto.randomUUID(),

        pickup:
          $('#pPickup')
            ?.value || '',

        dropoff:
          $('#pDropoff')
            ?.value || '',

        distance_km:
          plannedRoute.km,

        duration_minutes:
          Math.round(
            plannedRoute.seconds /
            60
          ),

        price:
          calc(
            plannedRoute.km,
            surcharge
          ),

        status:
          'Gepland',

        when:
          `${d} ${t}`,

        weight_kg:
          Number(
            $('#pWeight')
              ?.value || 0
          ),

        length_cm:
          Number(
            $('#pLengthCm')
              ?.value || 0
          ),

        width_cm:
          Number(
            $('#pWidthCm')
              ?.value || 0
          ),

        height_cm:
          Number(
            $('#pHeightCm')
              ?.value || 0
          ),

        parcel_type:
          parcelTypeValue,

        parcel_description:
          parcelTypeValue
            .trim()
            .toLowerCase() ===
          'overige'
          ? (
              $('#pParcelDescription')
                ?.value || ''
            )
          : '',

        customer_name:
          $('#pCustomerName')
            ?.value || '',

        customer_phone:
          $('#pCustomerPhone')
            ?.value || '',

        customer_email:
          $('#pCustomerEmail')
            ?.value || '',

        cancellation_fee:
          0

      };

      try{

        await createOrder(
          payload
        );

        toast(
          'Zending ingepland.'
        );

        show(
          'shipments'
        );

      }catch(err){

        console.error(err);

        toast(
          'Zending kon niet worden opgeslagen.'
        );

      }

    }
  );

}


/* =========================================
   ADMIN STATE
========================================= */

async function refreshAdminState(){

  if(!supa){

    const out =
      $('#adminLoggedOut');

    const inn =
      $('#adminLoggedIn');

    if(out){

      out.classList.remove(
        'hidden'
      );

    }

    if(inn){

      inn.classList.add(
        'hidden'
      );

    }

    return;
  }

  const {
    data:{
      session
    }
  } =
    await supa
      .auth
      .getSession();

  const out =
    $('#adminLoggedOut');

  const inn =
    $('#adminLoggedIn');

  if(!session){

    if(out){

      out.classList.remove(
        'hidden'
      );

    }

    if(inn){

      inn.classList.add(
        'hidden'
      );

    }

    return;
  }

  if(out){

    out.classList.add(
      'hidden'
    );

  }

  if(inn){

    inn.classList.remove(
      'hidden'
    );

  }

  const identity =
    $('#adminIdentity');

  if(identity){

    identity.textContent =
      session.user?.email ||
      '';

  }

  loadAdminOrders();
}


/* =========================================
   ADMIN LOGIN
========================================= */

const adminLoginForm =
  $('#adminLoginForm');

if(adminLoginForm){

  adminLoginForm.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      if(!supa){

        toast(
          'Supabase is niet verbonden.'
        );

        return;
      }

      const email =
        $('#adminEmail')
          ?.value ||
        adminLoginForm
          .querySelector(
            '[type="email"]'
          )
          ?.value ||
        '';

      const password =
        $('#adminPassword')
          ?.value ||
        adminLoginForm
          .querySelector(
            '[type="password"]'
          )
          ?.value ||
        '';

      const {
        error
      } =
        await supa
          .auth
          .signInWithPassword({
            email,
            password
          });

      if(error){

        console.error(
          error
        );

        toast(
          'Inloggen mislukt.'
        );

        return;
      }

      toast(
        'Ingelogd.'
      );

      refreshAdminState();

    }
  );

}


/* =========================================
   ADMIN LOGOUT
========================================= */

const adminLogout =
  $('#adminLogout');

if(adminLogout){

  adminLogout.addEventListener(
    'click',
    async () => {

      if(supa){

        await supa
          .auth
          .signOut();

      }

      refreshAdminState();

    }
  );

}


/* =========================================
   ADMIN ORDERS
========================================= */

async function loadAdminOrders(){

  if(!supa){
    return;
  }

  const adminList =
    $('#adminList');

  if(!adminList){
    return;
  }

  const {
    data,
    error
  } =
    await supa
      .from('orders')
      .select('*')
      .order(
        'created_at',
        {
          ascending:
            false
        }
      );

  if(error){

    console.error(
      error
    );

    adminList.innerHTML =
      '<p>Orders konden niet worden geladen.</p>';

    return;
  }

  adminList.innerHTML =
    data?.length
    ? data
        .map(
          s =>
            shipmentCard(
              s,
              true
            )
        )
        .join('')
    : '<p>Nog geen orders.</p>';

  $$('.update-status')
    .forEach(
      sel => {

        sel.addEventListener(
          'change',
          async () => {

            const id =
              sel.dataset.order;

            const status =
              sel.value;

            const {
              error
            } =
              await supa
                .from('orders')
                .update({
                  status
                })
                .eq(
                  'order_number',
                  id
                );

            if(error){

              console.error(
                'Status bijwerken mislukt:',
                error
              );

              toast(
                'Status kon niet worden bijgewerkt.'
              );

              return;
            }

            updateLocalShipment(
              id,
              {
                status
              }
            );

            toast(
              'Status bijgewerkt.'
            );

          }
        );

      }
    );

}


/* =========================================
   BEGROETING
========================================= */

const hr =
  new Date()
    .getHours();

const greeting =
  $('#greeting');

if(greeting){

  greeting.textContent =
    hr < 12
    ? 'Goedemorgen,'
    : hr < 18
    ? 'Goedemiddag,'
    : 'Goedenavond,';

}


/* =========================================
   START
========================================= */

initSupabase();
loadMaps();
render();

toggleParcelDescription('');
toggleParcelDescription('p');


/* =========================================
   SERVICE WORKER
========================================= */

if(
  'serviceWorker'
  in navigator
){

  window.addEventListener(
    'load',
    () => {

      navigator
        .serviceWorker
        .register(
          './sw.js'
        )
        .catch(
          err =>
            console.warn(
              'Service worker:',
              err
            )
        );

    }
  );

    }
