"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const template=fs.readFileSync(path.join(__dirname,"../tools/sw.template.js"),"utf8");
const BUILD="test-version";
const ROOT="https://fimova.test/";
const assets=["./","./build/app-test-version.js"];
function environment(){
  const handlers={}, stores=new Map(), calls=[];
  const control={offline:false,badAsset:false,otherBuild:false,quota:false,waiting:false,claimed:false};
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const map=stores.get(name);
      return {
        async put(key,response){if(control.quota)throw Error("quota");map.set(typeof key==="string"?key:key.url,response.clone());},
        async match(key){const r=map.get(typeof key==="string"?key:key.url);return r?.clone();}
      };
    },
    async keys(){return [...stores.keys()]},
    async delete(key){return stores.delete(key)}
  };
  const self={
    registration:{scope:ROOT},location:{origin:new URL(ROOT).origin},
    addEventListener:(name,fn)=>handlers[name]=fn,
    skipWaiting:async()=>{control.waiting=true;},clients:{claim:async()=>{control.claimed=true;}}
  };
  const fetch=async(request)=>{
    if(control.offline)throw Error("offline");
    const url=typeof request==="string"?request:request.url;calls.push(url);
    if(control.badAsset&&url.includes("/build/"))return new Response("missing",{status:404});
    const html=`<body data-build="${control.otherBuild?"new-build":BUILD}">FiMova</body>`;
    const r=new Response(url===ROOT?html:"window.example=true;",{headers:{"Content-Type":url===ROOT?"text/html":"text/javascript"}});
    Object.defineProperty(r,"url",{value:url});return r;
  };
  const context=vm.createContext({self,caches,fetch,URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,console});
  vm.runInContext(template.replaceAll("__BUILD__",BUILD).replace("__ASSETS__",JSON.stringify(assets)),context);
  async function lifecycle(type){
    let pending;handlers[type]({waitUntil:p=>pending=p});await pending;
  }
  async function navigate(url=ROOT,mode="navigate",method="GET"){
    let response,intercepted=false;
    handlers.fetch({request:{url,mode,method},respondWith:p=>{intercepted=true;response=p;}});
    return {intercepted,response:await response};
  }
  return {context,handlers,control,stores,calls,caches,lifecycle,navigate};
}
test("precache installs a complete matching shell and versioned JS",async()=>{
  const e=environment();await e.lifecycle("install");
  assert.equal(e.control.waiting,true);
  assert.ok(e.stores.get("fimova:"+ROOT+":"+BUILD).has(ROOT));
});
test("failed install removes partial new cache, does not activate",async()=>{
  const e=environment();e.control.badAsset=true;
  await assert.rejects(e.lifecycle("install"));
  assert.equal(e.control.waiting,false);assert.equal(e.stores.has("fimova:"+ROOT+":"+BUILD),false);
});
test("HTML/worker deployment mismatch rejects install",async()=>{
  const e=environment();e.control.otherBuild=true;await assert.rejects(e.lifecycle("install"),/different deployments/);
});
test("navigation fetches network first",async()=>{
  const e=environment();await e.lifecycle("install");e.calls.length=0;
  const {response}=await e.navigate();assert.equal(response.status,200);assert.equal(e.calls[0],ROOT);
});
test("offline navigation uses saved canonical shell",async()=>{
  const e=environment();await e.lifecycle("install");e.control.offline=true;
  const {response}=await e.navigate();assert.equal(response.status,200);assert.match(await response.text(),/FiMova/);
});
test("index.html alias also receives clean canonical response offline",async()=>{
  const e=environment();await e.lifecycle("install");e.control.offline=true;
  const {response}=await e.navigate(ROOT+"index.html");assert.equal(response.status,200);
  assert.equal(response.redirected,false);assert.equal(response.url,"");
});
test("new HTML does not overwrite the old offline shell",async()=>{
  const e=environment();await e.lifecycle("install");e.control.otherBuild=true;
  assert.match(await (await e.navigate()).response.text(),/new-build/);
  e.control.offline=true;
  assert.match(await (await e.navigate()).response.text(),/test-version/);
});
test("no cache and no network produce informative 503",async()=>{
  const e=environment();e.control.offline=true;
  const {response}=await e.navigate();assert.equal(response.status,503);
});
test("quota errors do not break online navigation",async()=>{
  const e=environment();e.control.quota=true;
  const {response}=await e.navigate();assert.equal(response.status,200);
});
test("diagnostics, external requests and POST are not intercepted",async()=>{
  const e=environment();
  assert.equal((await e.navigate(ROOT+"wersja.json","cors")).intercepted,false);
  assert.equal((await e.navigate("https://other.test/")).intercepted,false);
  assert.equal((await e.navigate(ROOT,"navigate","POST")).intercepted,false);
});
test("activation keeps one older app cache and other apps untouched",async()=>{
  const e=environment();
  await e.caches.open("slowko:do-not-touch");
  await e.caches.open("fimova:"+ROOT+":older-1");
  await e.caches.open("fimova:"+ROOT+":older-2");
  await e.lifecycle("install");await e.lifecycle("activate");
  const names=await e.caches.keys();
  assert.ok(names.includes("slowko:do-not-touch"));
  assert.ok(!names.includes("fimova:"+ROOT+":older-1"));
  assert.ok(names.includes("fimova:"+ROOT+":older-2"));
  assert.ok(e.control.claimed);
});
test("immutable asset available with network disabled",async()=>{
  const e=environment();await e.lifecycle("install");e.control.offline=true;
  const {response}=await e.navigate(ROOT+"build/app-test-version.js","cors");
  assert.equal(response.status,200);
});
test("ready status reflects actual cached shell",async()=>{
  const e=environment();await e.lifecycle("install");
  let pending,message;
  e.handlers.message({data:{type:"STATUS"},source:{postMessage:m=>message=m},waitUntil:p=>pending=p});
  await pending;assert.equal(message.ready,true);assert.equal(message.app,"fimova");
});
test("followed HTTP redirect is rebuilt as a navigation-safe response",async()=>{
  const server=http.createServer((req,res)=>{
    if(req.url==="/index.html"){res.writeHead(308,{Location:"/"});res.end();return;}
    res.writeHead(200,{"Content-Type":"text/html","X-Test":"kept"});res.end("<h1>FiMova</h1>");
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  try{
    const url="http://127.0.0.1:"+server.address().port;
    const response=await fetch(url+"/index.html");
    assert.equal(response.redirected,true);
    const e=environment();e.context.self.location.origin=url;e.context.input=response;
    const clean=await vm.runInContext("cleanResponse(input)",e.context);
    assert.equal(clean.redirected,false);assert.equal(clean.url,"");
    assert.equal(clean.headers.get("X-Test"),"kept");assert.match(await clean.text(),/FiMova/);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test("refuse cross-origin followed redirects",async()=>{
  const e=environment();const r=new Response("not our app");
  Object.defineProperty(r,"url",{value:"https://unrelated.test/"});
  e.context.input=r;
  await assert.rejects(vm.runInContext("cleanResponse(input)",e.context),/Cross-origin/);
});
