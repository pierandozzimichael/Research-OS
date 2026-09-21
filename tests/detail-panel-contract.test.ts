import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const clientUrl=new URL("../app/research-os.tsx",import.meta.url);
const cssUrl=new URL("../app/globals.css",import.meta.url);

test("record reader keeps essentials before secondary disclosures",async()=>{
  const source=await readFile(clientUrl,"utf8");
  const start=source.indexOf("function DetailPanel");
  const end=source.indexOf("declare global",start);
  const detail=source.slice(start,end);
  assert.ok(start>=0&&end>start);

  const positions=[
    detail.indexOf("<h2>{record.title}</h2>"),
    detail.indexOf('className="detail-meta"'),
    detail.indexOf('className="detail-summary"'),
    detail.indexOf("<RecordAtAGlance"),
    detail.indexOf("<RecordDisclosure"),
  ];
  assert.ok(positions.every(position=>position>=0));
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
});

test("record reader uses accessible disclosures without hiding evidence boundaries",async()=>{
  const source=await readFile(clientUrl,"utf8");
  assert.match(source,/function RecordDisclosure[\s\S]*?<details[\s\S]*?<summary>/);
  assert.match(source,/onToggle=\{event=>setOpen\(event\.currentTarget\.open\)\}/);
  for(const title of ["Evidence & sources","Connected path","Add figure context","Full record","Explicit connections"]){
    assert.match(source,new RegExp(`title="${title.replace(/[&]/g,"&")}"`));
  }
  assert.match(source,/blockerCount>0&&<div><span>Blockers/);
  assert.match(source,/figures>0&&<div><span>Figures/);
});

test("destructive relationship controls require explicit management mode",async()=>{
  const source=await readFile(clientUrl,"utf8");
  assert.match(source,/Changes save immediately\./);
  assert.match(source,/aria-expanded=\{manageConnections\}/);
  assert.match(source,/manageConnections&&<button className="remove"/);
  assert.match(source,/persistRelations\(record\.id,record\.relations\.filter/);
});

test("record reader preserves canonical edit and figure write boundaries",async()=>{
  const source=await readFile(clientUrl,"utf8");
  assert.match(source,/className="primary" onClick=\{saveDetails\}>Save Markdown/);
  assert.match(source,/value=\{draftTitle\}/);
  assert.match(source,/value=\{draftSummary\}/);
  assert.match(source,/value=\{draftBody\}/);
  assert.match(source,/saveFigures=\{saveFigures\}/);
});

test("reader CSS protects narrow layouts and readable supporting text",async()=>{
  const css=await readFile(cssUrl,"utf8");
  assert.match(css,/\.detail-panel \{ overflow-x: hidden;/);
  assert.match(css,/\.reader-disclosure > summary/);
  assert.match(css,/\.reader-disclosure \.section-cards section > div[\s\S]*?font-size: var\(--type-body\)/);
  assert.match(css,/@media \(max-width: 640px\)[\s\S]*?\.detail-panel \{ padding: 18px 16px 90px; \}/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/\.canvas-layout\.detail-expanded \.canvas-panel,[\s\S]*?\.library-layout\.detail-expanded \.library-main \{ display: none; \}/);
});

test("mobile record selection enters a dedicated reading mode",async()=>{
  const source=await readFile(clientUrl,"utf8");
  assert.match(source,/function selectRecordForReading\(id:string\)/);
  assert.match(source,/matchMedia\("\(max-width: 640px\)"\)\.matches\)setDetailExpanded\(true\)/);
  assert.match(source,/className="expand-detail-compact"[\s\S]*?Back to list/);
  assert.match(source,/aria-label=\{expanded\?"Back to map or list":"Open record reader"\}/);
  assert.match(source,/onClick=\{\(\)=>selectRecordForReading\(r\.id\)\}/);
});
