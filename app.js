
const BASE=15, PER_KM=1.30;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const CFG=window.VR_CONFIG||{};
let supa=null;
let directRoute={km:null,seconds:null};
let plannedRoute={km:null,seconds:null};
let googleLoaded=false;

function money(v){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(v)}
function calc(km,surcharge=false){let p=BASE+(Number(km||0)*PER_KM); if(surcharge)p*=1.5; return p}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}
function fmtDuration(sec){sec=Number(sec||0);const h=Math.floor(sec/3600),m=Math.round((sec%3600)/60);return h?`${h} u ${m} min`:`${m} min`}
function orderNo(){const d=new Date();return `VR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(1000+Math.random()*9000)}`}
function hasBackend(){return !!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY)}
function hasMaps(){return !!CFG.GOOGLE_MAPS_API_KEY}

function initSupabase(){
  if(hasBackend() && window.supabase?.createClient){
    supa=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
  }
  const b=$('#backendBadge');
  b.className='backend-badge '+(supa?'ok':'warn');
  b.textContent=supa?'Centrale orderdatabase: verbonden':'Centrale orderdatabase: nog niet gekoppeld — lokale opslag actief';
}
function show(id){
  $('#welcome').classList.remove('active');$('#shell').classList.remove('hidden');
  $$('.page').forEach(x=>x.classList.remove('active'));const el=document.getElementById(id);if(el)el.classList.add('active');
  if(id==='admin') refreshAdminState();
  render();scrollTo(0,0);
}
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));

function localShipments(){return JSON.parse(localStorage.getItem('vr_shipments')||'[]')}
function saveLocal(s){const a=localShipments();const ix=a.findIndex(x=>x.id===s.id||x.order_number===s.order_number);if(ix>=0)a[ix]=s;else a.unshift(s);localStorage.setItem('vr_shipments',JSON.stringify(a));}
function shipmentCard(s,admin=false){
  const order=s.order_number||s.orderNo||'';
  const dist=s.distance_km||s.km;
  return `<div class="shipment" data-id="${s.id||''}">
    <div class="shipment-top"><div><b>${order?order+' · ':''}${s.pickup}</b><br><small>naar ${s.dropoff}</small></div><span class="status">${s.status||'Aangevraagd'}</span></div>
    <div class="meta"><span>${s.when||s.pickup_time||'Vandaag'}${dist?' · '+Number(dist).toFixed(1)+' km':''}</span><span>${money(Number(s.price||0))}</span></div>
    ${admin?`<div class="admin-actions"><select class="status-select" data-order="${s.id}">
      ${['Aangevraagd','Geaccepteerd','Onderweg naar ophalen','Opgehaald','Onderweg','Afgeleverd','Geannuleerd'].map(st=>`<option ${st===s.status?'selected':''}>${st}</option>`).join('')}
      </select><button class="primary update-status" data-order="${s.id}">Status opslaan</button></div>`:''}
  </div>`
}
function render(){
  const a=localShipments();
  $('#shipmentList').innerHTML=a.length?a.map(x=>shipmentCard(x)).join(''):'<div class="shipment"><small>Nog geen zendingen. Boek je eerste rit.</small></div>';
  $('#recentList').innerHTML=a.length?a.slice(0,3).map(x=>shipmentCard(x)).join(''):'<div class="shipment"><small>Nog geen recente zendingen.</small></div>';
}
function setRouteUI(prefix,route){
  const box=$(prefix?'#pRouteBox':'#routeBox');
  const stat=$(prefix?'#pRouteStatus':'#routeStatus');
  const kmEl=$(prefix?'#pRouteKm':'#routeKm');
  const timeEl=$(prefix?'#pRouteTime':'#routeTime');
  if(route.km){
    box.classList.remove('hidden');kmEl.textContent=`${route.km.toFixed(1)} km`;timeEl.textContent=fmtDuration(route.seconds);
    stat.textContent='Route berekend op basis van de autoroute.';
    const date=prefix?$('#pDate').value:null,time=prefix?$('#pTime').value:null;
    const sur=prefix?plannedSurcharge(date,time):$('#afterHours').checked;
    $(prefix?'#pPrice':'#price').textContent=money(calc(route.km,sur));
  }
}
function plannedSurcharge(d,t){
  if(!d||!t)return false;const hour=Number(t.split(':')[0]||12),dow=new Date(d+'T12:00:00').getDay();
  return hour>=17||hour<8||dow===0||dow===6;
}

9

async async function orsGeocode(address){
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

  if(!CFG.ORS_API_KEY){
    stat.textContent = 'OpenRouteService is niet gekoppeld.';
    return;
  }

  stat.textContent = 'Route wordt berekend...';

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
    stat.textContent = err.message || 'Route kon niet worden berekend';
  }
}

function loadMaps(){
  if(!CFG.ORS_API_KEY){
    $('#routeStatus').textContent = 'OpenRouteService is niet gekoppeld.';
    $('#pRouteStatus').textContent = 'OpenRouteService is niet gekoppeld.';
    return;
  }

  $('#routeStatus').textContent = 'Vul beide adressen in.';
  $('#pRouteStatus').textContent = 'Vul beide adressen in.';
}
