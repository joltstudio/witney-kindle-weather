import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const chrome=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
const live=process.argv.includes('--live');
const snapshot=process.argv.includes('--snapshot');
const out=resolve(live||snapshot?'outputs/witney-weather-live-600x800.png':'outputs/witney-weather-600x800.png');
const url=`http://127.0.0.1:4173/?mode=${snapshot?'snapshot':live?'live':'fixture'}`;
await mkdir(resolve('outputs'),{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'witney-weather-chrome-'));
try{
  const result=spawnSync(chrome,[
    '--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
    '--window-size=600,800',`--user-data-dir=${profile}`,
    `--screenshot=${out}`,`--virtual-time-budget=${live||snapshot?15000:1500}`,url
  ],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||`Chrome exited with ${result.status}`);
  const png=await readFile(out);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(width!==600||height!==800)throw new Error(`Expected 600×800 PNG; got ${width}×${height}.`);
  console.log(`Wrote ${out} (${width}×${height})`);
}finally{await rm(profile,{recursive:true,force:true});}
