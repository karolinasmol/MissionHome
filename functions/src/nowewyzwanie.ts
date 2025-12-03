import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const REGION = "europe-central2";

const DAILY_SUGGESTIONS_LIMIT = 12;

/* ----------------------------------------------------
   TYPES
---------------------------------------------------- */

type Difficulty = "easy" | "medium" | "hard" | "extreme";

type DefaultChore = {
  key: string;
  title: string;
  expValue: number;
  difficulty: Difficulty;
};

/* ----------------------------------------------------
   DIFFICULTY / EXP MAP
   (front też zakłada 25/50/100, my dodajemy 150 = extreme)
---------------------------------------------------- */

function mapExpToDifficulty(exp: number): Difficulty {
  if (exp >= 150) return "extreme";
  if (exp >= 100) return "hard";
  if (exp >= 50) return "medium";
  return "easy";
}

/**
 * Lista domyślnych zadań – EXP tylko w progach 25 / 50 / 100 / 150
 */
const DEFAULT_CHORES: DefaultChore[] = [
  // --- Klasyczne domowe ---
  { key: "odkurzanie", title: "Odkurz mieszkanie", expValue: 100, difficulty: "hard" },
  { key: "zmywanie", title: "Pozmywaj naczynia", expValue: 50, difficulty: "medium" },
  { key: "mycie_okien", title: "Umyj okna", expValue: 150, difficulty: "extreme" },
  { key: "mycie_podlogi", title: "Umyj podłogę", expValue: 100, difficulty: "hard" },
  { key: "dezynfekcja_wc", title: "Zdezynfekuj WC", expValue: 100, difficulty: "hard" },
  { key: "wypranie_zaslon", title: "Wypierz zasłony", expValue: 100, difficulty: "hard" },
  { key: "czyszczenie_kratek_went", title: "Wyczyść kratki wentylacyjne", expValue: 150, difficulty: "extreme" },
  { key: "czyszczenie_filtra_pralki", title: "Wyczyść filtr pralki", expValue: 100, difficulty: "hard" },
  { key: "fronty_szafek", title: "Umyj fronty szafek", expValue: 100, difficulty: "hard" },
  { key: "czyszczenie_piekarnika", title: "Wyczyść piekarnik", expValue: 150, difficulty: "extreme" },
  { key: "ulozenie_ubran", title: "Ułóż ubrania", expValue: 50, difficulty: "medium" },
  { key: "pranie", title: "Zrób pranie (nastaw i rozwieś)", expValue: 100, difficulty: "hard" },
  { key: "posciel", title: "Zmień pościel", expValue: 100, difficulty: "hard" },
  { key: "odkurz_kanape", title: "Odkurz kanapę / fotel", expValue: 100, difficulty: "hard" },
  { key: "umyj_lazienke", title: "Umyj łazienkę (szybko)", expValue: 100, difficulty: "hard" },
  { key: "umyj_zlew", title: "Umyj zlew i baterię", expValue: 50, difficulty: "medium" },
  { key: "umyj_lustro", title: "Umyj lustro", expValue: 50, difficulty: "medium" },
  { key: "umyj_plytki", title: "Przetrzyj płytki w kuchni", expValue: 50, difficulty: "medium" },
  { key: "porzadek_na_blacie", title: "Ogarnij blat w kuchni", expValue: 25, difficulty: "easy" },
  { key: "posprzataj_biurko", title: "Ogarnij biurko", expValue: 50, difficulty: "medium" },
  { key: "porzadek_w_szafce", title: "Ogarnij jedną szafkę", expValue: 50, difficulty: "medium" },
  { key: "porzadek_w_szufladzie", title: "Ogarnij jedną szufladę", expValue: 50, difficulty: "medium" },
  { key: "przetrzyj_klamki", title: "Przetrzyj klamki i włączniki", expValue: 50, difficulty: "medium" },
  { key: "wynies_karton", title: "Wynieś kartony / makulaturę", expValue: 25, difficulty: "easy" },
  { key: "segregacja", title: "Posegreguj śmieci", expValue: 25, difficulty: "easy" },
  { key: "umyj_kubel", title: "Przetrzyj kosz na śmieci", expValue: 50, difficulty: "medium" },
  { key: "mycie_lodowki", title: "Wyczyść lodówkę (w środku)", expValue: 150, difficulty: "extreme" },
  { key: "przejrzyj_lodowke", title: "Przejrzyj lodówkę (wyrzuć zepsute)", expValue: 50, difficulty: "medium" },
  { key: "odkamienianie_czajnika", title: "Odkamień czajnik", expValue: 50, difficulty: "medium" },
  { key: "wyczysc_okap", title: "Wyczyść okap / filtr", expValue: 100, difficulty: "hard" },
  { key: "wyczysc_mikrofale", title: "Wyczyść mikrofalę", expValue: 50, difficulty: "medium" },
  { key: "wyczysc_plyte", title: "Wyczyść płytę kuchenną", expValue: 50, difficulty: "medium" },
  { key: "wyczysc_kabine", title: "Wyczyść kabinę prysznicową", expValue: 100, difficulty: "hard" },
  { key: "fugi", title: "Wyczyść fugi (kawałek)", expValue: 150, difficulty: "extreme" },
  { key: "odkurz_listwy", title: "Odkurz listwy przypodłogowe", expValue: 50, difficulty: "medium" },

  // --- Nowe klasyczne domowe (+15) ---
  { key: "umyj_drzwi", title: "Umyj drzwi wejściowe", expValue: 50, difficulty: "medium" },
  { key: "umyj_klamki_drzwi", title: "Umyj klamki wszystkich drzwi", expValue: 50, difficulty: "medium" },
  { key: "umyj_parapety", title: "Umyj parapety", expValue: 50, difficulty: "medium" },
  { key: "odkurz_kaloryfery", title: "Odkurz kaloryfery", expValue: 100, difficulty: "hard" },
  { key: "umyj_lampy", title: "Umyj lampy i klosze", expValue: 50, difficulty: "medium" },
  { key: "umyj_sciane_kuchnia", title: "Umyj ścianę w kuchni przy blacie", expValue: 50, difficulty: "medium" },
  { key: "wyczysc_kosz_pranie", title: "Wyczyść kosz na pranie", expValue: 50, difficulty: "medium" },
  { key: "zdejmij_siersc", title: "Zbierz sierść z kanapy (rolką)", expValue: 25, difficulty: "easy" },
  { key: "umyj_deske_sedesowa", title: "Umyj deskę sedesową", expValue: 50, difficulty: "medium" },
  { key: "odkurz_materac", title: "Odkurz materac", expValue: 100, difficulty: "hard" },
  { key: "umyj_kratki_piekarnik", title: "Umyj kratki w piekarniku", expValue: 50, difficulty: "medium" },
  { key: "czysc_gora_szafek", title: "Przetrzyj górę szafek kuchennych", expValue: 100, difficulty: "hard" },
  { key: "umyj_uszczelki_drzwi", title: "Wyczyść uszczelki drzwi", expValue: 50, difficulty: "medium" },
  { key: "umyj_suszarke", title: "Umyj suszarkę na naczynia", expValue: 25, difficulty: "easy" },
  { key: "wyczysc_odplyw", title: "Wyczyść odpływ w prysznicu", expValue: 50, difficulty: "medium" },

  // --- Szybkie, prozaiczne ---
  { key: "wyrzuc_smieci", title: "Wyrzuć śmieci", expValue: 25, difficulty: "easy" },
  { key: "scielenie_lozka", title: "Pościel łóżko", expValue: 25, difficulty: "easy" },
  { key: "starcie_kurzu", title: "Zetrzyj kurz", expValue: 50, difficulty: "medium" },
  { key: "podlej_kwiaty", title: "Podlej kwiaty", expValue: 25, difficulty: "easy" },
  { key: "ubierz_polarek", title: "Załóż polarek (zimno!)", expValue: 25, difficulty: "easy" },
  { key: "wywietrz_5min", title: "Wywietrz mieszkanie 5 minut", expValue: 25, difficulty: "easy" },
  { key: "odloz_10_rzeczy", title: "Odłóż 10 rzeczy na miejsce", expValue: 25, difficulty: "easy" },
  { key: "ogarnij_podloge_3min", title: "Pozbieraj rzeczy z podłogi (3 min)", expValue: 25, difficulty: "easy" },
  { key: "umyj_kubek", title: "Umyj kubek / szklankę od razu", expValue: 25, difficulty: "easy" },
  { key: "wymien_recznik", title: "Wymień ręcznik na świeży", expValue: 25, difficulty: "easy" },
  { key: "ubrania_do_prania", title: "Zbierz ubrania do prania", expValue: 25, difficulty: "easy" },
  { key: "poskladaj_5_ubran", title: "Złóż 5 ubrań", expValue: 25, difficulty: "easy" },
  { key: "umyj_pod_prysznicem", title: "Opłucz kabinę po prysznicu", expValue: 25, difficulty: "easy" },
  { key: "przetrzyj_blaty", title: "Przetrzyj blaty", expValue: 25, difficulty: "easy" },
  { key: "zdejmij_kurz_z_tv", title: "Przetrzyj TV / monitor", expValue: 25, difficulty: "easy" },
  { key: "wymien_worki", title: "Wymień worek / opróżnij pojemnik odkurzacza", expValue: 50, difficulty: "medium" },
  { key: "ogarnij_buty", title: "Ustaw buty w jedno miejsce", expValue: 25, difficulty: "easy" },
  { key: "przetrzyj_laptop", title: "Przetrzyj klawiaturę / laptop", expValue: 25, difficulty: "easy" },
  { key: "przetrzyj_fotele", title: "Przetrzyj stół i krzesła", expValue: 50, difficulty: "medium" },

  // --- Nowe szybkie (+10) ---
  { key: "odloz_3_rzeczy", title: "Odłóż 3 rzeczy na swoje miejsce", expValue: 25, difficulty: "easy" },
  { key: "speed_clean_2min", title: "Zrób 2 minuty speed clean", expValue: 25, difficulty: "easy" },
  { key: "zdejmij_smieci_biurko", title: "Zdejmij śmieci z biurka", expValue: 25, difficulty: "easy" },
  { key: "zbierz_naczynia", title: "Zbierz naczynia z mieszkania", expValue: 25, difficulty: "easy" },
  { key: "wyczysc_telefon", title: "Wyczyść ekran telefonu", expValue: 25, difficulty: "easy" },
  { key: "oproznikieszenie", title: "Opróżnij kieszenie kurtek", expValue: 25, difficulty: "easy" },
  { key: "wyrzuc_1_rzecz", title: "Wyrzuć 1 zbędną rzecz", expValue: 25, difficulty: "easy" },
  { key: "sprawdz_dlugopisy", title: "Sprawdź długopisy i wyrzuć zużyte", expValue: 25, difficulty: "easy" },
  { key: "umyj_1_rzecz", title: "Umyj jedną rzecz w kuchni", expValue: 25, difficulty: "easy" },
  { key: "ogarnij_kabelki", title: "Ogarnij kable przy biurku", expValue: 25, difficulty: "easy" },

  // --- Lifestyle / zdrowie ---
  { key: "wypij_wode", title: "Wypij szklankę wody", expValue: 25, difficulty: "easy" },
  { key: "zjedz_owoc", title: "Zjedz owoc", expValue: 25, difficulty: "easy" },
  { key: "zjedz_warzywa", title: "Zjedz porcję warzyw", expValue: 25, difficulty: "easy" },
  { key: "zjedz_batonika", title: "Zjedz batonika", expValue: 25, difficulty: "easy" },
  { key: "zjedz_owsianke", title: "Zjedz owsiankę", expValue: 25, difficulty: "easy" },
  { key: "pol_zdrowa_przekaska", title: "Zjedz pół-zdrową przekąskę", expValue: 25, difficulty: "easy" },
  { key: "zdrowe_sniadanie", title: "Zjedz zdrowe śniadanie", expValue: 50, difficulty: "medium" },
  { key: "herbata", title: "Zrób herbatę i wypij na spokojnie", expValue: 25, difficulty: "easy" },
  { key: "rozciaganie_5min", title: "Porozciągaj się 5 minut", expValue: 25, difficulty: "easy" },
  { key: "spacer_po_domie", title: "Zrób 1000 kroków po domu", expValue: 25, difficulty: "easy" },
  { key: "oddech_2min", title: "Oddychaj spokojnie 2 minuty", expValue: 25, difficulty: "easy" },
  { key: "cwiczenia_brzucha_10min", title: "Zrób 10 min ćwiczeń brzucha", expValue: 100, difficulty: "hard" },
  { key: "mini_trening_7min", title: "Zrób trening 7 minut", expValue: 50, difficulty: "medium" },
  { key: "przysiady_50", title: "Zrób 50 przysiadów", expValue: 50, difficulty: "medium" },
  { key: "plank_2min", title: "Zrób plank 2 min (z przerwami)", expValue: 50, difficulty: "medium" },

  // --- Nowe lifestyle (+10) ---
  { key: "10_oddechow", title: "Zrób 10 głębokich oddechów", expValue: 25, difficulty: "easy" },
  { key: "woda_cytryna", title: "Wypij wodę z cytryną", expValue: 25, difficulty: "easy" },
  { key: "20_pajacykow", title: "Zrób 20 pajacyków", expValue: 25, difficulty: "easy" },
  { key: "medytacja_5min", title: "Zrób 5-minutową medytację", expValue: 50, difficulty: "medium" },
  { key: "piosenka_relaks", title: "Posłuchaj ulubionej piosenki", expValue: 25, difficulty: "easy" },
  { key: "zdrowa_przekaska", title: "Zjedz zdrową przekąskę", expValue: 25, difficulty: "easy" },
  { key: "reset_kregoslup", title: "Porozciągaj kręgosłup", expValue: 25, difficulty: "easy" },
  { key: "spacer_5min", title: "Przejdź się po mieszkaniu 5 minut", expValue: 25, difficulty: "easy" },
  { key: "postawa_2min", title: "Usiądź prosto na 2 minuty", expValue: 25, difficulty: "easy" },
  { key: "pozytywna_rzecz", title: "Zapisz jedną pozytywną myśl", expValue: 25, difficulty: "easy" },

  // --- Relaks/hobby ---
  { key: "czytanie_20min", title: "Poczytaj książkę 20 min", expValue: 50, difficulty: "medium" },
  { key: "zataniec_do_piosenki", title: "Zatańcz do ulubionej piosenki", expValue: 25, difficulty: "easy" },
  { key: "porzadek_w_galerii", title: "Zrób porządek w galerii zdjęć", expValue: 25, difficulty: "easy" },
  { key: "posprzataj_pulpit", title: "Ogarnij pulpit / komputer", expValue: 50, difficulty: "medium" },
  { key: "ogarnij_hasla", title: "Ogarnij hasła / menedżer haseł", expValue: 50, difficulty: "medium" },
  { key: "posprzataj_notatki", title: "Usuń 10 starych notatek", expValue: 25, difficulty: "easy" },

  // --- Nowe relaks (+10) ---
  { key: "przesluchaj_piosenke", title: "Przesłuchaj jedną ulubioną piosenkę", expValue: 25, difficulty: "easy" },
  { key: "zrob_zdjecie", title: "Zrób zdjęcie czegoś ładnego", expValue: 25, difficulty: "easy" },
  { key: "usun_memy", title: "Usuń stare memy z telefonu", expValue: 25, difficulty: "easy" },
  { key: "bazgrol", title: "Narysuj mały bazgroł", expValue: 25, difficulty: "easy" },
  { key: "hobby_10min", title: "Poświęć 10 minut hobby", expValue: 50, difficulty: "medium" },
  { key: "porzadek_pobrane", title: "Wyczyść folder Pobrane", expValue: 50, difficulty: "medium" },
  { key: "usun_aplikacje", title: "Usuń 5 nieużywanych aplikacji", expValue: 25, difficulty: "easy" },
  { key: "porzadek_ekran", title: "Ogarnij ekran startowy telefonu", expValue: 25, difficulty: "easy" },
  { key: "usun_powiadomienia", title: "Wyczyść powiadomienia", expValue: 25, difficulty: "easy" },
  { key: "dodaj_kalendarz", title: "Przypnij ważną rzecz do kalendarza", expValue: 25, difficulty: "easy" },

  // --- Deep clean ---
  { key: "przetarcie_listew_przedluzaczy", title: "Przetrzyj listwy i przedłużacze", expValue: 50, difficulty: "medium" },
  { key: "wyczysc_sitka", title: "Wyczyść sitka w kranach", expValue: 100, difficulty: "hard" },
  { key: "wyczysc_suszarke", title: "Wyczyść suszarkę do naczyń", expValue: 50, difficulty: "medium" },
  { key: "kurz_za_meblami", title: "Odkurz za meblami", expValue: 100, difficulty: "hard" },
  { key: "mycie_koszy", title: "Przetrzyj pojemniki i organizery", expValue: 50, difficulty: "medium" },

  // --- Nowe deep clean (+10) ---
  { key: "kratka_klima", title: "Umyj kratkę klimatyzacji/wentylacji", expValue: 50, difficulty: "medium" },
  { key: "wnęka_kran", title: "Przetrzyj wnękę pod kranem", expValue: 50, difficulty: "medium" },
  { key: "tyl_lodowki", title: "Odkurz tył lodówki", expValue: 100, difficulty: "hard" },
  { key: "drzwi_pod_zlewem", title: "Umyj drzwi szafki pod zlewem", expValue: 50, difficulty: "medium" },
  { key: "pralka_zewn", title: "Umyj pralkę z zewnątrz", expValue: 25, difficulty: "easy" },
  { key: "uszczelki_lodowki", title: "Wyczyść uszczelki lodówki", expValue: 50, difficulty: "medium" },
  { key: "szuflady_dno", title: "Przetrzyj dno szuflad w kuchni", expValue: 50, difficulty: "medium" },
  { key: "pod_lozkiem", title: "Odkurz pod łóżkiem", expValue: 50, difficulty: "medium" },
  { key: "pokrywki_garnkow", title: "Umyj pokrywki garnków", expValue: 50, difficulty: "medium" },
  { key: "przetrzyj_plastiki", title: "Przetrzyj plastikowe elementy w domu", expValue: 50, difficulty: "medium" },

  // --- Admin ---
  { key: "zaplanuj_posilki", title: "Zaplanuj 2 posiłki na jutro", expValue: 25, difficulty: "easy" },
  { key: "lista_zakupow", title: "Zrób listę zakupów", expValue: 25, difficulty: "easy" },
  { key: "przygotuj_ubranie", title: "Przygotuj ubranie na jutro", expValue: 25, difficulty: "easy" },
  { key: "zapis_na_badania", title: "Zapisz się na badania profilaktyczne (online)", expValue: 50, difficulty: "medium" },

  // --- Nowe admin (+10) ---
  { key: "sprawdz_leki", title: "Sprawdź terminy ważności leków", expValue: 50, difficulty: "medium" },
  { key: "uzupelnij_apteczke", title: "Uzupełnij apteczkę", expValue: 50, difficulty: "medium" },
  { key: "zmien_haslo", title: "Zmień jedno hasło na silniejsze", expValue: 50, difficulty: "medium" },
  { key: "mail_20", title: "Usuń 20 maili ze skrzynki", expValue: 25, difficulty: "easy" },
  { key: "zapisz_paragon", title: "Zrób zdjęcie paragonu", expValue: 25, difficulty: "easy" },
  { key: "zaplanuj_dzien_wolny", title: "Zaplanuj jeden wolny dzień", expValue: 25, difficulty: "easy" },
  { key: "zapisz_marzenie", title: "Zapisz jedno marzenie", expValue: 25, difficulty: "easy" },
  { key: "lista_jutro", title: "Zrób listę 3 zadań na jutro", expValue: 25, difficulty: "easy" },
  { key: "sprawdz_saldo", title: "Sprawdź saldo i wydatki", expValue: 25, difficulty: "easy" },
  { key: "zamknij_stare_zadanie", title: "Zamknij jedno stare zadanie", expValue: 25, difficulty: "easy" },
];

export default DEFAULT_CHORES;


function todayYMD() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(t1: Date, t2: Date) {
  return Math.floor((t2.getTime() - t1.getTime()) / (1000 * 60 * 60 * 24));
}

function toDateSafe(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val instanceof admin.firestore.Timestamp) return val.toDate();
  if (typeof val?.toDate === "function") {
    try {
      const d = val.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * --------------------------------------------------------
 * 1) generateDailyChallenges — wywoływane przez frontend
 * --------------------------------------------------------
 */
export const generateDailyChallenges = onRequest(
  { region: REGION },
  async (req, res): Promise<void> => {
    // CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const uid = (req.query.uid as string) || "";

      if (!uid) {
        res.status(400).json({ ok: false, error: "missing-uid" });
        return;
      }

      const userRef = db.doc(`users/${uid}`);
      const userSnap = await userRef.get();

      let user: any;

      if (!userSnap.exists) {
        user = {
          uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOfferDay: null,
          lastChallengeModalAt: null,
          lastAcceptedAt: {},
        };

        await userRef.set(user, { merge: true });
        console.log("[generateDailyChallenges] created missing user doc for", uid);
      } else {
        user = userSnap.data() || {};
      }

      const today = todayYMD();

      // jeśli już wygenerowano dziś → nic nie rób
      if (user.lastOfferDay === today) {
        res.status(200).json({ ok: true, already: true, today });
        return;
      }

      const lastAcceptedAt = user.lastAcceptedAt || {};

      // cooldown 3 dni (bez crasha jeśli coś jest krzywe)
      const filtered = DEFAULT_CHORES.filter((ch) => {
        const last = lastAcceptedAt[ch.key];
        if (!last) return true;

        const lastDate = toDateSafe(last);
        if (!lastDate) return true;

        const diff = daysBetween(lastDate, new Date());
        return diff >= 3;
      });

      // losujemy 12 (jeśli jest mniej dostępnych po cooldownie, bierzemy ile się da)
      const shuffled = filtered.sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, DAILY_SUGGESTIONS_LIMIT);

      const col = db.collection(`users/${uid}/new_challenges`);

      // usuwamy stare pending
      const old = await col.where("status", "==", "PENDING").get();

      const batch = db.batch();
      old.docs.forEach((doc) => batch.delete(doc.ref));

      // dodajemy nowe
      for (const ch of chosen) {
        const id = `${ch.key}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const ref = col.doc(id);

        const expMode: Difficulty = ch.difficulty ?? mapExpToDifficulty(ch.expValue);

        batch.set(ref, {
          key: ch.key,
          title: ch.title,
          expValue: ch.expValue, // 25–150
          expMode, // spójne z frontendem
          status: "PENDING",
          dayOffer: today,
          dueAt: admin.firestore.Timestamp.fromDate(new Date()),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // zapisujemy że dziś wygenerowano
      batch.set(
        userRef,
        {
          lastOfferDay: today,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();

      res.status(200).json({
        ok: true,
        generated: chosen.length,
        today,
      });
    } catch (err: any) {
      console.error("generateDailyChallenges ERROR:", err);
      res.status(500).json({
        ok: false,
        error: err?.message || String(err),
      });
    }
  }
);

/**
 * --------------------------------------------------------
 * 2) ACCEPT — tworzy misję + zapisuje cooldown
 * --------------------------------------------------------
 */
export const onChallengeAcceptedCreateMission = onDocumentUpdated(
  {
    region: REGION,
    document: "users/{userId}/new_challenges/{challengeId}",
  },
  async (event): Promise<void> => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) return;
    if (before.status === "ACCEPTED") return;
    if (after.status !== "ACCEPTED") return;

    const userId = event.params.userId;
    const challengeId = event.params.challengeId;
    const { key, title, expValue } = after;

    // expMode może być null jeśli coś starego już jest w bazie
    const expModeFromDoc =
      (after.expMode as Difficulty | undefined) || mapExpToDifficulty(expValue || 0);

    const missionRef = db.collection("missions").doc(`daily_${challengeId}`);

    await missionRef.set({
      title,
      expValue,
      expMode: expModeFromDoc,

      assignedToUserId: userId,
      assignedByUserId: userId,
      createdByUserId: userId,

      dueDate: admin.firestore.Timestamp.fromDate(new Date()),
      repeat: { type: "none" },

      completed: false,
      archived: false,
      source: "DAILY_SUGGESTION",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const userRef = db.doc(`users/${userId}`);
    await userRef.set(
      {
        lastAcceptedAt: {
          [key]: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

/**
 * --------------------------------------------------------
 * 3) DECLINE — tylko timestamp
 * --------------------------------------------------------
 */
export const onChallengeDeclinedStamp = onDocumentUpdated(
  {
    region: REGION,
    document: "users/{userId}/new_challenges/{challengeId}",
  },
  async (event): Promise<void> => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) return;
    if (before.status === "DECLINED") return;
    if (after.status !== "DECLINED") return;

    const userId = event.params.userId;
    const challengeId = event.params.challengeId;

    await db.doc(`users/${userId}/new_challenges/${challengeId}`).set(
      {
        declinedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

// functions/src/nowewyzwanie.ts
