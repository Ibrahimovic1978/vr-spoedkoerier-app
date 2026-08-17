const BASE = 15, PER_KM = 1.30;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CFG = window.VR_CONFIG || {};

let supa = null;
let directRoute = { km: null, seconds: null };
let plannedRoute = { km: null, seconds: null };

function money(v){
  return new Intl.NumberFormat('nl-NL',{
    style:'currency',
    currency:'EUR'
  }).format(Number(v || 0));
}

function calc(km,surcharge=false){
  let p = BASE + Number(km || 0) * PER_KM;
  if(surcharge) p *= 1.5;
  return p;
}

function toast(t){
  const e = $('#toast');
  if(!e) return;
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2600);
}

function fmtDuration(sec){
  sec = Number(sec || 0);
  const min = Math.round(sec / 60);

  if(min < 60) return `${min} min`;

  const h = Math.floor(min / 60);
  const m = min % 60;

  return `${h}u ${m}m`;
}

function orderNo(){
  const d = new Date();
  return 'VR-' +
    d.getFullYear() +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getDate()).padStart(2,'0') +
    '-' +
    Math.random().toString(36).slice(2,7).toUpperCase();
}

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
    supa = window.supabase.createClient(
      CFG.SUPABASE_URL,
      CFG.SUPABASE_ANON_KEY
    );
  }

  const b = $('#backendBadge');

  if(b){
    b.className = 'backend-badge ' + (supa ? 'ok' : 'warn');
    b.textContent = supa
      ? 'Centrale orderdatabase: verbonden'
      : 'Centrale orderdatabase: lokaal';
  }
}

function show(id){
  const welcome = $('#welcome');
  if(welcome) welcome.classList.remove('active');

  $$('.page').forEach(x => x.classList.remove('active'));

  const page = $('#' + id);
  if(page) page.classList.add('active');

  if(id === 'admin') refreshAdminState();

  render();
  scrollTo(0,0);
}

$$('[data-go]').forEach(b => {
  b.addEventListener('click',() => show(b.dataset.go));
});

function localShipments(){
  try{
    return JSON.parse(localStorage.getItem('vr_shipments') || '[]');
  }catch{
    return [];
  }
}

function saveLocal(s){
  const a = localShipments();
  a.unshift(s);
  localStorage.setItem('vr_shipments',JSON.stringify(a));
  render();
}

function shipmentCard(s,admin=false){
  const order = s.order_number || s.order || s.id || '';
  const dist = s.distance_km || s.km || '';

  return `
    <div class="shipment" data-order="${order}">
      <div class="shipment-top">
        <div>
          <b>${order}</b>
          <div class="meta">
            <span>${s.when || ''}</span>
            <span>${dist ? Number(dist).toFixed(1) + ' km' : ''}</span>
            <span>${s.status || ''}</span>
          </div>
        </div>
      </div>

      <div class="meta">
        <span>${s.pickup || ''}</span>
        <span>→</span>
        <span>${s.dropoff || ''}</span>
      </div>

      ${admin ? `
        <div class="admin-actions">
          <select class="update-status" data-order="${order}">
            ${[
              'Aangevraagd',
              'Geaccepteerd',
              'Onderweg',
              'Opgehaald',
              'Afgeleverd',
              'Geannuleerd'
            ].map(x => `
              <option ${x === s.status ? 'selected' : ''}>
                ${x}
              </option>
            `).join('')}
          </select>
        </div>
      ` : ''}
    </div>
  `;
}

function render(){
  const a = localShipments();

  const shipmentList = $('#shipmentList');
  if(shipmentList){
    shipmentList.innerHTML = a.length
      ? a.map(s => shipmentCard(s)).join('')
      : '<p>Nog geen zendingen.</p>';
  }

  const recentList = $('#recentList');
  if(recentList){
    recentList.innerHTML = a.length
      ? a.slice(0,3).map(s => shipmentCard(s)).join('')
      : '<p>Nog geen recente zendingen.</p>';
  }
}

function setRouteUI(prefix,route){
  const box = $(prefix ? '#pRouteBox' : '#routeBox');
  const stat = $(prefix ? '#pRouteStatus' : '#routeStatus');
  const kmEl = $(prefix ? '#pRouteKm' : '#routeKm');
  const timeEl = $(prefix ? '#pRouteTime' : '#routeTime');
  const priceEl = $(prefix ? '#pPrice' : '#price');

  if(!route || !route.km) return;

  if(box) box.classList.remove('hidden');

  if(kmEl) kmEl.textContent = Number(route.km).toFixed(1) + ' km';
  if(timeEl) timeEl.textContent = fmtDuration(route.seconds);

  if(stat){
    stat.textContent = 'Route berekend';
  }

  let surcharge = false;

  if(prefix){
    const date = $('#pDate')?.value;
    const time = $('#pTime')?.value;
    surcharge = plannedSurcharge(date,time);
  }else{
    surcharge = !!$('#afterHours')?.checked;
  }

  if(priceEl){
    priceEl.textContent = money(calc(route.km,surcharge));
  }
}

function plannedSurcharge(d,t){
  if(!d || !t) return false;

  const hour = Number(t.split(':')[0]);
  const dow = new Date(d + 'T12:00:00').getDay();

  return hour >= 17 || hour < 8 || dow === 0 || dow === 6;
}

async function orsGeocode(address){
  const url =
    'https://api.heigit.org/geocode/search' +
    '?api_key=' + encodeURIComponent(CFG.ORS_API_KEY) +
    '&text=' + encodeURIComponent(address) +
    '&boundary.country=NLD' +
    '&size=1';

  const res = await fetch(url);

  if(!res.ok){
    throw new Error('Adres zoeken mislukt');
  }

  const data = await res.json();

  if(!data.features || !data.features.length){
    throw new Error('Adres niet gevonden');
  }

  const coords = data.features[0].geometry.coordinates;

  return {
    lng: coords[0],
    lat: coords[1]
  };
}

async function calculateRoute(origin,destination,prefix=''){
  if(!origin || !destination) return;

  const stat = $(prefix ? '#pRouteStatus' : '#routeStatus');

  if(!hasORS()){
    if(stat) stat.textContent = 'OpenRouteService is niet gekoppeld.';
    return;
  }

  if(stat) stat.textContent = 'Route wordt berekend...';

  try{
    const from = await orsGeocode(origin);
    const to = await orsGeocode(destination);

    const url =
      'https://api.heigit.org/v2/directions/driving-car' +
      '?api_key=' + encodeURIComponent(CFG.ORS_API_KEY) +
      '&start=' + from.lng + ',' + from.lat +
      '&end=' + to.lng + ',' + to.lat;

    const res = await fetch(url);

    if(!res.ok){
      throw new Error('Routeberekening mislukt');
    }

    const data = await res.json();

    if(!data.features || !data.features.length){
      throw new Error('Geen route gevonden');
    }

    const summary = data.features[0].properties.summary;

    const route = {
      km: summary.distance / 1000,
      seconds: summary.duration
    };

    if(prefix){
      plannedRoute = route;
    }else{
      directRoute = route;
    }

    setRouteUI(prefix,route);

  }catch(err){
    console.error(err);

    if(stat){
      stat.textContent =
        err.message || 'Route kon niet worden berekend';
    }
  }
}

function debounce(fn,ms=650){
  let t;

  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args),ms);
  };
}

const routeDirectDeb = debounce(() => {
  calculateRoute(
    $('#pickup')?.value,
    $('#dropoff')?.value,
    ''
  );
});

const routePlannedDeb = debounce(() => {
  calculateRoute(
    $('#pPickup')?.value,
    $('#pDropoff')?.value,
    'p'
  );
});

['pickup','dropoff'].forEach(id => {
  const e = $('#' + id);
  if(e) e.addEventListener('input',routeDirectDeb);
});

['pPickup','pDropoff'].forEach(id => {
  const e = $('#' + id);
  if(e) e.addEventListener('input',routePlannedDeb);
});

const afterHours = $('#afterHours');
if(afterHours){
  afterHours.addEventListener('change',() => {
    if(directRoute.km) setRouteUI('',directRoute);
  });
}

const pDate = $('#pDate');
if(pDate){
  pDate.addEventListener('change',() => {
    if(plannedRoute.km) setRouteUI('p',plannedRoute);
  });
}

const pTime = $('#pTime');
if(pTime){
  pTime.addEventListener('change',() => {
    if(plannedRoute.km) setRouteUI('p',plannedRoute);
  });
}

function loadMaps(){
  if(!hasORS()){
    if($('#routeStatus')){
      $('#routeStatus').textContent =
        'OpenRouteService is niet gekoppeld.';
    }

    if($('#pRouteStatus')){
      $('#pRouteStatus').textContent =
        'OpenRouteService is niet gekoppeld.';
    }

    return;
  }

  if($('#routeStatus')){
    $('#routeStatus').textContent =
      'Vul beide adressen in.';
  }

  if($('#pRouteStatus')){
    $('#pRouteStatus').textContent =
      'Vul beide adressen in.';
  }
}

async function createOrder(payload){
  saveLocal(payload);

  if(!supa){
    return {
      data: payload,
      local: true
    };
  }

  const {data,error} = await supa
    .from('orders')
    .insert({
      order_number: payload.order_number,
      pickup: payload.pickup,
      dropoff: payload.dropoff,
      distance_km: payload.distance_km,
      duration_minutes: payload.duration_minutes,
      price: payload.price,
      status: payload.status,
      parcel_type: payload.parcel_type || '',
      customer_name: payload.customer_name || '',
      customer_phone: payload.customer_phone || '',
      customer_email: payload.customer_email || '',
      when: payload.when || ''
    })
    .select()
    .single();

  if(error) throw error;

  return {
    ...payload,
    id: data.id
  };
}

const bookingForm = $('#bookingForm');

if(bookingForm){
  bookingForm.addEventListener('submit',async e => {
    e.preventDefault();

    if(!directRoute.km){
      toast('Bereken eerst de route door beide adressen in te vullen.');
      return;
    }

    const surcharge = !!$('#afterHours')?.checked;

    const payload = {
      id: crypto.randomUUID(),
      order_number: orderNo(),
      pickup: $('#pickup')?.value || '',
      dropoff: $('#dropoff')?.value || '',
      distance_km: directRoute.km,
      duration_minutes: Math.round(directRoute.seconds / 60),
      price: calc(directRoute.km,surcharge),
      status: 'Aangevraagd',
      when: 'Vandaag',
      parcel_type: $('#parcelType')?.value || '',
      customer_name: $('#customerName')?.value || '',
      customer_phone: $('#customerPhone')?.value || '',
      customer_email: $('#customerEmail')?.value || ''
    };

    try{
      await createOrder(payload);
      toast('Zending aangevraagd.');
      show('shipments');
    }catch(err){
      console.error(err);
      toast('Zending kon niet worden opgeslagen.');
    }
  });
}

const plannedForm = $('#plannedForm');

if(plannedForm){
  plannedForm.addEventListener('submit',async e => {
    e.preventDefault();

    if(!plannedRoute.km){
      toast('Bereken eerst de route door beide adressen in te vullen.');
      return;
    }

    const d = $('#pDate')?.value || '';
    const t = $('#pTime')?.value || '';
    const surcharge = plannedSurcharge(d,t);

    const payload = {
      id: crypto.randomUUID(),
      order_number: orderNo(),
      pickup: $('#pPickup')?.value || '',
      dropoff: $('#pDropoff')?.value || '',
      distance_km: plannedRoute.km,
      duration_minutes: Math.round(plannedRoute.seconds / 60),
      price: calc(plannedRoute.km,surcharge),
      status: 'Gepland',
      when: `${d} ${t}`,
      parcel_type: $('#pParcelType')?.value || '',
      customer_name: $('#pCustomerName')?.value || '',
      customer_phone: $('#pCustomerPhone')?.value || '',
      customer_email: $('#pCustomerEmail')?.value || ''
    };

    try{
      await createOrder(payload);
      toast('Zending ingepland.');
      show('shipments');
    }catch(err){
      console.error(err);
      toast('Zending kon niet worden opgeslagen.');
    }
  });
}

async function refreshAdminState(){
  if(!supa){
    const out = $('#adminLoggedOut');
    const inn = $('#adminLoggedIn');

    if(out) out.classList.remove('hidden');
    if(inn) inn.classList.add('hidden');

    return;
  }

  const {
    data:{session}
  } = await supa.auth.getSession();

  const out = $('#adminLoggedOut');
  const inn = $('#adminLoggedIn');

  if(!session){
    if(out) out.classList.remove('hidden');
    if(inn) inn.classList.add('hidden');
    return;
  }

  if(out) out.classList.add('hidden');
  if(inn) inn.classList.remove('hidden');

  loadAdminOrders();
}

const adminLoginForm = $('#adminLoginForm');

if(adminLoginForm){
  adminLoginForm.addEventListener('submit',async e => {
    e.preventDefault();

    if(!supa){
      toast('Supabase is niet verbonden.');
      return;
    }

    const email =
      $('#adminEmail')?.value ||
      adminLoginForm.querySelector('[type="email"]')?.value ||
      '';

    const password =
      $('#adminPassword')?.value ||
      adminLoginForm.querySelector('[type="password"]')?.value ||
      '';

    const {error} = await supa.auth.signInWithPassword({
      email,
      password
    });

    if(error){
      console.error(error);
      toast('Inloggen mislukt.');
      return;
    }

    toast('Ingelogd.');
    refreshAdminState();
  });
}

const adminLogout = $('#adminLogout');

if(adminLogout){
  adminLogout.addEventListener('click',async () => {
    if(supa) await supa.auth.signOut();
    refreshAdminState();
  });
}

async function loadAdminOrders(){
  if(!supa) return;

  const adminList = $('#adminList');
  if(!adminList) return;

  const {data,error} = await supa
    .from('orders')
    .select('*')
    .order('created_at',{ascending:false});

  if(error){
    console.error(error);
    adminList.innerHTML =
      '<p>Orders konden niet worden geladen.</p>';
    return;
  }

  adminList.innerHTML = data?.length
    ? data.map(s => shipmentCard(s,true)).join('')
    : '<p>Nog geen orders.</p>';

  $$('.update-status').forEach(sel => {
    sel.addEventListener('change',async () => {
      const id = sel.dataset.order;
      const status = sel.value;

      const {error} = await supa
        .from('orders')
        .update({status})
        .eq('order_number',id);

      toast(
        error
          ? 'Status kon niet worden bijgewerkt.'
          : 'Status bijgewerkt.'
      );
    });
  });
}

const hr = new Date().getHours();
const greeting = $('#greeting');

if(greeting){
  greeting.textContent =
    hr < 12 ? 'Goedemorgen,' :
    hr < 18 ? 'Goedemiddag,' :
    'Goedenavond,';
}

initSupabase();
loadMaps();
render();

if('serviceWorker' in navigator){
  window.addEventListener('load',() => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(() => {});
  });
}
