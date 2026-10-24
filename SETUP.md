# Hisaab — setup guide

Voice se kharch/aamdani likhne wala app. Data aapki **Google Sheet** me rehta hai,
app sirf interface hai.

---

## 1. Google Sheet + Apps Script (5 minute)

1. [sheets.new](https://sheets.new) par naya Sheet kholein. Naam de dein — `Hisaab`.
2. Menu se **Extensions → Apps Script**.
3. Left me jo `Code.gs` khula hai, uska poora content delete karein.
4. Is folder ki **`Code.gs`** file ka poora code copy karke wahan paste karein.
5. **Save** (💾) dabayein.
6. (Optional lekin recommended) Password lagane ke liye:
   - `setupPassword` function ke andar `'CHANGE-THIS-PASSWORD'` ki jagah apna password likhein.
   - Upar function dropdown se `setupPassword` chunein → **Run**.
   - Permission maange to **Review permissions → Allow**.
   - Phir `setupPassword` function delete kar dein (password save ho chuka hai).

## 2. Web App deploy karein

1. Upar right **Deploy → New deployment**.
2. Gear icon → **Web app**.
3. Settings:
   - **Description**: `hisaab api`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. **Deploy** → **Authorize access** → apna Google account → Allow.
5. Jo **Web app URL** mile ( `.../exec` par khatam hota hai ) use copy kar lein.

> Ye URL aapke Sheet ka "API" hai. Ise kisi ke saath share na karein
> (password laga hua hai to bhi safe hai, phir bhi private rakhein).

## 3. App ko internet par rakhein (HTTPS zaroori)

Voice command ke liye browser ko **HTTPS** chahiye. Sabse aasan tareeka:

**Netlify Drop**
1. [app.netlify.com/drop](https://app.netlify.com/drop) kholein.
2. Is `hisaab` folder ko drag-and-drop kar dein.
3. 20 second me `https://random-name.netlify.app` jaisa link mil jayega.
4. Site settings me naam badal sakte hain (`hisaab-myname.netlify.app`).

**Ya GitHub Pages**
1. GitHub par naya repo banayein, `hisaab` folder ke files upload karein.
2. Settings → Pages → Branch: `main` → `/root` → Save.
3. `https://username.github.io/repo/` par app live ho jayegi.

> Local test: folder me `python -m http.server 8000` chala kar
> `http://localhost:8000` kholein. Mic sirf localhost par chalta hai,
> phone se LAN IP par nahi — uske liye HTTPS hosting chahiye.

## 4. App me Sheet connect karein

1. App kholein → **Settings** tab.
2. **Web App URL** me step 2 ka URL paste karein.
3. Password set kiya tha to **Password** field me daalein.
4. **Connect** dabayein.
5. Green "Connected ✓" aa jaye to ho gaya. Upar ka pill **Sheet** dikhayega.

Ab jo bhi entry karoge, seedha Sheet me jayegi. Internet na ho to entry phone me
save rahegi aur net aane par apne aap Sheet me chali jayegi.

## 5. Phone me install karein

**Android (Chrome)**
1. Upar wala `https://...` link Chrome me kholein.
2. Right-top **⋮ → Add to Home screen → Install**.

**iPhone (Safari)**
1. Link Safari me kholein.
2. Share button → **Add to Home Screen**.

Ab icon se app fullscreen khulegi.

---

## Kaise bolein

Mic (laal gol button) dabayein aur bolein:

| Bolein | Banega |
|---|---|
| "chai pe pachas rupaye kharch" | ₹50 · Food · Kharch |
| "salary pandrah hazaar mili" | ₹15,000 · Salary · Aamdani |
| "kal auto ka tees rupaye" | ₹30 · Travel · kal ki date |
| "bijli ka bill 1200 bhara" | ₹1,200 · Bills · Kharch |
| "upi se kirana 450" | ₹450 · Grocery · UPI |
| "mummy ko do hazaar diye" | ₹2,000 · Family · Kharch |
| "doctor ko 300 diya" | ₹300 · Health · Kharch |
| "12 tarikh ko rent 8000" | ₹8,000 · Rent · 12 tarikh |

Save karne se pehle ek confirm screen aati hai — amount, category, date, payment
sab wahin badal sakte hain. Galat samjha ho to 2 second me theek kar dein.

Voice na chale to wahin type bhi kar sakte hain, ya **+** button se manual entry.

---

## Sheet ka structure

`ENTRIES` tab me ye columns hote hain:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| ID | Date | Type | Category | Amount | Note | Payment | CreatedAt |

Sheet me direct edit/delete kar sakte hain — app next sync par wahi dikhayega.
Bas **ID column mat chhediye** (usee se row pehchani jaati hai).

---

## Reports

- **Report tab** — mahine ki aamdani, kharch, bachat; roz ka graph; category-wise pie.
- Category row par tap → us category ki saari entry.
- **Entries tab** — search, type filter, kisi bhi entry par tap karke edit/delete.
- **Settings → CSV download** — us mahine ka CSV (Excel me khulega).

---

## Problem aaye to

| Problem | Solution |
|---|---|
| "Sheet se galat jawab aaya" | URL `/exec` par khatam hona chahiye, `/dev` nahi. Deploy dobara karein. |
| "Password galat hai" | Apps Script me `setupPassword` dobara chalayein, phir app me naya password daalein. |
| Mic nahi chalta | HTTPS link se kholein (Netlify/GitHub Pages). Chrome me mic permission allow karein. |
| Voice samajh nahi raha | Settings → bhasha **Hindi** ya **English (India)** try karein. Dheere bolein. |
| Entry Sheet me nahi dikh rahi | Settings → **Sync now**. Upar pill "Offline" ho to internet check karein. |
| Data purana lag raha hai | Pull-to-refresh jaisa: Settings → Sync now. |

---

## Files

| File | Kaam |
|---|---|
| `index.html` | app ka UI |
| `styles.css` | design |
| `parser.js` | voice/text se amount, category, date samajhna |
| `app.js` | app logic, reports, sync |
| `api.js` | Google Sheet se baat |
| `Code.gs` | Sheet ke andar chalne wala backend |
| `manifest.json`, `sw.js` | install + offline |
| `icons/` | app icon |
