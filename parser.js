/* ============================================================
   Hisaab — voice command parser
   ------------------------------------------------------------
   Hindi (Devanagari) + Hinglish + English sentence se
   { amount, type, category, date, payment, note } nikalta hai.

   Examples:
     "chai pe pachas rupaye kharch"        -> 50 expense Food
     "salary pandrah hazaar mili"          -> 15000 income Salary
     "kal auto ka tees rupaye"             -> 30 expense Travel (yesterday)
     "bijli ka bill 1200 bhara"            -> 1200 expense Bills
     "चाय पर पचास रुपये खर्च"                -> 50 expense Food
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------
     1. Devanagari -> Latin  (पचास -> pachas)
     --------------------------------------------------------- */
  var CONS = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
    'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f'
  };
  var VOWEL = {
    'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
  };
  var MATRA = {
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au'
  };
  var MARKS = { 'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': '', 'ऽ': '', 'ॐ': 'om' };
  var DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

  function transliterate(str) {
    var out = '', pending = false, ch;
    for (var i = 0; i < str.length; i++) {
      ch = str.charAt(i);
      if (CONS[ch]) {
        if (pending) out += 'a';
        out += CONS[ch];
        pending = true;
      } else if (MATRA[ch] !== undefined) {
        out += MATRA[ch]; pending = false;
      } else if (MARKS[ch] !== undefined) {
        out += MARKS[ch]; pending = false;
      } else if (VOWEL[ch] !== undefined) {
        if (pending) out += 'a';
        out += VOWEL[ch]; pending = false;
      } else if (DIGITS[ch] !== undefined) {
        if (pending) out += 'a';
        out += DIGITS[ch]; pending = false;
      } else if (/[\s\p{P}\p{S}]/u.test(ch)) {
        // word boundary — inherent 'a' yahin khatam
        out += ch; pending = false;
      } else {
        if (pending) out += 'a';
        out += ch; pending = false;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------
     2. Spelling normaliser — same word ki alag spelling ek jaisi
     --------------------------------------------------------- */
  function normWord(w) {
    var x = String(w || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (!x) return '';
    x = x.replace(/aa+/g, 'a')
         .replace(/ee+/g, 'i')
         .replace(/ii+/g, 'i')
         .replace(/oo+/g, 'u')
         .replace(/uu+/g, 'u')
         .replace(/w/g, 'v')
         .replace(/z/g, 'j')
         .replace(/q/g, 'k')
         .replace(/x/g, 'ks')
         .replace(/chh/g, 'ch')
         .replace(/([b-df-hj-np-tv-z])\1+/g, '$1');
    if (x.length > 3 && x.charAt(x.length - 1) === 'a') x = x.slice(0, -1);
    if (/y$/.test(x) && x.length > 2) x = x.slice(0, -1) + 'i';
    return x;
  }

  /* ---------------------------------------------------------
     3. Number words
     --------------------------------------------------------- */
  var NUM_RAW = {
    'shunya': 0, 'sifar': 0, 'zero': 0,
    'ek': 1, 'one': 1,
    'do': 2, 'two': 2,
    'teen': 3, 'tin': 3, 'three': 3,
    'char': 4, 'four': 4,
    'panch': 5, 'five': 5,
    'chhah': 6, 'chhe': 6, 'che': 6, 'six': 6,
    'saat': 7, 'sat': 7, 'seven': 7,
    'aath': 8, 'ath': 8, 'eight': 8,
    'nau': 9, 'nine': 9,
    'das': 10, 'dus': 10, 'ten': 10,
    'gyarah': 11, 'eleven': 11,
    'barah': 12, 'twelve': 12,
    'terah': 13, 'thirteen': 13,
    'chaudah': 14, 'fourteen': 14,
    'pandrah': 15, 'fifteen': 15,
    'solah': 16, 'sixteen': 16,
    'satrah': 17, 'seventeen': 17,
    'atharah': 18, 'athara': 18, 'eighteen': 18,
    'unnis': 19, 'unis': 19, 'nineteen': 19,
    'bees': 20, 'bis': 20, 'twenty': 20,
    'ikkis': 21, 'ikis': 21,
    'bais': 22,
    'teis': 23,
    'chaubis': 24,
    'pachees': 25, 'pachchis': 25,
    'chhabbis': 26, 'chabbis': 26,
    'sattais': 27,
    'athais': 28, 'atthais': 28,
    'untis': 29, 'untees': 29,
    'tees': 30, 'thirty': 30,
    'ikattis': 31,
    'battis': 32,
    'taintis': 33, 'tetis': 33,
    'chauntis': 34, 'chautis': 34,
    'paintis': 35, 'paitis': 35,
    'chhattis': 36, 'chattis': 36,
    'saintis': 37, 'santis': 37,
    'adtis': 38, 'adhtis': 38,
    'untalis': 39, 'unchalis': 39,
    'chalis': 40, 'chalees': 40, 'forty': 40,
    'iktalis': 41, 'iktalis': 41,
    'bayalis': 42, 'beyalis': 42,
    'taintalis': 43,
    'chavalis': 44, 'chawalis': 44,
    'paintalis': 45,
    'chhiyalis': 46,
    'saintalis': 47,
    'adtalis': 48, 'adhtalis': 48,
    'unchas': 49,
    'pachas': 50, 'pachchas': 50, 'fifty': 50,
    'ikyavan': 51,
    'bavan': 52, 'bawan': 52,
    'tirpan': 53, 'tirpan': 53,
    'chauvan': 54, 'chauwan': 54,
    'pachpan': 55,
    'chhappan': 56,
    'sattavan': 57, 'sattawan': 57,
    'atthavan': 58, 'athawan': 58,
    'unsath': 59,
    'saath': 60, 'sath': 60, 'sixty': 60,
    'iksath': 61,
    'basath': 62, 'baisath': 62,
    'tirsath': 63,
    'chausath': 64,
    'pansath': 65,
    'chhiyasath': 66,
    'sadsath': 67,
    'adsath': 68,
    'unhattar': 69,
    'sattar': 70, 'seventy': 70,
    'ikhattar': 71,
    'bahattar': 72,
    'tihattar': 73,
    'chauhattar': 74,
    'pachattar': 75,
    'chhihattar': 76,
    'sattahattar': 77,
    'athhattar': 78,
    'unyasi': 79, 'unasi': 79,
    'assi': 80, 'eighty': 80,
    'ikyasi': 81,
    'bayasi': 82,
    'tirasi': 83,
    'chaurasi': 84,
    'pachasi': 85,
    'chhiyasi': 86, 'chiyasi': 86,
    'sattasi': 87,
    'athasi': 88,
    'navasi': 89,
    'nabbe': 90, 'ninty': 90, 'ninety': 90,
    'ikyanve': 91, 'ikyanwe': 91,
    'banve': 92, 'banwe': 92,
    'tiranve': 93, 'tiranwe': 93,
    'chauranve': 94, 'chauranwe': 94,
    'panchanve': 95, 'panchanwe': 95,
    'chhiyanve': 96, 'chhiyanwe': 96,
    'sattanve': 97, 'sattanwe': 97,
    'atthanve': 98, 'atthanwe': 98,
    'ninyanve': 99, 'ninyanwe': 99,
    'sau': 100, 'hundred': 100,
    'hazar': 1000, 'hajar': 1000, 'thousand': 1000,
    'lakh': 100000, 'lac': 100000, 'lakhs': 100000,
    'million': 1000000, 'crore': 10000000, 'cr': 10000000
  };
  var MULTIPLIERS = { 100: 1, 1000: 1, 100000: 1, 1000000: 1, 10000000: 1 };

  var NUM = {};
  Object.keys(NUM_RAW).forEach(function (k) {
    var nk = normWord(k);
    if (nk && NUM[nk] === undefined) NUM[nk] = NUM_RAW[k];
  });

  function numToken(tok) {
    if (/^\d+(\.\d+)?$/.test(tok)) return { value: parseFloat(tok), mult: false };
    var v = NUM[normWord(tok)];
    if (v === undefined) return null;
    return { value: v, mult: MULTIPLIERS[v] === 1 };
  }

  /* ---------------------------------------------------------
     4. Categories (keywords Hinglish me hi likhe hain,
        runtime par normWord karke match hote hain)
     --------------------------------------------------------- */
  var CATS = [
    {
      name: 'Food', type: 'expense', icon: '🍽️', color: '#F97316',
      kw: 'chai coffee nashta khana khane lunch dinner breakfast restaurant dhaba hotel samosa pizza burger biryani snack mithai mithai momos dosa thali canteen cafe patties vada pav bhel puri chowmein roll shake juice ice cream kulfi tiffin khaana khaya piya nashta'
    },
    {
      name: 'Grocery', type: 'expense', icon: '🛒', color: '#65A30D',
      kw: 'kirana grocery sabzi sabji vegetables ration doodh milk dudh atta chawal rice dal daal tel oil masala ande egg chicken mutton fish aata kirana saman grocery saman nammak namak cheeni sugar chai patti ghee butter paneer'
    },
    {
      name: 'Travel', type: 'expense', icon: '🚌', color: '#0EA5E9',
      kw: 'auto rickshaw riksha e rickshaw uber ola rapido taxi cab bus train metro ticket petrol diesel cng fuel parking toll flight hawaai safar travel bike scooter gaadi'
    },
    {
      name: 'Bills', type: 'expense', icon: '💡', color: '#F59E0B',
      kw: 'bijli electricity current pani water gas cylinder lpg internet wifi broadband mobile recharge phone dth cable bill bills tax maintenance society sevā seva'
    },
    {
      name: 'Rent', type: 'expense', icon: '🏠', color: '#8B5CF6',
      kw: 'rent kiraya kiraye makan flat house'
    },
    {
      name: 'Health', type: 'expense', icon: '🩺', color: '#EF4444',
      kw: 'dawa dawai medicine doctor hospital clinic medical tablet injection ilaaj checkup lab test patanjali davakhana'
    },
    {
      name: 'Education', type: 'expense', icon: '📚', color: '#6366F1',
      kw: 'fees school college tuition coaching books kitab stationery exam course hostel fees pathshala'
    },
    {
      name: 'Shopping', type: 'expense', icon: '🛍️', color: '#EC4899',
      kw: 'kapde clothes shirt pant saree sari suit shoes joote chappal chappal shopping amazon flipkart myntra mall makeup cosmetic laptop watch mobile phone'
    },
    {
      name: 'Entertainment', type: 'expense', icon: '🎬', color: '#A855F7',
      kw: 'movie cinema film party daru sharab beer wine cigarette sutta pan masala game netflix subscription picnic ghumna ghumne'
    },
    {
      name: 'Repair', type: 'expense', icon: '🔧', color: '#78716C',
      kw: 'repair puncture mechanic service servicing mistri plumber electrician carpenter thik karaya'
    },
    {
      name: 'Loan/EMI', type: 'expense', icon: '🏦', color: '#0891B2',
      kw: 'emi loan karja karz installment udhaar udhar kist'
    },
    {
      name: 'Family', type: 'expense', icon: '👨‍👩‍👧', color: '#D97706',
      kw: 'papa mummy mammi ammi maa mata bachcho bachchon family bhai behen bete beti ghar'
    },
    {
      name: 'Donation', type: 'expense', icon: '❤️', color: '#E11D48',
      kw: 'donation daan mandir temple church masjid shagun gift birthday gift'
    },
    {
      name: 'Other', type: 'expense', icon: '📦', color: '#94A3B8',
      kw: 'other misc'
    },
    {
      name: 'Salary', type: 'income', icon: '💰', color: '#16A34A',
      kw: 'salary pagar tankhwah tankha betan vetan wages mazdoori majdur'
    },
    {
      name: 'Business', type: 'income', icon: '🏪', color: '#0D9488',
      kw: 'dukan shop business dhandha sale becha bech profit munafa dukan'
    },
    {
      name: 'Freelance', type: 'income', icon: '💻', color: '#2563EB',
      kw: 'freelance project client upwork fiverr tuitoring'
    },
    {
      name: 'Interest', type: 'income', icon: '📈', color: '#7C3AED',
      kw: 'byaj interest fd rd dividend'
    },
    {
      name: 'Gift', type: 'income', icon: '🎁', color: '#DB2777',
      kw: 'gift inaam reward bonus cashback'
    },
    {
      name: 'Other Income', type: 'income', icon: '➕', color: '#059669',
      kw: 'aamdani income kamai kamaya mila'
    }
  ];

  // keyword phrases -> normalised words
  CATS.forEach(function (c) {
    c.phrases = c.kw.split(/\s+/).filter(Boolean).map(function (k) {
      return normWord(k);
    }).filter(Boolean);
    c.uniq = [];
    c.phrases.forEach(function (p) { if (c.uniq.indexOf(p) < 0) c.uniq.push(p); });
  });

  function catByName(name) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].name === name) return CATS[i];
    return null;
  }

  function categoriesFor(type) {
    return CATS.filter(function (c) { return c.type === type; });
  }

  /* ---------------------------------------------------------
     5. Type words (kharch / aamdani)
     --------------------------------------------------------- */
  var INCOME_WORDS = ('mila mili mile milta milti aaya aayi aaye ayi prapt received receive credit credited ' +
    'jama kamaya kamai kamaye aamdani income kamana got refund earn earned bonus vasooli wapas').split(/\s+/);
  var EXPENSE_WORDS = ('kharch kharcha kharchh kharida kharid kharide kharidaa liya liye diya diye di de din ' +
    'bheja bheje bheji spend spent paid pay payment bhara bhar bharna expense debit nikala nikale udaya khaya piya gaya gya waste barbad').split(/\s+/);

  var INCOME_N = INCOME_WORDS.map(normWord);
  var EXPENSE_N = EXPENSE_WORDS.map(normWord);

  var CURRENCY = ['rupaye', 'rupees', 'rs', 'rupya', 'rupaiya', 'inr', 'bucks', 'paisa', 'paise'];
  var PAY_WORDS = {
    cash: ['cash', 'nakad', 'nakad'],
    upi: ['upi', 'gpay', 'gpay', 'googlepay', 'paytm', 'phonepe', 'fonepe'],
    card: ['card', 'debit', 'creditcard', 'atm'],
    bank: ['bank', 'netbanking', 'cheque', 'check', 'neft', 'imps', 'account']
  };
  var PAY_N = {};
  Object.keys(PAY_WORDS).forEach(function (k) {
    PAY_N[k] = PAY_WORDS[k].map(normWord);
  });

  var STOP = ('pe par ka ki ke ko se me mein mai hai hua hui huwa tha thi the ek and aur or do of to for a an ' +
    'rupees rupaye rs rupya rupaiya inr paisa paise kar karke liye lie die dia wala wali wale bolte bola bolo bhi ab').split(/\s+/).map(normWord);

  /* udhaar / loan words */
  var LOAN_N = ['udhaar', 'udhar', 'udhari', 'udhaari', 'karz', 'karza', 'karja', 'loan', 'udhaar'].map(normWord);
  var GIVE_N = ['diya', 'diye', 'di', 'de', 'dena', 'dene', 'dia', 'diyo', 'de diya', 'de diye'].map(normWord);
  var TAKE_N = ['liya', 'liye', 'lie', 'li', 'lena', 'lene', 'liyo', 'liyaa'].map(normWord);
  var BACK_N = ['wapas', 'vapas', 'wapsi', 'lautaya', 'lauta', 'return', 'returns'].map(normWord);
  var RECV_N = ['mila', 'mile', 'mili', 'aaya', 'aaye', 'aayi', 'received', 'mil'].map(normWord);
  var PAID_N = ['kiya', 'kiye', 'ki', 'diya', 'diye', 'lautaya', 'return', 'paid'].map(normWord);

  function hasWord(norm, list) {
    for (var i = 0; i < list.length; i++) if (norm.indexOf(list[i]) >= 0) return true;
    return false;
  }

  var DAYS = {};
  var DAYS_RAW = {
    somvar: 1, somwar: 1, monday: 1, mon: 1,
    mangalvar: 2, mangalwar: 2, tuesday: 2, tue: 2,
    budhvar: 3, budhwar: 3, wednesday: 3, wed: 3,
    guruvar: 4, brihaspativar: 4, thursday: 4, thu: 4,
    shukravar: 5, shukrawar: 5, friday: 5, fri: 5,
    shanivar: 6, shaniwar: 6, saturday: 6, sat: 6,
    ravivar: 7, raviwar: 7, sunday: 7, sun: 7
  };
  Object.keys(DAYS_RAW).forEach(function (k) { DAYS[normWord(k)] = DAYS_RAW[k]; });

  var DATE_WORDS = {};
  var DATE_RAW = { aaj: 0, today: 0, abhi: 0, now: 0, kal: -1, kalh: -1, yesterday: -1, parso: -2, parson: -2 };
  Object.keys(DATE_RAW).forEach(function (k) { DATE_WORDS[normWord(k)] = DATE_RAW[k]; });
  var PREV_WORDS = ['pichla', 'pichle', 'pichli', 'pichhla', 'last'].map(normWord);
  var MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
    may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
    september: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
  };

  /* ---------------------------------------------------------
     6. Helpers
     --------------------------------------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function tokenize(text) {
    var t = transliterate(String(text || ''));
    t = t.toLowerCase();
    // "50rs", "₹50", "rs. 50" -> "50"
    t = t.replace(/(\d+(?:\.\d+)?)\s*(?:rs\.?|rupees?|rupaye|rupay|rupaiya|rupya|inr|bucks)\b/g, ' $1 rupaye ');
    t = t.replace(/[₹$]/g, ' ');
    // "5k", "1.5k" -> 5000 / 1500 ; "2 lakh" -> 200000
    t = t.replace(/(\d+(?:\.\d+)?)\s*(k|thousand|hazar|hajar|lakh|lac|crore|cr)\b/g, function (m, a, b) {
      var mult = (b === 'lakh' || b === 'lac') ? 100000 : (b === 'crore' || b === 'cr') ? 10000000 : 1000;
      return ' ' + (parseFloat(a) * mult) + ' ';
    });
    t = t.replace(/(\d)\s*,\s*(\d\d\d)/g, '$1$2');   // 1,200 -> 1200
    t = t.replace(/[^a-z0-9.]+/g, ' ').trim();
    if (!t) return [];
    return t.split(/\s+/);
  }

  function findRun(tokens, consumed) {
    var runs = [];
    var i = 0;
    while (i < tokens.length) {
      var n0 = numToken(tokens[i]);
      if (!n0) { i++; continue; }
      var start = i, total = 0, current = 0, ok = true, any = false;
      while (i < tokens.length) {
        var n = numToken(tokens[i]);
        if (!n) break;
        if (consumed[i]) { ok = false; break; }
        any = true;
        if (n.mult && n.value === 100) {
          current = (current || 1) * 100;
        } else if (n.mult) {
          total += (current || 1) * n.value;
          current = 0;
        } else {
          current += n.value;
        }
        i++;
      }
      if (ok && any) {
        var val = total + current;
        var cur = false;
        if (tokens[i] === 'rupaye' || tokens[start - 1] === 'rupaye') cur = true;
        runs.push({ value: val, start: start, end: i - 1, currency: cur });
      }
      if (i === start) i++;
    }
    return runs;
  }

  /* ---------------------------------------------------------
     7. Main parser
     --------------------------------------------------------- */
  function buildNote(tokens, norm, consumed) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      if (consumed[i]) continue;
      var w = norm[i];
      if (!w || STOP.indexOf(w) >= 0) continue;
      if (numToken(tokens[i])) continue;
      out.push(tokens[i]);
    }
    var note = out.join(' ').replace(/\s+/g, ' ').trim();
    return note.length > 60 ? note.slice(0, 60) : note;
  }

  function isPaymentWord(w) {
    var found = false;
    Object.keys(PAY_N).forEach(function (k) {
      if (PAY_N[k].indexOf(w) >= 0) found = true;
    });
    return found;
  }

  function extractPerson(tokens, norm, consumed) {
    var sep = -1, i;
    for (i = 0; i < norm.length; i++) {
      if (consumed[i]) continue;
      if (norm[i] === 'ko' || norm[i] === 'se') { sep = i; break; }
    }
    if (sep < 0) return '';

    var words = [];
    for (var j = sep - 1; j >= 0 && words.length < 2; j--) {
      if (consumed[j]) continue;
      var w = norm[j];
      if (!w || STOP.indexOf(w) >= 0) break;
      if (numToken(tokens[j])) break;
      if (LOAN_N.indexOf(w) >= 0) break;
      if (GIVE_N.indexOf(w) >= 0 || TAKE_N.indexOf(w) >= 0 || BACK_N.indexOf(w) >= 0) break;
      if (isPaymentWord(w)) break;
      words.unshift(tokens[j]);
      consumed[j] = true;
    }
    return words.join(' ').trim();
  }

  function loanDirection(norm) {
    var back = hasWord(norm, BACK_N);
    var give = hasWord(norm, GIVE_N);
    var take = hasWord(norm, TAKE_N);

    if (back && hasWord(norm, RECV_N)) return 'received';
    if (back && (give || hasWord(norm, PAID_N))) return 'paid';
    if (norm.indexOf('se') >= 0 && take) return 'taken';
    if (norm.indexOf('ko') >= 0 && give) return 'given';
    if (take && !give) return 'taken';
    return 'given';
  }

  function capName(s) {
    return String(s || '').split(/\s+/).filter(Boolean).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function parse(text, opts) {
    opts = opts || {};
    var now = opts.now ? new Date(opts.now) : new Date();
    var today = startOfDay(now);
    var tokens = tokenize(text);
    var norm = tokens.map(normWord);
    var consumed = tokens.map(function () { return false; });

    var result = {
      raw: String(text || ''),
      kind: 'entry',
      amount: 0,
      type: 'expense',
      category: 'Other',
      date: isoDate(today),
      payment: 'cash',
      note: ''
    };
    if (!tokens.length) return result;

    /* ---- 7a. date ---- */
    var dateObj = null;
    for (var i = 0; i < norm.length; i++) {
      var w = norm[i];
      if (DATE_WORDS[w] !== undefined) {
        dateObj = addDays(today, DATE_WORDS[w]);
        consumed[i] = true;
        break;
      }
      if (PREV_WORDS.indexOf(w) >= 0) {
        var nxt = norm[i + 1];
        if (nxt && DAYS[nxt] !== undefined) {
          var diff = ((today.getDay() + 6) % 7 + 1) - DAYS[nxt]; // 1=Mon..7=Sun
          if (diff <= 0) diff += 7;
          dateObj = addDays(today, -diff);
          consumed[i] = consumed[i + 1] = true;
          break;
        }
      }
      if (DAYS[w] !== undefined && !numToken(tokens[i])) {
        var target = DAYS[w];
        var cur = ((today.getDay() + 6) % 7) + 1;
        var back = (cur - target + 7) % 7;
        dateObj = addDays(today, -back);
        consumed[i] = true; break;
      }
    }
    // "12 tarikh" / "12 tareekh"
    if (!dateObj) {
      for (var j = 0; j < norm.length - 1; j++) {
        var nv = numToken(tokens[j]);
        if (nv && !nv.mult && norm[j + 1] && /^(tarikh|tareekh|date|tariq)$/.test(norm[j + 1])) {
          var d = Number(nv.value);
          if (d >= 1 && d <= 31) {
            dateObj = new Date(today.getFullYear(), today.getMonth(), d);
            if (dateObj > today) dateObj = new Date(today.getFullYear(), today.getMonth() - 1, d);
            consumed[j] = consumed[j + 1] = true;
            break;
          }
        }
      }
    }
    if (dateObj) result.date = isoDate(dateObj);

    /* ---- 7b. payment ---- */
    Object.keys(PAY_N).forEach(function (mode) {
      PAY_N[mode].forEach(function (p) {
        for (var k = 0; k < norm.length; k++) {
          if (!consumed[k] && norm[k] === p) {
            result.payment = mode;
            consumed[k] = true;
            return;
          }
        }
      });
    });

    /* ---- 7c. amount ---- */
    var runs = findRun(tokens, consumed);
    var best = null;
    runs.forEach(function (r) {
      if (!r.value) return;
      if (!best) { best = r; return; }
      if (r.currency && !best.currency) { best = r; return; }
      if (r.currency === best.currency && r.value > best.value) best = r;
    });
    if (best) {
      result.amount = Math.round(best.value * 100) / 100;
      for (var b = best.start; b <= best.end; b++) consumed[b] = true;
    }

    /* ---- 7c2. udhaar / loan ---- */
    var isLoan = opts.context === 'udhaar' || hasWord(norm, LOAN_N);
    if (isLoan) {
      var person = extractPerson(tokens, norm, consumed);
      var dir = loanDirection(norm);
      // loan ke verbs/words note me na aayein
      for (var li = 0; li < norm.length; li++) {
        if (consumed[li]) continue;
        if (LOAN_N.indexOf(norm[li]) >= 0 || GIVE_N.indexOf(norm[li]) >= 0 ||
            TAKE_N.indexOf(norm[li]) >= 0 || BACK_N.indexOf(norm[li]) >= 0 ||
            RECV_N.indexOf(norm[li]) >= 0 || PAID_N.indexOf(norm[li]) >= 0) {
          consumed[li] = true;
        }
      }
      result.kind = 'udhaar';
      result.person = capName(person);
      result.loanType = dir;
      result.note = buildNote(tokens, norm, consumed);
      return result;
    }

    /* ---- 7d. category ---- */
    var catScores = {};
    CATS.forEach(function (c) {
      var score = 0;
      c.uniq.forEach(function (p) {
        for (var i2 = 0; i2 < norm.length; i2++) {
          if (consumed[i2] || norm[i2] !== p) continue;
          score += 2;
          consumed[i2] = true;
        }
      });
      if (score) catScores[c.name] = score;
    });

    /* ---- 7e. type ---- */
    var incScore = 0, expScore = 0;
    norm.forEach(function (w, i3) {
      if (consumed[i3]) return;
      if (INCOME_N.indexOf(w) >= 0) { incScore++; consumed[i3] = true; }
      else if (EXPENSE_N.indexOf(w) >= 0) { expScore++; consumed[i3] = true; }
    });

    var bestCat = null, bestScore = 0;
    Object.keys(catScores).forEach(function (name) {
      if (catScores[name] > bestScore) { bestScore = catScores[name]; bestCat = name; }
    });

    if (incScore === 0 && expScore === 0) {
      var bc = bestCat ? catByName(bestCat) : null;
      result.type = bc ? bc.type : 'expense';
    } else {
      result.type = incScore > expScore ? 'income' : 'expense';
    }

    if (bestCat) {
      var cat = catByName(bestCat);
      result.category = (cat && cat.type === result.type) ? bestCat : (result.type === 'income' ? 'Other Income' : 'Other');
    } else {
      result.category = result.type === 'income' ? 'Other Income' : 'Other';
    }

    /* ---- 7f. note (bacha hua text) ---- */
    result.note = buildNote(tokens, norm, consumed);

    return result;
  }

  /* ---------------------------------------------------------
     8. Export
     --------------------------------------------------------- */
  root.HisaabParser = {
    parse: parse,
    tokenize: tokenize,
    normWord: normWord,
    transliterate: transliterate,
    categories: CATS,
    categoriesFor: categoriesFor,
    categoryByName: catByName
  };
})(typeof window !== 'undefined' ? window : this);
