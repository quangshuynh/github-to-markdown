# GitHub → Markdown

A simple website that turns any GitHub user's public repositories into a clean Markdown summary that you can copy or download as a `.md` file.

## Features

* Search by GitHub username
* Fetch all public repositories
* Display repository names and descriptions
* Generate a clean Markdown summary
* Copy the generated Markdown
* Download the result as a `.md` file
* No backend or dependencies required

## Output

The generated Markdown looks like this:

```md
username: burg3rman22
public repositories: 2

# repositories:

### repo 1:

- name: example-one
- desc: Example repository description

### repo 2:

- name: example-two
- desc: No description
```

## Running Locally

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/github-to-markdown.git
cd github-to-markdown
```

You can open `index.html` directly in your browser.

Alternatively, start a simple local server with Python:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploying to GitHub Pages

This project is completely static, so it can be hosted directly with GitHub Pages. You do **not** need to install a `gh-pages` package.

First, make sure your project has been pushed to GitHub:

```bash
git add .
git commit -m "Add GitHub to Markdown website"
git push
```

Then:

1. Open your repository on GitHub.
2. Go to **Settings**.
3. Select **Pages** from the sidebar.
4. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
5. Select the `main` branch.
6. Select `/ (root)` as the folder.
7. Click **Save**.

GitHub will build and publish the site.

Your website will normally be available at:

```text
https://YOUR_USERNAME.github.io/github-to-markdown/
```

For example:

```text
https://quangshuynh.github.io/github-to-markdown/
```

It may take a minute or two for the first deployment to become available.

## Project Structure

```text
github-to-markdown/
├── index.html
├── styles.css
├── script.js
└── README.md
```

### `index.html`

Contains the website structure, username input, generated Markdown output, and download controls.

### `styles.css`

Contains the styling and responsive layout.

### `script.js`

Handles GitHub API requests, repository pagination, Markdown generation, copying, and `.md` downloads.

## GitHub API

The website uses the GitHub REST API to retrieve public user and repository information.

For example:

```text
https://api.github.com/users/USERNAME
https://api.github.com/users/USERNAME/repos
```

Requests are made directly from the browser and do not require authentication for basic usage.

Because unauthenticated GitHub API requests are rate-limited, a larger production deployment may benefit from a backend or serverless function with authenticated GitHub API requests.

## License

Feel free to use, modify, and build on this project.
