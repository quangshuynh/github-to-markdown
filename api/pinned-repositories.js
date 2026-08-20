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
        "User-Agent": "github-to-markdown",
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
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.status(200).json({ repositories });
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

module.exports = pinnedRepositoriesHandler;
