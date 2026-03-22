# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Obsidian plugin** that imports GitHub starred repositories, own repositories, and organization repos as structured Markdown notes with YAML frontmatter. Supports AI-powered README summarization via Anthropic Claude or any OpenAI-compatible API (Ollama, LM Studio, vLLM, etc.).

## Commands

**Never use local npm commands. Always run via Docker.**

```bash
docker compose run --rm build         # Type check + production build
docker compose run --rm test          # Run Vitest unit tests
docker compose run --rm lint          # ESLint check
docker compose run --rm format-check  # Prettier format check
```

Test files are in `src/__tests__/`, Obsidian API mock is at `src/__mocks__/obsidian.ts`.

### Symlink to Vault (live development)

```bash
ln -s $(pwd) /path/to/vault/.obsidian/plugins/repo-notes
```

Build output is `main.js` (excluded by `.gitignore`). esbuild bundles `src/main.ts` as the entry point.

## Architecture

Two source files:

- **`src/i18n.ts`** — English/Japanese translation object. Exports `getT(lang: Lang): T`. Translation values include both strings and function types like `(name: string) => string`.
- **`src/main.ts`** — Plugin body, organized into sections:
  - **Types** — `GitHubRepo`, `StarredItem`, `Profile`, `RepoNotesSettings` interfaces
  - **Defaults** — `defaultProfile()`, `DEFAULT_SETTINGS`
  - **Main Plugin** (`RepoNotesPlugin extends Plugin`) — `onload`, `loadSettings`, `saveSettings`, `syncProfile`, `syncRepoList`, and other core logic
  - **Settings Tab** (`RepoNotesSettingTab extends PluginSettingTab`) — Profile management UI
  - **Modals** (`SyncModal` etc.) — Sync progress UI
  - **Pure utility functions** — Exported pure functions for testing (see below)

## Key implementation notes

- **Always use `requestUrl` (Obsidian API) for HTTP requests.** Browser `fetch` does not work in Obsidian's sandbox.

- **Accessing `window.moment`**: type as `(window as Window & { moment?: { locale?: () => string } })`. `as any` is forbidden.

- **Never set CSS styles directly**: avoid `element.style.*`. Use CSS classes (`addClass/removeClass`) or `setCssProps({ "--var": val })`. All CSS class names must use the `repo-notes-` prefix.

- **i18n**: Use `getT(lang: Lang): T` from `src/i18n.ts`. The plugin's `get t()` resolves the language via `resolveUiLang(this.settings.uiLang, momentLocale)`. `uiLang` is `"auto" | "en" | "ja"`. When `"auto"`, Obsidian's locale is detected dynamically via `window.moment.locale()`.

- **Settings migration**: `loadSettings()` contains migration logic from the old single-account format to the `profiles[]` array format. When adding new settings fields, handle migration similarly. Also ensure missing fields are filled with defaults.

- **AI providers**: Switch via `summaryProvider: "anthropic" | "openai-compatible"`. `summarizeReadme()` dispatches to `summarizeReadmeAnthropic()` or `summarizeReadmeOpenAI()`. OpenAI-compatible uses the `/v1/chat/completions` endpoint. Use `checkCanSummarize()` to determine if summarization is available.

- **Sync vs. AI summarize separation**: `syncCurrentNote()` never calls AI — it preserves the existing `## Summary` section via `extractSummary()`. `summarizeCurrentNote()` never re-fetches repo metadata from GitHub — it reconstructs the `GitHubRepo` object from the note's frontmatter and only fetches the README for AI. This keeps API costs predictable.

- **Commit count fetching** is batched (10 parallel) to respect GitHub API rate limits.

- **TypeScript constraints**: `tsconfig.json` sets `lib: ["ES6", "DOM"]` and `target: "ES6"`. TypeScript 5.x (`^5.3.0`) with `moduleResolution: bundler` is used, but methods like `Array.prototype.includes` (ES2016+) cause type errors — use `indexOf` etc. as alternatives.

- **`obsidian` module is external** (not bundled by esbuild). Obsidian runtime provides it, so imports are for type definitions only.

## Exported pure functions (for testing)

The following functions are exported from `src/main.ts` for unit testing:

| Function | Purpose |
|---|---|
| `resolveUiLang(uiLang, momentLocale)` | Returns the resolved language from `uiLang` setting and Obsidian locale |
| `checkCanSummarize(settings)` | Returns whether AI summarization is available with current settings |
| `buildNote(profile, item, ...)` | Generates the note Markdown string |
| `sanitizeFilename(name)` | Converts characters invalid in filenames to hyphens |
| `defaultProfile(id, name)` | Creates a Profile object with default values |
| `extractMemo(content)` | Extracts the `## Memo` section from note content |
| `extractSummary(content)` | Extracts the `## Summary` section from note content (trimmed) |

## Git workflow

- **Commit messages must be in English** (Obsidian has many international users). Example: `Add rate limit display to SyncModal`
- **Never push directly to main** (branch protection rules enforced). Always create a branch and open a PR.
- **Always cut new branches from `main`**. Branching from old branches causes merged changes to appear in diffs.
- After committing: `git push origin <branch>` → `gh pr create`.
- After squash merge, delete branches with `git branch -D` (`-d` gives "not fully merged" error).
- **Update `CLAUDE.md` and `CLAUDE.ja.md` before opening a PR** when behavior, architecture, or exported functions change.

## Obsidian plugin review (obsidianmd/obsidian-releases)

- **ObsidianReviewBot** scans source code on the main branch (no release tag needed).
- ESLint rules (required):
  - No `any` types → type `window.moment` as `Window & { moment?: { locale?: () => string } }`
  - No direct `element.style.*` → use CSS classes (`addClass/removeClass`) or `setCssProps({ "--var": val })`
  - No `async` event handlers → `el.addEventListener("click", () => { void (async () => { ... })(); })`
  - No `createEl("h2/h3")` → use `new Setting(containerEl).setName(...).setHeading()`
  - Command IDs must not include the plugin ID (`"sync"` ✓ / `"repo-notes-sync"` ✗)
  - No `console.log` → use `console.debug/warn/error`
  - UI text must be sentence case (except proper nouns)
  - No `@ts-ignore` → use `@ts-expect-error -- <reason>`
- **All comments in `src/main.ts` and `src/i18n.ts` must be in English** (Obsidian community reviewers are English speakers)
- **Function names and string arguments must always be in English** across all files (avoid 2-byte characters in identifiers and arguments)
- Test file comments (`src/__tests__/`) may be in Japanese

## Release

### Stable release

Pushing a tag triggers `.github/workflows/release.yml`, which automatically creates a release and opens a CHANGELOG.md update PR.

```bash
# 1. Update version in manifest.json → PR → merge to main
# 2. Push tag (no `v` prefix)
git tag 1.2.0
git push origin 1.2.0
```

- Tag format: **no `v` prefix** (`v1.0.0` will not trigger the workflow)
- Release assets: `main.js`, `manifest.json`, `styles.css`, `repo-notes.zip`
- After release, merge the auto-created `chore/changelog-<version>` PR

### Pre-release (beta / BRAT distribution)

`.github/workflows/pre-release.yml` triggers on tags containing `-` and creates a GitHub Release with `prerelease: true`. BRAT users can then install the beta.

```bash
# 1. Update manifest.json version to beta (e.g. 1.1.1-beta.1) → PR → merge to main
# 2. Push tag
git tag 1.1.1-beta.1
git push origin 1.1.1-beta.1
```

- Tag format: `1.1.1-beta.1`, `1.1.1-rc.1` etc. (must contain `-`)
- CHANGELOG is not updated (will be updated at stable release)
- Before stable release: update manifest.json to stable version → PR → merge → tag
