const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateRecommendations,
  parseUsernameFromSearch,
  scoreDescription,
  scoreProfile,
  scoreRepository,
  transformRepository,
} = require("../audit.js");

/**
 * creates representative github repository response data for tests
 * @param {Object} overrides repository properties to override
 * @returns {Object} github repository response fixture
 */
function createRepository(overrides = {}) {
  return {
    name: "transaction-validator",
    full_name: "example/transaction-validator",
    description: "FastAPI service that validates transaction data using PostgreSQL",
    html_url: "https://github.com/example/transaction-validator",
    homepage: "https://example.com",
    language: "Python",
    topics: ["fastapi", "postgresql", "validation"],
    license: { spdx_id: "MIT" },
    stargazers_count: 4,
    forks_count: 1,
    open_issues_count: 0,
    archived: false,
    fork: false,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    pushed_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

test("strong descriptions score highly while vague descriptions explain what is missing", () => {
  const strong = scoreDescription("FastAPI service that validates transaction data using PostgreSQL");
  const vague = scoreDescription("Python project");

  assert.equal(strong.score, 100);
  assert.ok(vague.score < 70);
  assert.match(vague.findings[0].action, /problem solved|key behavior/i);
});

test("repository transformation preserves factual metadata and supplemental readme state", () => {
  const transformed = transformRepository(createRepository(), {
    pinnedRepositories: ["transaction-validator"],
    readmes: { "transaction-validator": { present: true, size: 1800 } },
  });

  assert.equal(transformed.pinned, true);
  assert.equal(transformed.readme.present, true);
  assert.equal(transformed.readme.size, 1800);
  assert.deepEqual(transformed.topics, ["fastapi", "postgresql", "validation"]);
});

test("repository scoring identifies missing presentation fundamentals", () => {
  const repository = transformRepository(createRepository({
    name: "test",
    description: null,
    homepage: null,
    topics: [],
    license: null,
    pushed_at: "2020-01-01T00:00:00Z",
  }), {
    pinnedRepositories: [],
    readmes: { test: { present: false, size: null } },
  });
  const audit = scoreRepository(repository, new Date("2026-08-21T00:00:00Z"));

  assert.ok(audit.score < 40);
  assert.ok(audit.findings.some((finding) => /no root README/i.test(finding.reason)));
  assert.ok(audit.findings.some((finding) => /too generic/i.test(finding.reason)));
});

test("profile recommendations rank widespread high-severity issues", () => {
  const missingReadme = transformRepository(createRepository({ name: "one" }), {
    pinnedRepositories: [],
    readmes: { one: { present: false, size: null } },
  });
  const missingDescription = transformRepository(createRepository({ name: "two", description: null }), {
    pinnedRepositories: [],
    readmes: { two: { present: false, size: null } },
  });
  const audits = [missingReadme, missingDescription].map((repository) =>
    scoreRepository(repository, new Date("2026-08-21T00:00:00Z"))
  );
  const profile = scoreProfile(audits);
  const recommendations = generateRecommendations(audits);

  assert.ok(profile.overall >= 0 && profile.overall <= 100);
  assert.equal(recommendations[0].severity, "high");
  assert.ok(recommendations.some((recommendation) => recommendation.repositories.length === 2));
});

test("portfolio recommendations suggest strong unpinned repositories when pin data is known", () => {
  const repository = transformRepository(createRepository(), {
    pinnedRepositories: [],
    readmes: { "transaction-validator": { present: true, size: 1800 } },
  });
  const recommendations = generateRecommendations([
    scoreRepository(repository, new Date("2026-08-21T00:00:00Z")),
  ]);

  assert.ok(recommendations.some((recommendation) => /pinning/i.test(recommendation.action)));
});

test("URL username parsing accepts share links and rejects malformed usernames", () => {
  assert.equal(parseUsernameFromSearch("?user=quangshuynh"), "quangshuynh");
  assert.equal(parseUsernameFromSearch("?user=bad--name-"), null);
  assert.equal(parseUsernameFromSearch("?other=value"), null);
});

test("empty profiles return a zero presentation score without throwing", () => {
  assert.deepEqual(scoreProfile([]), {
    overall: 0,
    categories: {
      presentation: 0,
      descriptions: 0,
      readme: 0,
      discoverability: 0,
      maintenance: 0,
      focus: 0,
    },
  });
});
