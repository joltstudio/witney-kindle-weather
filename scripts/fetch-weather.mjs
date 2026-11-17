import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { API_URL, validatePayload, selectNext48 } from '../weather.js';

const controller=new AbortController();
const timer=setTimeout(()=>controller.abort(),15_000);
try{
  const response=await fetch(API_URL,{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw new Error(`Open-Meteo returned ${response.status}.`);
  const payload=validatePayload(await response.json());
  const fetchedAt=Date.now();
  selectNext48(payload,fetchedAt);
  await mkdir(resolve('outputs'),{recursive:true});
  await writeFile(resolve('outputs/weather-snapshot.json'),JSON.stringify({payload,fetchedAt}));
  console.log(`Saved validated weather snapshot at ${new Date(fetchedAt).toISOString()}.`);
}finally{clearTimeout(timer)}
