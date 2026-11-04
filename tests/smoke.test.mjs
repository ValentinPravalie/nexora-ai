import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("browser bundle does not contain a server API key", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.doesNotMatch(html + app, /OPENAI_API_KEY|sk-[A-Za-z0-9]{20,}/);
});

test("chat endpoint authenticates users and keeps model selection server-side", async () => {
  const source = await read("api/chat.js");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /gpt-6-astra/);
  assert.match(source, /gpt-6\.1-terra/);
  assert.match(source, /stream:\s*req\.body\?\.\s*stream/);
});

test("UI renders message text safely and exposes conversation controls", async () => {
  const source = await read("app.js");
  assert.match(source, /function renderMarkdown/);
  assert.match(source, /function copyText/);
  assert.match(source, /function editMessage/);
  assert.match(source, /function regenerateLast/);
  assert.match(source, /function archiveChat/);
  assert.match(source, /historySearch/);
});

test("realtime voice uses a short-lived token endpoint", async () => {
  const [app, endpoint] = await Promise.all([read("app.js"), read("api/realtime-token.js")]);
  assert.match(app, /\/api\/realtime-token/);
  assert.match(endpoint, /realtime\/client_secrets/);
  assert.match(endpoint, /authenticateRequest/);
});
