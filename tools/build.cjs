/* Run: node tools/build.cjs. No npm dependencies or external services. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const pub = path.join(root, "public");
const C = require(path.join(pub, "core.js"));
const txt = fs.readFileSync(path.join(root, "data/slowka.txt"), "utf8");
const { words, duplicates } = C.parseTXT(txt);
const rawHTML = fs.readFileSync(path.join(root, "tools/index.template.html"), "utf8");
const swTemplate = fs.readFileSync(path.join(root, "tools/sw.template.js"), "utf8");
const hash = crypto.createHash("sha256").update(txt).update(rawHTML).update(swTemplate).update(fs.readFileSync(__filename));
["core.js", "app.js", "styles.css", "assets/fimova-logo.png", "assets/finova-school.png"].forEach(name => hash.update(fs.readFileSync(path.join(pub, name))));
const build = hash.digest("hex").slice(0, 16);
const data = { app: "fimova", version: "1.0", build, sample: true, words };
const serialized = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const vocabulary = "/* Generated from data/slowka.txt. Do not edit. */\nglobalThis.FIMOVA_DATA = " + serialized + ";\n";
fs.writeFileSync(path.join(pub, "vocabulary.js"), vocabulary);
const buildDir = path.join(pub, "build");
fs.rmSync(buildDir, { recursive: true, force: true }); fs.mkdirSync(buildDir, { recursive: true });
let html = rawHTML.replace("<body>", `<body data-build="${build}">`);
const assets = ["./"];
for (const name of ["core.js", "vocabulary.js", "app.js", "styles.css"]) {
  const ext = path.extname(name), basename = path.basename(name, ext);
  const versioned = `build/${basename}-${build}${ext}`;
  fs.copyFileSync(path.join(pub, name), path.join(pub, versioned));
  html = html.replaceAll(`"./${name}"`, `"./${versioned}"`);
  assets.push("./" + versioned);
}
for (const name of ["fimova-logo.png", "finova-school.png"]) {
  const versioned = `build/${name.replace(".png", "")}-${build}.png`;
  fs.copyFileSync(path.join(pub, "assets", name), path.join(pub, versioned));
  html = html.replaceAll(`"./assets/${name}"`, `"./${versioned}"`);
  assets.push("./" + versioned);
}
assets.push("./manifest.webmanifest", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-180.png");
fs.writeFileSync(path.join(pub, "index.html"), html);
fs.writeFileSync(path.join(pub, "sw.js"), swTemplate.replaceAll("__BUILD__", build).replace("__ASSETS__", JSON.stringify(assets)));
const counts = C.GRADES.map(grade => ({
  klasa: grade, slowka: words.filter(w => w.grade === grade).length, rozdzialy: C.chapters(words, grade).length
}));
const metadata = {
  aplikacja: "FiMova", wersja: "1.0", build, liczbaFiszek: words.length,
  liczbaKlas: counts.filter(c => c.slowka).length,
  liczbaRozdzialow: counts.reduce((n, c) => n + c.rozdzialy, 0), klasy: counts,
  zrodlo: "data/slowka.txt", commit: process.env.CF_PAGES_COMMIT_SHA || null
};
fs.writeFileSync(path.join(pub, "wersja.json"), JSON.stringify(metadata, null, 2) + "\n");

// Self-contained desktop preview. No service worker and no network dependencies.
let demo = rawHTML.replace("<body>", `<body data-build="${build}">`)
  .replace(/  <link rel="manifest"[^>]*>\n/, "")
  .replace('  <link rel="stylesheet" href="./styles.css">', "<style>\n" + fs.readFileSync(path.join(pub, "styles.css"), "utf8") + "\n</style>")
  .replace(/  <script src="\.\/(core|vocabulary|app)\.js" defer><\/script>/g, (_, name) =>
    "<script defer-data>\n" + (name === "core" ? "globalThis.FIMOVA_STANDALONE = true;\n" : "") +
    fs.readFileSync(path.join(pub, `${name}.js`), "utf8") + "\n</script>");
const inlineScripts = [...demo.matchAll(/<script defer-data>[\s\S]*?<\/script>/g)].map(m => m[0].replace(" defer-data", "")).join("\n");
demo = demo.replace(/<script defer-data>[\s\S]*?<\/script>/g, "").replace("</body>", inlineScripts + "\n</body>");
demo = demo.replace(/"\.\/assets\/([^"]+\.png)"/g, (_, name) => '"data:image/png;base64,' + fs.readFileSync(path.join(pub, "assets", name)).toString("base64") + '"');
fs.writeFileSync(path.join(root, "fimova-demo.html"), demo);
console.log(`FIMOVA-1.0 | ${words.length} slowek | ${metadata.liczbaKlas} klas | ${metadata.liczbaRozdzialow} rozdzialow | build ${build}`);
console.log("Dane kontrolne: /wersja.json");
if (duplicates) console.log(`Scalono powtorzone wiersze TXT: ${duplicates}`);
