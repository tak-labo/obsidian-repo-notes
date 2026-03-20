# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Obsidian plugin** that imports GitHub starred repositories and own repositories (including organization repos) as structured Markdown notes with YAML frontmatter. Integrates with GitHub API and Anthropic Claude API for README summarization.

## Commands

```bash
npm install          # 依存関係インストール
npm run dev          # 開発用ウォッチモード（変更を自動ビルド）
npm run build        # 型チェック(tsc -noEmit -skipLibCheck) + 本番ビルド
```

テストフレームワークは存在しない。

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

## Key implementation notes

- **HTTP通信は必ず `requestUrl`（Obsidian API）を使うこと。** ブラウザの `fetch` はObsidianのサンドボックスで動作しない。

- **i18n**: `src/i18n.ts` の `getT()` で翻訳オブジェクトを取得する。ロケール検出は `window.moment.locale().startsWith("ja")` で行う。翻訳キーには文字列の他に関数も含まれるため、`T` 型を使うこと。

- **設定マイグレーション**: `loadSettings()` に旧シングルアカウント形式（`githubToken` を直接持つ形式）から `profiles[]` 配列形式へのマイグレーションロジックがある。新しい設定フィールドを追加する際は同様にマイグレーションを考慮すること。

- **Anthropic API キー** は `RepoNotesSettings.anthropicApiKey` に保存される（vault の `.obsidian/plugins/repo-notes/data.json`）。

- **コミット数取得**はバッチ処理（10件並列）で行われる（GitHub API レート制限対策）。

- **TypeScript制約**: `tsconfig.json` の `lib` が `["ES6", "DOM"]` で固定されている。`Array.prototype.includes` などES2016以降のメソッドはコンパイルエラーになるため、`indexOf` などで代替すること。

- **`obsidian` モジュールは external**（esbuildがバンドルしない）。Obsidianランタイムが提供するため、importは型定義のみの目的で使う。

## Release

`.github/workflows/release.yml` により、タグプッシュ時に GitHub Actions で自動リリース。リリース成果物: `main.js`, `manifest.json`, `styles.css`。
