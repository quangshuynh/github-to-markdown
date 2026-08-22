const test = require("node:test");
const assert = require("node:assert/strict");
const { buildScoreCardData, buildShareText, buildShareUrl } = require("../share.js");

test("share URLs use the analyzed username and encode it safely", () => {
  assert.equal(buildShareUrl("quangshuynh"), "https://gitprofilelens.vercel.app/?user=quangshuynh");
  assert.equal(buildShareUrl(" octo-cat "), "https://gitprofilelens.vercel.app/?user=octo-cat");
  assert.equal(buildShareUrl("name with space"), "https://gitprofilelens.vercel.app/?user=name+with+space");
});

test("share text uses the analyzed username and actual score", () => {
  assert.equal(buildShareText("quangshuynh", 89), "I got an 89/100 on GitProfileLens. What's your score? https://gitprofilelens.vercel.app/?user=quangshuynh");
  assert.match(buildShareText("another-user", 74), /74\/100.*user=another-user/);
  assert.doesNotMatch(buildShareText("another-user", 74), /89\/100|quangshuynh/);
});

test("score card data derives dynamic strongest and improvement categories", () => {
  const data = buildScoreCardData("another-user", {
    overall: 74,
    categories: { presentation: 90, descriptions: 80, readme: 55, discoverability: 72, maintenance: 88, focus: 65 },
  });
  assert.deepEqual(data, {
    username: "@another-user",
    score: 74,
    strongest: "Repository presentation: 90/100",
    improvement: "README quality: 55/100",
    productUrl: "gitprofilelens.vercel.app",
  });
});
