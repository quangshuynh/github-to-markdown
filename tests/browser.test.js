const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const repository = {
  name: "portfolio-lens",
  full_name: "example/portfolio-lens",
  description: "Developer portfolio analyzer with actionable repository guidance",
  html_url: "https://github.com/example/portfolio-lens",
  homepage: "https://example.com",
  language: "JavaScript",
  topics: ["github", "portfolio", "analysis"],
  license: { spdx_id: "MIT" },
  stargazers_count: 5,
  forks_count: 1,
  open_issues_count: 0,
  archived: false,
  fork: false,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  pushed_at: "2026-08-01T00:00:00Z",
};
const secondRepository = {
  ...repository,
  name: "api-toolkit",
  full_name: "example/api-toolkit",
  description: null,
  html_url: "https://github.com/example/api-toolkit",
  language: "Python",
  topics: ["api"],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  pushed_at: "2026-07-01T00:00:00Z",
};
const readme = {
  present: true,
  size: 2200,
  sections: { overview: true, installation: true, usage: true, examples: true, contributing: false },
  hasCodeBlock: true,
  hasImage: true,
  headingCount: 6,
};

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(serveProjectFile);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("profile flow renders verified README details and switches tabs", { skip: !chromePath }, async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await mockGithubRequests(page);

  await page.goto(`${baseUrl}/?user=example`);
  await page.locator("#result-section").waitFor({ state: "visible" });

  assert.match(await page.locator("#status").innerText(), /including 1 profile pins/i);
  assert.match(await page.locator("#profile-insight").innerText(), /Example's portfolio snapshot: 2 public projects/i);
  await page.getByRole("button", { name: /explain the readme quality score/i }).click();
  assert.match(await page.locator("#score-explanation-readme").innerText(), /rounded average of 2 repository README scores/i);
  assert.match(await page.locator("#score-explanation-readme").innerText(), /Every analyzed repository passed/i);
  await page.getByRole("button", { name: /explain the portfolio focus score/i }).click();
  assert.match(await page.locator("#score-explanation-focus").innerText(), /55-point baseline/i);
  await page.getByRole("tab", { name: "Audit" }).click();
  await page.getByText("README checklist").first().waitFor();
  assert.match(await page.locator(".readme-checklist").first().innerText(), /✓ Overview/);
  assert.match(await page.locator(".readme-checklist").first().innerText(), /– Contribution guide/);

  await browser.close();
});

test("mobile layout has no horizontal page overflow", { skip: !chromePath }, async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockGithubRequests(page);

  await page.goto(`${baseUrl}/?user=example`);
  await page.locator("#result-section").waitFor({ state: "visible" });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  assert.ok(dimensions.content <= dimensions.viewport, `page width ${dimensions.content}px exceeds ${dimensions.viewport}px viewport`);
  assert.equal(await page.locator("#generate-button").isVisible(), true);
  assert.equal(await page.locator("#share-button").isVisible(), true);

  await browser.close();
});

test("Markdown export respects compact, pinned-only, and manual selection options", { skip: !chromePath }, async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await mockGithubRequests(page);
  await page.goto(`${baseUrl}/?user=example`);
  await page.locator("#result-section").waitFor({ state: "visible" });

  await page.getByRole("tab", { name: "Markdown export" }).click();
  assert.match(await page.locator("#output").inputValue(), /portfolio-lens/);
  assert.match(await page.locator("#output").inputValue(), /api-toolkit/);
  assert.doesNotMatch(await page.locator("#output").inputValue(), /README is missing|actionable findings/i);
  await page.getByLabel("Full repository details").uncheck();
  assert.doesNotMatch(await page.locator("#output").inputValue(), /primary language:/i);
  await page.getByLabel("Pinned repositories only").check();
  assert.match(await page.locator("#output").inputValue(), /portfolio-lens/);
  assert.doesNotMatch(await page.locator("#output").inputValue(), /api-toolkit/);

  await page.getByLabel("Pinned repositories only").uncheck();
  await page.getByRole("tab", { name: "Repositories" }).click();
  await page.getByLabel("Include api-toolkit in selected exports").uncheck();
  await page.getByRole("tab", { name: "Markdown export" }).click();
  await page.getByLabel("Selected repositories only").check();
  assert.match(await page.locator("#output").inputValue(), /portfolio-lens/);
  assert.doesNotMatch(await page.locator("#output").inputValue(), /api-toolkit/);
  await browser.close();
});

test("empty and nonexistent profiles show useful states", { skip: !chromePath }, async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const emptyPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await mockGithubRequests(emptyPage, []);
  await emptyPage.goto(`${baseUrl}/?user=example`);
  await emptyPage.locator("#result-section").waitFor({ state: "visible" });
  assert.match(await emptyPage.locator("#status").innerText(), /no public repositories/i);
  assert.equal(await emptyPage.locator("#overall-score").innerText(), "0");

  const missingPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await missingPage.route("https://api.github.com/users/missing", (route) => route.fulfill({ status: 404, json: { message: "Not Found" } }));
  await missingPage.goto(`${baseUrl}/?user=missing`);
  await missingPage.locator("#status.error").waitFor();
  assert.match(await missingPage.locator("#status").innerText(), /user not found/i);
  assert.equal(await missingPage.locator("#result-section").isHidden(), true);
  await browser.close();
});

test("sharing uses the dynamic score and opens anonymously from its URL", { skip: !chromePath }, async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const senderContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await senderContext.addInitScript(() => {
    window.__sharedResult = null;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => { window.__sharedResult = data; },
    });
  });
  const sender = await senderContext.newPage();
  const browserErrors = [];
  sender.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  sender.on("pageerror", (error) => browserErrors.push(error.message));
  await mockGithubRequests(sender);
  await sender.goto(`${baseUrl}/?user=example`);
  await sender.locator("#result-section").waitFor({ state: "visible" });
  const score = await sender.locator("#overall-score").innerText();
  await sender.getByRole("button", { name: "Share result" }).click();
  const payload = await sender.evaluate(() => window.__sharedResult);
  assert.match(payload.text, new RegExp(`I got an? ${score}/100`));
  assert.match(payload.text, /user=example/);
  assert.doesNotMatch(payload.text, /token|authorization|github_pat/i);

  const shareUrl = payload.text.match(/https:\/\/\S+$/)[0];
  const recipientContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const recipient = await recipientContext.newPage();
  await mockGithubRequests(recipient);
  await recipient.goto(`${baseUrl}/${new URL(shareUrl).search}`);
  await recipient.locator("#result-section").waitFor({ state: "visible" });
  assert.equal(await recipient.locator("#username").inputValue(), "example");
  assert.equal(await recipient.locator("#overall-score").innerText(), score);

  const downloadPromise = sender.waitForEvent("download");
  await sender.getByRole("button", { name: "Download score card" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "example-gitprofilelens-score.png");

  const fallbackContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await fallbackContext.addInitScript(() => {
    window.__copiedResult = null;
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedResult = text; } },
    });
  });
  const fallbackPage = await fallbackContext.newPage();
  await mockGithubRequests(fallbackPage);
  await fallbackPage.goto(`${baseUrl}/?user=example`);
  await fallbackPage.locator("#result-section").waitFor({ state: "visible" });
  await fallbackPage.getByRole("button", { name: "Share result" }).click();
  assert.match(await fallbackPage.evaluate(() => window.__copiedResult), /user=example/);
  assert.equal(await fallbackPage.locator("#share-button").innerText(), "Copied!");
  await fallbackPage.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("clipboard unavailable"); } },
    });
  });
  await fallbackPage.locator("#share-button").click();
  assert.match(await fallbackPage.locator("#status.error").innerText(), /could not share automatically/i);
  assert.deepEqual(browserErrors, []);
  await browser.close();
});

async function mockGithubRequests(page, repositories = [repository, secondRepository]) {
  await page.route("https://api.github.com/users/example", (route) =>
    route.fulfill({ json: { login: "example", name: "Example User", avatar_url: "", html_url: "https://github.com/example" } })
  );
  await page.route("https://api.github.com/users/example/repos**", (route) =>
    route.fulfill({ json: repositories })
  );
  await page.route("**/api/pinned-repositories?username=example", (route) =>
    route.fulfill({
      json: {
        repositories: repositories.length ? [repository.name] : [],
        readmes: Object.fromEntries(repositories.map((item) => [item.name, readme])),
      },
    })
  );
}

function serveProjectFile(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filename = path.resolve(projectRoot, relativePath);
  if (!filename.startsWith(`${projectRoot}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filename, (error, content) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
    response.setHeader("Content-Type", types[path.extname(filename)] || "application/octet-stream");
    response.end(content);
  });
}
