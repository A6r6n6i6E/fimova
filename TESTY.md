# FiMova 1.0 — weryfikacja paczki

## Wykonane

**77 testów Node — 77 zaliczonych.**

Uruchomienie: `node --test tests/*.test.cjs`

Obejmują m.in. parser TXT, klasy i rozdziały, rozpoznawanie odpowiedzi,
warianty, kolejkę powtórek, postępy, reset zakresu, walidację kopii,
powtarzalne budowanie oraz 15 testów modułu offline.

Testy modułu offline korzystają z symulowanych zdarzeń service workera,
pamięci CacheStorage i awarii sieci. Osobny test wykonuje rzeczywiste
lokalne przekierowanie HTTP (308) przez Node fetch i sprawdza odbudowanie
odpowiedzi, bez metadanych przekierowania.

**30 scenariuszy izolowanego interfejsu Chromium — 30 zaliczonych.**

Uruchomienie: `python tests/browser_test.py`
Dodatkowe wymagania testowe: Python, Playwright, Chromium.
W tym środowisku Chromium: `/usr/bin/chromium`.
Ścieżkę można ustawić przez `CHROMIUM_PATH`.

Scenariusze obejmują:
- pięć klas, wszystkie rozdziały i zakres „Cała klasa”;
- prawidłowe odpowiedzi, warianty, literówki, pusty wpis i „Nie wiem”;
- powroty błędnych fiszek i zakończenie rozdziału;
- zmianę zakresu i odtworzenie stanu po ponownym utworzeniu dokumentu;
- wybór pliku TXT, tekst wklejony, UTF-8, duplikaty i błędne wiersze;
- prywatne słówka, pobranie JSON i jego ponowne wczytanie;
- potwierdzany reset i listę słówek;
- układy 320×568, 360×640, 390×740, 412×780, 768×700 i 1440×900;
- sprawdzenie wszystkich 250 przykładów w panelu wyniku przy tych rozmiarach;
- symulację zmniejszonego obszaru widoku przy wpisywaniu;
- brak nieobsłużonych błędów JavaScript.

Zrzuty ekranu pochodzą z rzeczywistego HTML/CSS/JS paczki, nie z makiety.

## Ograniczenia

Przeglądarka w środowisku testowym odrzucała nawigację do lokalnego serwera
komunikatem `ERR_BLOCKED_BY_ADMINISTRATOR`.
Dlatego scenariusze UI uruchomiono przez wstrzyknięcie samodzielnego HTML
i zastępczą pamięć Storage w RAM. Nie jest to test natywnej trwałości
localStorage ani pełnej instalacji service workera w przeglądarce.

Nie wykonano wdrożenia na koncie użytkownika, testu na fizycznym telefonie,
testu w Safari/WebKit, rzeczywistej klawiatury telefonu, ani pełnego
przeglądarkowego cyklu online → offline → aktualizacja.
Nie należy traktować symulacji zmiany wysokości jako testu klawiatury iOS.

## Kontrola po publikacji

1. Sprawdź udany nowy commit w Cloudflare oraz `/wersja.json`.
2. Otwórz i zamknij aplikację kilka razy w zwykłej sesji przeglądarki.
3. Odpowiedz poprawnie, odśwież i sprawdź, czy postęp został.
4. Odpowiedz błędnie; potwierdź widoczność pisowni i przycisku „Następne słówko”.
5. Zmień klasę, wróć i sprawdź wyniki.
6. Zapisz i wczytaj JSON.
7. Dopiero po „Gotowe offline” przetestuj tryb samolotowy.
8. Sprawdź aktualizację po zmianie TXT na GitHubie.

Identyfikator tej paczki: `a2015518a8133a67`.
Podział demonstracyjny: 250 fiszek, 5 klas, 25 rozdziałów.
Po własnej zmianie danych testy kontrolujące dokładny skład przykładowej
bazy wymagają dostosowania oczekiwanych liczb.
