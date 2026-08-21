const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/**
 * returns public repositories pinned to a github user's profile
 * @param {Object} request vercel serverless request
 * @param {Object} response vercel serverless response
 * @returns {Promise<void>} no return value
 */
async function pinnedRepositoriesHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const username = String(request.query.username || "").trim();

  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
    response.status(400).json({ error: "A valid GitHub username is required." });
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    response.status(503).json({ error: "The GitHub API token is not configured." });
    return;
  }

  try {
    const githubResponse = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "gitprofilelens",
      },
      body: JSON.stringify({
        query: `
          query PinnedRepositories($username: String!) {
            user(login: $username) {
              pinnedItems(first: 6, types: REPOSITORY) {
                nodes {
                  ... on Repository {
                    name
                  }
                }
              }
              repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
                nodes {
                  name
                  readmeMarkdown: object(expression: "HEAD:README.md") {
                    ... on Blob { byteSize text }
                  }
                  readmeUppercase: object(expression: "HEAD:README") {
                    ... on Blob { byteSize text }
                  }
                  readmeLowercase: object(expression: "HEAD:readme.md") {
                    ... on Blob { byteSize text }
                  }
                }
              }
            }
          }
        `,
        variables: { username },
      }),
    });
    const data = await githubResponse.json();

    if (!githubResponse.ok || data.errors) {
      response.status(githubResponse.ok ? 502 : githubResponse.status).json({
        error: "GitHub could not return pinned repositories.",
      });
      return;
    }

    if (!data.data.user) {
      response.status(404).json({ error: "GitHub user not found." });
      return;
    }

    const repositories = data.data.user.pinnedItems.nodes.map(
      getRepositoryName
    );
    const readmes = Object.fromEntries(
      data.data.user.repositories.nodes.map(getReadmeEntry)
    );
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.status(200).json({ repositories, readmes });
  } catch {
    response.status(502).json({ error: "GitHub could not return pinned repositories." });
  }
}

/**
 * gets a repository name from a github graphql node
 * @param {Object} repository github graphql repository node
 * @returns {string} repository name
 */
function getRepositoryName(repository) {
  return repository.name;
}

/**
 * converts a github repository node into a readme metadata entry
 * @param {Object} repository github graphql repository node
 * @returns {Array} repository name and readme metadata entry
 */
function getReadmeEntry(repository) {
  const readme =
    repository.readmeMarkdown ||
    repository.readmeUppercase ||
    repository.readmeLowercase;
  return [
    repository.name,
    readme ? { present: true, size: readme.byteSize, ...analyzeReadme(readme.text || "") } : { present: false, size: null },
  ];
}

/**
 * extracts useful, deterministic documentation signals without retaining README text
 * @param {string} markdown README markdown
 * @returns {Object} structural README signals
 */
function analyzeReadme(markdown) {
  const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)]
    .map((match) => match[1].replace(/[*_`#]/g, "").trim().toLowerCase());
  const hasHeading = (pattern) => headings.some((heading) => pattern.test(heading));

  return {
    sections: {
      overview: hasHeading(/overview|about|introduction|what (?:it|this)|features?/),
      installation: hasHeading(/install|setup|getting started|prerequisites?/),
      usage: hasHeading(/usage|how to use|quick ?start|running/),
      examples: hasHeading(/examples?|demo|screenshots?|preview/),
      contributing: hasHeading(/contribut|development/),
    },
    hasCodeBlock: /```[\s\S]*?```/.test(markdown),
    hasImage: /!\[[^\]]*\]\([^)]+\)|<img\b/i.test(markdown),
    headingCount: headings.length,
  };
}

module.exports = pinnedRepositoriesHandler;
