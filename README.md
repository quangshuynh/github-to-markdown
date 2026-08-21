# GitProfileLens

> See your GitHub profile through a different lens.

GitProfileLens analyzes your public GitHub repositories and helps you understand how your developer portfolio is presented. It identifies weak repository metadata, surfaces actionable improvements, lets you explore repository information, and exports your GitHub data to clean Markdown.

Results include a personalized portfolio snapshot highlighting the profile's strongest presentation signal.
Hand-drawn decorative accents are randomized on each load within protected page gutters, adding character without image downloads or interference with controls and screen readers.

[Open the live demo](https://quangshuynh.github.io/gitprofilelens/)

![GitProfileLens overview showing the profile score and prioritized recommendations](docs/screenshot.png)

## Product areas

- **Profile Audit** - Analyze how a developer's public repositories are presented and discovered.
- **Repository Explorer** - Fetch and inspect useful public repository information in one place.
- **Markdown Export** - Generate clean, configurable Markdown from the fetched repository data.

## Key features

- Load every public repository owned by a GitHub user with pagination.
- Open shareable audits such as `/?user=quangshuynh`.
- Calculate an overall portfolio score and six explainable category scores.
- Expand any category score to see its calculation and the most common signals affecting it.
- Audit repository names, descriptions, READMEs, topics, licenses, demos, and maintenance signals.
- Separate factual checks from subjective presentation recommendations.
- Rank the five highest-impact portfolio improvements.
- Inspect all fetched repository data without hiding it behind the audit.
- Detect pinned repositories and root README metadata through an optional serverless GraphQL integration.
- Preview, copy, and download Markdown.
- Export all, pinned-only, or manually selected repositories with full or compact details.
- Handle nonexistent users, empty accounts, rate limits, and unavailable supplemental data.

## How the audit works

The scoring implementation lives in `audit.js` and is shared by the browser and automated tests. Each repository receives category scores for:

- Repository presentation: name clarity and consistency.
- Descriptions: specificity, useful length, placeholder text, and basic polish.
- README quality: presence, useful length, core sections (overview, setup, and usage), examples, code samples, visuals, and contribution guidance.
- Discoverability: topics, license, and a demo link where it is likely useful.
- Maintenance: push recency while treating archived projects as intentionally complete.

The profile score aggregates those results and adds portfolio focus. Every finding contains a severity, reason, suggested action, and a flag indicating whether it is a factual check or subjective recommendation.

Unknown README data receives a neutral score and is explicitly marked unverified. The app does not invent README results or AI-generated descriptions.
When structural README data is available, each repository audit card shows a checklist of detected and missing documentation elements alongside its README subscore.

## JSON report API

Other tools can consume the same normalized public repository data used by the browser:

```text
GET /api/report?user=quangshuynh
```

The endpoint returns the username, public repository count, pinned repository names, and serialized public metadata for each repository. It requires the server-side `GITHUB_TOKEN`, performs no HTML scraping, and never includes credentials or private repositories in responses.

## Markdown export

Markdown remains a first-class feature. The export view supports:

- Full repository metadata or a compact name/description/link format.
- Only pinned repositories.
- Only repositories selected in the Repositories view.
- Clipboard copy and `.md` download.

Audit findings are not inserted into the Markdown report.

## Local setup

No client build step or framework is required.

```bash
git clone https://github.com/YOUR_USERNAME/github-to-markdown.git
cd github-to-markdown
python -m http.server 8000
```

Open `http://localhost:8000`. Core repository fetching, scoring, browsing, and Markdown export work without login. README and pinned-repository checks appear as unverified unless the serverless integration is running.

### Full local setup

Create `.env.local`:

```text
GITHUB_TOKEN=your_fine_grained_github_token
```

Then use the Vercel CLI:

```bash
vercel dev
```

Never commit `.env.local` or a GitHub token. Local environment files are ignored by Git.

## Architecture

```text
github-to-markdown/              # current repository name before rename
|-- api/
|   `-- pinned-repositories.js  # authenticated GraphQL serverless function
|-- tests/
|   `-- audit.test.js           # scoring, recommendation, URL, and transform tests
|-- audit.js                     # deterministic scoring and data transformation
|-- index.html                   # accessible application structure
|-- script.js                    # fetching, state, rendering, URL, and export behavior
|-- styles.css                   # responsive visual system
`-- package.json                 # test and syntax-check scripts
```

The browser fetches public users and paginated repositories from GitHub REST. The optional Vercel function makes one authenticated GraphQL request for up to 100 root README checks and the profile's pinned repositories. It caches successful responses for five minutes.

## Tests

```bash
npm test
npm run check
npm run test:browser
```

Tests cover meaningful scoring behavior, vague-description guidance, missing presentation fundamentals, recommendation ranking, empty profiles, URL username parsing, and repository-data transformation.

## Deployment

### Vercel (all features)

Deploy the repository and configure `GITHUB_TOKEN` in the Vercel project environment. The token stays in the serverless function and is never sent to the browser.

### GitHub Pages (core features)

GitHub Pages can host the static client. Repository fetching, auditing, sharing, and Markdown export work, but Pages cannot run the serverless function; README and pinned data will be labeled unverified.

## Repository rename checklist

The repository is still named `github-to-markdown`. Immediately before or after renaming it to `gitprofilelens`:

- Rename the repository in GitHub under **Settings → General → Repository name**.
- Update the live-demo URL near the top of this README to `https://quangshuynh.github.io/gitprofilelens/` if GitHub Pages remains the host.
- Update the clone URL and `cd` command in **Local setup** from `github-to-markdown` to `gitprofilelens`.
- Recheck GitHub Pages branch/folder settings and wait for the renamed Pages site to deploy.
- Update any Vercel project's Git repository connection, project name, domains, and deployment environment if they reference the old name.
- Update external bookmarks, portfolio links, social previews, and repository topics.
- Verify the share URL, serverless `/api/pinned-repositories` route, and `GITHUB_TOKEN` environment variable after redeployment.
- Search the repository once more for `github-to-markdown`; no application code should depend on it after the clone/demo references are updated.

GitHub normally redirects old repository URLs after a rename, but deployment URLs and third-party integrations should still be updated explicitly.

## Limitations

- Unauthenticated GitHub REST requests have a low hourly rate limit. The app reports the reset time when GitHub supplies it.
- Root README and pin checks require the optional authenticated function.
- The GraphQL README query covers the first 100 public repositories and checks common root filenames: `README.md`, `README`, and `readme.md`.
- README size is only a useful warning signal; it cannot determine writing quality.
- Recommendations are deterministic presentation guidance, not an assessment of code quality or developer ability.
- A share URL re-fetches current public data; no audit snapshot or database is stored.

## Contributing

1. Create a focused branch.
2. Keep scoring changes deterministic and document their rationale.
3. Add or update behavior-focused tests.
4. Run `npm test` and `npm run check`.
5. Open a pull request describing user-facing changes and scoring tradeoffs.

## License

Feel free to use, modify, and build on this project.
