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
  assert.match(await page.locator("#profile-insight").innerText(), /Example's portfolio snapshot: 1 public project/i);
  await page.getByRole("tab", { name: "Audit" }).click();
  await page.getByText("README checklist").waitFor();
  assert.match(await page.locator(".readme-checklist").innerText(), /✓ Overview/);
  assert.match(await page.locator(".readme-checklist").innerText(), /– Contribution guide/);

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

async function mockGithubRequests(page) {
  await page.route("https://api.github.com/users/example", (route) =>
    route.fulfill({ json: { login: "example", name: "Example User", avatar_url: "", html_url: "https://github.com/example" } })
  );
  await page.route("https://api.github.com/users/example/repos**", (route) =>
    route.fulfill({ json: [repository] })
  );
  await page.route("**/api/pinned-repositories?username=example", (route) =>
    route.fulfill({ json: { repositories: [repository.name], readmes: { [repository.name]: readme } } })
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
