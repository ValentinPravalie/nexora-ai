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
  assert.ok(html.includes('href="/about.html"'));
  assert.ok(html.includes('href="/contact.html"'));
  assert.ok(html.includes('href="/privacy.html"'));
  assert.ok(about.includes("Despre ELVORAQ AI"));
  assert.ok(contact.includes("Contact"));
  assert.ok(privacy.includes("Politica de confidențialitate"));
  for (const [page, path] of [[html, "/"], [about, "/about.html"], [contact, "/contact.html"], [privacy, "/privacy.html"]]) {
    assert.ok(page.includes('rel="canonical" href="https://elvoraq-ai.vercel.app' + path + '"'));
  }
  assert.ok(robots.includes("Sitemap: https://elvoraq-ai.vercel.app/sitemap.xml"));
  assert.ok(sitemap.includes("https://elvoraq-ai.vercel.app/"));
  assert.ok(ads.includes("google.com, pub-8165826899810634, DIRECT"));
  assert.ok(config.includes("pagead2.googlesyndication.com"));
});
