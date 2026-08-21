const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/pinned-repositories.js");

/**
 * creates a mock vercel response and observable result
 * @returns {{response: Object, result: Object}} response mock and captured result
 */
function createResponse() {
  const result = { status: null, body: null, headers: {} };
  const response = {
    setHeader(name, value) { result.headers[name] = value; },
    status(statusCode) { result.status = statusCode; return response; },
    json(body) { result.body = body; },
  };
  return { response, result };
}

test("serverless metadata endpoint validates usernames", async () => {
  const { response, result } = createResponse();
  await handler({ method: "GET", query: { username: "bad username" } }, response);
  assert.equal(result.status, 400);
});

test("serverless metadata endpoint transforms pins and README blobs", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        user: {
          pinnedItems: { nodes: [{ name: "portfolio" }] },
          repositories: {
            nodes: [
              { name: "portfolio", readmeMarkdown: { byteSize: 1800 }, readmeUppercase: null, readmeLowercase: null },
              { name: "empty", readmeMarkdown: null, readmeUppercase: null, readmeLowercase: null },
            ],
          },
        },
      },
    }),
  });
  const { response, result } = createResponse();

  try {
    await handler({ method: "GET", query: { username: "example" } }, response);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.repositories, ["portfolio"]);
    assert.deepEqual(result.body.readmes.portfolio, { present: true, size: 1800 });
    assert.deepEqual(result.body.readmes.empty, { present: false, size: null });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
