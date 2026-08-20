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
    const user = await fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`);
    const repositories = await fetchAllRepositories(username);

    currentUsername = user.login;
    output.value = createMarkdown(user.login, repositories);
    resultSection.hidden = false;
    statusEl.textContent = `Found ${repositories.length} public repositories for @${user.login}.`;
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
    showError("Could not copy automatically. Select the Markdown and copy it manually.");
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

function createMarkdown(username, repositories) {
  const lines = [
    `username: ${escapeMarkdown(username)}`,
    `public repositories: ${repositories.length}`,
    "",
    "# repositories:",
    "",
  ];

  repositories.forEach((repo, index) => {
    lines.push(
      `### repo ${index + 1}:`,
      "",
      `- name: ${escapeMarkdown(repo.name)}`,
      `- desc: ${escapeMarkdown(repo.description || "No description")}`,
      ""
    );
  });

  return lines.join("\n");
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, " ")
    .replace(/([*_`[\]<>])/g, "\\$1");
}

function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? "Generating..." : "Generate";
}

function showError(message) {
  statusEl.classList.add("error");
  statusEl.textContent = message;
}
