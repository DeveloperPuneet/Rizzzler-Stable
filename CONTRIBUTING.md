# Contributing to Rizzzler 🌙

Thanks for contributing to Rizzzler. Whether you're fixing a bug, improving performance, adding a new theme, editing docs, or tightening security, every contribution helps make the platform better.

This project is built around an Express + EJS app with MongoDB storage, a centralized registry for theme and visual options, and public profile pages that users can customize heavily.

---

## Code of Conduct

Please be respectful, constructive, and collaborative.

We welcome thoughtful feedback and code review discussions. Keep comments professional and focused on improving the project.

---

## Before You Start

Please check the following first:

- search existing issues before creating a new one
- read the current README and docs flow
- keep pull requests focused on one feature or bugfix
- stay consistent with the existing MVC structure and app conventions

---

## Ways to Contribute

You can help by:

- fixing bugs and edge cases
- improving the dashboard or profile flow
- adding or refining themes and visual effects
- improving documentation and onboarding
- enhancing security and validation
- improving accessibility and mobile UX
- writing or updating tests
- suggesting product ideas and setup improvements

---

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/Rizzzler.git
cd Rizzzler
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Set the required values before running the app, especially:

- `MONGO_URI`
- `SESSION_SECRET`
- `BASE_URL`
- `ADMIN_PASSWORD`
- `SMTP_*` for mail delivery
- `GOOGLE_OAUTH_*` and `GITHUB_*` for social auth if used
- `MISTRAL_API_KEY` if you want AI mail features

Do not commit your `.env` file.

### 4. Start development

```bash
npm run dev
```

or

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

---

## Project Structure

```text
app.js
config/
controllers/
middlewares/
models/
public/
Routes/
services/
shared/
views/
tests/
```

Key files and folders to know:

- `shared/registry.js` — main source of truth for themes, avatar effects, title effects, and showcase motion effects
- `controllers/` — route handlers and business logic
- `views/` — EJS templates for auth, dashboard, docs, showcase, admin, and public pages
- `public/css/themes/` — theme CSS files
- `tests/` — regression and cleanup checks

---

## Coding Guidelines

Please keep code consistent with the current project patterns:

- prefer small, readable functions
- reuse existing middleware and controllers where possible
- keep route logic and view logic appropriately separated
- avoid unnecessary dependencies
- preserve the app’s existing naming and layout conventions
- add comments only where the logic is not obvious

---

## Theme Contributions

If you're adding a theme, follow the registry-driven pattern used by the project.

### Required steps

1. Create a CSS file in `public/css/themes/`
2. Style the theme classes using the app's existing showcase patterns
3. Add the theme metadata to `shared/registry.js`
4. Include a unique key, label, description, CSS path, and accent color

Example structure:

```js
{
  key: "yourtheme",
  label: "Your Theme",
  desc: "A short description of the style",
  css: "/css/themes/yourtheme.css",
  accent: "#abcdef",
  heroEyebrow: "Your Theme",
  grandWords: ["Bold", "Bright", "Fresh"],
  storyBlurbs: ["A short supporting line."],
  creditsTagline: "made with personality"
}
```

This keeps theme support consistent across backend validation and the dashboard UI.

---

## Docs and Content Contributions

Documentation is a major part of this project. If you improve docs or onboarding flow, make sure they are practical and specific.

Good docs contributions include:

- setup and troubleshooting steps
- real-world examples for login, profile editing, and publishing
- FAQ-style answers for common errors
- theme and feature explanations with enough detail to help users succeed

---

## Bug Reports

Please include:

- expected behavior
- actual behavior
- steps to reproduce
- browser and OS
- screenshots or logs if relevant
- the route or page affected

---

## Feature Requests

Feature requests are welcome when they solve a real user problem.

Please explain:

- the problem you are trying to solve
- why it matters
- how your idea fits the current app
- any relevant examples or references

---

## Pull Requests

Before opening a PR, please check that:

- your changes are scoped and focused
- tests or validation checks pass when relevant
- documentation is updated if the behavior or setup changed
- no secrets, debug logs, or personal credentials are included
- the code matches the current repository patterns

---

## Commit Style

Use clear, descriptive commit messages.

Examples:

```text
feat: add sticker chaos theme
fix: resolve profile validation bug
docs: expand onboarding and FAQ content
style: improve mobile showcase layout
refactor: centralize theme registry usage
security: tighten admin route validation
```

---

## Security

If you discover a security issue, do not create a public issue. Follow the process in `SECURITY.md` and report it privately.

Responsible disclosure is required to protect users and the project.

---

## Questions

If you're unsure about a change, route, or implementation pattern, open an issue first and ask before doing large work.

That helps avoid duplicate effort and keeps the project architecture consistent.

---

Thank you for helping improve Rizzzler. ❤️

Every contribution—whether it's fixing a typo, improving documentation, reporting a bug, or building a major feature—helps make Rizzzler better.

Happy coding! 🚀
