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
// Property 3 — Liste vide (Req 9.4) : pour tasks = [] et TOUT Question_Id
// (connu comme inconnu), l'answer est exactement "GOODBYE".
// ---------------------------------------------------------------------------
test('Property 3 — liste vide → "GOODBYE" pour tout Question_Id', () => {
  // Ids connus : vérification exhaustive directe.
  KNOWN_IDS.forEach((id) => {
    assert.strictEqual(oracleAnswer([], id, 0), "GOODBYE", `vide + ${id}`);
  });
  // Ids arbitraires (y compris inconnus) + now arbitraire.
  fc.assert(
    fc.property(questionIdArb, nowArb, (q, now) => {
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
// Property 5 — Vérifications concrètes par règle (Req 3.1, 3.2, 3.3, 3.4, 3.6).
// ---------------------------------------------------------------------------

// 5a. count → String(list.length) pour une liste NON vide (Req 3.3).
test('Property 5a — "count" renvoie String(list.length) (liste non vide)', () => {
  fc.assert(
    fc.property(taskListArb, nowArb, (tasks, now) => {
      fc.pre(tasks.length > 0);
      assert.strictEqual(oracleAnswer(tasks, "count", now), String(tasks.length));
    }),
    { numRuns: 200 }
  );
});

// 5b. quiet → "NO" pour une liste non vide (Req 3.4).
// Note : la liste vide donne "GOODBYE" (la règle 1 l'emporte sur quiet, voir
// design.md), donc on ne teste "quiet" QUE sur des listes non vides.
test('Property 5b — "quiet" renvoie "NO" (liste non vide)', () => {
  fc.assert(
    fc.property(taskListArb, nowArb, (tasks, now) => {
      fc.pre(tasks.length > 0);
      assert.strictEqual(oracleAnswer(tasks, "quiet", now), "NO");
    }),
    { numRuns: 200 }
  );
});

// 5c. which-first dérive de list[0].title (Req 3.1).
test('Property 5c — "which-first" dérive de sanitizeToAnswer(list[0].title)', () => {
  fc.assert(
    fc.property(taskListArb, nowArb, (tasks, now) => {
      fc.pre(tasks.length > 0);
      assert.strictEqual(
        oracleAnswer(tasks, "which-first", now),
        sanitizeToAnswer(tasks[0].title)
      );
    }),
    { numRuns: 200 }
  );
});

// 5d. oldest : avec timestamps explicites → plus petit created_at ;
//     sans timestamps (tous "") → dernier élément. Listes concrètes fixes.
test('Property 5d — "oldest" choisit le plus petit created_at, sinon le dernier', () => {
  // Tous datés : le plus petit created_at (2001-...) gagne.
  const dated = [
    { id: 3, title: "Recent Ghost", created_at: "2003-01-01 00:00:00" },
    { id: 2, title: "Middle Ghost", created_at: "2002-01-01 00:00:00" },
    { id: 1, title: "Ancient Ghost", created_at: "2001-01-01 00:00:00" }
  ];
  assert.strictEqual(oracleAnswer(dated, "oldest", 0), sanitizeToAnswer("Ancient Ghost"));
  assert.strictEqual(oracleAnswer(dated, "oldest", 0), "ANCIENT GHOST");

  // Aucun daté (tous "") : repli sur le dernier élément (ordre id DESC serveur).
  const undated = [
    { id: 3, title: "Newest", created_at: "" },
    { id: 2, title: "Middle", created_at: "" },
    { id: 1, title: "Oldest By Order", created_at: "" }
  ];
  assert.strictEqual(oracleAnswer(undated, "oldest", 0), sanitizeToAnswer("Oldest By Order"));
  assert.strictEqual(oracleAnswer(undated, "oldest", 0), "OLDEST BY ORDER");

  // Partiellement daté (un created_at manquant) : repli sur le dernier élément.
  const partial = [
    { id: 2, title: "Has Date", created_at: "2002-01-01 00:00:00" },
    { id: 1, title: "No Date Last", created_at: "" }
  ];
  assert.strictEqual(oracleAnswer(partial, "oldest", 0), "NO DATE LAST");
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

// 5f. sanitizeToAnswer d'un titre uniquement ponctuation → "A SPIRIT" (Req 3.6).
test('Property 5f — sanitizeToAnswer d\'un titre ponctuation-only → "A SPIRIT"', () => {
  assert.strictEqual(sanitizeToAnswer("!!! ??? ..."), "A SPIRIT");
  assert.strictEqual(sanitizeToAnswer(""), "A SPIRIT");
  assert.strictEqual(sanitizeToAnswer("   "), "A SPIRIT");
  // Et via oracleAnswer (which-first) sur un titre ponctuation-only.
  assert.strictEqual(
    oracleAnswer([{ id: 1, title: "***", created_at: "" }], "which-first", 0),
    "A SPIRIT"
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
