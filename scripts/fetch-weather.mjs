import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { API_URL, validatePayload, selectNext48 } from '../weather.js';
import { fetchStationData } from '../observations.js';

let response;
let requestError;
for(let attempt=1;attempt<=3;attempt++){
  try{
    response=await fetch(API_URL,{signal:AbortSignal.timeout(30_000),cache:'no-store'});
    if(response.status<500)break;
    requestError=new Error(`Open-Meteo returned ${response.status}.`);
  }catch(error){
    requestError=error;
  }
  if(attempt<3){
    console.warn(`Open-Meteo request ${attempt} failed; retrying. ${requestError.message}`);
    await new Promise(resolve=>setTimeout(resolve,2_000*attempt));
  }
}
let snapshot;
if(response?.ok){
  try{
    const payload=validatePayload(await response.json());
    const fetchedAt=Date.now();
    selectNext48(payload,fetchedAt);
    const {stationObservation,stationObservations}=await fetchStationData(fetch,fetchedAt);
    if(!stationObservation)console.warn('No fresh, valid EGVN METAR; forecast will be used alone.');
    snapshot={payload,fetchedAt,stationObservation,stationObservations};
  }catch(error){
    requestError=error;
  }
}
if(!snapshot){
  try{
    const previous=JSON.parse(await readFile(resolve('outputs/weather-snapshot.json'),'utf8'));
    validatePayload(previous.payload);
    selectNext48(previous.payload,previous.fetchedAt);
    if(Date.now()-previous.fetchedAt>24*60*60_000)throw new Error('Cached forecast is older than 24 hours.');
    snapshot=previous;
    console.warn(`Open-Meteo unavailable (${requestError?.message??(response?`HTTP ${response.status}`:'no response')}); keeping cached forecast from ${new Date(previous.fetchedAt).toISOString()}.`);
  }catch(error){
    throw new Error(`Open-Meteo unavailable and no usable cached forecast exists: ${error.message}`);
  }
}

await mkdir(resolve('outputs'),{recursive:true});
await writeFile(resolve('outputs/weather-snapshot.json'),JSON.stringify(snapshot));
console.log(`Saved validated weather snapshot at ${new Date(snapshot.fetchedAt).toISOString()}.`);
