/*
 * oracle.prop.test.js — Tests de propriétés du cœur PUR de l'Oracle_Board.
 *
 * Feature: oracle-board
 * Logique pure uniquement : aucun DOM, aucune base, aucun réseau. board.js
 * garde tout accès DOM derrière `typeof document !== "undefined"`, donc rien ne
 * s'exécute sous Node au require.
 *
 * Runner : node:test ; PBT : fast-check (>= 100 itérations, ici 200 pour
 * s'aligner sur les autres suites du dépôt).
 *
 * Couvre : Req 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, plus des vérifications concrètes
 * des règles par question (Req 3.1, 3.2, 3.3, 3.4, 3.6).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Board = require("../static/board.js");
const {
  oracleAnswer,
  sanitizeToAnswer,
  stripAccents,
  oldestTask,
  makeRng,
  ANSWER_MAX,
  ANSWER_CHARSET,
  QUESTIONS
} = Board;

// ---------------------------------------------------------------------------
// Générateurs
// ---------------------------------------------------------------------------

// Les quatre Question_Ids connus.
const KNOWN_IDS = ["which-first", "oldest", "count", "quiet"];

// Un titre arbitraire : unicode quelconque, en incluant explicitement des
// chaînes vides et uniquement blanches pour exercer le sanitiseur et le repli.
const titleArb = fc.oneof(
  fc.string(),
  fc.constant(""),
  fc.constant("   "),
  fc.constant("!!! ??? ...")
);

// Un created_at arbitraire : vide (âge inconnu), timestamp SQLite-like, ou
// chaîne quelconque. Le mélange produit des listes « toutes datées », « aucune
// datée » et « partiellement datées ».
const createdAtArb = fc.oneof(
  fc.constant(""),
  fc
    .integer({ min: 946684800000, max: 2082758399000 }) // 2000-01-01 .. 2035-12-31 (ms)
    .map((ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ")),
  fc.string()
);

// Une tâche arbitraire { id, title, created_at }.
const taskArb = fc.record({
  id: fc.integer(),
  title: titleArb,
  created_at: createdAtArb
});

// Une liste de tâches arbitraire (0..12 éléments).
const taskListArb = fc.array(taskArb, { maxLength: 12 });

// Un Question_Id arbitraire : connu OU inconnu (chaîne quelconque).
const questionIdArb = fc.oneof(fc.constantFrom.apply(fc, KNOWN_IDS), fc.string());

// Un temps de référence arbitraire.
const nowArb = fc.oneof(fc.integer(), fc.integer({ min: 0, max: 2082758399000 }));

// ---------------------------------------------------------------------------
// Property 1 — Charset (Req 9.2) : chaque caractère de l'Oracle_Answer
// appartient à l'Answer_Charset (A–Z, 0–9, espace).
// ---------------------------------------------------------------------------
test("Property 1 — chaque caractère de oracleAnswer est dans ANSWER_CHARSET", () => {
  fc.assert(
    fc.property(taskListArb, questionIdArb, nowArb, (tasks, q, now) => {
      const ans = oracleAnswer(tasks, q, now);
      assert.strictEqual(typeof ans, "string");
      for (let i = 0; i < ans.length; i++) {
        const ch = ans.charAt(i);
        assert.ok(
          ANSWER_CHARSET.indexOf(ch) !== -1,
          `"${ch}" (de "${ans}") doit appartenir à ANSWER_CHARSET`
        );
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 2 — Longueur (Req 9.3) : length <= ANSWER_MAX (24).
// ---------------------------------------------------------------------------
test("Property 2 — oracleAnswer a une longueur <= ANSWER_MAX", () => {
  assert.strictEqual(ANSWER_MAX, 24);
  fc.assert(
    fc.property(taskListArb, questionIdArb, nowArb, (tasks, q, now) => {
      const ans = oracleAnswer(tasks, q, now);
      assert.ok(
        ans.length <= ANSWER_MAX,
        `longueur ${ans.length} ("${ans}") doit rester <= ${ANSWER_MAX}`
      );
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 3 — Liste vide (réponses enrichies) : chaque question a son repli
// dédié quand il n'y a aucune tâche.
//   which-first / oldest → "GOODBYE"
//   count                → "NONE"
//   quiet                → "YES"
//   Question_Id inconnu  → règle which-first → "GOODBYE"
// ---------------------------------------------------------------------------
test("Property 3 — liste vide : repli dédié par question", () => {
  assert.strictEqual(oracleAnswer([], "which-first", 0), "GOODBYE");
  assert.strictEqual(oracleAnswer([], "oldest", 0), "GOODBYE");
  assert.strictEqual(oracleAnswer([], "count", 0), "NONE");
  assert.strictEqual(oracleAnswer([], "quiet", 0), "YES");
  // Un Question_Id inconnu suit la règle which-first → "GOODBYE".
  fc.assert(
    fc.property(fc.string(), nowArb, (q, now) => {
      fc.pre(KNOWN_IDS.indexOf(q) === -1);
      assert.strictEqual(oracleAnswer([], q, now), "GOODBYE");
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 4 — Déterminisme (Req 9.5) : deux appels avec des arguments
// structurellement égaux renvoient des chaînes strictement égales.
// ---------------------------------------------------------------------------
test("Property 4 — oracleAnswer est déterministe (mêmes arguments → même answer)", () => {
  fc.assert(
    fc.property(taskListArb, questionIdArb, nowArb, (tasks, q, now) => {
      const a = oracleAnswer(tasks, q, now);
      const b = oracleAnswer(tasks, q, now);
      assert.strictEqual(a, b, `attendu identique, obtenu "${a}" vs "${b}"`);
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 5 — Vérifications concrètes par règle (réponses enrichies).
//   which-first → "FIRST " + nom de la plus ancienne tâche, tronqué
//   oldest      → "OLDEST " + nom de la plus ancienne tâche, tronqué
//   count       → N + " SPIRIT"/" SPIRITS", "NONE" si 0
//   quiet       → "YES" si vide, sinon "NO"
// ---------------------------------------------------------------------------

// 5a. count (liste non vide) → N + " SPIRIT" (N==1) / " SPIRITS" (N>=2).
test('Property 5a — "count" renvoie N + " SPIRIT(S)" (liste non vide)', () => {
  fc.assert(
    fc.property(taskListArb, nowArb, (tasks, now) => {
      fc.pre(tasks.length > 0);
      const n = tasks.length;
      const expected = String(n) + (n === 1 ? " SPIRIT" : " SPIRITS");
      assert.strictEqual(oracleAnswer(tasks, "count", now), expected);
    }),
    { numRuns: 200 }
  );
  // Cas concrets pour la frontière singulier/pluriel.
  assert.strictEqual(oracleAnswer([{ id: 1, title: "x", created_at: "" }], "count", 0), "1 SPIRIT");
  assert.strictEqual(
    oracleAnswer(
      [{ id: 2, title: "x", created_at: "" }, { id: 1, title: "y", created_at: "" }],
      "count",
      0
    ),
    "2 SPIRITS"
  );
});

// 5b. quiet → "YES" si la liste est vide, sinon "NO".
test('Property 5b — "quiet" : "YES" si vide, sinon "NO"', () => {
  assert.strictEqual(oracleAnswer([], "quiet", 0), "YES");
  fc.assert(
    fc.property(taskListArb, nowArb, (tasks, now) => {
      const expected = tasks.length === 0 ? "YES" : "NO";
      assert.strictEqual(oracleAnswer(tasks, "quiet", now), expected);
    }),
    { numRuns: 200 }
  );
});

// 5c. which-first (liste non vide) → "FIRST " + nom de la PLUS ANCIENNE tâche,
//     normalisé puis tronqué pour que le tout tienne sous ANSWER_MAX.
test('Property 5c — "which-first" = "FIRST " + nom de la plus ancienne (tronqué)', () => {
  fc.assert(
    fc.property(taskListArb, nowArb, (tasks, now) => {
      fc.pre(tasks.length > 0);
      const old = oldestTask(tasks);
      const expected = "FIRST " + sanitizeToAnswer(old.title, ANSWER_MAX - 6);
      assert.strictEqual(oracleAnswer(tasks, "which-first", now), expected);
    }),
    { numRuns: 200 }
  );
  // Concret : la plus ancienne (created_at min) est choisie, pas list[0].
  const dated = [
    { id: 3, title: "Recent Ghost", created_at: "2003-01-01 00:00:00" },
    { id: 1, title: "Ancient Ghost", created_at: "2001-01-01 00:00:00" }
  ];
  assert.strictEqual(oracleAnswer(dated, "which-first", 0), "FIRST ANCIENT GHOST");
});

// 5d. oldest : plus petit created_at ; sinon dernier élément. Préfixe "OLDEST ".
test('Property 5d — "oldest" = "OLDEST " + plus ancienne, sinon dernier', () => {
  const dated = [
    { id: 3, title: "Recent Ghost", created_at: "2003-01-01 00:00:00" },
    { id: 2, title: "Middle Ghost", created_at: "2002-01-01 00:00:00" },
    { id: 1, title: "Ancient Ghost", created_at: "2001-01-01 00:00:00" }
  ];
  assert.strictEqual(oracleAnswer(dated, "oldest", 0), "OLDEST ANCIENT GHOST");

  // Aucun daté (tous "") : repli sur le dernier élément (ordre id DESC serveur).
  const undated = [
    { id: 3, title: "Newest", created_at: "" },
    { id: 2, title: "Middle", created_at: "" },
    { id: 1, title: "Last One", created_at: "" }
  ];
  assert.strictEqual(oracleAnswer(undated, "oldest", 0), "OLDEST LAST ONE");

  // Partiellement daté : repli sur le dernier élément.
  const partial = [
    { id: 2, title: "Has Date", created_at: "2002-01-01 00:00:00" },
    { id: 1, title: "No Date Last", created_at: "" }
  ];
  assert.strictEqual(oracleAnswer(partial, "oldest", 0), "OLDEST NO DATE LAST");
});

// 5g. Troncature : un nom très long est coupé pour que le résultat PRÉFIXÉ
//     reste <= ANSWER_MAX (24). "FIRST " = 6 → nom max 18 ; "OLDEST " = 7 → 17.
test("Property 5g — troncature : résultat préfixé toujours <= ANSWER_MAX", () => {
  const longTitle = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // 36 chars, tout charset
  const list = [{ id: 1, title: longTitle, created_at: "" }];

  const first = oracleAnswer(list, "which-first", 0);
  assert.ok(first.length <= ANSWER_MAX, `"${first}" (${first.length}) <= ${ANSWER_MAX}`);
  assert.strictEqual(first, "FIRST " + longTitle.slice(0, ANSWER_MAX - 6)); // 18 chars de nom

  const oldest = oracleAnswer(list, "oldest", 0);
  assert.ok(oldest.length <= ANSWER_MAX, `"${oldest}" (${oldest.length}) <= ${ANSWER_MAX}`);
  assert.strictEqual(oldest, "OLDEST " + longTitle.slice(0, ANSWER_MAX - 7)); // 17 chars de nom
});

// 5h. Accents : les diacritiques sont dépouillés (é→E, ñ→N, ü→U) et le reste
//     normalisé. "Café Fantôme" → "CAFE FANTOME".
test("Property 5h — stripAccents / sanitizeToAnswer : accents retirés", () => {
  assert.strictEqual(stripAccents("Café Fantôme"), "Cafe Fantome");
  assert.strictEqual(sanitizeToAnswer("Café Fantôme"), "CAFE FANTOME");
  assert.strictEqual(sanitizeToAnswer("Ñoño Über"), "NONO UBER");
  // Via oracleAnswer (which-first) : préfixe + nom sans accents.
  assert.strictEqual(
    oracleAnswer([{ id: 1, title: "Café Fantôme", created_at: "" }], "which-first", 0),
    "FIRST CAFE FANTOME"
  );
});

// 5e. oldestTask : égalité de created_at → le plus petit id est le plus ancien.
test("Property 5e — oldestTask : à created_at égal, le plus petit id est le plus ancien", () => {
  const ts = "2020-06-15 12:00:00";
  const tie = [
    { id: 9, title: "Nine", created_at: ts },
    { id: 4, title: "Four", created_at: ts },
    { id: 7, title: "Seven", created_at: ts }
  ];
  const oldest = oldestTask(tie);
  assert.strictEqual(oldest.id, 4, "le plus petit id doit être le plus ancien à timestamp égal");

  // Garde défensive : entrée non tableau / vide → undefined.
  assert.strictEqual(oldestTask([]), undefined);
  assert.strictEqual(oldestTask(null), undefined);
  assert.strictEqual(oldestTask(undefined), undefined);
});

// 5f. sanitizeToAnswer d'un titre uniquement ponctuation → "A SPIRIT" (repli).
test('Property 5f — sanitizeToAnswer d\'un titre ponctuation-only → "A SPIRIT"', () => {
  assert.strictEqual(sanitizeToAnswer("!!! ??? ..."), "A SPIRIT");
  assert.strictEqual(sanitizeToAnswer(""), "A SPIRIT");
  assert.strictEqual(sanitizeToAnswer("   "), "A SPIRIT");
  // Et via oracleAnswer (which-first) sur un titre ponctuation-only :
  // préfixe "FIRST " + le repli "A SPIRIT".
  assert.strictEqual(
    oracleAnswer([{ id: 1, title: "***", created_at: "" }], "which-first", 0),
    "FIRST A SPIRIT"
  );
});

// ---------------------------------------------------------------------------
// Property 6 — Totalité : oracleAnswer ne lève JAMAIS pour une entrée arbitraire
// (y compris tasks non tableau et Question_Id inconnu). Implicitement couvert
// par 1–2, mais vérifié explicitement ici.
// ---------------------------------------------------------------------------
test("Property 6 — oracleAnswer ne lève jamais (totalité)", () => {
  const weirdTasks = fc.oneof(
    taskListArb,
    fc.constant(null),
    fc.constant(undefined),
    fc.string(),
    fc.integer(),
    fc.object()
  );
  fc.assert(
    fc.property(weirdTasks, questionIdArb, nowArb, (tasks, q, now) => {
      const ans = oracleAnswer(tasks, q, now);
      assert.strictEqual(typeof ans, "string");
      assert.ok(ans.length <= ANSWER_MAX);
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Cas concrets (style du dépôt) : table QUESTIONS et déterminisme de makeRng.
// ---------------------------------------------------------------------------

// QUESTIONS possède exactement les quatre clés attendues → libellés anglais.
test("QUESTIONS mappe les quatre Question_Ids aux libellés anglais exacts", () => {
  assert.deepStrictEqual(Object.keys(QUESTIONS).sort(), KNOWN_IDS.slice().sort());
  assert.strictEqual(QUESTIONS["which-first"], "Which first?");
  assert.strictEqual(QUESTIONS["oldest"], "What is oldest?");
  assert.strictEqual(QUESTIONS["count"], "How many spirits?");
  assert.strictEqual(QUESTIONS["quiet"], "Is it quiet?");
});

// makeRng(seed) est déterministe : deux générateurs de même graine produisent
// la même suite, toutes les valeurs dans [0,1).
test("makeRng(seed) est déterministe et borné dans [0,1)", () => {
  fc.assert(
    fc.property(fc.integer(), (seed) => {
      const r1 = makeRng(seed);
      const r2 = makeRng(seed);
      for (let i = 0; i < 16; i++) {
        const a = r1();
        const b = r2();
        assert.strictEqual(a, b, "même graine → même suite");
        assert.ok(a >= 0 && a < 1, `valeur ${a} doit être dans [0,1)`);
      }
    }),
    { numRuns: 200 }
  );
});
