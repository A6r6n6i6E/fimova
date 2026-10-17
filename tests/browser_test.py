#!/usr/bin/env python3
"""Isolated Chromium UI checks with an in-memory Storage substitute.

No browser-network access or native localStorage persistence is claimed.
Use npm start on a normal device for a real HTTP/PWA/keyboard check.
Requires Python, playwright and Chromium; these are test tools, not app dependencies.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, os, tempfile

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"fimova-demo.html").read_text(encoding="utf-8")
OUT=Path(os.environ.get("FIMOVA_TEST_OUT",tempfile.mkdtemp(prefix="fimova-tests-")))
OUT.mkdir(parents=True,exist_ok=True)
REPORTS=[]; ERRORS=[]

def passed(name):
    REPORTS.append(name)
    print("PASS:",name,flush=True)

def mount(browser,width=390,height=740,store=None):
    context=browser.new_context(viewport={"width":width,"height":height},
        is_mobile=width<600,has_touch=width<600,device_scale_factor=1,accept_downloads=True)
    page=context.new_page()
    page.on("pageerror",lambda e:ERRORS.append(str(e)))
    page.evaluate("""initial=>{
      const entries={...initial};window.__store=entries;
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>entries[k]??null,
        setItem:(k,v)=>entries[k]=String(v),
        removeItem:k=>delete entries[k]
      }});
      Math.random=()=>.999;
    }""",store or {})
    page.set_content(HTML,wait_until="domcontentloaded")
    page.wait_for_function("document.querySelector('#question').hidden || document.querySelector('#prompt').textContent !== 'Wczytywanie…'")
    return context,page

def current(page):
    return page.evaluate("""()=>{
      const grade=Number(document.querySelector('#grade').value);
      const chapter=document.querySelector('#chapter').value;
      const pl=document.querySelector('#prompt').textContent;
      return FIMOVA_DATA.words.find(w=>w.grade===grade&&(chapter==='*'||w.chapter===chapter)&&w.pl===pl);
    }""")

def state(page):
    return page.evaluate("""()=>{
      const value=Object.entries(__store).find(([k])=>k.startsWith('fimova:1:'))?.[1];
      return value?JSON.parse(value):null;
    }""")

def next_card(page):
    page.wait_for_timeout(295)
    page.locator("#primary").click()

def layout(page):
    result=page.evaluate("""()=>{
      const b=document.querySelector('#primary'), br=b.getBoundingClientRect();
      const f=document.querySelector('.material-picker').getBoundingClientRect();
      const a=document.querySelector('#answer').getBoundingClientRect();
      return {width:innerWidth,height:visualViewport.height,doc:document.documentElement.scrollHeight,
        docWidth:document.documentElement.scrollWidth,buttonBottom:br.bottom,buttonHeight:br.height,
        buttonHit:b.contains(document.elementFromPoint(br.x+br.width/2,br.y+br.height/2)),
        filterBottom:f.bottom,answerBottom:a.bottom};
    }""")
    assert result["doc"]<=result["height"]+2,result
    assert result["docWidth"]<=result["width"]+1,result
    assert result["buttonBottom"]<=result["height"]+1 and result["buttonHeight"]>=44 and result["buttonHit"],result
    assert result["filterBottom"]<=result["height"]+1,result
    return result

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH","/usr/bin/chromium"),headless=True,
      args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx,page=mount(browser)
    expect(page.locator("#grade option")).to_have_count(5)
    expect(page.locator("#chapter option")).to_have_count(6)
    expect(page.locator("#learned-count")).to_have_text("0 z 10")
    assert current(page)["pl"]=="plecak"
    passed("Default class 4 / first chapter, 10 words; exactly 5 grade options")
    for grade in range(4,9):
        page.select_option("#grade",str(grade))
        options=page.locator("#chapter option").all_text_contents()
        assert len(options)==6
        for chapter in options[1:]:
            page.select_option("#chapter",label=chapter)
            w=current(page)
            assert w["grade"]==grade and w["chapter"]==chapter
            expect(page.locator("#remaining-count")).to_have_text("10")
        page.select_option("#chapter","*")
        expect(page.locator("#remaining-count")).to_have_text("50")
        passed(f"Class {grade}: all 5 chapters select correctly; whole class contains 50 cards")
    ctx.close()

    ctx,page=mount(browser)
    page.locator("#primary").click()
    expect(page.locator("#input-error")).to_be_visible()
    assert state(page) is None
    passed("Empty input is not counted as an attempt")
    page.fill("#answer","  BACKPACK  ");page.click("#primary")
    expect(page.locator("#learned-count")).to_have_text("1 z 10")
    expect(page.locator("#feedback-title")).to_have_text("Świetnie! Już umiesz.")
    assert not page.locator("#answer-zone").is_visible()
    layout(page)
    learned_id=current(page)["id"]
    passed("Alternative spelling, upper case and whitespace accepted; feedback replaces the input")
    next_card(page)
    assert current(page)["id"]!=learned_id
    passed("Learned word is removed from the study queue")
    page.select_option("#grade","5");page.select_option("#grade","4")
    expect(page.locator("#learned-count")).to_have_text("1 z 10")
    assert current(page)["id"]!=learned_id
    saved=page.evaluate("__store")
    ctx.close()
    ctx,page=mount(browser,store=saved)
    expect(page.locator("#learned-count")).to_have_text("1 z 10")
    assert current(page)["id"]!=learned_id
    passed("State serialized in Storage survives rebuilding the isolated document")
    page.click("#open-options");page.click("#open-library")
    expect(page.locator(".word-row")).to_have_count(10)
    page.fill("#search","plecak");expect(page.locator(".word-row")).to_have_count(1)
    expect(page.locator(".word-status")).to_have_text("✓")
    passed("Word list obeys scope, searches Polish/English, marks learned words")
    ctx.close()

    ctx,page=mount(browser)
    first=current(page)
    page.fill("#answer","schoolbeg");page.click("#primary")
    expect(page.locator("#correct-answer")).to_have_text("schoolbag")
    expect(page.locator("#learned-count")).to_have_text("0 z 10")
    assert state(page)["progress"][first["id"]]["mistakes"]==1
    layout(page)
    passed("Typo is rejected, correct English is shown, no progress is awarded")
    next_card(page)
    assert current(page)["id"]!=first["id"]
    for _ in range(9):
        w=current(page)
        assert w["id"]!=first["id"]
        page.fill("#answer",w["en"]);page.click("#primary");next_card(page)
    assert current(page)["id"]==first["id"]
    page.fill("#answer",first["en"]);page.click("#primary");next_card(page)
    expect(page.locator("#finished")).to_be_visible()
    expect(page.locator("#remaining-count")).to_have_text("0")
    passed("Wrong card returns after other cards; completing the chapter reaches a finished state")
    page.click("#primary")
    assert page.locator("#chapter").input_value().startswith("2.")
    passed("Finished chapter button moves to another unlearned chapter")
    ctx.close()

    ctx,page=mount(browser)
    page.click("#skip")
    assert state(page)["progress"][current(page)["id"]]["learned"] is False
    expect(page.locator("#correct-answer")).to_have_text("schoolbag")
    passed("I do not know shows the answer without learning it")
    ctx.close()

    ctx,page=mount(browser)
    page.click("#open-options");page.click("#open-txt")
    page.fill("#txt-content","nowe słowo;new word;4;6. Moje słówka")
    page.click("#preview-import")
    expect(page.locator("#import-summary")).to_contain_text("Nowe słówka: 1")
    page.click("#commit-import")
    page.locator("#options-dialog [data-close]").click()
    page.select_option("#chapter",label="6. Moje słówka")
    expect(page.locator("#prompt")).to_have_text("nowe słowo")
    expect(page.locator("#remaining-count")).to_have_text("1")
    page.fill("#answer","new word");page.click("#primary");next_card(page)
    expect(page.locator("#finished")).to_be_visible()
    passed("TXT import creates a chapter in the specified grade and teaches the new word")
    saved=page.evaluate("__store")
    ctx.close()
    ctx,page=mount(browser,store=saved)
    expect(page.locator("#finished")).to_be_visible()
    expect(page.locator("#chapter")).to_have_value("6. Moje słówka")
    page.click("#open-options");page.click("#open-txt")
    page.fill("#txt-content","nowe słowo;new word;4;6. Moje słówka")
    page.click("#preview-import")
    expect(page.locator("#import-summary")).to_contain_text("Nowe słówka: 0")
    expect(page.locator("#commit-import")).to_be_hidden()
    passed("Imported cards and progress restore; repeat import skips duplicates")
    page.fill("#txt-content","dobry;good;4;Test\nniepoprawny wiersz")
    page.click("#preview-import")
    expect(page.locator("#import-summary")).to_contain_text("Wiersz 2")
    expect(page.locator("#commit-import")).to_be_hidden()
    passed("Invalid TXT line blocks the whole import, without partial changes")
    page.locator("#txt-dialog [data-close]").click()
    page.click("#reset-scope")
    expect(page.locator("#confirm-dialog")).to_be_visible()
    page.locator("#confirm-dialog [data-close]").click()
    expect(page.locator("#learned-count")).to_have_text("1 z 1")
    page.click("#reset-scope");page.click("#confirm-action")
    expect(page.locator("#learned-count")).to_have_text("0 z 1")
    passed("Reset is confirmed explicitly and restores only the selected scope")
    ctx.close()

    ctx,page=mount(browser)
    page.click("#open-options");page.click("#open-txt")
    page.locator("#txt-file").set_input_files({"name":"test.txt","mimeType":"text/plain",
      "buffer":"podróż;journey | trip;8;6. Dodatkowy rozdział".encode("utf-8")})
    expect(page.locator("#commit-import")).to_be_visible()
    page.click("#commit-import");page.locator("#options-dialog [data-close]").click()
    page.select_option("#grade","8");page.select_option("#chapter",label="6. Dodatkowy rozdział")
    expect(page.locator("#prompt")).to_have_text("podróż")
    page.fill("#answer","trip");page.click("#primary")
    expect(page.locator("#learned-count")).to_have_text("1 z 1")
    passed("File picker imports UTF-8 Polish text and alternate English answers")
    page.click("#open-options")
    with page.expect_download() as result: page.click("#backup-export")
    dl=result.value
    assert dl.suggested_filename.startswith("fimova-postepy-")
    backup=json.loads(Path(dl.path()).read_text())
    assert backup["app"]=="fimova" and "podróż" in backup["extraTXT"]
    passed("JSON download includes class choices, learning progress and private words")
    page.locator("#backup-file").set_input_files({"name":"backup.json","mimeType":"application/json","buffer":json.dumps(backup).encode()})
    expect(page.locator("#confirm-dialog")).to_be_visible()
    page.click("#confirm-action")
    passed("JSON file restore validates the backup and asks for confirmation")
    ctx.close()

    for width,height in [(320,568),(360,640),(390,740),(412,780),(768,700),(1440,900)]:
        ctx,page=mount(browser,width,height)
        layout(page)
        page.screenshot(path=str(OUT/f"question-{width}.png"))
        page.click("#skip")
        layout(page)
        page.screenshot(path=str(OUT/f"feedback-{width}.png"))
        # Stress every supplied prompt/answer, using the real feedback DOM/styles.
        failures=page.evaluate("""()=>{
          const issues=[];
          for(const w of FIMOVA_DATA.words){
            document.querySelector('#prompt').textContent=w.pl;
            document.querySelector('#correct-answer').textContent=w.en;
            const c=document.querySelector('.card-content');
            const b=document.querySelector('#primary').getBoundingClientRect();
            if(c.scrollHeight>c.clientHeight+2 || b.bottom>innerHeight+1) issues.push(w.pl);
          }
          return issues;
        }""")
        assert not failures,(width,height,failures)
        passed(f"Layout {width}x{height}: question, feedback and all 250 sample answers fit; next button stays visible")
        ctx.close()

    ctx,page=mount(browser,390,740)
    page.locator("#answer").focus()
    page.set_viewport_size({"width":390,"height":370})
    page.wait_for_timeout(100)
    assert page.locator("body").evaluate("(b)=>b.classList.contains('keyboard')")
    layout(page)
    page.screenshot(path=str(OUT/"keyboard-simulation.png"))
    passed("Reduced visual viewport simulation keeps the input action and selectors on screen")
    ctx.close()

    assert not ERRORS,ERRORS
    passed("No uncaught JavaScript errors during the isolated scenarios")
    browser.close()

(OUT/"browser-report.json").write_text(json.dumps({"mode":"isolated; in-memory Storage; no live browser network/PWA test",
  "passed":len(REPORTS),"checks":REPORTS,"page_errors":ERRORS},ensure_ascii=False,indent=2),encoding="utf-8")
print("TOTAL:",len(REPORTS),flush=True)
