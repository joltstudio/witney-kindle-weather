import { CONFIG } from './config.js';
import { API_URL, DEMO_PAYLOAD, validatePayload, selectNext48, summarize48, chartBoundaries, hourAt, dateLabel, clockLabel, hourLabel, weatherText, sunshineMinutes } from './weather.js';
import { isFreshStationObservation, isValidStationObservation, OBSERVATION_STATION } from './observations.js';

const $=id=>document.getElementById(id);
document.documentElement.style.setProperty('--page-width',`${CONFIG.display.width}px`);
document.documentElement.style.setProperty('--page-height',`${CONFIG.display.height}px`);
document.documentElement.style.setProperty('--page-gutter',`${CONFIG.spacing.page}px`);
document.documentElement.style.setProperty('--page-top',`${CONFIG.spacing.top}px`);
document.documentElement.style.setProperty('--page-bottom',`${CONFIG.spacing.bottom}px`);
document.documentElement.style.setProperty('--current-column-width',`${CONFIG.spacing.currentColumn}px`);
document.documentElement.style.setProperty('--type-scale',String(CONFIG.typography.scale));
document.documentElement.style.setProperty('--weather-font',`"${CONFIG.typography.body}",Arial,sans-serif`);
const fitPreview=()=>document.documentElement.style.setProperty('--preview-scale',String(Math.min(1,innerWidth/CONFIG.display.width,innerHeight/CONFIG.display.height)));
fitPreview();window.addEventListener('resize',fitPreview);
const fmt=(v,d=0)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
const escapeSvg=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function render(payload,fetchedAt,{stale=false,error=false,demo=false,nowMs=Date.now(),stationObservation=null,stationObservations=[]}={}){
  const hours=selectNext48(payload,nowMs),summary=summarize48(hours),current=payload.current;
  $('current-temp').innerHTML=`${fmt(current.temperature_2m,0)}<sup>${CONFIG.units.temperature}</sup>`;
  $('current-feels').textContent=`${fmt(current.apparent_temperature,0)}${CONFIG.units.temperature}`;
  $('current-humidity').textContent=`${fmt(current.relative_humidity_2m)}${CONFIG.units.humidity}`;
  $('current-wind').textContent=`${fmt(current.wind_speed_10m)}${CONFIG.units.wind}`;
  $('condition-text').textContent=weatherText(current.weather_code);
  const status=$('status');status.dataset.state=stale?'stale':error?'error':demo?'demo':'live';
  $('status-text').textContent=stale?'STALE DATA':error?'DATA UNAVAILABLE':'';
  $('updated').textContent=`Updated ${new Intl.DateTimeFormat('en-GB',{timeZone:CONFIG.location.timezone,hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short',hourCycle:'h23'}).format(new Date(fetchedAt))}${stale?' · stale':''}`;
  const usableObservation=isFreshStationObservation(stationObservation)?stationObservation:null;
  const observationLine=$('observation-detail');
  observationLine.hidden=!usableObservation;
  if(usableObservation){
    const parts=[`${OBSERVATION_STATION} obs ${clockLabel(usableObservation.observedAt/1000)}`,`${fmt(usableObservation.temperatureC,0)}°C`];
    if(Number.isFinite(usableObservation.humidityPct))parts.push(`RH ≈${fmt(usableObservation.humidityPct,0)}%`);
    if(Number.isFinite(usableObservation.windMph))parts.push(`Wind ${fmt(usableObservation.windMph,0)}mph`);
    observationLine.textContent=parts.join(' · ');
  }
  const historyStart=(hours[0].time-24*3600)*1000;
  const usableHistory=Array.isArray(stationObservations)?stationObservations.filter(point=>
    isValidStationObservation(point)&&point.observedAt>=historyStart&&point.observedAt<=nowMs+5*60_000
  ):[];
  $('announcement').textContent=`Witney weather updated ${clockLabel(fetchedAt/1000)}.`;
  $('chart-wrap').innerHTML=chartSvg(hours,summary,usableHistory,nowMs);
}

function chartSvg(hours,summary,stationObservations=[],nowMs=Date.now()){
  const W=CONFIG.chart.width,L=CONFIG.chart.labelWidth,P=W-L,top=52,rowH=CONFIG.chart.rowHeight,gap=CONFIG.spacing.rowGap;
  const historyHours=stationObservations.length?24:0,chartHours=historyHours+hours.length,forecastOffset=historyHours;
  const chartStart=hours[0].time-historyHours*3600,step=P/chartHours;
  const timeline=Array.from({length:chartHours},(_,i)=>({time:chartStart+i*3600}));
  const tempValues=[...hours.flatMap(h=>[h.temp,h.feels]),...stationObservations.map(point=>point.temperatureC)].filter(Number.isFinite);
  const tempMin=tempValues.length?Math.floor(Math.min(...tempValues)-1):-10;
  const tempMax=tempValues.length?Math.ceil(Math.max(...tempValues)+1):10;
  const ranges={
    temp:{key:'temp',title:'TEMP + FEELS',detail:`↑${fmt(summary.high,0)}° · ↓${fmt(summary.low,0)}°`,detail2:`↑${fmt(summary.feelsHigh,0)}° · ↓${fmt(summary.feelsLow,0)}°`,min:tempMin,max:tempMax},
    rain:{key:'rain',title:'RAIN',detail:`${fmt(summary.rainPeak,1)} ${CONFIG.units.precipitation}/h MAX`,min:0,max:Math.max(.5,Math.ceil(Math.max(...hours.map(h=>h.rain??0))*2)/2)},
    sun:{key:'sun',title:'SUNSHINE',detail:`${fmt(summary.sunshine.low)}–${fmt(summary.sunshine.high)} min/h`,min:0,max:60},
    wind:{key:'wind',title:'WIND',detail:`${fmt(summary.wind.low)}–${fmt(summary.wind.high)} ${CONFIG.units.wind}`,min:0,max:Math.max(10,Math.ceil(Math.max(...hours.map(h=>h.wind??0),...stationObservations.map(point=>point.windMph??0))/5)*5)}
  };
  const rows=Object.values(ranges),H=top+rows.length*(rowH+gap)+24;
  const svg=[`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${historyHours?`24 hours of Brize Norton observed temperature and wind followed by `:''}48 hours of forecast temperature, feels-like, rainfall, sunshine and wind.">`];
  const boundaries=chartBoundaries(timeline),lanes=[];
  for(let i=0;i<boundaries.length;i++){
    const start=boundaries[i],end=boundaries[i+1]??chartHours,left=L+start*step,right=L+end*step,mid=(left+right)/2,label=dateLabel(timeline[start].time),textWidth=label.length*5.8*CONFIG.typography.scale;
    const x=Math.max(L+textWidth/2,Math.min(L+P-textWidth/2,mid));
    let lane=0;while(lanes[lane]!==undefined&&lanes[lane]>x-textWidth/2-4)lane++;
    lanes[lane]=x+textWidth/2;
    svg.push(`<text x="${x}" y="${19+lane*18}" text-anchor="middle" class="date">${escapeSvg(label)}</text>`);
  }
  for(const i of boundaries.filter(i=>i>0)){
    const x=L+i*step;svg.push(`<line x1="${x}" x2="${x}" y1="43" y2="${H-22}" class="midnight"/>`);
  }
  const nowX=L+Math.max(0,Math.min(chartHours,(nowMs/1000-chartStart)/3600))*step;
  svg.push(`<line x1="${nowX}" x2="${nowX}" y1="43" y2="${H-22}" class="now-marker"/><text x="${nowX+3}" y="49" class="now-label">NOW</text>`);
  rows.forEach((series,r)=>{
    const y=top+r*(rowH+gap),bottom=y+rowH;
    svg.push(`<text x="0" y="${y+21}" class="metric">${escapeSvg(series.title)}</text><text x="0" y="${y+42}" class="scale">${escapeSvg(series.detail)}</text>`);
    if(series.detail2)svg.push(`<text x="0" y="${y+61}" class="scale">${escapeSvg(series.detail2)}</text>`);
    const py=v=>bottom-6-((Math.max(series.min,Math.min(series.max,v))-series.min)/(series.max-series.min||1))*(rowH-14);
    if(series.key==='temp'){
      for(const [key,cls] of [['temp','temp-line'],['feels','feels-line']]){
        const d=hours.map((h,i)=>Number.isFinite(h[key])?`${i?'L':'M'} ${L+(forecastOffset+i+.5)*step} ${py(h[key])}`:'').filter(Boolean).join(' ');
        svg.push(`<path d="${d}" class="${cls}"/>`);
      }
      const actualTemp=observationLinePath(stationObservations,point=>point.temperatureC,point=>L+(point.observedAt/1000-chartStart)/3600*step,py);
      if(actualTemp)svg.push(`<path d="${actualTemp}" class="actual-line"/>`);
      for(const point of stationObservations){const x=L+(point.observedAt/1000-chartStart)/3600*step;svg.push(`<circle cx="${x}" cy="${py(point.temperatureC)}" r="1.7" class="actual-dot"/>`);}
      for(const [key,highIndex,lowIndex,cls] of [['temp',summary.highIndex,summary.lowIndex,'air-extreme'],['feels',summary.feelsHighIndex,summary.feelsLowIndex,'feels-extreme']]){
        for(const index of new Set([highIndex,lowIndex])){
          if(index<0||!Number.isFinite(hours[index]?.[key]))continue;
          const x=L+(forecastOffset+index+.5)*step,yv=py(hours[index][key]);
          svg.push(`<circle cx="${x}" cy="${yv}" r="3.5" class="extreme-dot ${cls}"/>`);
        }
      }
    }else if(series.key==='humidity'){
      const d=hours.map((h,i)=>Number.isFinite(h.humidity)?`${i?'L':'M'} ${L+(i+.5)*step} ${py(h.humidity)}`:'').filter(Boolean).join(' ');
      svg.push(`<path d="${d}" class="series-line"/>`);
    }else{
      hours.forEach((h,i)=>{
        const value=series.key==='sun'?sunshineMinutes(h.sunshine):h[series.key];
        if(!Number.isFinite(value)||value<=0)return;
        const x=L+(forecastOffset+i)*step+step*.2,w=step*.6,yv=py(value);
        svg.push(`<rect x="${x}" y="${yv}" width="${w}" height="${Math.max(1,bottom-6-yv)}" class="${series.key==='rain'?'rain-bar':'bar'}"/>`);
      });
      if(series.key==='wind'){
        const actualWind=observationLinePath(stationObservations,point=>point.windMph,point=>L+(point.observedAt/1000-chartStart)/3600*step,py);
        if(actualWind)svg.push(`<path d="${actualWind}" class="actual-line"/>`);
        for(const point of stationObservations){if(Number.isFinite(point.windMph)){const x=L+(point.observedAt/1000-chartStart)/3600*step;svg.push(`<circle cx="${x}" cy="${py(point.windMph)}" r="1.7" class="actual-dot"/>`);}}
      }
    }
  });
  const axisY=H-6;
  timeline.forEach((h,i)=>{if(hourAt(h.time)%6===0){const x=L+(i+.5)*step;svg.push(`<text x="${x}" y="${axisY}" text-anchor="middle" class="axis">${hourLabel(h.time,timeline)}</text>`);}});
  svg.push('</svg>');return svg.join('');
}

function observationLinePath(observations,valueOf,xOf,yOf){
  let previous=null;
  const commands=[];
  for(const point of observations){
    const value=valueOf(point);
    if(!Number.isFinite(value)){previous=null;continue;}
    const x=xOf(point),y=yOf(value),gap=previous?(point.observedAt-previous.observedAt)/1000:Infinity;
    commands.push(`${!previous||gap>90*60?'M':'L'} ${x} ${y}`);
    previous=point;
  }
  return commands.join(' ');
}

async function fetchLive(){
  const key=CONFIG.api.cacheKey,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CONFIG.api.timeoutMs);
  const snapshotPromise=fetch('outputs/weather-snapshot.json',{cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(s=>{
      if(!s)return null;
      const payload=validatePayload(s.payload);
      return {payload,fetchedAt:s.fetchedAt,stationObservation:s.stationObservation??null,stationObservations:s.stationObservations??[]};
    }).catch(()=>null);
  try{
    const response=await fetch(API_URL,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(`Weather service returned ${response.status}.`);
    const payload=validatePayload(await response.json()),fetchedAt=Date.now();selectNext48(payload,fetchedAt);
    const snapshot=await snapshotPromise;
    const stationData={stationObservation:snapshot?.stationObservation??null,stationObservations:snapshot?.stationObservations??[]};
    try{localStorage.setItem(key,JSON.stringify({payload,fetchedAt,...stationData}));}catch{}
    render(payload,fetchedAt,stationData);return;
  }catch(err){
    let snapshot=await snapshotPromise;
    if(snapshot){
      try{selectNext48(snapshot.payload,snapshot.fetchedAt);}catch{snapshot=null;}
    }
    if(snapshot){
      try{localStorage.setItem(key,JSON.stringify(snapshot));}catch{}
      const stale=Date.now()-snapshot.fetchedAt>2*CONFIG.api.refreshMinutes*60_000;
      render(snapshot.payload,snapshot.fetchedAt,{stale,nowMs:snapshot.fetchedAt,stationObservation:snapshot.stationObservation,stationObservations:snapshot.stationObservations});
      $('status-text').textContent=stale?'STALE DATA':'CACHED DATA';
      return;
    }
    const saved=readCache(key);
    if(saved){render(saved.payload,saved.fetchedAt,{stale:true,error:true,nowMs:saved.fetchedAt,stationObservation:saved.stationObservation,stationObservations:saved.stationObservations});return;}
    console.error('Weather unavailable:',err);$('status').dataset.state='error';$('status-text').textContent='DATA UNAVAILABLE';$('updated').textContent='No saved weather';$('condition-text').textContent='Weather unavailable';$('chart-wrap').innerHTML='<div class="empty">No weather data received. Check the connection; the display will retry.</div>';
  }finally{clearTimeout(timer)}
}
function readCache(key){try{const value=JSON.parse(localStorage.getItem(key));if(!value||!Number.isFinite(value.fetchedAt))return null;validatePayload(value.payload);return value;}catch{return null}}

const mode=new URLSearchParams(location.search).get('mode');
if(mode==='fixture')render(DEMO_PAYLOAD,Date.parse('2026-11-17T10:45:00Z'),{demo:true,nowMs:DEMO_PAYLOAD.current.time*1000});
else if(mode==='snapshot')fetch('outputs/weather-snapshot.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Snapshot unavailable.');return r.json()}).then(s=>{const payload=validatePayload(s.payload);selectNext48(payload,s.fetchedAt);const stale=Date.now()-s.fetchedAt>2*CONFIG.api.refreshMinutes*60_000;render(payload,s.fetchedAt,{stale,nowMs:s.fetchedAt,stationObservation:s.stationObservation,stationObservations:s.stationObservations})}).catch(()=>{$('status').dataset.state='error';$('status-text').textContent='DATA UNAVAILABLE';$('updated').textContent='No snapshot';$('condition-text').textContent='Weather unavailable';$('chart-wrap').innerHTML='<div class="empty">No weather snapshot is available.</div>'});
else{fetchLive();setInterval(fetchLive,CONFIG.api.refreshMinutes*60_000);}
