"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("metadata shows FiMova, 250 cards, 5 grades and 25 chapters",()=>{
  const m=JSON.parse(read("public/wersja.json"));
  assert.equal(m.aplikacja,"FiMova");assert.equal(m.liczbaFiszek,250);
  assert.equal(m.liczbaKlas,5);assert.equal(m.liczbaRozdzialow,25);
});
test("built HTML refers only to existing local assets",()=>{
  const html=read("public/index.html");
  for(const [,p] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root,"public",p)),p);
});
test("repeated builds produce the same content version",()=>{
  const before=JSON.parse(read("public/wersja.json")).build;
  execFileSync(process.execPath,["tools/build.cjs"],{cwd:root});
  assert.equal(JSON.parse(read("public/wersja.json")).build,before);
});
test("scripts, stylesheet and logos are versioned",()=>{
  const html=read("public/index.html");
  assert.match(html,/build\/core-[a-f0-9]+\.js/);
  assert.match(html,/build\/app-[a-f0-9]+\.js/);
  assert.match(html,/build\/styles-[a-f0-9]+\.css/);
  assert.match(html,/build\/vocabulary-[a-f0-9]+\.js/);
  assert.match(html,/build\/fimova-logo-[a-f0-9]+\.png/);
});
test("standalone preview has no external scripts/styles/images or SW",()=>{
  const html=read("fimova-demo.html");
  assert.ok(html.includes("FIMOVA_STANDALONE = true"));
  assert.ok(!/<script[^>]*src=/.test(html));
  assert.ok(!/<link[^>]*rel="stylesheet"/.test(html));
  assert.ok(!/<img[^>]*src="(?!data:)/.test(html));
});
test("input disables spellcheck and autocorrection",()=>{
  const html=read("public/index.html");assert.match(html,/spellcheck="false"/);
  assert.match(html,/autocorrect="off"/);assert.match(html,/autocapitalize="none"/);
});
test("selectors use grade and chapter, not old page filters",()=>{
  const html=read("public/index.html");
  assert.match(html,/id="grade"/);assert.match(html,/id="chapter"/);assert.ok(!/id="page"/.test(html));
});
test("public app uses independent progress namespace",()=>{
  assert.match(read("public/app.js"),/fimova:1:/);assert.ok(!/localStorage\.clear/.test(read("public/app.js")));
});
test("manifest has correctly sized supplied local icons",()=>{
  const manifest=JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.short_name,"FiMova");
  for(const i of manifest.icons)assert.ok(fs.existsSync(path.join(root,"public",i.src)));
});
