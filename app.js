import { CONFIG } from './config.js';
import { API_URL, DEMO_PAYLOAD, validatePayload, selectNext48, summarize48, chartBoundaries, hourAt, dateKey, dateLabel, clockLabel, hourLabel, weatherText, sunshineMinutes } from './weather.js';

const $=id=>document.getElementById(id);
document.documentElement.style.setProperty('--page-width',`${CONFIG.display.width}px`);
document.documentElement.style.setProperty('--page-height',`${CONFIG.display.height}px`);
document.documentElement.style.setProperty('--page-gutter',`${CONFIG.spacing.page}px`);
document.documentElement.style.setProperty('--page-top',`${CONFIG.spacing.top}px`);
document.documentElement.style.setProperty('--page-bottom',`${CONFIG.spacing.bottom}px`);
document.documentElement.style.setProperty('--base-font',`${CONFIG.typography.size}px`);
document.documentElement.style.setProperty('--weather-font',`"${CONFIG.typography.body}",Arial,sans-serif`);
const fitPreview=()=>document.documentElement.style.setProperty('--preview-scale',String(Math.min(1,innerWidth/CONFIG.display.width,innerHeight/CONFIG.display.height)));
fitPreview();window.addEventListener('resize',fitPreview);
const fmt=(v,d=0)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
const escapeSvg=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function render(payload,fetchedAt,{stale=false,error=false,demo=false,nowMs=Date.now()}={}){
  const hours=selectNext48(payload,nowMs),summary=summarize48(hours),current=payload.current;
  $('current-temp').innerHTML=`${fmt(current.temperature_2m,0)}<sup>${CONFIG.units.temperature}</sup>`;
  $('current-feels').textContent=`${fmt(current.apparent_temperature,0)}${CONFIG.units.temperature}`;
  $('condition-text').textContent=weatherText(current.weather_code);
  $('current-detail').textContent=`Humidity ${fmt(current.relative_humidity_2m)}${CONFIG.units.humidity}  ·  Wind ${fmt(current.wind_speed_10m)} ${CONFIG.units.wind}`;
  const status=$('status');status.dataset.state=stale?'stale':error?'error':demo?'demo':'live';
  $('status-text').textContent=stale?'STALE DATA':error?'DATA UNAVAILABLE':'';
  $('updated').textContent=`Updated ${new Intl.DateTimeFormat('en-GB',{timeZone:CONFIG.location.timezone,hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short',hourCycle:'h23'}).format(new Date(fetchedAt))}${stale?' · stale':''}`;
  $('announcement').textContent=`Witney weather updated ${clockLabel(fetchedAt/1000)}.`;
  $('chart-wrap').innerHTML=chartSvg(hours,summary);
}

function chartSvg(hours,summary){
  const W=CONFIG.chart.width,L=CONFIG.chart.labelWidth,P=W-L,top=43,rowH=CONFIG.chart.rowHeight,gap=CONFIG.spacing.rowGap,H=top+5*(rowH+gap)+24,step=P/48;
  const tempValues=hours.flatMap(h=>[h.temp,h.feels]).filter(Number.isFinite);
  const tempMin=tempValues.length?Math.floor(Math.min(...tempValues)-1):-10;
  const tempMax=tempValues.length?Math.ceil(Math.max(...tempValues)+1):10;
  const ranges={
    temp:{key:'temp',title:`TEMP + FEELS · ${CONFIG.units.temperature}`,detail:`↑${fmt(summary.high,0)}° · ↓${fmt(summary.low,0)}°`,detail2:`↑${fmt(summary.feelsHigh,0)}° · ↓${fmt(summary.feelsLow,0)}°`,min:tempMin,max:tempMax},
    rain:{key:'rain',title:`RAIN · ${CONFIG.units.precipitation}/h`,detail:`${fmt(summary.rainPeak,1)} ${CONFIG.units.precipitation}/h MAX`,min:0,max:Math.max(.5,Math.ceil(Math.max(...hours.map(h=>h.rain??0))*2)/2)},
    humidity:{key:'humidity',title:`HUMIDITY · ${CONFIG.units.humidity}`,detail:`${fmt(summary.humidity.low)}–${fmt(summary.humidity.high)}${CONFIG.units.humidity}`,min:0,max:100},
    wind:{key:'wind',title:`WIND · ${CONFIG.units.wind}`,detail:`${fmt(summary.wind.low)}–${fmt(summary.wind.high)} ${CONFIG.units.wind}`,min:0,max:Math.max(10,Math.ceil(Math.max(...hours.map(h=>h.wind??0))/5)*5)},
    sun:{key:'sun',title:'SUNSHINE · min/h',detail:`${fmt(summary.sunshine.low)}–${fmt(summary.sunshine.high)} min/h`,min:0,max:60}
  };
  const svg=[`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="48 hourly values with air temperature and feels-like, rainfall, humidity, wind and sunshine. Air and feels-like high and low points are marked; peak hourly rainfall is noted.">`];
  const boundaries=chartBoundaries(hours),lanes=[];
  for(let i=0;i<boundaries.length;i++){
    const start=boundaries[i],end=boundaries[i+1]??48,left=L+start*step,right=L+end*step,mid=(left+right)/2,label=dateLabel(hours[start].time),textWidth=label.length*6.4;
    const x=Math.max(L+textWidth/2,Math.min(L+P-textWidth/2,mid));
    let lane=0;while(lanes[lane]!==undefined&&lanes[lane]>x-textWidth/2-4)lane++;
    lanes[lane]=x+textWidth/2;
    svg.push(`<text x="${x}" y="${13+lane*14}" text-anchor="middle" class="date">${escapeSvg(label)}</text>`);
  }
  for(const i of boundaries.filter(i=>i>0)){
    const x=L+i*step;svg.push(`<line x1="${x}" x2="${x}" y1="34" y2="${H-22}" class="midnight"/>`);
  }
  const rows=Object.values(ranges);
  rows.forEach((series,r)=>{
    const y=top+r*(rowH+gap),bottom=y+rowH;
    svg.push(`<text x="0" y="${y+22}" class="metric">${escapeSvg(series.title)}</text><text x="0" y="${y+42}" class="scale">${escapeSvg(series.detail)}</text>`);
    if(series.detail2)svg.push(`<text x="0" y="${y+57}" class="scale">${escapeSvg(series.detail2)}</text>`);
    const py=v=>bottom-6-((Math.max(series.min,Math.min(series.max,v))-series.min)/(series.max-series.min||1))*(rowH-14);
    if(series.key==='temp'){
      for(const [key,cls] of [['temp','temp-line'],['feels','feels-line']]){
        const d=hours.map((h,i)=>Number.isFinite(h[key])?`${i?'L':'M'} ${L+(i+.5)*step} ${py(h[key])}`:'').filter(Boolean).join(' ');
        svg.push(`<path d="${d}" class="${cls}"/>`);
      }
      for(const [key,highIndex,lowIndex,cls] of [['temp',summary.highIndex,summary.lowIndex,'air-extreme'],['feels',summary.feelsHighIndex,summary.feelsLowIndex,'feels-extreme']]){
        for(const index of new Set([highIndex,lowIndex])){
          if(index<0||!Number.isFinite(hours[index]?.[key]))continue;
          const x=L+(index+.5)*step,yv=py(hours[index][key]);
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
        const x=L+i*step+step*.2,w=step*.6,yv=py(value);
        svg.push(`<rect x="${x}" y="${yv}" width="${w}" height="${Math.max(1,bottom-6-yv)}" class="${series.key==='rain'?'rain-bar':'bar'}"/>`);
      });
    }
  });
  const axisY=H-6;
  hours.forEach((h,i)=>{if(hourAt(h.time)%6===0){const x=L+(i+.5)*step;svg.push(`<text x="${x}" y="${axisY}" text-anchor="middle" class="axis">${hourLabel(h.time,hours)}</text>`);}});
  svg.push('</svg>');return svg.join('');
}

async function fetchLive(){
  const key=CONFIG.api.cacheKey,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CONFIG.api.timeoutMs);
  try{
    const response=await fetch(API_URL,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(`Weather service returned ${response.status}.`);
    const payload=validatePayload(await response.json()),fetchedAt=Date.now();selectNext48(payload,fetchedAt);
    try{localStorage.setItem(key,JSON.stringify({payload,fetchedAt}));}catch{}
    render(payload,fetchedAt);return;
  }catch(err){
    const saved=readCache(key);
    if(saved){render(saved.payload,saved.fetchedAt,{stale:true,error:true,nowMs:saved.fetchedAt});return;}
    console.error('Weather unavailable:',err);$('status').dataset.state='error';$('status-text').textContent='DATA UNAVAILABLE';$('updated').textContent='No saved weather';$('condition-text').textContent='Weather unavailable';$('chart-wrap').innerHTML='<div class="empty">No weather data received. Check the connection; the display will retry.</div>';
  }finally{clearTimeout(timer)}
}
function readCache(key){try{const value=JSON.parse(localStorage.getItem(key));if(!value||!Number.isFinite(value.fetchedAt))return null;validatePayload(value.payload);return value;}catch{return null}}

const mode=new URLSearchParams(location.search).get('mode');
if(mode==='fixture')render(DEMO_PAYLOAD,Date.parse('2026-11-17T10:45:00Z'),{demo:true,nowMs:DEMO_PAYLOAD.current.time*1000});
else if(mode==='snapshot')fetch('outputs/weather-snapshot.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Snapshot unavailable.');return r.json()}).then(s=>{const payload=validatePayload(s.payload);selectNext48(payload,s.fetchedAt);render(payload,s.fetchedAt,{nowMs:s.fetchedAt})}).catch(()=>{$('status').dataset.state='error';$('status-text').textContent='DATA UNAVAILABLE';$('updated').textContent='No snapshot';$('condition-text').textContent='Weather unavailable';$('chart-wrap').innerHTML='<div class="empty">No weather snapshot is available.</div>'});
else{fetchLive();setInterval(fetchLive,CONFIG.api.refreshMinutes*60_000);}
