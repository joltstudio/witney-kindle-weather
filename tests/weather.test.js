import test from 'node:test';
import assert from 'node:assert/strict';
import { API_URL, DEMO_PAYLOAD, selectNext48, validatePayload, hourAt, dateKey, dateLabel, hourLabel, chartBoundaries, summarize48, sunshineMinutes } from '../weather.js';

test('selects 48 local hourly values and labels the repeated autumn hour',()=>{
  const payload=structuredClone(DEMO_PAYLOAD),start=Date.parse('2026-10-24T22:00:00Z')/1000;
  payload.hourly.time=payload.hourly.time.map((_,i)=>start+i*3600);
  const hours=selectNext48(payload,start*1000),repeated=hours.filter(h=>hourAt(h.time)===1&&dateKey(h.time)==='2026-10-25');
  assert.equal(hours.length,48);
  assert.equal(repeated.length,2);
  assert.equal(hourLabel(repeated[0].time,hours),'01a');
  assert.equal(hourLabel(repeated[1].time,hours),'01b');
  assert.equal(chartBoundaries(hours).filter(i=>i>0).length,2);
  assert.equal(new Set(hours.map(h=>dateLabel(h.time))).size,3);
});

test('keeps local midnight dates across the spring DST change',()=>{
  const payload=structuredClone(DEMO_PAYLOAD),start=Date.parse('2026-03-28T00:00:00Z')/1000;
  payload.hourly.time=payload.hourly.time.map((_,i)=>start+i*3600);
  const hours=selectNext48(payload,start*1000);
  assert.equal(hours.length,48);
  assert.equal(new Set(hours.map(h=>dateKey(h.time))).size,3);
  assert.equal(hours.filter(h=>hourAt(h.time)===0).length,3);
});

test('starts a complete 48-hour forecast at the next full UTC hour',()=>{
  const payload=structuredClone(DEMO_PAYLOAD),start=Date.parse('2026-11-17T10:00:00Z')/1000;
  payload.hourly.time=payload.hourly.time.map((_,i)=>start+i*3600);
  const hours=selectNext48(payload,(start+20*60)*1000);
  assert.equal(hours.length,48);
  assert.equal(hours[0].time,start+3600);
  assert.equal(hours.at(-1).time,start+48*3600);
});

test('rejects malformed or missing weather fields',()=>{
  assert.equal(validatePayload(DEMO_PAYLOAD),DEMO_PAYLOAD);
  const broken=structuredClone(DEMO_PAYLOAD);broken.hourly.wind_speed_10m.pop();
  assert.throws(()=>validatePayload(broken),/wind_speed_10m/);
  assert.throws(()=>validatePayload({error:true}),/incomplete/);
});

test('uses configured units and converts sunshine seconds to minutes/hour',()=>{
  const query=new URL(API_URL).searchParams;
  assert.equal(query.get('temperature_unit'),'celsius');
  assert.equal(query.get('wind_speed_unit'),'mph');
  assert.equal(query.get('precipitation_unit'),'mm');
  assert.equal(query.has('models'),false,'Best Match remains automatic');
  assert.equal(sunshineMinutes(1800),30);
  assert.equal(sunshineMinutes(null),null);
});

test('summarizes temperature and feels-like extremes plus peak rainfall',()=>{
  const start=Date.parse('2026-11-17T10:00:00Z'),hours=selectNext48(DEMO_PAYLOAD,start);
  const summary=summarize48(hours);
  assert.equal(summary.high,Math.max(...hours.map(h=>h.temp)));
  assert.equal(summary.low,Math.min(...hours.map(h=>h.temp)));
  assert.equal(summary.feelsHigh,Math.max(...hours.map(h=>h.feels)));
  assert.equal(summary.feelsLow,Math.min(...hours.map(h=>h.feels)));
  assert.equal(summary.rainPeak,Math.max(...hours.map(h=>h.rain)));
  hours[2].rain=null;
  assert.equal(summarize48(hours).rainPeak,null);
});
