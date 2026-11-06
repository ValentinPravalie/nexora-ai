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

test("transcription accepts browser audio containers with codec parameters", async () => {
  const source = await read("api/transcribe.js");
  assert.match(source, /rawMime\.split\(";"\)\[0\]/);
  assert.match(source, /"audio\/webm", "audio\/ogg"/);
});

test("chat API exposes a dedicated Code Engineer mode", async () => {
  const source = await read("api/chat.js");
  assert.match(source, /"code-engineer"/);
  assert.match(source, /MOD CODE ENGINEER/);
});
test("workspace and memory controls are available in the website UI", async () => {
  const html = await read("index.html");
  const app = await read("app.js");
  assert.match(html, /id="workspaceSelect"/);
  assert.match(html, /id="workspaceAdd"/);
  assert.match(app, /elvoraq_chat_workspaces_/);
  assert.match(app, /elvoraq_memory_/);
});


test("public information and AdSense configuration use the registered domain", async () => {
  const [html, about, contact, privacy, robots, sitemap, ads, config] = await Promise.all([
    read("index.html"), read("about.html"), read("contact.html"), read("privacy.html"),
    read("robots.txt"), read("sitemap.xml"), read("ads.txt"), read("vercel.json")
  ]);
  assert.match(html, /href="\\/about\\.html"/);
  assert.match(html, /href="\\/contact\\.html"/);
  assert.match(html, /href="\\/privacy\\.html"/);
  assert.match(about, /Despre ELVORAQ AI/);
  assert.match(contact, /Contact/);
  assert.match(privacy, /Politica de confidențialitate/);
  assert.match(html, /rel="canonical" href="https:\\/\\/elvoraq-ai\\.vercel\\.app\\/"/);
  assert.match(about, /rel="canonical" href="https:\\/\\/elvoraq-ai\\.vercel\\.app\\/about\\.html"/);
  assert.match(contact, /rel="canonical" href="https:\\/\\/elvoraq-ai\\.vercel\\.app\\/contact\\.html"/);
  assert.match(privacy, /rel="canonical" href="https:\\/\\/elvoraq-ai\\.vercel\\.app\\/privacy\\.html"/);
  assert.match(robots, /Sitemap: https:\\/\\/elvoraq-ai\\.vercel\\.app\\/sitemap\\.xml/);
  assert.match(sitemap, /https:\\/\\/elvoraq-ai\\.vercel\\.app\\//);
  assert.match(ads, /google\\.com, pub-8165826899810634, DIRECT/);
  assert.match(config, /pagead\\.googlesyndication\\.com/);
});
