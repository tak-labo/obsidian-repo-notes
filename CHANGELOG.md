# Changelog

All notable changes to this project will be documented in this file.
*Format based on [Keep a Changelog](https://keepachangelog.com/)*

---

## [1.0.0] - 2026-03-20

### Added

- ⭐ **GitHub Stars sync** — import all starred repositories as notes
- 📁 **My Repos sync** — supports public/private repos with optional fork exclusion
- 🏢 **Organization sync** — import repos from specified GitHub organizations into per-org subfolders
- 👤 **Multi-profile** — manage multiple GitHub accounts as separate profiles with a tab UI
- 🗂 **Rich YAML frontmatter** — URL, description, language, stars, forks, commits, last updated, starred date, topics (as Obsidian tags)
- 🤖 **AI README summary** — automatic README summarization via Claude Haiku (Anthropic API), with English/Japanese output option
- 📄 **Raw README embed** — optionally embed full README content in the note body
- 🌐 **i18n (English / Japanese)** — UI language switches automatically based on Obsidian's locale setting (`src/i18n.ts`)
- 🔒 **Fine-grained PAT support** — compatible with both Classic (`ghp_...`) and Fine-grained (`github_pat_...`) personal access tokens
- ⚙️ **Auto-sync on startup** — automatically sync a designated profile when Obsidian launches
- 📂 **Flexible folder targeting** — combine a parent folder (dropdown) and subfolder name for fine-grained save location control
- 🔄 **Commit count fetching** — fetches total commits on the default branch in batches of 10 (GitHub API rate-limit friendly)
- 📊 **Sync progress modal** — real-time display of saved / skipped / error counts with a progress bar

### Settings migration

Automatic migration from the legacy single-account format (where `githubToken` was stored at the top level) to the new `profiles[]` array format. Existing vault settings are preserved.

---

## [1.0.0] - 2026-03-20

### 追加

- ⭐ **GitHub Stars同期** — Starしたリポジトリをノートとして一括インポート
- 📁 **自分のリポジトリ同期** — public/private両対応、フォーク除外オプション付き
- 🏢 **Organization同期** — 指定したOrgのリポジトリを各Orgサブフォルダに保存
- 👤 **マルチプロファイル** — 複数GitHubアカウントをプロファイルで管理、タブUIで切り替え
- 🗂 **リッチなYAMLフロントマター** — URL・説明文・言語・Star数・Fork数・コミット数・最終更新日・Star登録日・トピック（Obsidianタグ）
- 🤖 **AI README要約** — Claude Haiku（Anthropic API）によるREADME自動要約、日英出力切り替え対応
- 📄 **README全文埋め込み** — READMEをノート本文に展開するオプション
- 🌐 **日英UI自動切り替え** — Obsidianのロケール設定にあわせてUIを自動切り替え（`src/i18n.ts`）
- 🔒 **Fine-grained PAT対応** — Classic（`ghp_...`）とFine-grained（`github_pat_...`）の両方に対応
- ⚙️ **起動時自動同期** — Obsidian起動時に指定プロファイルを自動同期
- 📂 **柔軟なフォルダ指定** — 親フォルダ（ドロップダウン）＋サブフォルダ名の組み合わせで保存先を設定
- 🔄 **コミット数取得** — デフォルトブランチの総コミット数をバッチ取得（10件並列、APIレート制限対策）
- 📊 **同期進捗モーダル** — 保存・スキップ・エラー件数をプログレスバーとともにリアルタイム表示

### 設定マイグレーション

旧バージョン（`githubToken` をトップレベルに直接保持するシングルアカウント形式）から新しい `profiles[]` 配列形式への自動マイグレーションに対応。既存Vaultの設定はそのまま引き継がれる。
