/* FiMova UI: no framework, no analytics, local-only learning progress. */
(() => {
  "use strict";
  const C = globalThis.FiMova;
  const data = globalThis.FIMOVA_DATA;
  const $ = id => document.getElementById(id);
  if (!C || !data?.words?.length) {
    $("prompt").textContent = "Nie wczytano słówek";
    $("instruction").textContent = "Odśwież stronę. Jeśli to nie pomoże, sprawdź publikację aplikacji.";
    $("primary-label").textContent = "Odśwież";
    $("answer-zone").hidden = $("skip").hidden = true;
    $("study-form").addEventListener("submit", e => { e.preventDefault(); location.reload(); });
    return;
  }
  const scopePath = location.pathname.replace(/index\.html$/, "");
  const STORAGE = `fimova:1:${scopePath}`;
  let state = C.initialState(), words = [], scope = [], queue, current = null;
  let mode = "question", feedbackAt = 0, importCandidate = null, pendingConfirm = null;
  let storageOK = true, isComposing = false, toastTimer = null, registration = null;

  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) state = C.readBackup(saved);
  } catch {
    storageOK = false;
  }

  function notify(message, duration = 5000) {
    clearTimeout(toastTimer);
    $("toast").textContent = message; $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, duration);
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
      storageOK = true;
    } catch {
      if (storageOK) notify("Nie udało się zapisać postępów. Zapisz kopię w Opcjach.", 8000);
      storageOK = false;
    }
    $("storage-status").hidden = storageOK;
    $("storage-status").textContent = "Pamięć przeglądarki jest niedostępna lub zapis był uszkodzony. Zapisz postępy do pliku przed zamknięciem strony.";
  }
  function buildWords() {
    const map = new Map(data.words.map(w => [w.id, w]));
    const extras = state.extraTXT ? C.parseTXT(state.extraTXT).words : [];
    extras.forEach(w => { if (!map.has(w.id)) map.set(w.id, w); });
    words = [...map.values()];
    $("dataset-count").textContent = words.length;
    $("remove-extra").disabled = !extras.length;
  }
  function chapter() { return $("chapter").value; }
  function scopeTitle() {
    return `Klasa ${state.grade} · ${chapter() === "*" ? "cała klasa" : chapter()}`;
  }
  function controls() {
    $("grade").value = String(state.grade);
    const chapters = C.chapters(words, state.grade);
    const preferred = state.selected[state.grade];
    const chosen = preferred === "*" || chapters.includes(preferred) ? preferred : (chapters[0] || "*");
    $("chapter").replaceChildren();
    const all = document.createElement("option");
    all.value = "*"; all.textContent = "Cała klasa"; $("chapter").append(all);
    chapters.forEach(name => {
      const option = document.createElement("option");
      option.value = name; option.textContent = name; $("chapter").append(option);
    });
    $("chapter").value = chosen;
    state.selected[state.grade] = chosen;
  }
  function updateProgress() {
    const s = C.stats(scope, state);
    $("learned-count").textContent = `${s.done} z ${s.total}`;
    $("remaining-count").textContent = s.remaining;
    $("progress").max = Math.max(1, s.total); $("progress").value = s.done;
    $("progress").setAttribute("aria-valuetext", `${s.done} z ${s.total} słówek opanowanych`);
    $("scope-label").textContent = scopeTitle();
    $("reset-scope").disabled = !s.done && !scope.some(w => state.progress[w.id]);
  }
  function newScope() {
    scope = C.scoped(words, state.grade, chapter());
    queue = new C.Queue(scope, state);
    updateProgress(); nextQuestion();
  }
  function nextQuestion(focus = false) {
    current = queue.next(state);
    $("study-card").className = "study-card";
    $("feedback").hidden = $("finished").hidden = true;
    $("input-error").hidden = true;
    $("answer").removeAttribute("aria-invalid");
    $("answer").value = "";
    $("answer").disabled = false;
    $("primary").disabled = false;
    $("question").hidden = $("answer-zone").hidden = $("skip").hidden = false;
    $("primary-label").textContent = "Sprawdź";
    if (!current) {
      mode = scope.length ? "complete" : "empty";
      $("question").hidden = $("answer-zone").hidden = $("skip").hidden = true;
      $("finished").hidden = false;
      if (scope.length) {
        $("study-card").classList.add("good");
        $("finish-title").textContent = "Brawo! Wszystko umiesz.";
        $("finish-copy").textContent = `Opanowane: ${scope.length} z ${scope.length}. Wybierz kolejny rozdział i ucz się dalej.`;
        $("primary-label").textContent = "Wybierz kolejny rozdział";
      } else {
        $("finish-title").textContent = "Tu jeszcze nie ma słówek";
        $("finish-copy").textContent = "Wybierz inną klasę lub dodaj listę w Opcjach.";
        $("primary-label").textContent = "Wybierz klasę";
      }
      if (focus) $("finish-title").focus({ preventScroll: true });
    } else {
      mode = "question";
      $("prompt").textContent = current.pl;
      $("prompt").classList.toggle("long", current.pl.length > 23);
      $("instruction").textContent = "Napisz po angielsku";
      if (focus) $("prompt").focus({ preventScroll: true });
    }
    $("study-card").querySelector(".card-content").scrollTop = 0;
  }
  function submit(skip = false) {
    if (mode !== "question" || !current) return;
    const value = $("answer").value;
    if (!skip && !value.trim()) {
      $("input-error").textContent = "Wpisz odpowiedź lub wybierz „Nie wiem”.";
      $("input-error").hidden = false;
      $("answer").setAttribute("aria-invalid", "true");
      $("answer").focus({ preventScroll: true });
      return;
    }
    const ok = !skip && C.correct(current, value);
    state = C.record(state, current, ok ? "correct" : skip ? "skip" : "wrong");
    if (!ok) queue.retry(current);
    persist(); updateProgress();
    mode = "feedback"; feedbackAt = performance.now();
    $("answer").blur();
    $("answer-zone").hidden = $("skip").hidden = true;
    $("feedback").hidden = false;
    $("study-card").classList.add("answered", ok ? "good" : "retry");
    $("feedback-mark").textContent = ok ? "✓" : "↻";
    $("feedback-title").textContent = ok ? "Świetnie! Już umiesz." : "Zapamiętaj:";
    $("correct-answer").textContent = ok ? value.trim().replace(/\s+/g, " ") : current.en;
    $("feedback-note").textContent = ok ? "To słówko nie wróci do tej puli." : "To słówko wróci do powtórki.";
    $("primary-label").textContent = "Następne słówko";
    $("study-card").querySelector(".card-content").scrollTop = 0;
    if (matchMedia("(pointer:fine)").matches) $("primary").focus({ preventScroll: true });
  }
  function openDialog(id) {
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }
  function confirmChange(title, copy, label, action) {
    $("confirm-title").textContent = title;
    $("confirm-copy").textContent = copy;
    $("confirm-action").textContent = label;
    pendingConfirm = action;
    openDialog("confirm-dialog");
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function renderLibrary() {
    $("library-scope").textContent = scopeTitle();
    const query = C.normalize($("search").value);
    const selected = scope.filter(w => C.normalize([w.pl, ...w.answers].join(" ")).includes(query));
    $("library-count").textContent = `Słówek: ${selected.length}`;
    const list = document.createDocumentFragment();
    selected.forEach(w => {
      const row = document.createElement("div"); row.className = "word-row";
      const pl = document.createElement("span"); pl.textContent = w.pl;
      const en = document.createElement("span"); en.className = "en"; en.lang = "en"; en.textContent = w.answers.join(" / ");
      const status = document.createElement("span"); status.className = "word-status";
      if (C.learned(state, w.id)) { status.textContent = "✓"; status.setAttribute("aria-label", "Opanowane"); }
      row.append(pl, en, status); list.append(row);
    });
    $("word-list").replaceChildren(list);
  }
  function invalidateImport() {
    importCandidate = null;
    $("import-summary").hidden = true;
    $("commit-import").hidden = true;
    $("preview-import").hidden = false;
  }
  function previewImport() {
    try {
      const parsed = C.parseTXT($("txt-content").value);
      const existing = new Set(words.map(w => w.id));
      const additions = parsed.words.filter(w => !existing.has(w.id));
      if (words.length + additions.length > C.MAX_WORDS) throw Error(`Baza może zawierać najwyżej ${C.MAX_WORDS} fiszek.`);
      importCandidate = additions;
      const duplicates = parsed.duplicates + parsed.words.length - additions.length;
      $("import-summary").classList.remove("error");
      $("import-summary").textContent = `Nowe słówka: ${additions.length}. Pominięte duplikaty: ${duplicates}.` +
        (additions.length ? "\n\n" + additions.slice(0, 5).map(w => `Klasa ${w.grade} · ${w.pl} → ${w.en}`).join("\n") +
          (additions.length > 5 ? "\n…" : "") : "\nTe słówka już są w bazie.");
      $("import-summary").hidden = false;
      $("commit-import").hidden = !additions.length;
      $("preview-import").hidden = !!additions.length;
    } catch (error) {
      importCandidate = null;
      $("import-summary").textContent = error.message;
      $("import-summary").classList.add("error"); $("import-summary").hidden = false;
      $("commit-import").hidden = true;
    }
  }

  $("study-form").addEventListener("submit", e => {
    e.preventDefault();
    if (isComposing) return;
    if (mode === "question") submit();
    else if (mode === "feedback" && performance.now() - feedbackAt >= 280) nextQuestion(true);
    else if (mode === "complete") {
      const available = C.chapters(words, state.grade);
      const next = available.find(name => C.stats(C.scoped(words, state.grade, name), state).remaining > 0);
      if (next) {
        state.selected[state.grade] = next; controls(); persist(); newScope();
        $("prompt").focus({ preventScroll: true });
      } else {
        $("grade").focus({ preventScroll: true });
        notify("Ta klasa jest opanowana. Wybierz inną klasę lub zacznij od nowa w Opcjach.");
      }
    } else if (mode === "empty") $("grade").focus({ preventScroll: true });
  });
  $("skip").addEventListener("click", () => submit(true));
  $("answer").addEventListener("compositionstart", () => { isComposing = true; });
  $("answer").addEventListener("compositionend", () => { isComposing = false; });
  $("answer").addEventListener("input", () => {
    $("input-error").hidden = true; $("answer").removeAttribute("aria-invalid");
  });
  $("grade").addEventListener("change", () => {
    state.grade = Number($("grade").value); controls(); persist(); newScope();
  });
  $("chapter").addEventListener("change", () => {
    state.selected[state.grade] = chapter(); persist(); newScope();
  });
  $("open-options").addEventListener("click", () => {
    updateProgress();
    $("storage-status").hidden = storageOK;
    if (!storageOK) $("storage-status").textContent = "Pamięć przeglądarki jest niedostępna lub zapis był uszkodzony. Zapisz kopię postępów przed zamknięciem aplikacji.";
    openDialog("options-dialog");
  });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  $("confirm-dialog").addEventListener("close", () => { pendingConfirm = null; });
  $("confirm-action").addEventListener("click", () => {
    const action = pendingConfirm;
    pendingConfirm = null; $("confirm-dialog").close();
    if (action) action();
  });
  $("open-library").addEventListener("click", () => { $("search").value = ""; renderLibrary(); openDialog("library-dialog"); });
  $("search").addEventListener("input", renderLibrary);
  $("open-txt").addEventListener("click", () => { invalidateImport(); openDialog("txt-dialog"); });
  $("txt-content").addEventListener("input", invalidateImport);
  $("txt-file").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 1000000) throw Error("Plik TXT może mieć najwyżej 1 MB.");
      $("txt-content").value = await file.text(); invalidateImport(); previewImport();
    } catch (error) {
      $("import-summary").textContent = error.message; $("import-summary").hidden = false;
      $("import-summary").classList.add("error");
    }
    e.target.value = "";
  });
  $("preview-import").addEventListener("click", previewImport);
  $("commit-import").addEventListener("click", () => {
    if (!importCandidate?.length) return;
    const extra = state.extraTXT ? C.parseTXT(state.extraTXT).words : [];
    const count = importCandidate.length;
    state.extraTXT = C.toTXT([...extra, ...importCandidate]);
    persist(); buildWords(); controls(); newScope();
    $("txt-content").value = ""; invalidateImport(); $("txt-dialog").close();
    notify(`Dodano ${count} słówek. Wybierz ich klasę i rozdział na dole.`);
  });
  $("txt-export").addEventListener("click", () => download("fimova-slowka.txt", C.toTXT(words), "text/plain;charset=utf-8"));
  $("backup-export").addEventListener("click", () => download(
    `fimova-postepy-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), "application/json"));
  $("backup-import").addEventListener("click", () => $("backup-file").click());
  $("backup-file").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 3000000) throw Error("Kopia może mieć najwyżej 3 MB.");
      const candidate = C.readBackup(await file.text());
      if (data.words.length + (candidate.extraTXT ? C.parseTXT(candidate.extraTXT).words.length : 0) > C.MAX_WORDS) {
        throw Error("Kopia zawiera zbyt dużo dodatkowych słówek.");
      }
      confirmChange("Wczytać postępy?", "Kopia zastąpi postępy FiMova i prywatnie dodane słówka na tym urządzeniu. Nie zmieni bazy na GitHubie.", "Wczytaj kopię", () => {
        state = candidate; persist(); buildWords(); controls(); newScope(); notify("Wczytano postępy i prywatne słówka.");
      });
    } catch (error) { notify(error.message, 8000); }
    e.target.value = "";
  });
  $("reset-scope").addEventListener("click", () => {
    const affected = [...scope];
    confirmChange("Zacząć od nowa?", `${scopeTitle()}: ${affected.length} słówek wróci do nauki. Pozostałe wyniki zostaną zachowane.`, "Zacznij od nowa", () => {
      state = C.reset(state, affected); persist(); newScope(); $("options-dialog").close(); notify("Ten zakres znów jest gotowy do nauki.");
    });
  });
  $("remove-extra").addEventListener("click", () => {
    if (!state.extraTXT) return;
    confirmChange("Usunąć dodatkowe słówka?", "Znikną tylko słówka zaimportowane prywatnie na tym urządzeniu. Baza projektu zostanie bez zmian. Możesz wcześniej pobrać kopię TXT.", "Usuń dodatkowe", () => {
      state.extraTXT = ""; persist(); buildWords(); controls(); newScope(); notify("Usunięto prywatnie dodane słówka.");
    });
  });

  function viewport() {
    const vp = window.visualViewport;
    const height = vp && vp.scale === 1 ? vp.height : window.innerHeight;
    const top = vp && vp.scale === 1 ? vp.offsetTop : 0;
    document.documentElement.style.setProperty("--app-height", `${height}px`);
    document.documentElement.style.setProperty("--app-top", `${top}px`);
    const keyboard = document.activeElement === $("answer") && height < 530 && innerWidth < 800;
    document.body.classList.toggle("keyboard", keyboard);
  }
  window.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("scroll", viewport);
  $("answer").addEventListener("focus", () => { viewport(); setTimeout(viewport, 300); });
  $("answer").addEventListener("blur", () => { viewport(); setTimeout(viewport, 300); });
  window.addEventListener("storage", e => {
    if (e.key !== STORAGE || document.querySelector("dialog[open]")) return;
    try {
      state = e.newValue ? C.readBackup(e.newValue) : C.initialState();
      buildWords(); controls(); newScope(); notify("Wczytano postępy zmienione w drugiej karcie.");
    } catch { /* Invalid values from another tab must not replace valid progress. */ }
  });

  async function prepareOffline() {
    const status = $("connection-status");
    if (globalThis.FIMOVA_STANDALONE || location.protocol === "file:") {
      status.textContent = "Wersja plikowa. Na telefonie użyj opublikowanej strony."; return;
    }
    if (!("serviceWorker" in navigator) || !isSecureContext) {
      status.textContent = "Tryb online. Do działania offline potrzebny jest adres HTTPS."; return;
    }
    try {
      navigator.serviceWorker.addEventListener("message", e => {
        if (e.data?.app === "fimova" && e.data?.type === "READY") {
          status.textContent = e.data.ready ? "Gotowe offline. Po połączeniu z internetem sprawdzimy aktualizacje." : "Tryb online. Kopia offline nie jest jeszcze gotowa.";
        }
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        navigator.serviceWorker.controller?.postMessage({ type: "STATUS" });
      });
      registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type: "STATUS" });
    } catch {
      status.textContent = "Tryb online. Nie udało się przygotować kopii offline.";
    }
  }
  $("check-update").addEventListener("click", async () => {
    if (globalThis.FIMOVA_STANDALONE || location.protocol === "file:") { notify("To plik do podglądu. Aktualizacje są dostępne po publikacji strony."); return; }
    $("check-update").disabled = true;
    try {
      const response = await fetch("./wersja.json", { cache: "no-store" });
      if (!response.ok) throw Error("Nie udało się sprawdzić wersji.");
      const remote = await response.json();
      if (remote.build === data.build) notify("Masz najnowszą opublikowaną wersję.");
      else {
        await registration?.update().catch(() => {});
        confirmChange("Jest nowa wersja", "Odświeżymy aplikację. Zapisane postępy pozostaną na tym urządzeniu.", "Odśwież", () => location.reload());
      }
    } catch { notify("Nie można sprawdzić aktualizacji. Sprawdź połączenie z internetem."); }
    finally { $("check-update").disabled = false; }
  });

  $("build-label").textContent = `Wydanie ${data.build || "lokalne"}`;
  buildWords(); controls(); newScope(); viewport();
  if (!storageOK) notify("Nie udało się odczytać pamięci. Postępy możesz zapisać w Opcjach.", 8000);
  prepareOffline();
})();
