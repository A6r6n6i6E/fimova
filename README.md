# FiMova 1.0 — angielski dla klas 4–8

Kompletna, niezależna aplikacja webowa. Nie wymaga wcześniejszych paczek „Słówko”,
bibliotek npm, serwera aplikacyjnego ani kont uczniów.

## Co jest w środku

- Prosty ekran: polskie hasło, odpowiedź po angielsku i duże przyciski.
- Na dole: klasa 4–8 i rozdział. Opcja „Cała klasa” łączy rozdziały danej klasy.
- Poprawna odpowiedź oznacza fiszkę jako opanowaną. Nie jest ponownie losowana.
- Błąd lub „Nie wiem” pokazuje poprawną odpowiedź i pozostawia fiszkę w kolejce.
  Gdy są inne fiszki, błędna nie wraca natychmiast: trafia w losowe miejsce
  za co najmniej dwiema innymi. Gdy została tylko jedna, powtarza się ona.
- Duże litery, dodatkowe spacje i typograficzne apostrofy nie zmieniają wyniku.
  Literówki nie są automatycznie zaliczane. Akceptowane są warianty zapisane w TXT.
- Postępy zapisują się lokalnie. Zmiana klasy/rozdziału ich nie zeruje.
- „Opcje”: słownik, prywatny import TXT, eksport TXT, kopia JSON, reset zakresu.
- Oryginalne logo szkoły FiNova w informacjach; znak FiMova w nagłówku.
- Manifest i tryb offline. Brak reklam, zewnętrznych fontów, analityki i kont.

**Baza startowa: 250 fiszek, 5 klas, 25 rozdziałów.**
Każda klasa ma 5 przykładowych rozdziałów po 10 słówek.
To zestaw demonstracyjny, a nie słownictwo z określonego podręcznika
ani deklaracja zgodności z konkretnym programem nauczania.
Przypisanie poziomów klas jest orientacyjne i można je zmienić.

## Najszybsze uruchomienie na komputerze

Otwórz `fimova-demo.html` w przeglądarce. Wszystkie zasoby są w tym pliku.
Ta wersja nie rejestruje modułu offline i nie wymaga sieci.
Zapis lokalny plików HTML zależy od przeglądarki — rób kopie JSON.
Na telefonie używaj adresu opublikowanej aplikacji, nie podglądu pliku w menedżerze plików.

## Publikacja przez GitHub i Cloudflare Pages

Paczka zawiera katalogi bez dodatkowego folderu zewnętrznego:

```text
data/slowka.txt       ← jedyne źródło wspólnej bazy słówek
public/              ← gotowe pliki strony + źródła JS/CSS
tools/build.cjs       ← skrypt budowania
tools/index.template.html
tools/sw.template.js
package.json
tests/
fimova-demo.html
```

1. Wgraj pliki do repozytorium. Dla nowego repozytorium na jego głównym poziomie
   mają być widoczne foldery `data`, `public`, `tools` i plik `package.json`.
2. Połącz repozytorium z **Cloudflare Pages**, nie z aplikacją Workers.
3. Ustaw:
   - Framework preset: `None`
   - Build command: `node tools/build.cjs`
   - Build output directory: `public`
   - Production branch: gałąź, na którą wgrywasz pliki, np. `main`
   - Root directory: katalog zawierający równocześnie `data`, `public`, `tools`
     (puste pole, gdy są w głównym katalogu repozytorium).
4. Zapisz zmiany na gałęzi produkcyjnej i poczekaj na udane nowe wdrożenie.

### Zastępowanie aplikacji w już istniejącym projekcie

Nie trzeba usuwać repozytorium ani projektu Cloudflare. Przed podmianą zrób kopię.
Wgraj nową zawartość **do katalogu, który już jest ustawiony jako Root directory**:
- Root directory puste → do głównego katalogu repozytorium.
- Root directory `slowko-start` → do środka istniejącego `slowko-start`.
- Inna wartość → do wskazanego katalogu.

Zachowaj tę samą gałąź i połączenie GitHub–Cloudflare.
Przy powyższych ustawieniach polecenie budowania i katalog wynikowy pozostają
takie jak w wcześniejszej aplikacji.
Nie usuwaj `.git`, ustawień repozytorium ani danych przeglądarki.
FiMova ma osobny klucz postępów; nie odczytuje ani nie usuwa wyników „Słówko”.
Kopie JSON tych dwóch aplikacji nie są zamienne.

### Kontrola właściwego wdrożenia

W logu budowania startowej paczki:
`FIMOVA-1.0 | 250 slowek | 5 klas | 25 rozdzialow | build …`

Pod adresem swojej aplikacji dodaj `/wersja.json`.
Powinno być: `"aplikacja": "FiMova"`, `"liczbaFiszek": 250`, `"liczbaKlas": 5`.
Identyfikator obecnej paczki: `a2015518a8133a67`.
Po zmianie bazy liczby i identyfikator mogą się zmienić.

Jeżeli widzisz starą aplikację, najpierw sprawdź, czy nowy commit naprawdę
został opublikowany w Cloudflare. Sam upload do GitHuba nie potwierdza wdrożenia.
Sprawdź też Root directory i plik kontrolny w nowej sesji incognito.
Nie czyść danych witryny, bo można wtedy utracić zapisane postępy.

## Baza TXT — ważna zmiana formatu

W FiMova kolumny to:

```text
polskie hasło;angielska odpowiedź | alternatywa;klasa;rozdział
```

Przykład:

```text
plecak;schoolbag | backpack;4;1. W szkole
kanapka;sandwich;4;2. Jedzenie
lotnisko;airport;6;1. Podróże
moim zdaniem;in my opinion;8;4. Opinie
```

Klasa musi być liczbą 4, 5, 6, 7 lub 8. Rozdział ma dowolną nazwę.
Wszystkie cztery pola są wymagane. Puste wiersze i wiersze zaczynające się
od `#` są pomijane. Plik powinien być zapisany jako UTF-8.
Nie wpisuj średników wewnątrz haseł. Warianty oddzielaj `|`.

To NIE jest format poprzedniej aplikacji „Słówko”
(`polski;angielski;dział;strona`). Przed przeniesieniem starego TXT trzeba
przypisać jego słówka do klas i rozdziałów.

### Wspólne słówka dla wszystkich urządzeń

Edytuj wyłącznie `data/slowka.txt` w projekcie i zapisz zmianę na GitHubie.
Skrypt budowania tworzy z niego nową bazę i pliki strony.
Usunięcie wiersza usuwa go ze wspólnej listy po wdrożeniu.
Nie edytuj ręcznie `public/vocabulary.js` ani plików `public/build`.
Plik `data/words.json` z dawnego projektu nie jest wykorzystywany.

Nazwy rozdziałów w TXT automatycznie pojawią się w dolnym wyborze.
Identyfikator fiszki zależy od klasy, rozdziału, polskiego hasła i pierwszej
odpowiedzi. Zmiana któregoś z tych pól tworzy nową fiszkę.
Dopisanie wariantu odpowiedzi po `|` nie zmienia jej identyfikatora.

### Słówka dodawane prywatnie

„Opcje → Dodaj plik TXT” dodaje słówka wyłącznie do bieżącej przeglądarki.
Nie zmienia pliku na serwerze ani na GitHubie.
Aplikacja najpierw pokazuje podgląd. Duplikaty są pomijane;
błędne wiersze blokują import całej listy, aż zostaną poprawione.
Do usunięcia prywatnych fiszek służy osobny przycisk w informacjach dla nauczyciela.

TXT zawiera słownictwo. JSON zawiera postępy, wybrany zakres i prywatne słówka.
Kopia JSON nie zawiera całej wspólnej bazy — ją archiwizuj oddzielnie jako TXT.

## Telefon i tryb offline

Na iPhonie opublikowaną stronę można dodać w Safari do ekranu głównego.
Na Androidzie użyj opcji instalacji / dodania do ekranu głównego w przeglądarce,
gdy jest dostępna. Nazwy poleceń zależą od wersji systemu.

Pierwsze otwarcie wymaga internetu. W „Opcjach” zaczekaj na „Gotowe offline”.
Następnie przetestuj ponowne otwarcie w trybie samolotowym na swoim urządzeniu.
Gdy nie da się utworzyć pamięci offline, aplikacja nadal może działać online.
Dostępność pamięci i jej trwałość zależą od przeglądarki i wolnego miejsca.

Nawigacja pobiera świeżą stronę z sieci, a kopia offline służy jako rezerwa.
JS/CSS mają nazwy z identyfikatorem treści, aby unikać mieszania wersji.
Aktualizacja nigdy nie usuwa localStorage.
W opcjach jest też przycisk „Sprawdź aktualizację”.
Testy tej paczki nie zastępują próby na prawdziwym iPhonie lub Androidzie.

## Używanie w szkole

To nie jest dziennik elektroniczny ani system kont uczniów.
Wyniki są przypisane do przeglądarki na konkretnym urządzeniu, nie do osoby.
Na wspólnym komputerze korzystaj z odrębnych profili przeglądarki lub własnej
kopii JSON: wczytaj ją przed nauką i zapisz po nauce.
Kopie JSON zawierają wyniki oraz prywatne słówka — traktuj je jako własne pliki.
Usunięcie danych witryny może usunąć postępy. Nie ma automatycznej synchronizacji.

## Uruchomienie lokalne z serwerem

Potrzebny jest Node.js 20 lub nowszy. Brak zależności do instalowania.

```sh
node tools/build.cjs
npm start
```

Otwórz `http://localhost:8080`.
Port można zmienić zmienną środowiskową `PORT`.

`npm test` uruchamia testy Node. `python tests/browser_test.py` uruchamia
dodatkowe testy izolowanego interfejsu (wymaga Playwright i Chromium).
Szczegóły i ograniczenia testów są w `TESTY.md`.

## Dokumentacja platform

- Cloudflare — konfiguracja budowania:
  https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare — połączenie z GitHubem:
  https://developers.cloudflare.com/pages/get-started/git-integration/
- Apple — strona jako aplikacja na iPhonie:
  https://support.apple.com/guide/iphone/iphea86e5236/ios

Źródła opisują platformy. FiMova i przykładowa baza są częścią tej paczki.
