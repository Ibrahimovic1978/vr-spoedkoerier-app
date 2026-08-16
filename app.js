
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

async function calculateRoute(origin,destination,prefix=''){
  if(!origin||!destination)return;
  const stat=$(prefix?'#pRouteStatus':'#routeStatus');
  if(!googleLoaded){stat.textContent='Google Maps is nog niet gekoppeld. Vul de API-key in config.js.';return}
  stat.textContent='Route wordt berekend…';
  const service=new google.maps.DirectionsService();
  service.route({origin,destination,travelMode:google.maps.TravelMode.DRIVING},(res,status)=>{
    if(status==='OK'&&res.routes?.[0]?.legs?.[0]){
      const leg=res.routes[0].legs[0];
      const route={km:leg.distance.value/1000,seconds:leg.duration.value};
      if(prefix)plannedRoute=route;else directRoute=route;
      setRouteUI(prefix,route);
    }else{stat.textContent='Route kon niet worden berekend. Kies een adres uit de suggesties.'}
  });
}
function debounce(fn,ms=650){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}}
const routeDirectDeb=debounce(()=>calculateRoute($('#pickup').value,$('#dropoff').value,''),700);
const routePlannedDeb=debounce(()=>calculateRoute($('#pPickup').value,$('#pDropoff').value,'p'),700);
['pickup','dropoff'].forEach(id=>$('#'+id).addEventListener('change',routeDirectDeb));
['pPickup','pDropoff'].forEach(id=>$('#'+id).addEventListener('change',routePlannedDeb));
$('#afterHours').addEventListener('change',()=>setRouteUI('',directRoute));
$('#pDate').addEventListener('change',()=>setRouteUI('p',plannedRoute));$('#pTime').addEventListener('change',()=>setRouteUI('p',plannedRoute));

window.initVRMaps=()=>{
  googleLoaded=true;
  const opts={componentRestrictions:{country:['nl','be']},fields:['formatted_address','geometry','name']};
  [['pickup','dropoff'],['pPickup','pDropoff']].flat().forEach(id=>{
    const el=$('#'+id);const ac=new google.maps.places.Autocomplete(el,opts);
    ac.addListener('place_changed',()=>{const p=ac.getPlace();if(p?.formatted_address)el.value=p.formatted_address;id.startsWith('p')?routePlannedDeb():routeDirectDeb()});
  });
  $('#routeStatus').textContent='Vul beide adressen in. De route wordt automatisch berekend.';
  $('#pRouteStatus').textContent='Vul beide adressen in. De route wordt automatisch berekend.';
};
function loadMaps(){
  if(!hasMaps()){
    $('#routeStatus').textContent='Automatische kilometers zijn klaar, maar Google Maps moet nog gekoppeld worden.';
    $('#pRouteStatus').textContent='Automatische kilometers zijn klaar, maar Google Maps moet nog gekoppeld worden.';
    return;
  }
  const s=document.createElement('script');
  s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CFG.GOOGLE_MAPS_API_KEY)}&libraries=places&callback=initVRMaps`;
  s.async=true;s.defer=true;document.head.appendChild(s);
}

async function createOrder(payload){
  saveLocal(payload);
  if(!supa)return {data:payload,local:true};
  const {data,error}=await supa.from('orders').insert({
    order_number:payload.order_number,
    pickup:payload.pickup,dropoff:payload.dropoff,
    distance_km:payload.distance_km,duration_seconds:payload.duration_seconds,
    price:payload.price,status:payload.status,order_type:payload.order_type,
    parcel_type:payload.parcel_type||null,weight_kg:payload.weight_kg||null,
    customer_name:payload.customer_name,customer_phone:payload.customer_phone,
    customer_email:payload.customer_email,pickup_time:payload.when
  }).select().single();
  if(error)throw error;
  const merged={...payload,id:data.id};saveLocal(merged);return {data:merged,local:false};
}

$('#bookingForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!directRoute.km){toast('Bereken eerst de route door beide adressen te kiezen.');return}
  const payload={id:crypto.randomUUID?.()||Date.now(),order_number:orderNo(),pickup:$('#pickup').value,dropoff:$('#dropoff').value,
    distance_km:directRoute.km,duration_seconds:directRoute.seconds,price:calc(directRoute.km,$('#afterHours').checked),
    status:'Aangevraagd',when:'Vandaag',order_type:'direct',parcel_type:$('#parcelType').value,weight_kg:Number($('#weight').value||0),
    customer_name:$('#customerName').value,customer_phone:$('#customerPhone').value,customer_email:$('#customerEmail').value};
  try{const r=await createOrder(payload);toast(r.local?'Zending lokaal opgeslagen. Koppel Supabase om hem centraal binnen te krijgen.':`Aanvraag ${payload.order_number} is verzonden.`);e.target.reset();directRoute={km:null,seconds:null};$('#routeBox').classList.add('hidden');$('#price').textContent='Route eerst berekenen';show('shipments')}
  catch(err){console.error(err);toast('Centrale opslag gaf een fout. De aanvraag is lokaal bewaard.');show('shipments')}
});
$('#plannedForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!plannedRoute.km){toast('Bereken eerst de route door beide adressen te kiezen.');return}
  const d=$('#pDate').value,t=$('#pTime').value,sur=plannedSurcharge(d,t);
  const payload={id:crypto.randomUUID?.()||Date.now(),order_number:orderNo(),pickup:$('#pPickup').value,dropoff:$('#pDropoff').value,
    distance_km:plannedRoute.km,duration_seconds:plannedRoute.seconds,price:calc(plannedRoute.km,sur),
    status:'Gepland',when:`${d} ${t}`,order_type:'planned',customer_name:$('#pCustomerName').value,customer_phone:$('#pCustomerPhone').value,customer_email:$('#pCustomerEmail').value};
  try{const r=await createOrder(payload);toast(r.local?'Zending lokaal opgeslagen. Koppel Supabase voor centrale ontvangst.':`Zending ${payload.order_number} is gepland.`);e.target.reset();plannedRoute={km:null,seconds:null};$('#pRouteBox').classList.add('hidden');$('#pPrice').textContent='Route eerst berekenen';show('shipments')}
  catch(err){console.error(err);toast('Centrale opslag gaf een fout. De aanvraag is lokaal bewaard.');show('shipments')}
});

async function refreshAdminState(){
  if(!supa){$('#adminLoggedOut').classList.remove('hidden');$('#adminLoggedIn').classList.add('hidden');return}
  const {data:{session}}=await supa.auth.getSession();
  if(!session){$('#adminLoggedOut').classList.remove('hidden');$('#adminLoggedIn').classList.add('hidden');return}
  $('#adminLoggedOut').classList.add('hidden');$('#adminLoggedIn').classList.remove('hidden');$('#adminIdentity').textContent=session.user.email;await loadAdminOrders();
}
$('#adminLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!supa){toast('Supabase is nog niet gekoppeld.');return}
  const {error}=await supa.auth.signInWithPassword({email:$('#adminEmail').value,password:$('#adminPassword').value});
  if(error){toast('Inloggen mislukt.');return}toast('Ingelogd.');refreshAdminState();
});
$('#adminLogout').addEventListener('click',async()=>{if(supa)await supa.auth.signOut();refreshAdminState()});
async function loadAdminOrders(){
  const {data,error}=await supa.from('orders').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){$('#adminList').innerHTML='<div class="shipment">Orders konden niet worden geladen.</div>';return}
  $('#adminList').innerHTML=data.length?data.map(x=>shipmentCard(x,true)).join(''):'<div class="shipment">Nog geen centrale aanvragen.</div>';
  $$('.update-status').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=btn.dataset.order,sel=document.querySelector(`.status-select[data-order="${id}"]`);
    const {error}=await supa.from('orders').update({status:sel.value}).eq('id',id);
    toast(error?'Status kon niet worden opgeslagen.':'Status bijgewerkt.');if(!error)loadAdminOrders();
  }));
}

const hr=new Date().getHours();$('#greeting').textContent=(hr<12?'Goedemorgen,':hr<18?'Goedemiddag,':'Goedenavond,');
initSupabase();loadMaps();render();
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}
