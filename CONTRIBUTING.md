# Contributing to Rizzzler 🌙

First off, thank you for considering contributing to Rizzzler! ❤️

Whether you're fixing a bug, improving the UI, adding a new feature, or enhancing documentation, your contributions are greatly appreciated.

---

# Code of Conduct

Please be respectful and welcoming to everyone.

Constructive feedback, thoughtful discussions, and collaborative development help make Rizzzler better for everyone.

---

# Before You Start

Please take a few minutes to:

- Search existing Issues before opening a new one.
- Read the README and project documentation.
- Keep Pull Requests focused on **one feature or bug fix**.
- Follow the existing project structure and coding style.

---

# Ways You Can Contribute

You can help by:

- 🐛 Fixing bugs
- ✨ Adding new features
- 🎨 Creating new showcase themes
- 📖 Improving documentation
- ⚡ Optimizing performance
- 🔒 Improving security
- 🌍 Improving accessibility
- 🧪 Writing tests
- 💡 Suggesting ideas

---

# Development Setup

## 1. Fork the repository

Click **Fork** on GitHub.

---

## 2. Clone your fork

```bash
git clone https://github.com/<your-username>/Rizzzler-Stable.git

cd Rizzzler-Stable
```

---

## 3. Install dependencies

```bash
npm install
```

---

## 4. Configure Environment Variables

Copy the example environment file.

```bash
cp .env.example .env
```

Configure:

- `MONGO_URI`
- `SESSION_SECRET`
- `SMTP_*`
- `BASE_URL`
- `ADMIN_PASSWORD`
- `GEMINI_API_KEY` *(optional)*

Never commit your `.env` file.

---

## 5. Start Development

```bash
npm run dev
```

or

```bash
npm start
```

Open:

```
http://localhost:3000
```

---

# Project Structure

```
config/
controllers/
middlewares/
models/
services/
Routes/
views/
public/
app.js
```

Please keep new code consistent with the existing MVC architecture.

---

# Coding Guidelines

Please follow these guidelines:

- Keep functions small and readable.
- Use meaningful variable names.
- Reuse existing controllers and middleware whenever possible.
- Avoid unnecessary dependencies.
- Keep UI consistent with existing pages.
- Write comments only where the logic isn't immediately obvious.

---

# Adding a New Theme

One of the easiest ways to contribute is by creating a new showcase theme.

1. Create:

```
public/css/themes/yourtheme.css
```

2. Style the

```
.rz-theme-yourtheme
```

classes.

3. Register the theme inside:

```
config/themes.js
```

Example:

```js
{
  key: "yourtheme",
  label: "Your Theme",
  desc: "Theme description",
  css: "/css/themes/yourtheme.css",
  accent: "#abcdef"
}
```

Your theme will automatically appear in the Settings page.

---

# Reporting Bugs

Please include:

- Expected behavior
- Actual behavior
- Steps to reproduce
- Browser
- Operating System
- Screenshots (if applicable)

---

# Feature Requests

Feature requests are always welcome.

Please explain:

- The problem you're solving
- Your proposed solution
- Why it would benefit users

---

# Pull Requests

Before submitting a Pull Request, please ensure:

- The project builds successfully.
- Your changes have been tested.
- Documentation is updated if needed.
- Your PR focuses on a single feature or fix.
- No sensitive information or secrets are included.

---

# Commit Message Style

Please use descriptive commit messages.

Examples:

```text
feat: add profile analytics

feat: add cyberpunk theme

fix: resolve GridFS upload issue

fix: improve email verification flow

docs: update setup guide

refactor: simplify showcase controller

style: improve mobile responsiveness
```

---

# Security

If you discover a security vulnerability, **please do not create a public Issue.**

Instead, follow the instructions in **SECURITY.md**.

Responsible disclosure helps protect all Rizzzler users.

---

# Questions

If you're unsure about an implementation or feature, feel free to open a GitHub Discussion or Issue before starting work.

---

# Thank You ❤️

Every contribution—whether it's fixing a typo, improving documentation, reporting a bug, or building a major feature—helps make Rizzzler better.

Happy coding! 🚀
