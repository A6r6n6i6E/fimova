/* FiMova — dependency-free vocabulary, answer and queue logic. */
(function (scope, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.FiMova = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const GRADES = [4, 5, 6, 7, 8];
  const APP = "fimova";
  const MAX_WORDS = 5000;
  const naturalSort = (a, b) => a.localeCompare(b, "pl", { numeric: true });

  function normalize(value) {
    return typeof value === "string" ? value.normalize("NFKC").toLowerCase()
      .replace(/[\u2018\u2019\u02bc`]/g, "'")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim() : "";
  }
  function correct(word, answer) {
    const value = normalize(answer);
    return !!value && word.answers.some(a => normalize(a) === value);
  }

  // Two independent 32-bit hashes; collision is checked while parsing.
  function key(text) {
    let a = 2166136261, b = 2246822507;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b ^ text.charCodeAt(i), 3266489909);
    }
    return "f" + (a >>> 0).toString(16).padStart(8, "0") +
      (b >>> 0).toString(16).padStart(8, "0");
  }
  const identity = w => JSON.stringify([w.grade, normalize(w.chapter), normalize(w.pl), normalize(w.answers[0])]);

  function parseTXT(text) {
    if (typeof text !== "string" || text.length > 1000000) throw Error("Plik może mieć najwyżej 1 MB.");
    if (text.includes("\uFFFD")) throw Error("Zapisz plik w kodowaniu UTF-8. Nie udało się odczytać polskich znaków.");
    const words = [], errors = [], seen = new Map();
    let duplicates = 0;
    for (const [i, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(";").map(s => s.trim().replace(/\s+/g, " "));
      if (parts.length !== 4) {
        errors.push(`Wiersz ${i + 1}: wpisz 4 pola: polski;angielski;klasa;rozdział.`); continue;
      }
      const [pl, en, gradeText, chapter] = parts;
      const grade = Number(gradeText.replace(/^klasa\s+/i, ""));
      const answers = [...new Set(en.split("|").map(s => s.trim()).filter(Boolean))];
      if (!GRADES.includes(grade)) {
        errors.push(`Wiersz ${i + 1}: klasa musi być liczbą od 4 do 8.`); continue;
      }
      if (!pl || !chapter || !answers.length || en.split("|").some(s => !s.trim())) {
        errors.push(`Wiersz ${i + 1}: uzupełnij hasło, odpowiedź i rozdział.`); continue;
      }
      if (pl.length > 220 || chapter.length > 90 || answers.length > 16 || answers.some(a => a.length > 220)) {
        errors.push(`Wiersz ${i + 1}: za długi tekst (hasło: 220 znaków, rozdział: 90, warianty: 16).`); continue;
      }
      const w = { grade, chapter, pl, en: answers[0], answers };
      const signature = identity(w); w.id = key(signature);
      if (seen.has(w.id)) {
        const previous = seen.get(w.id);
        if (identity(previous) !== signature) throw Error("Konflikt identyfikatorów. Zmień nazwę rozdziału lub hasła.");
        previous.answers = [...new Set([...previous.answers, ...answers])];
        duplicates++; continue;
      }
      seen.set(w.id, w); words.push(w);
      if (words.length > MAX_WORDS) throw Error(`Baza może zawierać najwyżej ${MAX_WORDS} fiszek.`);
    }
    if (errors.length) throw Error(errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…i ${errors.length - 8} kolejnych błędów.` : ""));
    if (!words.length) throw Error("Nie znaleziono słówek. Wpisz co najmniej jeden wiersz.");
    return { words, duplicates };
  }
  function toTXT(words) {
    return "# FiMova — UTF-8\n# polski;angielski | alternatywa;klasa;rozdział\n" +
      words.map(w => `${w.pl};${w.answers.join(" | ")};${w.grade};${w.chapter}`).join("\n") + "\n";
  }
  function chapters(words, grade) {
    return [...new Set(words.filter(w => w.grade === grade).map(w => w.chapter))].sort(naturalSort);
  }
  function scoped(words, grade, chapter) {
    return words.filter(w => w.grade === grade && (chapter === "*" || w.chapter === chapter));
  }
  function learned(state, id) { return !!state.progress[id]?.learned; }
  function stats(words, state) {
    const done = words.filter(w => learned(state, w.id)).length;
    return { total: words.length, done, remaining: words.length - done };
  }
  function initialState() {
    return { app: APP, schema: 1, grade: 4, selected: {}, progress: {}, extraTXT: "" };
  }
  function record(state, word, result, now = new Date().toISOString()) {
    if (!["correct", "wrong", "skip"].includes(result)) throw Error("Nieznany wynik.");
    if (learned(state, word.id)) return state;
    const before = state.progress[word.id] || { learned: false, attempts: 0, mistakes: 0, updated: null };
    return { ...state, progress: { ...state.progress, [word.id]: {
      learned: result === "correct", attempts: before.attempts + 1,
      mistakes: before.mistakes + (result === "correct" ? 0 : 1), updated: now
    } } };
  }
  function reset(state, words) {
    const progress = { ...state.progress };
    words.forEach(w => { delete progress[w.id]; });
    return { ...state, progress };
  }
  function shuffle(items, rng = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  class Queue {
    constructor(words, state, rng = Math.random) {
      this.words = words;
      this.rng = rng;
      this.map = new Map(words.map(w => [w.id, w]));
      this.last = null;
      this.ids = shuffle(words.filter(w => !learned(state, w.id)).map(w => w.id), rng);
    }
    next(state) {
      this.ids = this.ids.filter(id => !learned(state, id));
      if (!this.ids.length) this.ids = shuffle(this.words.filter(w => !learned(state, w.id)).map(w => w.id), this.rng);
      if (!this.ids.length) return null;
      if (this.ids.length > 1 && this.ids[0] === this.last) {
        const i = 1 + Math.floor(this.rng() * (this.ids.length - 1));
        [this.ids[0], this.ids[i]] = [this.ids[i], this.ids[0]];
      }
      this.last = this.ids.shift();
      return this.map.get(this.last);
    }
    retry(word) {
      if (!this.map.has(word.id) || this.ids.includes(word.id)) return;
      const min = Math.min(2, this.ids.length);
      this.ids.splice(min + Math.floor(this.rng() * (this.ids.length - min + 1)), 0, word.id);
    }
  }
  function validateState(input) {
    if (!input || input.app !== APP || input.schema !== 1 ||
        !GRADES.includes(input.grade) || !input.progress ||
        typeof input.progress !== "object" || Array.isArray(input.progress)) {
      throw Error("To nie jest prawidłowa kopia postępów FiMova.");
    }
    const state = initialState();
    state.grade = input.grade;
    for (const [id, v] of Object.entries(input.progress)) {
      if (!/^f[0-9a-f]{16}$/.test(id) || !v || typeof v.learned !== "boolean" ||
          !Number.isSafeInteger(v.attempts) || v.attempts < 1 || v.attempts > 10000000 ||
          !Number.isSafeInteger(v.mistakes) || v.mistakes < 0 || v.mistakes > v.attempts ||
          (v.learned && v.mistakes === v.attempts) ||
          typeof v.updated !== "string" || !Number.isFinite(Date.parse(v.updated))) {
        throw Error("Kopia zawiera nieprawidłowe wyniki.");
      }
      state.progress[id] = { learned: v.learned, attempts: v.attempts, mistakes: v.mistakes, updated: v.updated };
    }
    if (Object.keys(state.progress).length > 20000) throw Error("Kopia zawiera zbyt dużo wyników.");
    for (const grade of GRADES) {
      const value = input.selected?.[grade];
      if (typeof value === "string" && value.length <= 90) state.selected[grade] = value;
    }
    if (input.extraTXT) {
      if (typeof input.extraTXT !== "string") throw Error("Nieprawidłowe dodatkowe słówka.");
      state.extraTXT = toTXT(parseTXT(input.extraTXT).words);
    }
    return state;
  }
  function readBackup(text) {
    if (typeof text !== "string" || text.length > 3000000) throw Error("Kopia jest zbyt duża.");
    let input;
    try { input = JSON.parse(text); } catch { throw Error("Nie udało się odczytać pliku JSON."); }
    return validateState(input);
  }
  return Object.freeze({ APP, GRADES, MAX_WORDS, normalize, correct, key, parseTXT, toTXT,
    chapters, scoped, learned, stats, initialState, record, reset, shuffle, Queue, validateState, readBackup });
});
