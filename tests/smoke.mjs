// Smoke test for the game. No real camera or hand is needed: the hand tracker is replaced by
// a scripted hand that sweeps the screen, and the camera is a fake feed.
//
// Run from the repo folder:
//   npm i --no-save playwright && npx playwright install chromium
//   node tests/smoke.mjs
//
// It takes about a minute. Exit code 0 means every check passed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACKER = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };

// scripted hand: a pinch (thumb tip 4 and index tip 8) moving in a loop across the frame
const STUB = `
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const HandLandmarker = { createFromOptions: async () => ({ detectForVideo: (v, now) => {
  const t = now / 1000, cx = 0.5 + 0.38 * Math.sin(t * 1.9), cy = 0.5 + 0.32 * Math.sin(t * 2.7 + 1);
  const p = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  p[0] = { x: cx, y: cy + 0.18, z: 0 }; p[9] = { x: cx, y: cy + 0.04, z: 0 };
  p[5] = { x: cx - 0.02, y: cy + 0.03, z: 0 }; p[17] = { x: cx + 0.05, y: cy + 0.06, z: 0 };
  p[4] = { x: cx - 0.015, y: cy, z: 0 }; p[8] = { x: cx + 0.015, y: cy - 0.01, z: 0 };
  return { landmarks: [p] };
} }) };`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
}

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, permissions: ["camera"] });
  await ctx.route(TRACKER, (r) => r.fulfill({ contentType: "text/javascript", body: STUB }));
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(r.status() + " " + r.url()); });
  await page.goto(base);
  return { ctx, page, problems };
}
const read = (page) => page.evaluate(() => ({
  score: Number(document.getElementById("scoreVal").textContent),
  time: document.getElementById("timeVal").textContent,
  paused: document.getElementById("pauseMenu").classList.contains("show"),
  hud: getComputedStyle(document.getElementById("hud")).display,
  overlay: getComputedStyle(document.getElementById("overlay")).display,
}));

// ---- Levels mode, pause menu ----
{
  const { ctx, page, problems } = await open();
  const title = await page.evaluate(() => ({ tab: document.title, h1: document.querySelector("#overlay h1").innerText.replace(/\s+/g, " ") }));
  check("start screen: the title says Motion Mosquito Zapper", title.h1 === "MOTION MOSQUITO ZAPPER" && title.tab.startsWith("Motion Mosquito Zapper"), title.h1);
  await page.click("#startBtn");
  await page.waitForFunction(() => Number(document.getElementById("scoreVal").textContent) > 0, null, { timeout: 40000 });
  check("levels: starts and the scripted hand zaps a mosquito", true);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const a = await read(page);
  await page.waitForTimeout(2000);
  const b = await read(page);
  check("pause: Esc opens the menu", a.paused);
  check("pause: the score stays frozen", a.score === b.score, `${a.score} then ${b.score}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("pause: Esc again resumes", !(await read(page)).paused);

  await page.click("#pauseBtn");
  await page.waitForTimeout(200);
  check("pause: the button opens the menu", (await read(page)).paused);
  await page.click("#pmRestart");
  await page.waitForTimeout(300);
  const r = await read(page);
  check("pause: Restart clears the score and resumes", r.score < 500 && !r.paused, `score ${r.score}`);

  await page.keyboard.press("p");
  await page.waitForTimeout(200);
  await page.click("#pmMenu");
  await page.waitForTimeout(400);
  const m = await read(page);
  check("pause: Menu returns to the start screen", m.overlay === "flex" && m.hud === "none");
  check("levels: no page errors or missing files", problems.length === 0, problems.join(" | "));
  await ctx.close();
}

// ---- 30 seconds mode ----
{
  const { ctx, page, problems } = await open();
  await page.click('.mode[data-mode="time"]');
  await page.click("#startBtn");
  await page.waitForFunction(() => document.getElementById("timeUp").classList.contains("show"), null, { timeout: 60000 });
  const t = await page.evaluate(() => ({
    score: Number(document.getElementById("tuScore").textContent),
    bests: JSON.parse(localStorage.getItem("mzap.bests.v1") || "{}"),
  }));
  check("time: the round ends on the Time Up screen", true);
  check("time: the score is shown and saved as a best", t.score > 0 && t.bests.time === t.score, `score ${t.score}`);
  check("time: no page errors or missing files", problems.length === 0, problems.join(" | "));
  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
