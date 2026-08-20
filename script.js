const form = document.querySelector("#github-form");
const usernameInput = document.querySelector("#username");
const generateButton = document.querySelector("#generate-button");
const statusEl = document.querySelector("#status");
const resultSection = document.querySelector("#result-section");
const output = document.querySelector("#output");
const copyButton = document.querySelector("#copy-button");
const downloadButton = document.querySelector("#download-button");
const auditSection = document.querySelector("#audit-section");
const auditSummary = document.querySelector("#audit-summary");
const auditList = document.querySelector("#audit-list");

let currentUsername = "";

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();

  if (!username) {
    showError("Enter a GitHub username.");
    return;
  }

  setLoading(true);
  resultSection.hidden = true;
  auditSection.hidden = true;
  statusEl.classList.remove("error");
  statusEl.textContent = `Loading @${username}...`;

  try {
    const user = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(username)}`
    );

    const repositories = await fetchAllRepositories(username);

    currentUsername = user.login;
    output.value = createMarkdown(user.login, repositories);
    renderAudits(repositories);
    resultSection.hidden = false;
    auditSection.hidden = false;

    statusEl.textContent =
      `Found ${repositories.length} public repositories for @${user.login}.`;
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);

    const original = copyButton.textContent;
    copyButton.textContent = "Copied!";

    setTimeout(() => {
      copyButton.textContent = original;
    }, 1200);
  } catch {
    showError(
      "Could not copy automatically. Select the Markdown and copy it manually."
    );
  }
});

downloadButton.addEventListener("click", () => {
  if (!output.value) return;

  const blob = new Blob([output.value], {
    type: "text/markdown;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${currentUsername || "github-user"}-repositories.md`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
});

/**
 * fetches all public repositories owned by a github user
 * @param {string} username github username
 * @returns {Promise<Array>} public repositories belonging to the user
 */
async function fetchAllRepositories(username) {
  const allRepos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url =
      `https://api.github.com/users/${encodeURIComponent(username)}/repos` +
      `?type=owner&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;

    const repos = await fetchJson(url);

    allRepos.push(...repos);

    if (repos.length < perPage) {
      break;
    }

    page += 1;
  }

  return allRepos;
}

/**
 * fetches json data from a url and handles github api errors
 * @param {string} url url to request
 * @returns {Promise<Object|Array>} parsed json response
 */
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    throw new Error("GitHub user not found.");
  }

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      "GitHub's API rate limit was reached. Try again later or add authenticated API requests."
    );
  }

  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}).`);
  }

  return response.json();
}

/**
 * creates a markdown summary from a github username and repositories
 * @param {string} username github username
 * @param {Array} repositories public github repositories
 * @returns {string} formatted markdown summary
 */
function createMarkdown(username, repositories) {
  const repositoriesByCreationDate = [...repositories].sort(
    compareCreationDatesNewestFirst
  );

  const lines = [
    `username: ${escapeMarkdown(username)}`,
    `public repositories: ${repositories.length}`,
    "",
    "# repositories:",
    "",
  ];

  repositoriesByCreationDate.forEach((repo, index) => {
    lines.push(
      `### repo ${repositories.length - index}:`,
      "",
      `- name: ${escapeMarkdown(repo.name)}`,
      `- desc: ${escapeMarkdown(repo.description || "No description")}`,
      `- url: ${repo.html_url}`,
      `- created: ${formatEasternTimestamp(repo.created_at)}`,
      `- last updated: ${formatEasternTimestamp(repo.updated_at)}`,
      `- last pushed: ${repo.pushed_at ? formatEasternTimestamp(repo.pushed_at) : "Never"}`,
      `- primary language: ${escapeMarkdown(repo.language || "Not specified")}`,
      `- license: ${escapeMarkdown(repo.license?.spdx_id || "Not specified")}`,
      `- topics: ${escapeMarkdown(repo.topics?.join(", ") || "None")}`,
      `- stars: ${repo.stargazers_count}`,
      `- forks: ${repo.forks_count}`,
      `- open issues and pull requests: ${repo.open_issues_count}`,
      `- archived: ${repo.archived ? "Yes" : "No"}`,
      `- forked repository: ${repo.fork ? "Yes" : "No"}`,
      ""
    );
  });

  return lines.join("\n");
}

/**
 * renders repository name and description audits on the page
 * @param {Array} repositories public github repositories
 * @returns {void} no return value
 */
function renderAudits(repositories) {
  const repositoriesByCreationDate = [...repositories].sort(
    compareCreationDatesNewestFirst
  );
  const auditsNeedingAttention = [];

  for (const repo of repositoriesByCreationDate) {
    const audit = auditRepository(repo);

    if (audit.issues.length > 0) {
      auditsNeedingAttention.push({ repo, audit });
    }
  }

  auditSummary.textContent =
    `${auditsNeedingAttention.length} of ${repositories.length} repositories ` +
    "have name or description suggestions.";
  auditList.replaceChildren();

  if (auditsNeedingAttention.length === 0) {
    const message = document.createElement("p");
    message.className = "audit-empty";
    message.textContent = "No name or description issues found.";
    auditList.appendChild(message);
    return;
  }

  for (const { repo, audit } of auditsNeedingAttention) {
    auditList.appendChild(createAuditCard(repo, audit));
  }
}

/**
 * audits a repository name and description
 * @param {Object} repo github repository data
 * @returns {{score: number, issues: Array<string>, recommendations: Array<string>}} audit result
 */
function auditRepository(repo) {
  const nameAudit = auditRepositoryName(repo.name);
  const descriptionAudit = auditRepositoryDescription(repo.description);
  const issues = [...nameAudit.issues, ...descriptionAudit.issues];
  const recommendations = [
    ...nameAudit.recommendations,
    ...descriptionAudit.recommendations,
  ];

  return {
    score: Math.min(nameAudit.score, descriptionAudit.score),
    issues,
    recommendations,
  };
}

/**
 * audits the readability and consistency of a repository name
 * @param {string} name github repository name
 * @returns {{score: number, issues: Array<string>, recommendations: Array<string>}} audit result
 */
function auditRepositoryName(name) {
  const issues = [];
  const recommendations = [];
  let score = 100;

  if (name.length > 50) {
    score -= 20;
    issues.push("Name is longer than 50 characters");
    recommendations.push("Shorten the name so it is easier to scan and type");
  }

  if (/_/.test(name)) {
    score -= 10;
    issues.push("Name uses underscores");
    recommendations.push("Consider lowercase kebab-case for consistency");
  }

  if (/[A-Z]/.test(name)) {
    score -= 5;
    issues.push("Name contains uppercase letters");
    recommendations.push("Consider lowercase kebab-case for consistency");
  }

  if (/^(test|testing|project|repo|repository|demo|sample)([-_]?\d*)?$/i.test(name)) {
    score -= 35;
    issues.push("Name is too generic to communicate the project's purpose");
    recommendations.push("Choose a short, distinctive name related to what the project does");
  }

  return { score: Math.max(score, 0), issues, recommendations };
}

/**
 * audits the clarity and completeness of a repository description
 * @param {string|null} description github repository description
 * @returns {{score: number, issues: Array<string>, recommendations: Array<string>}} audit result
 */
function auditRepositoryDescription(description) {
  const cleanedDescription = (description || "").trim();
  const issues = [];
  const recommendations = [];
  let score = 100;

  if (!cleanedDescription) {
    return {
      score: 0,
      issues: ["Description is missing"],
      recommendations: ["Add one sentence explaining what the repository does and who it helps"],
    };
  }

  if (/^(test|testing|todo|tbd|wip|sample|demo)$/i.test(cleanedDescription)) {
    score -= 50;
    issues.push("Description looks like placeholder text");
    recommendations.push("Replace the placeholder with the project's purpose and key capability");
  }

  if (cleanedDescription.length < 30) {
    score -= 25;
    issues.push(`Description is only ${cleanedDescription.length} characters`);
    recommendations.push("Add enough context to understand the project without opening it");
  }

  if (cleanedDescription.length > 160) {
    score -= 15;
    issues.push(`Description is ${cleanedDescription.length} characters and may be hard to scan`);
    recommendations.push("Shorten it to one focused sentence of 160 characters or fewer");
  }

  if (/^\s*\((wip|broken|deprecated|archived)\)/i.test(cleanedDescription)) {
    score -= 15;
    issues.push("Description begins with a temporary status label");
    recommendations.push("Use GitHub settings or topics for status and describe the project's purpose here");
  }

  if (/^[a-z]/.test(cleanedDescription)) {
    score -= 5;
    issues.push("Description starts with a lowercase letter");
    recommendations.push("Start the description with a capital letter");
  }

  return { score: Math.max(score, 0), issues, recommendations };
}

/**
 * creates a visual card for a repository audit
 * @param {Object} repo github repository data
 * @param {Object} audit repository audit result
 * @returns {HTMLElement} completed repository audit card
 */
function createAuditCard(repo, audit) {
  const card = document.createElement("article");
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  const score = document.createElement("span");

  card.className = "audit-card";
  link.href = repo.html_url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = repo.name;
  score.className = "audit-score";
  score.textContent = `${audit.score}/100`;
  heading.append(link, score);
  card.appendChild(heading);
  appendAuditList(card, "Findings", audit.issues);
  appendAuditList(card, "Suggestions", audit.recommendations);

  const prompt = document.createElement("details");
  const promptHeading = document.createElement("summary");
  const promptText = document.createElement("p");
  promptHeading.textContent = "AI rewrite prompt";
  promptText.textContent = createRewritePrompt(repo);
  prompt.append(promptHeading, promptText);
  card.appendChild(prompt);

  return card;
}

/**
 * appends a labeled list of audit messages to a card
 * @param {HTMLElement} card audit card receiving the list
 * @param {string} label heading displayed above the messages
 * @param {Array<string>} messages audit messages to display
 * @returns {void} no return value
 */
function appendAuditList(card, label, messages) {
  const heading = document.createElement("h4");
  const list = document.createElement("ul");
  heading.textContent = label;

  for (const message of messages) {
    const item = document.createElement("li");
    item.textContent = message;
    list.appendChild(item);
  }

  card.append(heading, list);
}

/**
 * creates an ai-ready prompt for improving a repository name and description
 * @param {Object} repo github repository data
 * @returns {string} prompt containing repository context and rewrite constraints
 */
function createRewritePrompt(repo) {
  const topics = repo.topics?.join(", ") || "none";
  return `Suggest a clear lowercase kebab-case repository name and one specific GitHub description of 30–160 characters. Current name: ${repo.name}. Current description: ${repo.description || "none"}. Primary language: ${repo.language || "unknown"}. Topics: ${topics}. Return the name and description only.`;
}

/**
 * compares repository creation dates with the newest repository first
 * @param {Object} repoA first repository to compare
 * @param {Object} repoB second repository to compare
 * @returns {number} sort order for the two repositories
 */
function compareCreationDatesNewestFirst(repoA, repoB) {
  return new Date(repoB.created_at) - new Date(repoA.created_at);
}

/**
 * formats a github timestamp in united states eastern time
 * @param {string} timestamp iso timestamp returned by github
 * @returns {string} date and time formatted in est or edt
 */
function formatEasternTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

/**
 * escapes markdown special characters in a value
 * @param {*} value value to escape
 * @returns {string} markdown safe string
 */
function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, " ")
    .replace(/([*_`[\]<>])/g, "\\$1");
}

/**
 * updates the generate button loading state
 * @param {boolean} isLoading whether the application is currently loading
 * @returns {void} no return value
 */
function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? "Generating..." : "Generate";
}

/**
 * displays an error message to the user
 * @param {string} message error message to display
 * @returns {void} no return value
 */
function showError(message) {
  statusEl.classList.add("error");
  statusEl.textContent = message;
}
