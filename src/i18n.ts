export type Lang = "en" | "ja";

const translations = {
  en: {
    // Sync Modal
    modalTitle: "Repo Notes",
    modalProfile: "Profile",
    modalProfileDesc: "Select account to sync",
    modalReady: "Ready to sync",
    modalSyncBtn: "Sync",
    modalSyncing: "Syncing...",
    modalResync: "Sync again",
    modalClose: "Close",
    modalNoToken: "⚠️ Please enter your GitHub token in settings",
    statTotal: "TOTAL",
    statSaved: "SAVED",
    statSkipped: "SKIPPED",
    statError: "ERROR",

    // Settings Tab
    settingsTitle: "Repo Notes",
    sectionProfiles: "Profiles",
    addProfile: "+ Add",
    profileName: "Profile name",
    profileDelete: "Delete",

    sectionAuth: "Authentication",
    tokenName: "GitHub Personal Access Token",
    tokenDesc: "Classic (ghp_...) or Fine-grained (github_pat_...) both supported. Required scopes: Stars → public_repo, Private repos → repo",
    tokenPlaceholder: "ghp_... or github_pat_...",

    sectionStars: "⭐ Starred Repositories",
    syncStars: "Sync starred repositories",
    starsFolder: "Save folder",

    sectionMyRepos: "📁 My Repositories",
    syncMyRepos: "Sync my repositories",
    myReposFolder: "Save folder",
    includeForks: "Include forks",
    includeForksDesc: "Include repositories you have forked",
    includePrivate: "Include private repositories",

    sectionNoteContent: "Note content",
    includeDescription: "Description",
    includeDescriptionDesc: "Include repository description as a property",
    includeTopics: "Topics / Tags",
    includeTopicsDesc: "Save GitHub topics as Obsidian tags",
    includeStats: "Stars / Language / Forks",
    includeStatsDesc: "Include stats as properties",
    includeCommitCount: "Commit count",
    includeCommitCountDesc: "Fetch total commits on default branch (increases API requests)",
    includeLastUpdated: "Last updated",
    includeLastUpdatedDesc: "Record the date of the last push",
    includeStarredDate: "Starred date",
    includeStarredDateDesc: "Record when you starred the repo (stars sync only)",
    overwriteExisting: "Overwrite existing files",
    overwriteExistingDesc: "When off, only new repositories are saved",

    sectionReadme: "README",
    includeReadmeRaw: "Include full README",
    includeReadmeRawDesc: "Embed the full README in the note (increases file size)",
    includeReadmeSummary: "Include AI README summary",
    includeReadmeSummaryDesc: "Requires Anthropic API key",

    sectionShared: "Shared settings",
    anthropicKey: "Anthropic API key",
    anthropicKeyDesc: "Used for README summaries (shared across all profiles)",
    anthropicKeyPlaceholder: "sk-ant-api03-...",
    summaryLang: "Summary language",
    autoSync: "Auto-sync on startup",
    autoSyncProfile: "Profile to auto-sync",

    sectionActions: "Actions",
    syncNow: "Sync now",
    syncNowDesc: (name: string) => `Sync [${name}]`,

    // Organizations
    sectionOrgs: "🏢 Organizations",
    orgNames: "Organization names",
    orgNamesDesc: "Repos from these orgs will be saved in a subfolder named after each org (under My Repos parent folder). Requires org:read scope or Fine-grained with org access.",
    orgNamesPlaceholder: "my-company\nanother-org",

    // Folder picker
    folderParentPlaceholder: "── Select parent folder ──",
    folderSubPlaceholder: "Subfolder name",
    folderRoot: "(root)",

    // Progress messages
    progressFetching: (name: string, label: string) => `[${name}] Fetching ${label}...`,
    progressFetched: (name: string, label: string, n: number) => `[${name}] ${label}: ${n} repos fetched`,
    progressCommits: (name: string) => `[${name}] Fetching commit counts...`,
    progressCommitsN: (name: string, cur: number, total: number) => `[${name}] Commit counts (${cur}/${total})`,
    progressDone: (name: string, label: string, saved: number, skipped: number, errors: number) =>
      `[${name}] ${label} done: ${saved} saved, ${skipped} skipped, ${errors} errors`,
    progressError: (msg: string) => `Error: ${msg}`,
    labelStars: "Starred repos",
    labelMine: "My repos",

    // Notices
    noticeAutoSync: (name: string) => `Repo Notes: Auto-syncing [${name}]...`,
    noticeNoToken: (name: string) => `⚠️ [${name}] Please set your GitHub token`,
    noticeError: (msg: string) => `Repo Notes error: ${msg}`,
  },

  ja: {
    // Sync Modal
    modalTitle: "Repo Notes",
    modalProfile: "プロファイル",
    modalProfileDesc: "同期するアカウントを選択",
    modalReady: "同期の準備ができています",
    modalSyncBtn: "同期開始",
    modalSyncing: "同期中...",
    modalResync: "再同期",
    modalClose: "閉じる",
    modalNoToken: "⚠️ 設定からGitHubトークンを入力してください",
    statTotal: "合計",
    statSaved: "保存",
    statSkipped: "スキップ",
    statError: "エラー",

    // Settings Tab
    settingsTitle: "Repo Notes",
    sectionProfiles: "プロファイル",
    addProfile: "+ 追加",
    profileName: "プロファイル名",
    profileDelete: "削除",

    sectionAuth: "認証",
    tokenName: "GitHub Personal Access Token",
    tokenDesc: "Classic (ghp_...) または Fine-grained (github_pat_...) どちらも対応。必要なスコープ: Stars同期→public_repo、プライベートRepo→repo",
    tokenPlaceholder: "ghp_... または github_pat_...",

    sectionStars: "⭐ Star済みリポジトリ",
    syncStars: "Star済みリポジトリを同期",
    starsFolder: "保存先フォルダ",

    sectionMyRepos: "📁 自分のリポジトリ",
    syncMyRepos: "自分のリポジトリを同期",
    myReposFolder: "保存先フォルダ",
    includeForks: "フォークを含める",
    includeForksDesc: "自分がフォークしたリポジトリも同期する",
    includePrivate: "プライベートリポジトリを含める",

    sectionNoteContent: "ノートの内容",
    includeDescription: "説明文 (Description)",
    includeDescriptionDesc: "リポジトリの説明をプロパティに含める",
    includeTopics: "トピック・タグ",
    includeTopicsDesc: "GitHubのトピックをObsidianのタグとして保存",
    includeStats: "Star数・言語・Fork数",
    includeStatsDesc: "統計情報をプロパティに含める",
    includeCommitCount: "コミット数",
    includeCommitCountDesc: "デフォルトブランチの総コミット数（APIリクエストが増えます）",
    includeLastUpdated: "最終更新日",
    includeLastUpdatedDesc: "最後にpushされた日付を記録",
    includeStarredDate: "Star登録日",
    includeStarredDateDesc: "いつStarしたかを記録（Stars同期のみ）",
    overwriteExisting: "既存ファイルを上書き",
    overwriteExistingDesc: "オフにすると新規リポジトリのみ保存",

    sectionReadme: "README",
    includeReadmeRaw: "README本文を含める",
    includeReadmeRawDesc: "READMEの全文をノートに埋め込みます",
    includeReadmeSummary: "README要約（AI）を含める",
    includeReadmeSummaryDesc: "Anthropic APIキーが必要",

    sectionShared: "共通設定",
    anthropicKey: "Anthropic API キー",
    anthropicKeyDesc: "README要約に使用（全プロファイル共通）",
    anthropicKeyPlaceholder: "sk-ant-api03-...",
    summaryLang: "要約言語",
    autoSync: "起動時に自動同期",
    autoSyncProfile: "自動同期するプロファイル",

    sectionActions: "操作",
    syncNow: "今すぐ同期",
    syncNowDesc: (name: string) => `[${name}] を同期します`,

    // Organizations
    sectionOrgs: "🏢 Organizations",
    orgNames: "Organization名",
    orgNamesDesc: "指定したOrgのリポジトリを同期します。各Orgのサブフォルダに保存されます（自分のRepoの親フォルダ配下）。スコープ: read:org または Fine-grained でOrg権限が必要。",
    orgNamesPlaceholder: "my-company\nanother-org",

    // Folder picker
    folderParentPlaceholder: "── 親フォルダを選択 ──",
    folderSubPlaceholder: "サブフォルダ名",
    folderRoot: "(ルート)",

    // Progress messages
    progressFetching: (name: string, label: string) => `[${name}] ${label}を取得中...`,
    progressFetched: (name: string, label: string, n: number) => `[${name}] ${label}: ${n}件取得`,
    progressCommits: (name: string) => `[${name}] コミット数を取得中...`,
    progressCommitsN: (name: string, cur: number, total: number) => `[${name}] コミット数 (${cur}/${total})`,
    progressDone: (name: string, label: string, saved: number, skipped: number, errors: number) =>
      `[${name}] ${label} 完了: ${saved}件保存, ${skipped}件スキップ, ${errors}件エラー`,
    progressError: (msg: string) => `エラー: ${msg}`,
    labelStars: "Star済み",
    labelMine: "自分のRepo",

    // Notices
    noticeAutoSync: (name: string) => `Repo Notes: [${name}] 自動同期を開始します...`,
    noticeNoToken: (name: string) => `⚠️ [${name}] GitHubトークンを設定してください`,
    noticeError: (msg: string) => `Repo Notes エラー: ${msg}`,
  },
} as const;

export type T = typeof translations.en;

export function getT(lang: Lang): T {
  return (translations[lang] ?? translations.en) as T;
}
