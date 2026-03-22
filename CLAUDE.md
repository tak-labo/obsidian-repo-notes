# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Obsidian plugin** that imports GitHub starred repositories, own repositories, and organization repos as structured Markdown notes with YAML frontmatter. Supports AI-powered README summarization via Anthropic Claude or any OpenAI-compatible API (Ollama, LM Studio, vLLM, etc.).

## Commands

```bash
npm install          # 依存関係インストール
npm run dev          # 開発用ウォッチモード（変更を自動ビルド）
npm run build        # 型チェック(tsc -noEmit -skipLibCheck) + 本番ビルド
npm test             # Vitest でユニットテストを実行
npm run test:watch   # ウォッチモードでテストを実行
```

Docker で実行する場合は `docker compose run --rm build` / `docker compose run --rm test` / `docker compose run --rm lint` / `docker compose run --rm format-check`。

テストファイルは `src/__tests__/`、Obsidian API のモックは `src/__mocks__/obsidian.ts`。

### Vault へのシンボリックリンク（ライブ開発）

```bash
ln -s $(pwd) /path/to/vault/.obsidian/plugins/repo-notes
```

ビルド成果物は `main.js`（`.gitignore` で除外済み）。esbuild が `src/main.ts` をエントリポイントとしてバンドルする。

## Architecture

ソースファイルは2つ：

- **`src/i18n.ts`** — 日英翻訳オブジェクト。`getT(lang: Lang): T` をエクスポート。翻訳値には文字列だけでなく `(name: string) => string` のような関数型も含まれる。
- **`src/main.ts`** — プラグイン本体。以下のセクションで構成：
  - **Types** — `GitHubRepo`, `StarredItem`, `Profile`, `RepoNotesSettings` インターフェース
  - **Defaults** — `defaultProfile()`, `DEFAULT_SETTINGS`
  - **Main Plugin** (`RepoNotesPlugin extends Plugin`) — `onload`, `loadSettings`, `saveSettings`, `syncProfile`, `syncRepoList` などコアロジック
  - **Settings Tab** (`RepoNotesSettingTab extends PluginSettingTab`) — プロファイル管理UI
  - **Modals** (`SyncModal` など) — 同期進捗表示UI
  - **Pure utility functions** — テスト用にエクスポートされた純粋関数（後述）

## Key implementation notes

- **HTTP通信は必ず `requestUrl`（Obsidian API）を使うこと。** ブラウザの `fetch` はObsidianのサンドボックスで動作しない。

- **`window.moment` へのアクセス**は `(window as Window & { moment?: { locale?: () => string } })` で型付けすること。`as any` は禁止。

- **CSSスタイルの直接指定禁止**: `element.style.*` は使わず、CSSクラス（`addClass/removeClass`）か `setCssProps({ "--var": val })` を使う。CSSクラス名は `repo-notes-` プレフィックス必須。

- **i18n**: `src/i18n.ts` の `getT(lang: Lang): T` で翻訳オブジェクトを取得する。プラグインの `get t()` は `resolveUiLang(this.settings.uiLang, momentLocale)` を通じて言語を解決する。`uiLang` は `"auto" | "en" | "ja"` で、`"auto"` のときは `window.moment.locale()` でObsidianのロケールを動的検出する。

- **設定マイグレーション**: `loadSettings()` に旧シングルアカウント形式から `profiles[]` 配列形式へのマイグレーションロジックがある。新しい設定フィールドを追加する際は同様にマイグレーションを考慮すること。新フィールドが `data.json` に存在しない場合のデフォルト補完も必要。

- **AIプロバイダー**: `summaryProvider: "anthropic" | "openai-compatible"` で切り替える。`summarizeReadme()` がディスパッチャーとなり、`summarizeReadmeAnthropic()` または `summarizeReadmeOpenAI()` を呼ぶ。OpenAI互換は `/v1/chat/completions` エンドポイントを使用。`checkCanSummarize()` で要約可能かを判定。

- **コミット数取得**はバッチ処理（10件並列）で行われる（GitHub API レート制限対策）。

- **TypeScript制約**: `tsconfig.json` の `lib` が `["ES6", "DOM"]`、`target` が `ES6` で固定されている。TypeScript 5系（`^5.3.0`）を使用しており `moduleResolution: bundler` が有効だが、`Array.prototype.includes` などES2016以降のメソッドは型エラーになるため `indexOf` 等で代替すること。

- **`obsidian` モジュールは external**（esbuildがバンドルしない）。Obsidianランタイムが提供するため、importは型定義のみの目的で使う。

## Exported pure functions (テスト用)

ユニットテストのために以下の関数が `src/main.ts` からエクスポートされている：

| 関数 | 用途 |
|---|---|
| `resolveUiLang(uiLang, momentLocale)` | `uiLang` 設定値とObsidianロケールから実際の言語を返す |
| `checkCanSummarize(settings)` | 現在の設定でAI要約が実行可能かを返す |
| `buildNote(profile, item, ...)` | ノートのMarkdown文字列を生成する |
| `sanitizeFilename(name)` | ファイル名に使えない文字をハイフンに変換する |
| `defaultProfile(id, name)` | デフォルト値で Profile オブジェクトを生成する |

## Git ワークフロー

- **mainブランチへの直接pushは禁止**（ブランチ保護ルールあり）。必ずブランチを作成してPRを出すこと。
- **新ブランチは必ず `main` から作成すること**。古いブランチから切るとマージ済み変更がdiffに混入する。
- コミット後は `git push origin <branch>` → `gh pr create` の流れで進める。
- スカッシュマージ後のブランチ削除は `git branch -D`（`-d` では "not fully merged" エラーになる）。

## Obsidian プラグイン審査（obsidianmd/obsidian-releases）

- **ObsidianReviewBot** はmainブランチのソースコードをスキャンする（リリースタグ不要）。
- ESLintルール（必須）:
  - `any` 型禁止 → `window.moment` は `Window & { moment?: { locale?: () => string } }` で型付け
  - `element.style.*` 直接指定禁止 → CSSクラス（`addClass/removeClass`）か `setCssProps({ "--var": val })` を使う
  - `async` イベントハンドラ禁止 → `el.addEventListener("click", () => { void (async () => { ... })(); })`
  - `createEl("h2/h3")` 禁止 → `new Setting(containerEl).setName(...).setHeading()` を使う
  - コマンドIDにプラグインIDを含めない（`"sync"` ○ / `"repo-notes-sync"` ✗）
  - `console.log` 禁止 → `console.debug/warn/error` を使う
  - UIテキストはsentence case（固有名詞除く）

## Release

タグをプッシュすると `.github/workflows/release.yml` が起動し、自動でリリースと CHANGELOG.md 更新PRを作成する。

```bash
# 1. manifest.json のバージョンを更新 → PR → mainにマージ
# 2. タグをプッシュ（v プレフィックスなし）
git tag 1.0.2
git push origin 1.0.2
```

- タグ形式は **`v` プレフィックスなし**（`v1.0.0` ではワークフローが発火しない）
- リリース成果物: `main.js`, `manifest.json`, `styles.css`, `repo-notes.zip`
- リリース後に `chore/changelog-<version>` ブランチのPRが自動作成されるのでマージする
