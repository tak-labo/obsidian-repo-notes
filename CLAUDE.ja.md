# CLAUDE.ja.md（日本語版）

`CLAUDE.md` の日本語参照版。Claude Code が自動で読み込む設定ファイルは `.claude.local.md`。

## このプロジェクトについて

GitHub のスター済みリポジトリ・自分のリポジトリ・Organization のリポジトリを、YAML フロントマター付きの構造化された Markdown ノートとして Obsidian にインポートする **Obsidian プラグイン**。Anthropic Claude または OpenAI 互換 API（Ollama, LM Studio, vLLM など）による AI README 要約機能あり。

## コマンド

**ローカルの npm コマンドは使用禁止。必ず Docker で実行すること。**

```bash
docker compose run --rm build         # 型チェック + 本番ビルド
docker compose run --rm test          # Vitest でユニットテスト実行
docker compose run --rm lint          # ESLint チェック
docker compose run --rm format-check  # Prettier フォーマットチェック
```

テストファイルは `src/__tests__/`、Obsidian API のモックは `src/__mocks__/obsidian.ts`。

### Vault へのシンボリックリンク（ライブ開発）

```bash
ln -s $(pwd) /path/to/vault/.obsidian/plugins/repo-notes
```

ビルド成果物は `main.js`（`.gitignore` で除外済み）。esbuild が `src/main.ts` をエントリポイントとしてバンドルする。

## アーキテクチャ

ソースファイルは2つ：

- **`src/i18n.ts`** — 日英翻訳オブジェクト。`getT(lang: Lang): T` をエクスポート。翻訳値には文字列だけでなく `(name: string) => string` のような関数型も含まれる。
- **`src/main.ts`** — プラグイン本体。以下のセクションで構成：
  - **Types** — `GitHubRepo`, `StarredItem`, `Profile`, `RepoNotesSettings` インターフェース
  - **Defaults** — `defaultProfile()`, `DEFAULT_SETTINGS`
  - **Main Plugin** (`RepoNotesPlugin extends Plugin`) — `onload`, `loadSettings`, `saveSettings`, `syncProfile`, `syncRepoList` などコアロジック
  - **Settings Tab** (`RepoNotesSettingTab extends PluginSettingTab`) — プロファイル管理UI
  - **Modals** (`SyncModal` など) — 同期進捗表示UI
  - **Pure utility functions** — テスト用にエクスポートされた純粋関数（後述）

## 実装上の重要事項

- **HTTP通信は必ず `requestUrl`（Obsidian API）を使うこと。** ブラウザの `fetch` はObsidianのサンドボックスで動作しない。

- **`window.moment` へのアクセス**は `(window as Window & { moment?: { locale?: () => string } })` で型付けすること。`as any` は禁止。

- **CSSスタイルの直接指定禁止**: `element.style.*` は使わず、CSSクラス（`addClass/removeClass`）か `setCssProps({ "--var": val })` を使う。CSSクラス名は `repo-notes-` プレフィックス必須。

- **i18n**: `src/i18n.ts` の `getT(lang: Lang): T` で翻訳オブジェクトを取得する。プラグインの `get t()` は `resolveUiLang(this.settings.uiLang, momentLocale)` を通じて言語を解決する。`uiLang` は `"auto" | "en" | "ja"` で、`"auto"` のときは `window.moment.locale()` でObsidianのロケールを動的検出する。

- **設定マイグレーション**: `loadSettings()` に旧シングルアカウント形式から `profiles[]` 配列形式へのマイグレーションロジックがある。新しい設定フィールドを追加する際は同様にマイグレーションを考慮すること。新フィールドが `data.json` に存在しない場合のデフォルト補完も必要。

- **AIプロバイダー**: `summaryProvider: "anthropic" | "openai-compatible"` で切り替える。`summarizeReadme()` がディスパッチャーとなり、`summarizeReadmeAnthropic()` または `summarizeReadmeOpenAI()` を呼ぶ。OpenAI互換は `/v1/chat/completions` エンドポイントを使用。`checkCanSummarize()` で要約可能かを判定。

- **Sync と AI要約の責務分離**: `syncCurrentNote()` は AI を呼ばない。既存の `## Summary` セクションを `extractSummary()` で読み取って保持する。`summarizeCurrentNote()` は GitHub からリポジトリメタデータを再取得しない。フロントマターから `GitHubRepo` オブジェクトを再構築し、README のフェッチと AI のみ実行する。APIコストを予測可能に保つための設計。

- **コミット数取得**はバッチ処理（10件並列）で行われる（GitHub API レート制限対策）。

- **TypeScript制約**: `tsconfig.json` の `lib` が `["ES6", "DOM"]`、`target` が `ES6` で固定されている。TypeScript 5系（`^5.3.0`）を使用しており `moduleResolution: bundler` が有効だが、`Array.prototype.includes` などES2016以降のメソッドは型エラーになるため `indexOf` 等で代替すること。

- **`obsidian` モジュールは external**（esbuildがバンドルしない）。Obsidianランタイムが提供するため、importは型定義のみの目的で使う。

## テスト用エクスポート関数

ユニットテストのために以下の関数が `src/main.ts` からエクスポートされている：

| 関数 | 用途 |
|---|---|
| `resolveUiLang(uiLang, momentLocale)` | `uiLang` 設定値とObsidianロケールから実際の言語を返す |
| `checkCanSummarize(settings)` | 現在の設定でAI要約が実行可能かを返す |
| `buildNote(profile, item, ...)` | ノートのMarkdown文字列を生成する |
| `sanitizeFilename(name)` | ファイル名に使えない文字をハイフンに変換する |
| `defaultProfile(id, name)` | デフォルト値で Profile オブジェクトを生成する |
| `extractMemo(content)` | ノート本文から `## Memo` セクションを抽出する |
| `extractSummary(content)` | ノート本文から `## Summary` セクションを抽出する（末尾空白除去済み） |

## Git ワークフロー

- **コミットメッセージは英語で書くこと**（海外ユーザーが多いため）。例: `Add rate limit display to SyncModal`
- **mainブランチへの直接pushは禁止**（ブランチ保護ルールあり）。必ずブランチを作成してPRを出すこと。
- **新ブランチは必ず `main` から作成すること**。古いブランチから切るとマージ済み変更がdiffに混入する。
- コミット後は `git push origin <branch>` → `gh pr create` の流れで進める。
- スカッシュマージ後のブランチ削除は `git branch -D`（`-d` では "not fully merged" エラーになる）。
- **PRを出す前に `CLAUDE.md` と `CLAUDE.ja.md` を更新すること**（振る舞い・アーキテクチャ・エクスポート関数が変わった場合）。

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
  - `@ts-ignore` 禁止 → `@ts-expect-error -- <reason>` を使う
- **コメントはすべて英語**（Obsidian コミュニティレビュアーが英語話者のため）

## リリース

### 安定版リリース

タグをプッシュすると `.github/workflows/release.yml` が起動し、自動でリリースと CHANGELOG.md 更新PRを作成する。

```bash
# 1. manifest.json のバージョンを更新 → PR → mainにマージ
# 2. タグをプッシュ（v プレフィックスなし）
git tag 1.2.0
git push origin 1.2.0
```

- タグ形式は **`v` プレフィックスなし**（`v1.0.0` ではワークフローが発火しない）
- リリース成果物: `main.js`, `manifest.json`, `styles.css`, `repo-notes.zip`
- リリース後に `chore/changelog-<version>` ブランチのPRが自動作成されるのでマージする

### Pre-release（beta / BRAT 配布）

`.github/workflows/pre-release.yml` が `-` を含むタグで起動し、`prerelease: true` の GitHub Release を作成する。BRAT ユーザーが beta 版を試せる。

```bash
# 1. manifest.json のバージョンを beta バージョンに更新（例: 1.1.1-beta.1）→ PR → mainにマージ
# 2. タグをプッシュ
git tag 1.1.1-beta.1
git push origin 1.1.1-beta.1
```

- タグ形式: `1.1.1-beta.1`, `1.1.1-rc.1` など（`-` を含む）
- CHANGELOG は更新しない（安定版リリース時にまとめて更新される）
- 安定版リリース前に manifest.json を安定版バージョンに戻して PR → マージ → タグの流れ
