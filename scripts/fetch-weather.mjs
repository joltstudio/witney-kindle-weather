import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { API_URL, validatePayload, selectNext48 } from '../weather.js';

let response;
for(let attempt=1;attempt<=3;attempt++){
  try{
    response=await fetch(API_URL,{signal:AbortSignal.timeout(30_000),cache:'no-store'});
    if(response.status<500)break;
    if(attempt===3)throw new Error(`Open-Meteo returned ${response.status}.`);
  }catch(error){
    if(attempt===3)throw error;
    console.warn(`Open-Meteo request ${attempt} failed; retrying. ${error.message}`);
  }
  await new Promise(resolve=>setTimeout(resolve,2_000*attempt));
}
if(!response.ok)throw new Error(`Open-Meteo returned ${response.status}.`);
const payload=validatePayload(await response.json());
const fetchedAt=Date.now();
selectNext48(payload,fetchedAt);
await mkdir(resolve('outputs'),{recursive:true});
await writeFile(resolve('outputs/weather-snapshot.json'),JSON.stringify({payload,fetchedAt}));
console.log(`Saved validated weather snapshot at ${new Date(fetchedAt).toISOString()}.`);
