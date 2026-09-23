import assert from "node:assert/strict";
import fs from "node:fs";
import { parseEnv } from "node:util";
import "./ts-loader.mjs";

const { emptyContent, cardResponseSchema, questionsResponseSchema } = await import("../src/lib/contracts.ts");
const { qualityReviewSchema } = await import("../src/lib/quality-contracts.ts");
const local = fs.existsSync(".env.local") ? parseEnv(fs.readFileSync(".env.local", "utf8")) : {};
const env = { ...local, ...process.env };
const expectArg = process.argv.find((arg) => arg.startsWith("--expect="));
const expectedSource = expectArg?.slice(9) || "ai";
assert.ok(["ai", "fallback"].includes(expectedSource), "Use --expect=ai or --expect=fallback");
const base = (env.CHECK_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function request(path, body) {
  const headers = { "Content-Type": "application/json" };
  const response = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response.json();
}

const rawText = "В учебной библиотеке наставники ищут материалы по нескольким папкам. Нужен поиск по названию и теме.";
const content = { ...emptyContent(), title: "Поиск материалов", context: "Наставники ищут материалы по нескольким папкам.", need: "Нужен поиск по названию и теме." };
const questions = questionsResponseSchema.parse(await request("/api/ai/questions", { rawText, industry: "Образование", content }));
assert.equal(questions.source, expectedSource, "Questions used unexpected source");
assert.ok(questions.questions.length >= 3 && questions.questions.length <= 5);
assert.equal(new Set(questions.questions.map((q) => q.id)).size, questions.questions.length);

const card = cardResponseSchema.parse(await request("/api/ai/card", { rawText, industry: "Образование", content, questions: questions.questions, answers: {} }));
assert.equal(card.source, expectedSource, "Card used unexpected source");
for (const field of ["deadline", "contact", "successTarget", "dataAccess", "constraints"]) {
  assert.equal(card.content[field], "", `Card invented ${field}`);
}
assert.ok(card.content.context.includes("Наставники") || card.content.context.includes("наставники"), "Card lost supplied context");

const poor = { ...emptyContent(), title: "Тест", context: "asdf asdf asdf", need: "???", users: "12345", dataDescription: "test test test", contact: "not-an-email" };
const review = qualityReviewSchema.parse(await request("/api/ai/quality", { content: poor, industry: "Образование" }));
assert.equal(review.source, expectedSource, "Quality review used unexpected source");
for (const field of ["context", "need", "users", "dataDescription", "contact"]) {
  assert.equal(review.fields.find((item) => item.field === field)?.accepted, false, `Poor ${field} was accepted`);
}
console.log(JSON.stringify({ source: expectedSource, questionCount: questions.questions.length, unknownCardFieldsBlank: 5, poorFieldsRejected: 5, qualityVersion: review.version }));
