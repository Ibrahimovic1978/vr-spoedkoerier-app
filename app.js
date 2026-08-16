
const BASE=15, PER_KM=1.30;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

function money(v){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(v)}
function calc(km, surcharge=false){let p=BASE+(Number(km||0)*PER_KM); if(surcharge)p*=1.5; return p}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function show(id){
  if(id==='home' && !$('#shell').classList.contains('hidden')){}
  $('#welcome').classList.remove('active');
  $('#shell').classList.remove('hidden');
  $$('.page').forEach(x=>x.classList.remove('active'));
  const el=document.getElementById(id); if(el) el.classList.add('active');
  render();
  scrollTo(0,0);
}
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));

function shipments(){return JSON.parse(localStorage.getItem('vr_shipments')||'[]')}
function saveShipment(s){const a=shipments();a.unshift(s);localStorage.setItem('vr_shipments',JSON.stringify(a));}
function shipmentCard(s){
  return `<div class="shipment"><div class="shipment-top"><div><b>${s.pickup}</b><br><small>naar ${s.dropoff}</small></div><span class="status">${s.status}</span></div><div class="meta"><span>${s.when}</span><span>${money(s.price)}</span></div></div>`
}
function render(){
  let a=shipments();
  $('#shipmentList').innerHTML=a.length?a.map(shipmentCard).join(''):'<div class="shipment"><small>Nog geen zendingen. Boek je eerste rit.</small></div>';
  $('#recentList').innerHTML=a.length?a.slice(0,3).map(shipmentCard).join(''):'<div class="shipment"><small>Nog geen recente zendingen.</small></div>';
}
function updateDirect(){ $('#price').textContent=money(calc($('#km').value,$('#afterHours').checked)); }
$('#km').addEventListener('input',updateDirect);$('#afterHours').addEventListener('change',updateDirect);
$('#pKm').addEventListener('input',()=>$('#pPrice').textContent=money(calc($('#pKm').value,false)));

$('#bookingForm').addEventListener('submit',e=>{
  e.preventDefault();
  const s={id:Date.now(),pickup:$('#pickup').value,dropoff:$('#dropoff').value,
    price:calc($('#km').value,$('#afterHours').checked),status:'Aangevraagd',
    when:'Vandaag',type:$('#parcelType').value};
  saveShipment(s); e.target.reset(); updateDirect(); toast('Zending aangevraagd — VR Spoedkoerier kan deze nu beoordelen.'); show('shipments');
});
$('#plannedForm').addEventListener('submit',e=>{
  e.preventDefault();
  const d=$('#pDate').value,t=$('#pTime').value;
  const hour=Number(t.split(':')[0]||12), dow=new Date(d+'T12:00:00').getDay();
  const sur=hour>=17||hour<8||dow===0||dow===6;
  const s={id:Date.now(),pickup:$('#pPickup').value,dropoff:$('#pDropoff').value,
    price:calc($('#pKm').value,sur),status:'Gepland',when:`${d} ${t}`};
  saveShipment(s); e.target.reset(); $('#pPrice').textContent=money(BASE); toast('Geplande zending opgeslagen.'); show('shipments');
});
const hr=new Date().getHours(); $('#greeting').textContent=(hr<12?'Goedemorgen,':hr<18?'Goedemiddag,':'Goedenavond,');
render();

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
