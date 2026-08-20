const form = document.querySelector("#github-form");
const usernameInput = document.querySelector("#username");
const generateButton = document.querySelector("#generate-button");
const statusEl = document.querySelector("#status");
const resultSection = document.querySelector("#result-section");
const output = document.querySelector("#output");
const copyButton = document.querySelector("#copy-button");
const downloadButton = document.querySelector("#download-button");

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
  statusEl.classList.remove("error");
  statusEl.textContent = `Loading @${username}...`;

  try {
    const user = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(username)}`
    );

    const repositories = await fetchAllRepositories(username);

    currentUsername = user.login;
    output.value = createMarkdown(user.login, repositories);
    resultSection.hidden = false;

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
