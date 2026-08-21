const form = document.querySelector("#github-form");
const usernameInput = document.querySelector("#username");
const generateButton = document.querySelector("#generate-button");
const statusEl = document.querySelector("#status");
const resultSection = document.querySelector("#result-section");
const profileAvatar = document.querySelector("#profile-avatar");
const profileName = document.querySelector("#profile-name");
const profileLink = document.querySelector("#profile-link");
const shareButton = document.querySelector("#share-button");
const overallScore = document.querySelector("#overall-score");
const categoryScores = document.querySelector("#category-scores");
const recommendationList = document.querySelector("#recommendation-list");
const auditSummary = document.querySelector("#audit-summary");
const auditList = document.querySelector("#audit-list");
const repositorySummary = document.querySelector("#repository-summary");
const repositoryList = document.querySelector("#repository-list");
const output = document.querySelector("#output");
const exportSummary = document.querySelector("#export-summary");
const includeDetailsInput = document.querySelector("#include-details");
const pinnedOnlyInput = document.querySelector("#pinned-only");
const selectedOnlyInput = document.querySelector("#selected-only");
const copyButton = document.querySelector("#copy-button");
const downloadButton = document.querySelector("#download-button");
const tabButtons = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");

const appState = {
  user: null,
  repositories: [],
  audits: [],
  supplemental: null,
};

form.addEventListener("submit", handleFormSubmit);
shareButton.addEventListener("click", copyShareLink);
copyButton.addEventListener("click", copyMarkdown);
downloadButton.addEventListener("click", downloadMarkdown);
includeDetailsInput.addEventListener("change", refreshMarkdown);
pinnedOnlyInput.addEventListener("change", refreshMarkdown);
selectedOnlyInput.addEventListener("change", refreshMarkdown);

for (const tabButton of tabButtons) {
  tabButton.addEventListener("click", handleTabClick);
}

initializeFromUrl();

/**
 * loads a profile when the form is submitted
 * @param {SubmitEvent} event browser form submission event
 * @returns {Promise<void>} no return value
 */
async function handleFormSubmit(event) {
  event.preventDefault();
  await loadProfile(usernameInput.value.trim());
}

/**
 * loads and renders github profile data for a username
 * @param {string} username github username
 * @returns {Promise<void>} no return value
 */
async function loadProfile(username) {
  if (!username) {
    showError("Enter a GitHub username.");
    return;
  }

  setLoading(true);
  resultSection.hidden = true;
  statusEl.classList.remove("error");
  statusEl.textContent = `Fetching public profile data for @${username}…`;

  try {
    const user = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(username)}`
    );
    const [rawRepositories, supplemental] = await Promise.all([
      fetchAllRepositories(user.login),
      fetchSupplementalMetadata(user.login),
    ]);
    const repositories = transformRepositories(rawRepositories, supplemental);
    const audits = repositories.map(scoreTransformedRepository);

    appState.user = user;
    appState.repositories = repositories;
    appState.audits = audits;
    appState.supplemental = supplemental;

    updateShareUrl(user.login);
    renderResults();
    resultSection.hidden = false;
    statusEl.textContent = createSuccessStatus(repositories.length, supplemental);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

/**
 * transforms raw github repositories into normalized application data
 * @param {Array<Object>} repositories github rest repositories
 * @param {Object|null} supplemental supplemental github graphql metadata
 * @returns {Array<Object>} normalized repository data
 */
function transformRepositories(repositories, supplemental) {
  const transformed = [];

  for (const repository of repositories) {
    transformed.push(GitHubAudit.transformRepository(repository, supplemental));
  }

  return transformed;
}

/**
 * scores a normalized repository for array mapping
 * @param {Object} repository normalized repository data
 * @returns {Object} repository audit
 */
function scoreTransformedRepository(repository) {
  return GitHubAudit.scoreRepository(repository);
}

/**
 * creates the status message shown after a successful profile fetch
 * @param {number} repositoryCount number of public repositories fetched
 * @param {Object|null} supplemental supplemental github metadata
 * @returns {string} success status message
 */
function createSuccessStatus(repositoryCount, supplemental) {
  if (repositoryCount === 0) {
    return "This account has no public repositories to audit.";
  }

  if (supplemental === null) {
    return `Analyzed ${repositoryCount} repositories. README and pinned data could not be verified.`;
  }

  return `Analyzed ${repositoryCount} repositories, including ${supplemental.pinnedRepositories.length} profile pins.`;
}

/**
 * fetches all public repositories owned by a github user
 * @param {string} username github username
 * @returns {Promise<Array<Object>>} public repositories belonging to the user
 */
async function fetchAllRepositories(username) {
  const allRepositories = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url =
      `https://api.github.com/users/${encodeURIComponent(username)}/repos` +
      `?type=owner&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
    const repositories = await fetchJson(url);
    allRepositories.push(...repositories);

    if (repositories.length < perPage) break;
    page += 1;
  }

  return allRepositories;
}

/**
 * fetches pinned repositories and readme metadata from the serverless api
 * @param {string} username github username
 * @returns {Promise<Object|null>} supplemental metadata or null when unavailable
 */
async function fetchSupplementalMetadata(username) {
  try {
    const response = await fetch(
      `/api/pinned-repositories?username=${encodeURIComponent(username)}`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) return null;
    const data = await response.json();

    if (!Array.isArray(data.repositories) || typeof data.readmes !== "object") {
      return null;
    }

    return { pinnedRepositories: data.repositories, readmes: data.readmes };
  } catch {
    return null;
  }
}

/**
 * fetches json data and translates github api failures into useful messages
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
    throw new Error("GitHub user not found. Check the username and try again.");
  }

  if (response.status === 403 || response.status === 429) {
    const resetTime = formatRateLimitReset(response.headers.get("X-RateLimit-Reset"));
    throw new Error(`GitHub's public API rate limit was reached.${resetTime}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}). Try again shortly.`);
  }

  return response.json();
}

/**
 * formats a github rate-limit reset header for an error message
 * @param {string|null} resetHeader unix reset timestamp header
 * @returns {string} formatted reset-time sentence or empty string
 */
function formatRateLimitReset(resetHeader) {
  if (!resetHeader) return " Try again later.";
  const resetDate = new Date(Number(resetHeader) * 1000);
  if (Number.isNaN(resetDate.getTime())) return " Try again later.";
  return ` Try again after ${resetDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
}

/**
 * renders every result view from current application state
 * @returns {void} no return value
 */
function renderResults() {
  renderProfileHeader();
  renderOverview();
  renderAudits();
  renderRepositories();
  refreshMarkdown();
}

/**
 * renders profile identity information
 * @returns {void} no return value
 */
function renderProfileHeader() {
  const user = appState.user;
  profileAvatar.src = user.avatar_url;
  profileAvatar.alt = `${user.login}'s GitHub avatar`;
  profileName.textContent = user.name || `@${user.login}`;
  profileLink.href = user.html_url;
  profileLink.textContent = `@${user.login}`;
}

/**
 * renders the overall score, category scores, and portfolio recommendations
 * @returns {void} no return value
 */
function renderOverview() {
  const profileScore = GitHubAudit.scoreProfile(appState.audits);
  const recommendations = GitHubAudit.generateRecommendations(appState.audits);
  overallScore.textContent = profileScore.overall;
  categoryScores.replaceChildren();

  const labels = [
    ["Repository presentation", profileScore.categories.presentation],
    ["Descriptions", profileScore.categories.descriptions],
    ["README quality", profileScore.categories.readme],
    ["Discoverability", profileScore.categories.discoverability],
    ["Maintenance", profileScore.categories.maintenance],
    ["Portfolio focus", profileScore.categories.focus],
  ];

  for (const [label, score] of labels) {
    categoryScores.appendChild(createCategoryScore(label, score));
  }

  recommendationList.replaceChildren();
  if (recommendations.length === 0) {
    recommendationList.appendChild(createEmptyState("No high-impact issues were detected in the public repository data."));
  } else {
    for (const recommendation of recommendations) {
      recommendationList.appendChild(createRecommendationCard(recommendation));
    }
  }
}

/**
 * creates a category score display with a progress bar
 * @param {string} label score category label
 * @param {number} score category score
 * @returns {HTMLElement} category score element
 */
function createCategoryScore(label, score) {
  const item = document.createElement("div");
  const heading = document.createElement("div");
  const name = document.createElement("span");
  const value = document.createElement("strong");
  const track = document.createElement("div");
  const bar = document.createElement("span");
  item.className = "category-score";
  heading.className = "category-score-heading";
  name.textContent = label;
  value.textContent = score;
  heading.append(name, value);
  track.className = "score-track";
  bar.style.width = `${score}%`;
  track.appendChild(bar);
  item.append(heading, track);
  return item;
}

/**
 * creates a portfolio recommendation card
 * @param {Object} recommendation structured portfolio recommendation
 * @returns {HTMLElement} recommendation card
 */
function createRecommendationCard(recommendation) {
  const card = document.createElement("article");
  const top = document.createElement("div");
  const severity = document.createElement("span");
  const category = document.createElement("strong");
  const reason = document.createElement("p");
  const action = document.createElement("p");
  const repositories = document.createElement("p");
  card.className = "recommendation-card";
  top.className = "recommendation-top";
  severity.className = `severity severity-${recommendation.severity}`;
  severity.textContent = recommendation.severity;
  category.textContent = recommendation.category;
  top.append(severity, category);
  reason.textContent = recommendation.reason;
  action.className = "recommendation-action";
  action.textContent = recommendation.action;
  repositories.className = "affected-repositories";
  repositories.textContent = `Affects: ${formatRepositoryNames(recommendation.repositories)}`;
  card.append(top, reason, action, repositories);
  return card;
}

/**
 * formats a concise list of repository names
 * @param {Array<string>} names repository names
 * @returns {string} comma-separated repository summary
 */
function formatRepositoryNames(names) {
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 4).join(", ")} and ${names.length - 4} more`;
}

/**
 * renders every repository audit with the lowest score first
 * @returns {void} no return value
 */
function renderAudits() {
  const sortedAudits = [...appState.audits].sort(compareRepositoryAudits);
  const needingAttention = sortedAudits.filter(hasAuditIssues).length;
  auditSummary.textContent = `${needingAttention} of ${sortedAudits.length} repositories have suggestions.`;
  auditList.replaceChildren();

  if (sortedAudits.length === 0) {
    auditList.appendChild(createEmptyState("No public repositories are available to audit."));
    return;
  }

  for (const audit of sortedAudits) {
    auditList.appendChild(createAuditCard(audit));
  }
}

/**
 * compares repository audits by score and update date
 * @param {Object} auditA first repository audit
 * @param {Object} auditB second repository audit
 * @returns {number} audit sort order
 */
function compareRepositoryAudits(auditA, auditB) {
  const difference = auditA.score - auditB.score;
  if (difference !== 0) return difference;
  return new Date(auditB.repository.updatedAt) - new Date(auditA.repository.updatedAt);
}

/**
 * determines whether a repository audit contains actionable findings
 * @param {Object} audit repository audit
 * @returns {boolean} true when a non-informational finding exists
 */
function hasAuditIssues(audit) {
  return audit.findings.some(isActionableFinding);
}

/**
 * determines whether a finding is actionable
 * @param {Object} finding structured audit finding
 * @returns {boolean} true for non-informational findings
 */
function isActionableFinding(finding) {
  return finding.severity !== "info";
}

/**
 * creates a repository-level audit card
 * @param {Object} audit repository audit
 * @returns {HTMLElement} repository audit card
 */
function createAuditCard(audit) {
  const repository = audit.repository;
  const card = document.createElement("article");
  const header = document.createElement("div");
  const titleArea = document.createElement("div");
  const title = document.createElement("h3");
  const link = document.createElement("a");
  const metadata = document.createElement("p");
  const score = document.createElement("strong");
  const description = document.createElement("p");
  const facts = document.createElement("div");
  const findings = document.createElement("div");
  card.className = "audit-card";
  header.className = "audit-card-header";
  link.href = repository.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = repository.name;
  title.appendChild(link);
  metadata.className = "repo-meta-line";
  metadata.textContent = `${repository.language || "Language unknown"} · ★ ${repository.stars} · Forks ${repository.forks} · Updated ${formatShortDate(repository.updatedAt)}`;
  titleArea.append(title, metadata);
  score.className = `repo-score ${getScoreClass(audit.score)}`;
  score.textContent = `${audit.score}/100`;
  header.append(titleArea, score);
  description.className = "current-description";
  description.textContent = repository.description || "No description";
  facts.className = "fact-row";
  facts.append(
    createFactBadge(`Topics: ${repository.topics.length || "none"}`),
    createFactBadge(`License: ${repository.license || "none"}`),
    createFactBadge(`README: ${formatReadmeStatus(repository.readme)}`),
    createFactBadge(repository.pinned === null ? "Pin: unknown" : repository.pinned ? "Pinned" : "Not pinned")
  );
  findings.className = "finding-list";

  if (audit.findings.length === 0) {
    findings.appendChild(createEmptyState("Strong presentation: no issues detected by the current checks."));
  } else {
    for (const finding of audit.findings) {
      findings.appendChild(createFindingRow(finding));
    }
  }

  card.append(header, description, facts, findings);
  return card;
}

/**
 * creates a compact metadata badge
 * @param {string} text badge text
 * @returns {HTMLElement} metadata badge
 */
function createFactBadge(text) {
  const badge = document.createElement("span");
  badge.textContent = text;
  return badge;
}

/**
 * formats readme metadata for display
 * @param {Object} readme readme metadata
 * @returns {string} readable readme status
 */
function formatReadmeStatus(readme) {
  if (readme.present === null) return "unverified";
  if (!readme.present) return "missing";
  if (readme.size !== null && readme.size < 500) return "short";
  return "present";
}

/**
 * creates a factual or advisory audit finding row
 * @param {Object} finding structured audit finding
 * @returns {HTMLElement} finding row
 */
function createFindingRow(finding) {
  const row = document.createElement("article");
  const heading = document.createElement("div");
  const type = document.createElement("span");
  const category = document.createElement("strong");
  const reason = document.createElement("p");
  const action = document.createElement("p");
  row.className = "finding";
  type.className = `finding-type ${finding.factual ? "is-factual" : "is-advisory"}`;
  type.textContent = finding.factual ? "Factual check" : "Recommendation";
  category.textContent = finding.category;
  heading.append(type, category);
  reason.textContent = finding.reason;
  action.className = "finding-action";
  action.textContent = `Next step: ${finding.action}`;
  row.append(heading, reason, action);
  return row;
}

/**
 * returns a visual score class for a numeric score
 * @param {number} score repository score
 * @returns {string} css class representing the score band
 */
function getScoreClass(score) {
  if (score >= 90) return "score-strong";
  if (score >= 70) return "score-medium";
  return "score-weak";
}

/**
 * renders fetched repository data and selection controls
 * @returns {void} no return value
 */
function renderRepositories() {
  const repositories = [...appState.repositories].sort(compareCreationDatesNewestFirst);
  repositorySummary.textContent = `${repositories.length} public repositories fetched.`;
  repositoryList.replaceChildren();

  if (repositories.length === 0) {
    repositoryList.appendChild(createEmptyState("This account has no public repositories."));
    return;
  }

  for (const repository of repositories) {
    repositoryList.appendChild(createRepositoryCard(repository));
  }
}

/**
 * creates a repository data card with an export selection control
 * @param {Object} repository normalized repository data
 * @returns {HTMLElement} repository data card
 */
function createRepositoryCard(repository) {
  const card = document.createElement("article");
  const checkbox = document.createElement("input");
  const content = document.createElement("div");
  const heading = document.createElement("div");
  const title = document.createElement("a");
  const flags = document.createElement("span");
  const description = document.createElement("p");
  const metadata = document.createElement("p");
  card.className = "repository-card";
  checkbox.type = "checkbox";
  checkbox.checked = repository.selected;
  checkbox.dataset.repository = repository.name;
  checkbox.setAttribute("aria-label", `Include ${repository.name} in selected exports`);
  checkbox.addEventListener("change", handleRepositorySelection);
  content.className = "repository-card-content";
  heading.className = "repository-card-heading";
  title.href = repository.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.textContent = repository.name;
  flags.className = "repository-flags";
  flags.textContent = [repository.pinned ? "Pinned" : "", repository.archived ? "Archived" : "", repository.fork ? "Fork" : ""].filter(Boolean).join(" · ");
  heading.append(title, flags);
  description.textContent = repository.description || "No description";
  metadata.className = "repo-meta-line";
  metadata.textContent = `${repository.language || "Unknown language"} · ${repository.topics.length} topics · ${repository.license || "No license"} · README ${formatReadmeStatus(repository.readme)} · Updated ${formatShortDate(repository.updatedAt)}`;
  content.append(heading, description, metadata);
  card.append(checkbox, content);
  return card;
}

/**
 * updates repository selection state and the markdown preview
 * @param {Event} event repository checkbox change event
 * @returns {void} no return value
 */
function handleRepositorySelection(event) {
  const repository = appState.repositories.find(
    (item) => item.name === event.currentTarget.dataset.repository
  );
  if (repository) repository.selected = event.currentTarget.checked;
  refreshMarkdown();
}

/**
 * compares repository creation dates with the newest repository first
 * @param {Object} repositoryA first repository
 * @param {Object} repositoryB second repository
 * @returns {number} repository sort order
 */
function compareCreationDatesNewestFirst(repositoryA, repositoryB) {
  return new Date(repositoryB.createdAt) - new Date(repositoryA.createdAt);
}

/**
 * updates markdown output from current export options
 * @returns {void} no return value
 */
function refreshMarkdown() {
  if (!appState.user) return;
  const options = {
    includeDetails: includeDetailsInput.checked,
    pinnedOnly: pinnedOnlyInput.checked,
    selectedOnly: selectedOnlyInput.checked,
  };
  const repositories = filterRepositoriesForExport(appState.repositories, options);
  output.value = createMarkdown(appState.user.login, repositories, appState.supplemental, options);
  exportSummary.textContent = `${repositories.length} repositories included in this export.`;
  pinnedOnlyInput.disabled = appState.supplemental === null;
}

/**
 * filters repositories according to export options
 * @param {Array<Object>} repositories normalized repositories
 * @param {Object} options markdown export options
 * @returns {Array<Object>} filtered repositories
 */
function filterRepositoriesForExport(repositories, options) {
  const includedRepositories = [];

  for (const repository of repositories) {
    if (options.pinnedOnly && repository.pinned !== true) continue;
    if (options.selectedOnly && !repository.selected) continue;
    includedRepositories.push(repository);
  }

  return includedRepositories;
}

/**
 * creates a markdown summary from normalized repositories
 * @param {string} username github username
 * @param {Array<Object>} repositories normalized repositories
 * @param {Object|null} supplemental supplemental github metadata
 * @param {Object} options markdown export options
 * @returns {string} formatted markdown report
 */
function createMarkdown(username, repositories, supplemental, options) {
  const sortedRepositories = [...repositories].sort(compareCreationDatesNewestFirst);
  const lines = [
    `username: ${escapeMarkdown(username)}`,
    `public repositories in report: ${sortedRepositories.length}`,
    "",
    "# pinned repositories:",
    "",
  ];
  const pinnedRepositories = sortedRepositories.filter(isPinnedRepository);

  if (supplemental === null) {
    lines.push("Pinned repository data unavailable.", "");
  } else if (pinnedRepositories.length === 0) {
    lines.push("No pinned repositories included in this report.", "");
  } else {
    for (const repository of pinnedRepositories) {
      lines.push(`- ${escapeMarkdown(repository.name)}`);
    }
    lines.push("");
  }

  lines.push("# repositories:", "");

  for (let index = 0; index < sortedRepositories.length; index += 1) {
    const repository = sortedRepositories[index];
    lines.push(
      `### repo ${sortedRepositories.length - index}:`,
      "",
      `- name: ${escapeMarkdown(repository.name)}`,
      `- desc: ${escapeMarkdown(repository.description || "No description")}`,
      `- url: ${repository.url}`,
      `- pinned on profile: ${repository.pinned === null ? "Unavailable" : repository.pinned ? "Yes" : "No"}`
    );

    if (options.includeDetails) {
      lines.push(
        `- created: ${formatEasternTimestamp(repository.createdAt)}`,
        `- last updated: ${formatEasternTimestamp(repository.updatedAt)}`,
        `- last pushed: ${repository.pushedAt ? formatEasternTimestamp(repository.pushedAt) : "Never"}`,
        `- primary language: ${escapeMarkdown(repository.language || "Not specified")}`,
        `- license: ${escapeMarkdown(repository.license || "Not specified")}`,
        `- topics: ${escapeMarkdown(repository.topics.join(", ") || "None")}`,
        `- stars: ${repository.stars}`,
        `- forks: ${repository.forks}`,
        `- open issues and pull requests: ${repository.openIssues}`,
        `- README: ${formatReadmeStatus(repository.readme)}`,
        `- archived: ${repository.archived ? "Yes" : "No"}`,
        `- forked repository: ${repository.fork ? "Yes" : "No"}`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * determines whether a repository is pinned
 * @param {Object} repository normalized repository
 * @returns {boolean} true when pinned
 */
function isPinnedRepository(repository) {
  return repository.pinned === true;
}

/**
 * handles switching between result tabs
 * @param {MouseEvent} event tab button click event
 * @returns {void} no return value
 */
function handleTabClick(event) {
  activateTab(event.currentTarget.dataset.tab, true);
}

/**
 * activates one result tab and optionally updates the url
 * @param {string} tabName tab identifier
 * @param {boolean} updateUrl whether to write the tab into the url
 * @returns {void} no return value
 */
function activateTab(tabName, updateUrl) {
  const validTab = ["overview", "audit", "repositories", "markdown"].includes(tabName)
    ? tabName
    : "overview";

  for (const button of tabButtons) {
    const active = button.dataset.tab === validTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }

  for (const panel of tabPanels) {
    panel.hidden = panel.id !== `${validTab}-panel`;
  }

  if (updateUrl && appState.user) updateShareUrl(appState.user.login, validTab);
}

/**
 * updates the current url with the audited username and active view
 * @param {string} username github username
 * @param {string|null} tabName optional result tab identifier
 * @returns {void} no return value
 */
function updateShareUrl(username, tabName = null) {
  const url = new URL(window.location.href);
  url.searchParams.set("user", username);
  const activeTab = tabName || url.searchParams.get("view");

  if (activeTab && activeTab !== "overview") {
    url.searchParams.set("view", activeTab);
  } else {
    url.searchParams.delete("view");
  }

  history.replaceState(null, "", url);
}

/**
 * initializes username and result view from url parameters
 * @returns {void} no return value
 */
function initializeFromUrl() {
  const username = GitHubAudit.parseUsernameFromSearch(window.location.search);
  const tabName = new URLSearchParams(window.location.search).get("view") || "overview";
  activateTab(tabName, false);

  if (username) {
    usernameInput.value = username;
    loadProfile(username);
  }
}

/**
 * copies the current shareable profile url
 * @returns {Promise<void>} no return value
 */
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showTemporaryButtonText(shareButton, "Link copied");
  } catch {
    showError("Could not copy the link automatically. Copy it from the address bar.");
  }
}

/**
 * copies the generated markdown preview
 * @returns {Promise<void>} no return value
 */
async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(output.value);
    showTemporaryButtonText(copyButton, "Copied");
  } catch {
    showError("Could not copy automatically. Select the Markdown and copy it manually.");
  }
}

/**
 * downloads the generated markdown as a file
 * @returns {void} no return value
 */
function downloadMarkdown() {
  if (!output.value) return;
  const blob = new Blob([output.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${appState.user?.login || "github-user"}-repositories.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * temporarily changes button text to acknowledge an action
 * @param {HTMLButtonElement} button button to update
 * @param {string} temporaryText temporary button label
 * @returns {void} no return value
 */
function showTemporaryButtonText(button, temporaryText) {
  const originalText = button.textContent;
  button.textContent = temporaryText;
  window.setTimeout(function restoreButtonText() {
    button.textContent = originalText;
  }, 1200);
}

/**
 * creates a reusable empty-state message
 * @param {string} message empty-state message
 * @returns {HTMLElement} empty-state element
 */
function createEmptyState(message) {
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = message;
  return emptyState;
}

/**
 * formats a timestamp as a concise local date
 * @param {string} timestamp iso timestamp
 * @returns {string} concise date
 */
function formatShortDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
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
 * updates the form loading state
 * @param {boolean} isLoading whether the application is loading
 * @returns {void} no return value
 */
function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  usernameInput.disabled = isLoading;
  generateButton.textContent = isLoading ? "Analyzing…" : "Analyze profile";
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
