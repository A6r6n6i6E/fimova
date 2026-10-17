"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../public/core.js");
const data = C.parseTXT(fs.readFileSync(path.join(__dirname, "../data/slowka.txt"), "utf8")).words;
const line = "kot;cat | kitty;4;1. Zwierzęta";
const word = C.parseTXT(line).words[0];
const changed = (value) => JSON.parse(JSON.stringify(value));

test("250 sample cards, grades 4-8, 5 chapters of 10 each", () => {
  assert.equal(data.length,250);
  for (const grade of C.GRADES) {
    assert.equal(C.scoped(data,grade,"*").length,50);
    assert.equal(C.chapters(data,grade).length,5);
    for (const chapter of C.chapters(data,grade)) assert.equal(C.scoped(data,grade,chapter).length,10);
  }
});
for (const answer of ["cat","CAT"," cat ","  KiTtY  "]) {
  test(`accepted exact variant: ${JSON.stringify(answer)}`, () => assert.equal(C.correct(word,answer),true));
}
for (const answer of [""," ","cats","caat","the cat","dog","kat",null]) {
  test(`reject typo or unspecified variant: ${JSON.stringify(answer)}`, () => assert.equal(C.correct(word,answer),false));
}
test("normalize multiple spaces, curly apostrophe, unicode hyphen only", () => {
  assert.equal(C.normalize("  DON'T   give   up "), "don't give up");
  assert.equal(C.normalize("don’t"), "don't");
  assert.equal(C.normalize("self – confident"), "self-confident");
  assert.notEqual(C.normalize("confidant"),"confident");
});
test("TXT accepts BOM, CRLF, comments, Klasa 4", () => {
  const result=C.parseTXT("\uFEFF# comments\r\n\r\nkot;cat;Klasa 4;1. Zwierzęta\r\n");
  assert.equal(result.words[0].grade,4);
});
test("duplicate rows merge explicit variants", () => {
  const result=C.parseTXT(line+"\n"+"kot;cat | kitten;4;1. Zwierzęta");
  assert.equal(result.words.length,1); assert.equal(result.duplicates,1);
  assert.deepEqual(result.words[0].answers,["cat","kitty","kitten"]);
});
test("IDs stable across reordering and additional variants", () => {
  const first=C.parseTXT(line).words[0];
  const second=C.parseTXT("pies;dog;4;1. Zwierzęta\n"+line+" | not-a-row").words[0];
  assert.equal(first.id,C.parseTXT(line.replace("kitty","kitten")).words[0].id);
  assert.match(second.id,/^f[0-9a-f]{16}$/);
});
test("grades and chapters have separate progress IDs", () => {
  assert.notEqual(word.id,C.parseTXT(line.replace(";4;",";5;")).words[0].id);
  assert.notEqual(word.id,C.parseTXT(line.replace("1. Zwierzęta","2. Dom")).words[0].id);
});
for (const [label, invalid] of [
  ["empty",""],["wrong fields","kot;cat;4"],["grade 3","kot;cat;3;Test"],
  ["grade 9","kot;cat;9;Test"],["old page format","kot;cat;Zwierzęta;Strona 1"],
  ["empty chapter","kot;cat;4;"],["empty answer","kot;;4;Test"],
  ["empty variant","kot;cat | ;4;Test"],["invalid UTF-8","ko\uFFFD;cat;4;Test"],
  ["long prompt","a".repeat(221)+";a;4;Test"],["too large","a".repeat(1000001)]
]) test("reject invalid TXT: "+label,()=>assert.throws(()=>C.parseTXT(invalid)));

test("TXT errors report original line and prevent partial import", () => {
  assert.throws(()=>C.parseTXT("# comment\n"+line+"\nbad"),/Wiersz 3/);
});
test("TXT round trip preserves IDs, classes, chapters, accents, variants",()=>{
  assert.deepEqual(C.parseTXT(C.toTXT(data)).words,data);
});
test("correct removes card; wrong and skip keep it",()=>{
  const start=C.initialState();
  const wrong=C.record(start,word,"wrong");
  assert.equal(C.stats([word],wrong).remaining,1);
  const skipped=C.record(wrong,word,"skip");
  assert.equal(C.stats([word],skipped).remaining,1);
  const done=C.record(skipped,word,"correct");
  assert.equal(C.stats([word],done).remaining,0);
  assert.equal(done.progress[word.id].attempts,3);
  assert.equal(done.progress[word.id].mistakes,2);
  assert.deepEqual(start.progress,{});
});
test("already learned card cannot be counted twice",()=>{
  const state=C.record(C.initialState(),word,"correct");
  assert.strictEqual(C.record(state,word,"correct"),state);
  assert.strictEqual(C.record(state,word,"wrong"),state);
});
test("unknown verdict rejected",()=>assert.throws(()=>C.record(C.initialState(),word,"maybe")));
test("reset only affects its scope",()=>{
  let state=C.record(C.record(C.initialState(),data[0],"correct"),data[50],"correct");
  state=C.reset(state,[data[0]]);
  assert.equal(C.learned(state,data[0].id),false); assert.equal(C.learned(state,data[50].id),true);
});
test("shuffled queue visits every unseen card before repeating",()=>{
  const s=C.initialState(), words=data.slice(0,10), q=new C.Queue(words,s,()=>.37);
  assert.equal(new Set(Array.from({length:10},()=>q.next(s).id)).size,10);
});
test("retry is random but not immediate when other cards remain",()=>{
  const s=C.initialState(), q=new C.Queue(data.slice(0,5),s,()=>0);
  const w=q.next(s); q.retry(w);
  assert.notEqual(q.next(s).id,w.id); assert.notEqual(q.next(s).id,w.id);
  assert.equal(q.next(s).id,w.id);
});
test("queue removes mastered cards even if already queued",()=>{
  let s=C.initialState(); const q=new C.Queue([word],s);
  assert.equal(q.next(s).id,word.id); q.retry(word);
  s=C.record(s,word,"correct"); assert.equal(q.next(s),null);
});
test("single failed card repeats until mastered",()=>{
  let s=C.initialState();const q=new C.Queue([word],s);
  for(let i=0;i<8;i++) { const w=q.next(s); assert.equal(w.id,word.id);q.retry(w);s=C.record(s,w,"wrong"); }
  s=C.record(s,word,"correct");assert.equal(q.next(s),null);
});
test("repeated retry calls never duplicate queue IDs",()=>{
  const s=C.initialState(),q=new C.Queue([word],s);q.next(s);q.retry(word);q.retry(word);assert.equal(q.ids.length,1);
});
test("empty scope returns no question",()=>assert.equal(new C.Queue([],C.initialState()).next(C.initialState()),null));
test("backup restores correct, mistaken and private cards",()=>{
  const s=C.record(C.initialState(),word,"correct");s.extraTXT=line;s.selected[4]="1. Zwierzęta";
  const restored=C.readBackup(JSON.stringify(s));assert.equal(restored.progress[word.id].learned,true);
  assert.equal(C.parseTXT(restored.extraTXT).words[0].pl,"kot");
});
test("initial empty backup is valid",()=>assert.deepEqual(C.readBackup(JSON.stringify(C.initialState())),C.initialState()));
for (const [name,fn] of [
  ["foreign app",s=>s.app="slowko"],["invalid grade",s=>s.grade=3],
  ["negative counter",s=>s.progress[word.id].attempts=-1],
  ["counter type",s=>s.progress[word.id].attempts="1"],
  ["invalid date",s=>s.progress[word.id].updated="not a date"],
  ["learned without correct attempt",s=>s.progress[word.id].mistakes=1],
  ["malformed extra list",s=>s.extraTXT="bad"]
]) test("reject corrupt backup: "+name,()=>{
  const s=changed(C.record(C.initialState(),word,"correct"));fn(s);assert.throws(()=>C.readBackup(JSON.stringify(s)));
});
test("reject prototype-related progress keys",()=>{
  const s=C.record(C.initialState(),word,"correct");
  assert.throws(()=>C.readBackup(JSON.stringify(s).replace(word.id,"__proto__")));
  assert.equal({}.learned,undefined);
});
test("reject malformed JSON",()=>assert.throws(()=>C.readBackup("{not json}")));
test("natural chapter ordering",()=>{
  const words=C.parseTXT("a;a;4;10. Test\nb;b;4;2. Test\nc;c;4;1. Test").words;
  assert.deepEqual(C.chapters(words,4),["1. Test","2. Test","10. Test"]);
});
