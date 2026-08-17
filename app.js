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


/* =========================================================
   HULPFUNCTIES
========================================================= */

function uid(){
  if(
    window.crypto &&
    typeof crypto.randomUUID === 'function'
  ){
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function money(value){
  return new Intl.NumberFormat(
    'nl-NL',
    {
      style: 'currency',
      currency: 'EUR'
    }
  ).format(Number(value || 0));
}

function calc(km, surcharge = false){
  let price =
    BASE +
    Number(km || 0) * PER_KM;

  if(surcharge){
    price *= 1.5;
  }

  return price;
}

function escapeHtml(value){
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message){
  const element = $('#toast');

  if(!element){
    return;
  }

  element.textContent = message;
  element.classList.add('show');

  setTimeout(() => {
    element.classList.remove('show');
  }, 2600);
}

function fmtDuration(seconds){
  const minutes =
    Math.round(
      Number(seconds || 0) / 60
    );

  if(minutes < 60){
    return `${minutes} min`;
  }

  const hours =
    Math.floor(minutes / 60);

  const remaining =
    minutes % 60;

  return `${hours}u ${remaining}m`;
}

function orderNo(){
  const d = new Date();

  return (
    'VR-' +
    d.getFullYear() +
    String(
      d.getMonth() + 1
    ).padStart(2, '0') +
    String(
      d.getDate()
    ).padStart(2, '0') +
    '-' +
    Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()
  );
}


/* =========================================================
   SUPABASE
========================================================= */

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
  try{
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
  }catch(error){
    console.error(
      'Supabase initialiseren mislukt:',
      error
    );

    supa = null;
  }

  const badge =
    $('#backendBadge');

  if(badge){
    badge.className =
      'backend-badge ' +
      (
        supa
          ? 'ok'
          : 'warn'
      );

    badge.textContent =
      supa
        ? 'Centrale orderdatabase: verbonden'
        : 'Centrale orderdatabase: niet verbonden';
  }
}


/* =========================================================
   PAGINA NAVIGATIE
========================================================= */

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

  $$('.page').forEach(page => {
    page.classList.remove('active');
  });

  const target =
    $('#' + id);

  if(target){
    target.classList.add('active');
  }

  if(id === 'admin'){
    refreshAdminState();
  }

  render();

  window.scrollTo(
    0,
    0
  );
}

function initNavigation(){
  $$('[data-go]').forEach(button => {
    button.addEventListener(
      'click',
      () => {
        show(button.dataset.go);
      }
    );
  });
}


/* =========================================================
   LOKALE KLANTORDERS
========================================================= */

function localShipments(){
  try{
    return JSON.parse(
      localStorage.getItem(
        'vr_shipments'
      ) || '[]'
    );
  }catch(error){
    console.error(error);

    return [];
  }
}

function saveLocal(shipment){
  const shipments =
    localShipments();

  const index =
    shipments.findIndex(
      item =>
        item.order_number ===
        shipment.order_number
    );

  if(index >= 0){
    shipments[index] = {
      ...shipments[index],
      ...shipment
    };
  }else{
    shipments.unshift(
      shipment
    );
  }

  localStorage.setItem(
    'vr_shipments',
    JSON.stringify(shipments)
  );

  render();
}

function updateLocalShipment(
  orderNumber,
  changes
){
  const shipments =
    localShipments();

  const updated =
    shipments.map(
      shipment => {
        if(
          shipment.order_number === orderNumber ||
          shipment.order === orderNumber
        ){
          return {
            ...shipment,
            ...changes
          };
        }

        return shipment;
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
  const shipments =
    localShipments();

  const updated =
    shipments.filter(
      shipment =>
        (
          shipment.order_number ||
          shipment.order ||
          shipment.id
        ) !== orderNumber
    );

  localStorage.setItem(
    'vr_shipments',
    JSON.stringify(updated)
  );

  render();
}


/* =========================================================
   AFMETINGEN EN OVERIGE
========================================================= */

function shipmentDimensions(shipment){
  const length =
    Number(
      shipment.length_cm || 0
    );

  const width =
    Number(
      shipment.width_cm || 0
    );

  const height =
    Number(
      shipment.height_cm || 0
    );

  if(
    !length &&
    !width &&
    !height
  ){
    return '';
  }

  return (
    `${length || '-'} × ` +
    `${width || '-'} × ` +
    `${height || '-'} cm`
  );
}

function toggleParcelDescription(
  planned = false
){
  const type =
    $(
      planned
        ? '#pParcelType'
        : '#parcelType'
    );

  const box =
    $(
      planned
        ? '#pParcelDescriptionBox'
        : '#parcelDescriptionBox'
    );

  if(
    !type ||
    !box
  ){
    return;
  }

  const other =
    type.value
      .trim()
      .toLowerCase() ===
    'overige';

  box.classList.toggle(
    'hidden',
    !other
  );
}

function initParcelFields(){
  const directType =
    $('#parcelType');

  if(directType){
    directType.addEventListener(
      'change',
      () => {
        toggleParcelDescription(false);
      }
    );
  }

  const plannedType =
    $('#pParcelType');

  if(plannedType){
    plannedType.addEventListener(
      'change',
      () => {
        toggleParcelDescription(true);
      }
    );
  }

  toggleParcelDescription(false);
  toggleParcelDescription(true);
}


/* =========================================================
   ANNULERINGSREGELS
========================================================= */

function customerCanCancel(shipment){
  return [
    'Aangevraagd',
    'Gepland',
    'Geaccepteerd'
  ].includes(
    shipment.status
  );
}

function estimatedCancellationFee(
  shipment
){
  if(
    shipment.status === 'Aangevraagd' ||
    shipment.status === 'Gepland'
  ){
    return 0;
  }

  if(
    shipment.status === 'Geaccepteerd'
  ){
    return Math.max(
      15,
      Number(
        shipment.price || 0
      ) * 0.25
    );
  }

  return null;
}


/* =========================================================
   ORDERKAART
========================================================= */

function shipmentCard(
  shipment,
  admin = false
){
  const order =
    shipment.order_number ||
    shipment.order ||
    shipment.id ||
    '';

  const distance =
    shipment.distance_km ||
    shipment.km ||
    '';

  const status =
    shipment.status || '';

  const dimensions =
    shipmentDimensions(
      shipment
    );

  const cancellationFee =
    Number(
      shipment.cancellation_fee || 0
    );

  let actions = '';

  if(admin){
    actions = `
      <div class="admin-actions">

        <select
          class="update-status"
          data-order="${escapeHtml(order)}"
        >

          ${
            [
              'Aangevraagd',
              'Gepland',
              'Geaccepteerd',
              'Onderweg',
              'Opgehaald',
              'Afgeleverd',
              'Geannuleerd'
            ]
            .map(
              item => `
                <option
                  value="${item}"
                  ${
                    item === status
                      ? 'selected'
                      : ''
                  }
                >
                  ${item}
                </option>
              `
            )
            .join('')
          }

        </select>

      </div>
    `;
  }else{
    if(
      customerCanCancel(shipment)
    ){
      const fee =
        estimatedCancellationFee(
          shipment
        );

      actions += `
        <div class="customer-actions">

          <button
            type="button"
            class="cancel-order"
            data-order="${escapeHtml(order)}"
          >
            ${
              fee === 0
                ? 'Zending annuleren'
                : `Annuleren · ca. ${money(fee)}`
            }
          </button>

        </div>
      `;
    }

    if(
      status === 'Geannuleerd' ||
      status === 'Afgeleverd'
    ){
      actions += `
        <div class="customer-actions">

          <button
            type="button"
            class="delete-local"
            data-order="${escapeHtml(order)}"
          >
            Verwijderen uit Mijn zendingen
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
                shipment.when || ''
              )}
            </span>

            ${
              distance
                ? `
                  <span>
                    ${Number(distance).toFixed(1)} km
                  </span>
                `
                : ''
            }

            <span>
              ${escapeHtml(status)}
            </span>

          </div>

        </div>

      </div>

      <div class="meta">

        <span>
          ${escapeHtml(
            shipment.pickup || ''
          )}
        </span>

        <span>→</span>

        <span>
          ${escapeHtml(
            shipment.dropoff || ''
          )}
        </span>

      </div>

      ${
        shipment.weight_kg
          ? `
            <div class="meta">
              <span>
                Gewicht:
                ${escapeHtml(
                  shipment.weight_kg
                )} kg
              </span>
            </div>
          `
          : ''
      }

      ${
        dimensions
          ? `
            <div class="meta">
              <span>
                Afmetingen:
                ${escapeHtml(
                  dimensions
                )}
              </span>
            </div>
          `
          : ''
      }

      ${
        shipment.parcel_type
          ? `
            <div class="meta">
              <span>
                Zending:
                ${escapeHtml(
                  shipment.parcel_type
                )}
              </span>
            </div>
          `
          : ''
      }

      ${
        shipment.parcel_description
          ? `
            <div class="meta">
              <span>
                Omschrijving:
                ${escapeHtml(
                  shipment.parcel_description
                )}
              </span>
            </div>
          `
          : ''
      }

      ${
        shipment.price
          ? `
            <div class="meta">
              <span>
                Ritprijs:
                ${money(
                  shipment.price
                )}
                excl. btw
              </span>
            </div>
          `
          : ''
      }

      ${
        status === 'Geannuleerd'
          ? `
            <div class="meta">
              <span>
                ${
                  cancellationFee > 0
                    ? `Annuleringskosten: ${money(cancellationFee)}`
                    : 'Geen annuleringskosten'
                }
              </span>
            </div>
          `
          : ''
      }

      ${actions}

    </div>
  `;
}


/* =========================================================
   RENDER KLANTORDERS
========================================================= */

function render(){
  const shipments =
    localShipments();

  const list =
    $('#shipmentList');

  if(list){
    list.innerHTML =
      shipments.length
        ? shipments
            .map(
              shipment =>
                shipmentCard(
                  shipment,
                  false
                )
            )
            .join('')
        : '<p>Nog geen zendingen.</p>';
  }

  const recent =
    $('#recentList');

  if(recent){
    recent.innerHTML =
      shipments.length
        ? shipments
            .slice(0, 3)
            .map(
              shipment =>
                shipmentCard(
                  shipment,
                  false
                )
            )
            .join('')
        : '<p>Nog geen recente zendingen.</p>';
  }

  $$('.cancel-order').forEach(
    button => {
      button.addEventListener(
        'click',
        () => {
          cancelCustomerOrder(
            button.dataset.order
          );
        }
      );
    }
  );

  $$('.delete-local').forEach(
    button => {
      button.addEventListener(
        'click',
        () => {
          if(
            confirm(
              'Deze zending uit Mijn zendingen verwijderen?'
            )
          ){
            removeLocalShipment(
              button.dataset.order
            );

            toast(
              'Zending verwijderd.'
            );
          }
        }
      );
    }
  );
}


/* =========================================================
   KLANT ANNULEREN
========================================================= */

async function cancelCustomerOrder(
  orderNumber
){
  const shipment =
    localShipments().find(
      item =>
        item.order_number ===
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

  const fee =
    estimatedCancellationFee(
      shipment
    );

  const message =
    fee === 0
      ? 'Deze zending kan kosteloos worden geannuleerd. Doorgaan?'
      : (
          'Deze zending is al geaccepteerd. ' +
          `Geschatte annuleringskosten: ${money(fee)}. ` +
          'Doorgaan?'
        );

  if(
    !confirm(message)
  ){
    return;
  }

  /*
    Als de veilige Supabase RPC aanwezig is,
    annuleren we ook centraal.
  */

  if(
    supa &&
    shipment.customer_token &&
    shipment.backend_cancel_supported
  ){
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
              fee ??
              0
            ),

          cancelled_at:
            result?.cancelled_at ||
            new Date().toISOString()
        }
      );

      toast(
        'Zending geannuleerd.'
      );

      return;

    }catch(error){
      console.error(
        'Centrale annulering mislukt:',
        error
      );

      toast(
        'Annuleren kon niet centraal worden verwerkt.'
      );

      return;
    }
  }

  /*
    Geen centrale annuleringsfunctie:
    we veranderen NIET stilletjes de database.
  */

  toast(
    'Annuleren via de centrale database moet nog worden gekoppeld.'
  );
}


/* =========================================================
   ROUTE UI
========================================================= */

function setRouteUI(
  planned,
  route
){
  const box =
    $(
      planned
        ? '#pRouteBox'
        : '#routeBox'
    );

  const status =
    $(
      planned
        ? '#pRouteStatus'
        : '#routeStatus'
    );

  const km =
    $(
      planned
        ? '#pRouteKm'
        : '#routeKm'
    );

  const time =
    $(
      planned
        ? '#pRouteTime'
        : '#routeTime'
    );

  const price =
    $(
      planned
        ? '#pPrice'
        : '#price'
    );

  if(
    !route ||
    !route.km
  ){
    return;
  }

  box?.classList.remove(
    'hidden'
  );

  if(km){
    km.textContent =
      `${Number(route.km).toFixed(1)} km`;
  }

  if(time){
    time.textContent =
      fmtDuration(
        route.seconds
      );
  }

  if(status){
    status.textContent =
      'Route berekend';
  }

  let surcharge = false;

  if(planned){
    surcharge =
      plannedSurcharge(
        $('#pDate')?.value,
        $('#pTime')?.value
      );
  }else{
    surcharge =
      !!$('#afterHours')?.checked;
  }

  if(price){
    price.textContent =
      money(
        calc(
          route.km,
          surcharge
        )
      );
  }
}


/* =========================================================
   TOESLAG
========================================================= */

function plannedSurcharge(
  date,
  time
){
  if(
    !date ||
    !time
  ){
    return false;
  }

  const hour =
    Number(
      time.split(':')[0]
    );

  const day =
    new Date(
      date + 'T12:00:00'
    ).getDay();

  return (
    hour >= 17 ||
    hour < 8 ||
    day === 0 ||
    day === 6
  );
}


/* =========================================================
   OPENROUTESERVICE
========================================================= */

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

  const response =
    await fetch(url);

  if(!response.ok){
    throw new Error(
      'Adres zoeken mislukt'
    );
  }

  const data =
    await response.json();

  if(
    !data.features ||
    !data.features.length
  ){
    throw new Error(
      'Adres niet gevonden'
    );
  }

  const coordinates =
    data.features[0]
      .geometry
      .coordinates;

  return {
    lng: coordinates[0],
    lat: coordinates[1]
  };
}

async function calculateRoute(
  origin,
  destination,
  planned = false
){
  if(
    !origin ||
    !destination
  ){
    return;
  }

  const status =
    $(
      planned
        ? '#pRouteStatus'
        : '#routeStatus'
    );

  if(!hasORS()){
    if(status){
      status.textContent =
        'Routeberekening is niet gekoppeld.';
    }

    return;
  }

  if(status){
    status.textContent =
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

    const response =
      await fetch(url);

    if(!response.ok){
      console.error(
        await response.text()
      );

      throw new Error(
        'Routeberekening mislukt'
      );
    }

    const data =
      await response.json();

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

    if(planned){
      plannedRoute = route;
    }else{
      directRoute = route;
    }

    setRouteUI(
      planned,
      route
    );

  }catch(error){
    console.error(
      error
    );

    if(status){
      status.textContent =
        error.message ||
        'Route kon niet worden berekend';
    }
  }
}


/* =========================================================
   DEBOUNCE
========================================================= */

function debounce(
  fn,
  delay = 650
){
  let timer;

  return (...args) => {
    clearTimeout(timer);

    timer =
      setTimeout(
        () => fn(...args),
        delay
      );
  };
}

function initRouteInputs(){
  const directRouteDebounced =
    debounce(
      () => {
        calculateRoute(
          $('#pickup')?.value,
          $('#dropoff')?.value,
          false
        );
      }
    );

  const plannedRouteDebounced =
    debounce(
      () => {
        calculateRoute(
          $('#pPickup')?.value,
          $('#pDropoff')?.value,
          true
        );
      }
    );

  [
    'pickup',
    'dropoff'
  ].forEach(id => {
    const field =
      $('#' + id);

    if(field){
      field.addEventListener(
        'input',
        directRouteDebounced
      );

      field.addEventListener(
        'change',
        directRouteDebounced
      );
    }
  });

  [
    'pPickup',
    'pDropoff'
  ].forEach(id => {
    const field =
      $('#' + id);

    if(field){
      field.addEventListener(
        'input',
        plannedRouteDebounced
      );

      field.addEventListener(
        'change',
        plannedRouteDebounced
      );
    }
  });

  $('#afterHours')
    ?.addEventListener(
      'change',
      () => {
        if(directRoute.km){
          setRouteUI(
            false,
            directRoute
          );
        }
      }
    );

  $('#pDate')
    ?.addEventListener(
      'change',
      () => {
        if(plannedRoute.km){
          setRouteUI(
            true,
            plannedRoute
          );
        }
      }
    );

  $('#pTime')
    ?.addEventListener(
      'change',
      () => {
        if(plannedRoute.km){
          setRouteUI(
            true,
            plannedRoute
          );
        }
      }
    );
}

function initRouteStatus(){
  const message =
    hasORS()
      ? 'Vul beide adressen in om de route te berekenen.'
      : 'Routeberekening is niet gekoppeld.';

  if($('#routeStatus')){
    $('#routeStatus').textContent =
      message;
  }

  if($('#pRouteStatus')){
    $('#pRouteStatus').textContent =
      message;
  }
}


/* =========================================================
   DATABASE ORDER OPSLAAN
========================================================= */

function buildDatabaseRow(
  payload,
  includeCancellationFields = true
){
  const row = {
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
      payload.when || ''
  };

  if(includeCancellationFields){
    row.customer_token =
      payload.customer_token;

    row.cancellation_fee =
      0;
  }

  return row;
}

function missingOptionalCancellationColumn(
  error
){
  const text =
    (
      error?.message ||
      ''
    ).toLowerCase();

  return (
    text.includes('customer_token') ||
    text.includes('cancellation_fee')
  );
}

async function createOrder(
  payload
){
  payload.customer_token =
    payload.customer_token ||
    uid();

  /*
    Zonder Supabase blijft de order
    lokaal beschikbaar.
  */

  if(!supa){
    payload.backend_cancel_supported =
      false;

    saveLocal(
      payload
    );

    return payload;
  }

  /*
    Eerst proberen we met de beveiligde
    annuleringsvelden.
  */

  let result =
    await supa
      .from('orders')
      .insert(
        buildDatabaseRow(
          payload,
          true
        )
      );

  /*
    Als customer_token/cancellation_fee
    nog niet in Supabase bestaan,
    proberen we automatisch opnieuw
    zonder die velden.

    Daardoor blijft boeken gewoon werken.
  */

  if(
    result.error &&
    missingOptionalCancellationColumn(
      result.error
    )
  ){
    console.warn(
      'Annuleringskolommen ontbreken. Order wordt zonder deze velden opgeslagen.'
    );

    result =
      await supa
        .from('orders')
        .insert(
          buildDatabaseRow(
            payload,
            false
          )
        );

    payload.backend_cancel_supported =
      false;
  }else{
    payload.backend_cancel_supported =
      !result.error;
  }

  if(result.error){
    console.error(
      'SUPABASE OPSLAAN FOUT:',
      result.error
    );

    throw result.error;
  }

  saveLocal(
    payload
  );

  return payload;
}


/* =========================================================
   DIRECTE ORDER
========================================================= */

function initDirectBooking(){
  const form =
    $('#bookingForm');

  if(!form){
    return;
  }

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if(!directRoute.km){
        toast(
          'Bereken eerst de route door beide adressen in te vullen.'
        );

        return;
      }

      const parcel =
        $('#parcelType')?.value ||
        '';

      if(
        parcel.toLowerCase() === 'overige' &&
        !$('#parcelDescription')
          ?.value
          ?.trim()
      ){
        toast(
          'Omschrijf bij Overige wat de zending is.'
        );

        return;
      }

      const surcharge =
        !!$('#afterHours')?.checked;

      const payload = {
        id:
          uid(),

        order_number:
          orderNo(),

        customer_token:
          uid(),

        pickup:
          $('#pickup')?.value?.trim() ||
          '',

        dropoff:
          $('#dropoff')?.value?.trim() ||
          '',

        distance_km:
          directRoute.km,

        duration_minutes:
          Math.round(
            directRoute.seconds / 60
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
            $('#weight')?.value || 0
          ),

        length_cm:
          Number(
            $('#lengthCm')?.value || 0
          ),

        width_cm:
          Number(
            $('#widthCm')?.value || 0
          ),

        height_cm:
          Number(
            $('#heightCm')?.value || 0
          ),

        parcel_type:
          parcel,

        parcel_description:
          parcel.toLowerCase() ===
          'overige'
            ? (
                $('#parcelDescription')
                  ?.value
                  ?.trim() ||
                ''
              )
            : '',

        customer_name:
          $('#customerName')
            ?.value
            ?.trim() ||
          '',

        customer_phone:
          $('#customerPhone')
            ?.value
            ?.trim() ||
          '',

        customer_email:
          $('#customerEmail')
            ?.value
            ?.trim() ||
          '',

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

      }catch(error){
        console.error(error);

        alert(
          'Zending kon niet worden opgeslagen.\n\n' +
          (
            error?.message ||
            error?.details ||
            'Onbekende databasefout'
          )
        );
      }
    }
  );
}


/* =========================================================
   GEPLANDE ORDER
========================================================= */

function initPlannedBooking(){
  const form =
    $('#plannedForm');

  if(!form){
    return;
  }

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if(!plannedRoute.km){
        toast(
          'Bereken eerst de route door beide adressen in te vullen.'
        );

        return;
      }

      const date =
        $('#pDate')?.value ||
        '';

      const time =
        $('#pTime')?.value ||
        '';

      const parcel =
        $('#pParcelType')?.value ||
        '';

      if(
        parcel.toLowerCase() === 'overige' &&
        !$('#pParcelDescription')
          ?.value
          ?.trim()
      ){
        toast(
          'Omschrijf bij Overige wat de zending is.'
        );

        return;
      }

      const payload = {
        id:
          uid(),

        order_number:
          orderNo(),

        customer_token:
          uid(),

        pickup:
          $('#pPickup')?.value?.trim() ||
          '',

        dropoff:
          $('#pDropoff')?.value?.trim() ||
          '',

        distance_km:
          plannedRoute.km,

        duration_minutes:
          Math.round(
            plannedRoute.seconds / 60
          ),

        price:
          calc(
            plannedRoute.km,
            plannedSurcharge(
              date,
              time
            )
          ),

        status:
          'Gepland',

        when:
          `${date} ${time}`,

        weight_kg:
          Number(
            $('#pWeight')?.value || 0
          ),

        length_cm:
          Number(
            $('#pLengthCm')?.value || 0
          ),

        width_cm:
          Number(
            $('#pWidthCm')?.value || 0
          ),

        height_cm:
          Number(
            $('#pHeightCm')?.value || 0
          ),

        parcel_type:
          parcel,

        parcel_description:
          parcel.toLowerCase() ===
          'overige'
            ? (
                $('#pParcelDescription')
                  ?.value
                  ?.trim() ||
                ''
              )
            : '',

        customer_name:
          $('#pCustomerName')
            ?.value
            ?.trim() ||
          '',

        customer_phone:
          $('#pCustomerPhone')
            ?.value
            ?.trim() ||
          '',

        customer_email:
          $('#pCustomerEmail')
            ?.value
            ?.trim() ||
          '',

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

      }catch(error){
        console.error(error);

        alert(
          'Zending kon niet worden opgeslagen.\n\n' +
          (
            error?.message ||
            error?.details ||
            'Onbekende databasefout'
          )
        );
      }
    }
  );
}


/* =========================================================
   ADMIN
========================================================= */

async function refreshAdminState(){
  const loggedOut =
    $('#adminLoggedOut');

  const loggedIn =
    $('#adminLoggedIn');

  if(!supa){
    loggedOut?.classList.remove(
      'hidden'
    );

    loggedIn?.classList.add(
      'hidden'
    );

    return;
  }

  const {
    data
  } =
    await supa.auth.getSession();

  const session =
    data?.session;

  if(!session){
    loggedOut?.classList.remove(
      'hidden'
    );

    loggedIn?.classList.add(
      'hidden'
    );

    return;
  }

  loggedOut?.classList.add(
    'hidden'
  );

  loggedIn?.classList.remove(
    'hidden'
  );

  const identity =
    $('#adminIdentity');

  if(identity){
    identity.textContent =
      session.user?.email ||
      '';
  }

  await loadAdminOrders();
}

function initAdminLogin(){
  const form =
    $('#adminLoginForm');

  if(form){
    form.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        if(!supa){
          toast(
            'Supabase is niet verbonden.'
          );

          return;
        }

        const email =
          $('#adminEmail')
            ?.value
            ?.trim() ||
          '';

        const password =
          $('#adminPassword')
            ?.value ||
          '';

        const {
          error
        } =
          await supa.auth
            .signInWithPassword({
              email,
              password
            });

        if(error){
          console.error(error);

          toast(
            'Inloggen mislukt.'
          );

          return;
        }

        toast(
          'Ingelogd.'
        );

        await refreshAdminState();
      }
    );
  }

  const logout =
    $('#adminLogout');

  if(logout){
    logout.addEventListener(
      'click',
      async () => {
        if(supa){
          await supa.auth.signOut();
        }

        await refreshAdminState();
      }
    );
  }
}

async function loadAdminOrders(){
  if(!supa){
    return;
  }

  const list =
    $('#adminList');

  if(!list){
    return;
  }

  list.innerHTML =
    '<p>Orders laden...</p>';

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
          ascending: false
        }
      );

  if(error){
    console.error(
      'Orders laden mislukt:',
      error
    );

    list.innerHTML =
      '<p>Orders konden niet worden geladen.</p>';

    return;
  }

  list.innerHTML =
    data?.length
      ? data
          .map(
            shipment =>
              shipmentCard(
                shipment,
                true
              )
          )
          .join('')
      : '<p>Nog geen orders.</p>';

  $$('.update-status').forEach(
    select => {
      select.addEventListener(
        'change',
        async () => {
          const orderNumber =
            select.dataset.order;

          const status =
            select.value;

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
                orderNumber
              );

          if(error){
            console.error(
              error
            );

            toast(
              'Status kon niet worden bijgewerkt.'
            );

            return;
          }

          updateLocalShipment(
            orderNumber,
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


/* =========================================================
   BEGROETING
========================================================= */

function setGreeting(){
  const greeting =
    $('#greeting');

  if(!greeting){
    return;
  }

  const hour =
    new Date().getHours();

  greeting.textContent =
    hour < 12
      ? 'Goedemorgen,'
      : hour < 18
      ? 'Goedemiddag,'
      : 'Goedenavond,';
}


/* =========================================================
   START APP
========================================================= */

function startApp(){
  initSupabase();

  initNavigation();

  initParcelFields();

  initRouteInputs();

  initRouteStatus();

  initDirectBooking();

  initPlannedBooking();

  initAdminLogin();

  setGreeting();

  render();
}

startApp();


/* =========================================================
   SERVICE WORKER
========================================================= */

if(
  'serviceWorker' in navigator
){
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register('./sw.js')
        .catch(
          error => {
            console.warn(
              'Service worker:',
              error
            );
          }
        );
    }
  );
    }
