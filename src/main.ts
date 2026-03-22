import {
  App,
  DropdownComponent,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TextComponent,
  requestUrl,
} from "obsidian";
import { type Lang, type T, getT } from "./i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StarredItem {
  starred_at?: string;
  repo?: GitHubRepo;
}

export interface GitHubRepo {
  full_name: string;
  html_url: string;
  homepage: string | null;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  default_branch: string;
  pushed_at: string;
  updated_at: string;
  created_at: string;
  private?: boolean;
  fork?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  githubToken: string;
  syncStars: boolean;
  starsFolder: string;
  starsFolderParent: string;
  syncMyRepos: boolean;
  myReposFolder: string;
  myReposFolderParent: string;
  myReposIncludeForks: boolean;
  myReposIncludePrivate: boolean;
  orgNames: string[];       // comma-separated org logins to sync
  includeDescription: boolean;
  includeTopics: boolean;
  includeStats: boolean;
  includeStarredDate: boolean;
  includeCommitCount: boolean;
  includeLastUpdated: boolean;
  includeReadmeRaw: boolean;
  includeReadmeExcerpt: boolean;
  overwriteExisting: boolean;
  lastSyncedAt?: {
    stars?: string;
    mine?: string;
    orgs?: { [orgLogin: string]: string };
  };
}

interface RepoNotesSettings {
  profiles: Profile[];
  anthropicApiKey: string;
  readmeSummaryLang: string;
  uiLang: "auto" | Lang;
  autoSyncOnStartup: boolean;
  autoSyncProfileId: string;
  summaryProvider: "anthropic" | "openai-compatible";
  anthropicModel: string;
  summaryBaseUrl: string;
  summaryModel: string;
  summaryApiKey: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultProfile(id: string, name: string): Profile {
  return {
    id, name, githubToken: "",
    syncStars: true, starsFolder: "GitHub Stars", starsFolderParent: "",
    syncMyRepos: false, myReposFolder: "My Repos", myReposFolderParent: "",
    myReposIncludeForks: false, myReposIncludePrivate: true,
    orgNames: [],
    includeDescription: true, includeTopics: true, includeStats: true,
    includeStarredDate: true, includeCommitCount: true, includeLastUpdated: true,
    includeReadmeRaw: false, includeReadmeExcerpt: false, overwriteExisting: true,
  };
}

const DEFAULT_SETTINGS: RepoNotesSettings = {
  profiles: [defaultProfile("default", "Personal")],
  anthropicApiKey: "", readmeSummaryLang: "en",
  uiLang: "auto",
  autoSyncOnStartup: false, autoSyncProfileId: "",
  summaryProvider: "anthropic",
  anthropicModel: "claude-haiku-4-5-20251001",
  summaryBaseUrl: "",
  summaryModel: "",
  summaryApiKey: "",
};

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ─── Main Plugin ──────────────────────────────────────────────────────────────

export default class RepoNotesPlugin extends Plugin {
  settings: RepoNotesSettings;

  get t(): T {
    const momentLocale = (window as Window & { moment?: { locale?: () => string } }).moment?.locale?.() ?? "en";
    return getT(resolveUiLang(this.settings.uiLang, momentLocale));
  }

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("star", "Sync repos", () => new SyncModal(this.app, this).open());

    this.addCommand({
      id: "sync",
      name: "Sync",
      callback: () => new SyncModal(this.app, this).open(),
    });

    this.addCommand({
      id: "open-settings",
      name: "Open settings",
      callback: () => {
        // @ts-ignore
        this.app.setting.open();
        // @ts-ignore
        this.app.setting.openTabById("repo-notes");
      },
    });

    this.addSettingTab(new RepoNotesSettingTab(this.app, this));

    if (this.settings.autoSyncOnStartup) {
      const pid = this.settings.autoSyncProfileId;
      const profile = this.settings.profiles.find((p) => p.id === pid) ?? this.settings.profiles[0];
      if (profile?.githubToken) {
        this.app.workspace.onLayoutReady(() => {
          void (async () => {
            new Notice(this.t.noticeAutoSync(profile.name));
            await this.syncProfile(profile, (msg) => console.debug(msg));
          })();
        });
      }
    }
  }

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    // Migrate old single-account format
    if (saved && saved.githubToken && !saved.profiles) {
      const p = defaultProfile("default", "Personal");
      const s = saved;
      Object.assign(p, {
        githubToken: s.githubToken ?? "",
        syncStars: s.syncStars ?? true,
        starsFolder: s.targetFolder ?? "GitHub Stars",
        starsFolderParent: s.targetFolderDropdown ?? "",
        syncMyRepos: s.syncMyRepos ?? false,
        myReposFolder: s.myReposFolder ?? "My Repos",
        myReposFolderParent: s.myReposFolderDropdown ?? "",
        myReposIncludeForks: s.myReposIncludeForks ?? false,
        myReposIncludePrivate: s.myReposIncludePrivate ?? true,
        includeDescription: s.includeDescription ?? true,
        includeTopics: s.includeTopics ?? true,
        includeStats: s.includeStats ?? true,
        includeStarredDate: s.includeStarredDate ?? true,
        includeCommitCount: s.includeCommitCount ?? true,
        includeLastUpdated: s.includeLastUpdated ?? true,
        includeReadmeRaw: s.includeReadmeRaw ?? false,
        includeReadmeExcerpt: s.includeReadmeExcerpt ?? false,
        overwriteExisting: s.overwriteExisting ?? true,
      });
      this.settings.profiles = [p];
      this.settings.anthropicApiKey = s.anthropicApiKey ?? "";
      this.settings.readmeSummaryLang = s.readmeSummaryLang ?? "en";
      this.settings.autoSyncOnStartup = s.autoSyncOnStartup ?? false;
    }
    if (!this.settings.profiles?.length) {
      this.settings.profiles = [defaultProfile("default", "Personal")];
    }
    if (!this.settings.summaryProvider) {
      this.settings.summaryProvider = "anthropic";
    }
    if (!this.settings.anthropicModel) {
      this.settings.anthropicModel = "claude-haiku-4-5-20251001";
    }
    // Migrate: if uiLang was not explicitly saved (old default "en"), reset to "auto"
    if (!saved || !saved.uiLang) {
      this.settings.uiLang = "auto";
    }
  }

  async saveSettings() { await this.saveData(this.settings); }

  // ─── Core Sync ───────────────────────────────────────────────────────────────

  async syncProfile(
    profile: Profile,
    onProgress: (msg: string) => void,
    onResult?: (saved: number, skipped: number, errors: number, total: number) => void,
    shouldAbort?: () => boolean,
    forceSync = false
  ) {
    let totalSaved = 0, totalSkipped = 0, totalErrors = 0, totalCount = 0;
    const acc = (s: number, sk: number, e: number, t: number) => {
      totalSaved += s; totalSkipped += sk; totalErrors += e; totalCount += t;
    };
    if (profile.syncStars) {
      if (shouldAbort?.()) { onResult?.(totalSaved, totalSkipped, totalErrors, totalCount); return; }
      const parts = [profile.starsFolderParent, profile.starsFolder].filter(Boolean);
      await this.syncRepoList(profile, "stars", parts.join("/") || "GitHub Stars", onProgress, acc, undefined, shouldAbort, forceSync);
    }
    if (profile.syncMyRepos) {
      if (shouldAbort?.()) { onResult?.(totalSaved, totalSkipped, totalErrors, totalCount); return; }
      const parts = [profile.myReposFolderParent, profile.myReposFolder].filter(Boolean);
      await this.syncRepoList(profile, "mine", parts.join("/") || "My Repos", onProgress, acc, undefined, shouldAbort, forceSync);
    }
    for (const org of (profile.orgNames ?? [])) {
      if (shouldAbort?.()) break;
      const orgLogin = org.trim();
      if (!orgLogin) continue;
      const parts = [profile.myReposFolderParent, orgLogin].filter(Boolean);
      await this.syncRepoList(profile, "org", parts.join("/") || orgLogin, onProgress, acc, orgLogin, shouldAbort, forceSync);
    }
    if (!shouldAbort?.()) {
      const syncedAt = new Date().toISOString();
      if (!profile.lastSyncedAt) profile.lastSyncedAt = {};
      if (profile.syncStars) profile.lastSyncedAt.stars = syncedAt;
      if (profile.syncMyRepos) profile.lastSyncedAt.mine = syncedAt;
      for (const org of (profile.orgNames ?? [])) {
        const orgLogin = org.trim();
        if (!orgLogin) continue;
        if (!profile.lastSyncedAt.orgs) profile.lastSyncedAt.orgs = {};
        profile.lastSyncedAt.orgs[orgLogin] = syncedAt;
      }
      await this.saveSettings();
    }
    onResult?.(totalSaved, totalSkipped, totalErrors, totalCount);
  }

  private async syncRepoList(
    profile: Profile,
    mode: "stars" | "mine" | "org",
    folder: string,
    onProgress: (msg: string) => void,
    onResult?: (saved: number, skipped: number, errors: number, total: number) => void,
    orgLogin?: string,
    shouldAbort?: () => boolean,
    forceSync = false
  ) {
    const t = this.t;
    if (!profile.githubToken) {
      new Notice(t.noticeNoToken(profile.name));
      return;
    }

    let saved = 0, skipped = 0, errors = 0;
    const label = mode === "stars" ? t.labelStars : mode === "org" ? `Org: ${orgLogin}` : t.labelMine;

    try {
      onProgress(t.progressFetching(profile.name, label));
      const items = mode === "stars"
        ? await this.fetchAllStars(profile.githubToken)
        : mode === "org"
          ? await this.fetchOrgRepos(profile.githubToken, orgLogin!, profile.myReposIncludeForks)
          : await this.fetchMyRepos(profile.githubToken, profile.myReposIncludeForks, profile.myReposIncludePrivate);

      const total = items.length;
      onProgress(t.progressFetched(profile.name, label, total));
      await this.ensureFolder(folder);

      const lastSyncedAtStr = mode === "stars" ? profile.lastSyncedAt?.stars
        : mode === "mine" ? profile.lastSyncedAt?.mine
        : profile.lastSyncedAt?.orgs?.[orgLogin ?? ""];
      const lastSyncedAt = (!forceSync && lastSyncedAtStr) ? new Date(lastSyncedAtStr) : null;

      const commitCounts = new Map<string, number>();
      if (profile.includeCommitCount) {
        onProgress(t.progressCommits(profile.name));
        const repos = items.map((i) => (i.repo ?? i) as unknown as GitHubRepo);
        const reposToFetch = repos.filter((repo) => {
          if (!lastSyncedAt) return true;
          const repoUpdatedAt = repo.pushed_at ?? repo.updated_at;
          return !repoUpdatedAt || new Date(repoUpdatedAt) > lastSyncedAt;
        });
        for (let b = 0; b < reposToFetch.length; b += 10) {
          await Promise.all(reposToFetch.slice(b, b + 10).map(async (repo) => {
            try {
              commitCounts.set(repo.full_name, await this.fetchCommitCount(profile.githubToken, repo.full_name, repo.default_branch ?? "main"));
            } catch { commitCounts.set(repo.full_name, -1); }
          }));
          onProgress(t.progressCommitsN(profile.name, Math.min(b + 10, reposToFetch.length), reposToFetch.length));
        }
      }

      for (let i = 0; i < items.length; i++) {
        if (shouldAbort?.()) break;
        const item = items[i];
        const repo = (item.repo ?? item) as unknown as GitHubRepo;
        const fname = this.sanitizeFilename(repo.full_name.replace("/", "_")) + ".md";
        const fpath = `${folder}/${fname}`;

        onProgress(`[${mode === "stars" ? "⭐" : mode === "org" ? "🏢" : "📁"} ${i + 1}/${total}] ${repo.full_name}`);

        try {
          const exists = this.app.vault.getAbstractFileByPath(fpath) instanceof TFile;
          if (exists && !profile.overwriteExisting) { skipped++; continue; }

          const repoUpdatedAt = repo.pushed_at ?? repo.updated_at;
          const isUpdated = forceSync || !exists || !lastSyncedAt || !repoUpdatedAt
            || new Date(repoUpdatedAt) > lastSyncedAt;

          let readmeRaw: string | null = null;
          let readmeSummary: string | null = null;
          if (isUpdated && (profile.includeReadmeRaw || profile.includeReadmeExcerpt)) {
            readmeRaw = await this.fetchReadme(profile.githubToken, repo.full_name);
          }
          const canSummarize = checkCanSummarize(this.settings);
          if (isUpdated && profile.includeReadmeExcerpt && canSummarize && readmeRaw) {
            readmeSummary = await this.summarizeReadme(readmeRaw, repo.full_name);
          }

          const summaryMeta = readmeSummary ? {
            provider: this.settings.summaryProvider,
            model: this.settings.summaryProvider === "anthropic"
              ? this.settings.anthropicModel
              : this.settings.summaryModel,
          } : null;

          let existingMemo = "";
          if (exists) {
            const existingFile = this.app.vault.getAbstractFileByPath(fpath);
            if (existingFile instanceof TFile) {
              const existingContent = await this.app.vault.read(existingFile);
              existingMemo = extractMemo(existingContent);
            }
          }

          const content = buildNote(profile, item, commitCounts.get(repo.full_name) ?? -1, readmeSummary, readmeRaw, mode, summaryMeta, existingMemo);
          if (exists) {
            const existingFile = this.app.vault.getAbstractFileByPath(fpath);
            if (existingFile instanceof TFile) {
              await this.app.vault.modify(existingFile, content);
            }
          } else {
            await this.app.vault.create(fpath, content);
          }
          saved++;
        } catch (e) {
          errors++;
          console.error(`Error saving ${repo.full_name}:`, e);
        }
      }

      onProgress(t.progressDone(profile.name, label, saved, skipped, errors));
      onResult?.(saved, skipped, errors, total);
    } catch (e) {
      onProgress(t.progressError(e.message));
      new Notice(t.noticeError(e.message));
    }
  }

  // ─── GitHub API ──────────────────────────────────────────────────────────────

  private async fetchAllStars(token: string): Promise<StarredItem[]> {
    const items: StarredItem[] = [];
    let page = 1;
    while (true) {
      const res = await requestUrl({
        url: `https://api.github.com/user/starred?per_page=100&page=${page}`,
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.star+json" },
      });
      if (res.status !== 200) throw new Error(`GitHub API error: ${res.status}`);
      const data: StarredItem[] = res.json;
      if (!data.length) break;
      items.push(...data);
      page++;
      if (data.length < 100) break;
    }
    return items;
  }

  private async fetchMyRepos(token: string, includeForks: boolean, includePrivate: boolean): Promise<StarredItem[]> {
    const repos: GitHubRepo[] = [];
    let page = 1;
    const visibility = includePrivate ? "all" : "public";
    while (true) {
      const res = await requestUrl({
        url: `https://api.github.com/user/repos?per_page=100&page=${page}&visibility=${visibility}&affiliation=owner&sort=updated`,
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
      });
      if (res.status !== 200) throw new Error(`GitHub API error: ${res.status}`);
      const data: GitHubRepo[] = res.json;
      if (!data.length) break;
      for (const repo of data) {
        if (!includeForks && repo.fork) continue;
        repos.push(repo);
      }
      page++;
      if (data.length < 100) break;
    }
    return repos.map((repo) => ({ repo } as StarredItem));
  }

  private async fetchOrgRepos(token: string, org: string, includeForks: boolean): Promise<StarredItem[]> {
    const repos: GitHubRepo[] = [];
    let page = 1;
    while (true) {
      const res = await requestUrl({
        url: `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&sort=updated&type=all`,
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
      });
      if (res.status !== 200) throw new Error(`GitHub API error (org: ${org}): ${res.status}`);
      const data: GitHubRepo[] = res.json;
      if (!data.length) break;
      for (const repo of data) {
        if (!includeForks && repo.fork) continue;
        repos.push(repo);
      }
      page++;
      if (data.length < 100) break;
    }
    return repos.map((repo) => ({ repo } as StarredItem));
  }

  private async fetchCommitCount(token: string, fullName: string, branch: string): Promise<number> {
    const res = await requestUrl({
      url: `https://api.github.com/repos/${fullName}/commits?sha=${branch}&per_page=1`,
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
    });
    if (res.status !== 200) return -1;
    const link = res.headers["link"] ?? res.headers["Link"] ?? "";
    if (link) {
      const match = link.match(/page=(\d+)>; rel="last"/);
      if (match) return parseInt(match[1], 10);
    }
    return (res.json as unknown[]).length;
  }

  private async fetchReadme(token: string, fullName: string): Promise<string | null> {
    try {
      const res = await requestUrl({
        url: `https://api.github.com/repos/${fullName}/readme`,
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.raw+json" },
      });
      if (res.status !== 200) return null;
      const text = typeof res.text === "string" ? res.text
        : res.json?.content ? atob(res.json.content.replace(/\n/g, "")) : null;
      return text ? text.slice(0, 6000) : null;
    } catch { return null; }
  }

  private async summarizeReadme(readmeText: string, repoName: string): Promise<string | null> {
    if (this.settings.summaryProvider === "openai-compatible") {
      return this.summarizeReadmeOpenAI(readmeText, repoName);
    }
    return this.summarizeReadmeAnthropic(readmeText, repoName);
  }

  private async summarizeReadmeAnthropic(readmeText: string, repoName: string): Promise<string | null> {
    if (!this.settings.anthropicApiKey) return null;
    const lang = this.settings.readmeSummaryLang === "ja" ? "日本語" : "English";
    try {
      const res = await requestUrl({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": this.settings.anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.settings.anthropicModel || "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: `Summarize the following README for GitHub repository "${repoName}" in ${lang}, in 3-5 sentences. Include what the tool/library does, key features, and target users. No preamble.\n\n---\n${readmeText}` }],
        }),
      });
      if (res.status !== 200) {
        console.error(`[repo-notes] Anthropic API error: status=${res.status}`, res.json);
        return null;
      }
      return res.json?.content?.[0]?.text ?? null;
    } catch (e) {
      console.error("[repo-notes] Anthropic API request failed:", e);
      return null;
    }
  }

  private async summarizeReadmeOpenAI(readmeText: string, repoName: string): Promise<string | null> {
    if (!this.settings.summaryBaseUrl || !this.settings.summaryModel) return null;
    const lang = this.settings.readmeSummaryLang === "ja" ? "日本語" : "English";
    const baseUrl = this.settings.summaryBaseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.settings.summaryApiKey) {
      headers["authorization"] = `Bearer ${this.settings.summaryApiKey}`;
    }
    try {
      const res = await requestUrl({
        url: `${baseUrl}/chat/completions`,
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.settings.summaryModel,
          max_tokens: 4000,
          messages: [
            { role: "system", content: "You are a concise summarizer. Output only the final summary. No thinking, no preamble, no explanation." },
            { role: "user", content: `Summarize the following README for GitHub repository "${repoName}" in ${lang}, in 3-5 sentences. Include what the tool/library does, key features, and target users. Reply only in ${lang}.\n\n---\n${readmeText}` },
          ],
        }),
      });
      if (res.status !== 200) {
        console.error(`[repo-notes] OpenAI-compatible API error: status=${res.status}`, res.json);
        return null;
      }
      const msg = res.json?.choices?.[0]?.message;
      const text = (msg?.content || null);
      if (!text) console.warn("[repo-notes] OpenAI-compatible: unexpected response shape", JSON.stringify(res.json?.choices?.[0]));
      return text;
    } catch (e) {
      console.error("[repo-notes] OpenAI-compatible API request failed:", e);
      return null;
    }
  }

  async fetchAvailableModels(baseUrl: string): Promise<string[]> {
    const base = baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = {};
    if (this.settings.summaryApiKey) headers["authorization"] = `Bearer ${this.settings.summaryApiKey}`;
    const res = await requestUrl({ url: `${base}/models`, method: "GET", headers });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const data: Array<{ id: string }> = res.json?.data ?? [];
    return data.map((m) => m.id).sort();
  }

  async fetchAnthropicModels(): Promise<string[]> {
    if (!this.settings.anthropicApiKey) throw new Error("No API key");
    const res = await requestUrl({
      url: "https://api.anthropic.com/v1/models",
      method: "GET",
      headers: { "x-api-key": this.settings.anthropicApiKey, "anthropic-version": "2023-06-01" },
    });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const data: Array<{ id: string }> = res.json?.data ?? [];
    return data.map((m) => m.id).sort();
  }

  // ─── Note Builder ────────────────────────────────────────────────────────────

  buildNote(profile: Profile, item: StarredItem, commitCount = -1, readmeSummary: string | null = null, readmeRaw: string | null = null, mode: "stars" | "mine" | "org" = "stars"): string {
    return buildNote(profile, item, commitCount, readmeSummary, readmeRaw, mode);
  }

  sanitizeFilename(name: string): string {
    return sanitizeFilename(name);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

// ─── Pure utility functions (exported for testing) ────────────────────────────

export function resolveUiLang(uiLang: "auto" | Lang, momentLocale: string): Lang {
  if (uiLang === "auto") {
    return momentLocale.startsWith("ja") ? "ja" : "en";
  }
  return uiLang;
}

export function checkCanSummarize(settings: Pick<RepoNotesSettings, "summaryProvider" | "summaryBaseUrl" | "summaryModel" | "anthropicApiKey">): boolean {
  return settings.summaryProvider === "openai-compatible"
    ? !!(settings.summaryBaseUrl && settings.summaryModel)
    : !!settings.anthropicApiKey;
}

export function extractMemo(content: string): string {
  const memoStart = content.indexOf("## Memo\n");
  if (memoStart === -1) return "";
  const afterMemo = content.slice(memoStart + "## Memo\n".length);
  const nextHeading = afterMemo.search(/^## /m);
  return nextHeading === -1 ? afterMemo : afterMemo.slice(0, nextHeading);
}

export function buildNote(
  profile: Profile,
  item: StarredItem,
  commitCount = -1,
  readmeSummary: string | null = null,
  readmeRaw: string | null = null,
  mode: "stars" | "mine" | "org" = "stars",
  summaryMeta: { provider: string; model: string } | null = null,
  existingMemo = ""
): string {
  const repo = (item.repo ?? item) as GitHubRepo;
  const starredAt = item.starred_at ?? null;
  const now = new Date().toISOString().split("T")[0];
  const fmtDate = (iso: string | null | undefined) => iso ? iso.split("T")[0] : null;
  const lastUpdated = fmtDate(repo.pushed_at ?? repo.updated_at);

  const fm: string[] = ["---"];
  fm.push(`source: ${mode === "mine" ? "my-repo" : mode === "org" ? "org-repo" : "starred"}`);
  fm.push(`profile: "${profile.name}"`);
  fm.push(`repo: "${repo.full_name}"`);
  fm.push(`url: "${repo.html_url}"`);
  if (repo.homepage) fm.push(`website: "${repo.homepage}"`);
  if (profile.includeDescription && repo.description)
    fm.push(`description: "${repo.description.replace(/"/g, '\\"')}"`);
  if (profile.includeStats) {
    fm.push(`language: ${repo.language ?? "Unknown"}`);
    fm.push(`stars: ${repo.stargazers_count ?? 0}`);
    fm.push(`forks: ${repo.forks_count ?? 0}`);
  }
  if (profile.includeCommitCount && commitCount >= 0) fm.push(`commits: ${commitCount}`);
  if (profile.includeLastUpdated && lastUpdated) fm.push(`last_updated: ${lastUpdated}`);
  if (profile.includeStarredDate && starredAt) fm.push(`starred_at: ${starredAt.split("T")[0]}`);
  fm.push(`synced_at: ${now}`);
  if (summaryMeta) {
    fm.push(`summary_provider: ${summaryMeta.provider}`);
    fm.push(`summary_model: ${summaryMeta.model}`);
  }
  if (profile.includeTopics && repo.topics?.length)
    fm.push(`tags: [${repo.topics.map((t) => `"${t}"`).join(", ")}]`);
  fm.push("---\n");

  const lines: string[] = [];
  if (mode === "mine") lines.push(`> 🔒 ${repo.private ? "Private" : "Public"}\n`);
  lines.push("## Memo");
  lines.push(existingMemo || "\n");
  if (profile.includeReadmeExcerpt && readmeSummary) { lines.push("## Summary"); lines.push(readmeSummary + "\n"); }
  if (profile.includeReadmeRaw && readmeRaw) { lines.push("## README"); lines.push(readmeRaw + "\n"); }

  return fm.join("\n") + lines.join("\n");
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, "-");
}

// ─── Sync Modal ───────────────────────────────────────────────────────────────

class SyncModal extends Modal {
  plugin: RepoNotesPlugin;
  logEl: HTMLElement;
  progressEl: HTMLElement;
  progressBar: HTMLElement;
  statsEl: HTMLElement;
  running = false;
  aborted = false;
  initialProfileId: string | null;

  constructor(app: App, plugin: RepoNotesPlugin, initialProfileId: string | null = null) {
    super(app);
    this.plugin = plugin;
    this.initialProfileId = initialProfileId;
  }

  onOpen() {
    const t = this.plugin.t;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("repo-notes-modal");
    contentEl.createEl("h2", { text: t.modalTitle });

    const profiles = this.plugin.settings.profiles;
    let selectedProfileId = this.initialProfileId ?? profiles[0]?.id ?? "";

    if (profiles.length > 1) {
      new Setting(contentEl).setName(t.modalProfile).setDesc(t.modalProfileDesc)
        .addDropdown((drop) => {
          for (const p of profiles) drop.addOption(p.id, p.name);
          drop.setValue(selectedProfileId);
          drop.onChange((v) => { selectedProfileId = v; });
        });
    }

    const progressWrap = contentEl.createDiv("gs-progress-wrap");
    this.progressEl = progressWrap.createDiv("gs-status-text");
    this.progressBar = progressWrap.createDiv("gs-track").createDiv("gs-fill");

    this.statsEl = contentEl.createDiv("gs-stats");
    this.statsEl.addClass("repo-notes-hidden");
    this.logEl = contentEl.createDiv("gs-log");

    const btnRow = contentEl.createDiv("gs-btn-row");
    const syncBtn = btnRow.createEl("button", { text: t.modalSyncBtn, cls: "mod-cta" });
    const forceBtn = btnRow.createEl("button", { text: t.modalForceSyncBtn });
    const abortBtn = btnRow.createEl("button", { text: t.modalAbort });
    abortBtn.addClass("repo-notes-hidden");

    const runSync = (forceSync: boolean) => {
      void (async () => {
        if (this.running) return;
        const profile = this.plugin.settings.profiles.find((p) => p.id === selectedProfileId);
        if (!profile) return;

        this.running = true;
        this.aborted = false;
        syncBtn.addClass("repo-notes-hidden");
        forceBtn.addClass("repo-notes-hidden");
        abortBtn.removeClass("repo-notes-hidden");
        abortBtn.disabled = false;
        abortBtn.setText(t.modalAbort);
        this.logEl.empty();
        this.statsEl.addClass("repo-notes-hidden");

        let count = 0;
        await this.plugin.syncProfile(
          profile,
          (msg) => {
            this.progressEl.setText(msg);
            this.appendLog(msg);
            count++;
            this.progressBar.setCssProps({ "--gs-fill-width": `${Math.min(count * 2, 95)}%` });
          },
          (saved, skipped, errors, total) => {
            this.progressBar.setCssProps({ "--gs-fill-width": "100%" });
            this.showStats(saved, skipped, errors, total);
          },
          () => this.aborted,
          forceSync
        );

        this.running = false;
        abortBtn.addClass("repo-notes-hidden");
        syncBtn.removeClass("repo-notes-hidden");
        forceBtn.removeClass("repo-notes-hidden");
        syncBtn.setText(t.modalResync);
        if (this.aborted) this.progressEl.setText(t.modalAborted);
      })();
    };

    syncBtn.addEventListener("click", () => runSync(false));

    forceBtn.addEventListener("click", () => {
      const ok = window.confirm(t.modalForceSyncConfirm);
      if (!ok) return;
      runSync(true);
    });

    abortBtn.addEventListener("click", () => {
      this.aborted = true;
      abortBtn.disabled = true;
      abortBtn.setText(t.modalAborted);
    });

    const closeBtn = btnRow.createEl("button", { text: t.modalClose });
    closeBtn.addEventListener("click", () => this.close());

    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (profile?.githubToken) {
      const lastSynced = profile.lastSyncedAt;
      const dates: string[] = [];
      if (lastSynced?.stars) dates.push(`Stars: ${lastSynced.stars.split("T")[0]}`);
      if (lastSynced?.mine) dates.push(`Mine: ${lastSynced.mine.split("T")[0]}`);
      const label = dates.length > 0
        ? `${t.modalReady} (${t.lastSynced(dates.join(", "))})`
        : t.modalReady;
      this.progressEl.setText(label);
      syncBtn.click();
    } else {
      this.progressEl.setText(t.modalNoToken);
    }
  }

  appendLog(msg: string) {
    const line = this.logEl.createDiv("gs-log-line");
    line.addClass(msg.includes("error") || msg.includes("エラー") || msg.includes("Error") ? "gs-log-err"
      : msg.includes("skipped") || msg.includes("スキップ") ? "gs-log-skip" : "gs-log-ok");
    line.setText(msg);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  showStats(saved: number, skipped: number, errors: number, total: number) {
    const t = this.plugin.t;
    this.statsEl.removeClass("repo-notes-hidden");
    this.statsEl.empty();
    for (const s of [
      { label: t.statTotal, value: total }, { label: t.statSaved, value: saved },
      { label: t.statSkipped, value: skipped }, { label: t.statError, value: errors },
    ]) {
      const card = this.statsEl.createDiv("gs-stat-card");
      card.createDiv("gs-stat-val").setText(String(s.value));
      card.createDiv("gs-stat-label").setText(s.label);
    }
  }

  onClose() { this.contentEl.empty(); }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class RepoNotesSettingTab extends PluginSettingTab {
  plugin: RepoNotesPlugin;
  private activeProfileId: string;

  constructor(app: App, plugin: RepoNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeProfileId = plugin.settings.profiles[0]?.id ?? "";
  }

  display(): void {
    const { containerEl } = this;
    const t = this.plugin.t;
    containerEl.empty();
    new Setting(containerEl).setName(t.settingsTitle).setHeading();

    const profiles = this.plugin.settings.profiles;
    if (!profiles.find((p) => p.id === this.activeProfileId)) {
      this.activeProfileId = profiles[0]?.id ?? "";
    }

    // ── 言語設定（最上部）────────────────────────────────────────────────
    new Setting(containerEl).setName("Language / 言語")
      .addDropdown((d) =>
        d.addOption("auto", "Auto (follow Obsidian)").addOption("en", "English").addOption("ja", "日本語")
          .setValue(this.plugin.settings.uiLang)
          .onChange(async (v) => {
            this.plugin.settings.uiLang = v as "auto" | Lang;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // ── プロファイルタブ ──────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionProfiles).setHeading();
    const tabRow = containerEl.createDiv({ attr: { style: "display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;" } });

    const renderTabs = () => {
      tabRow.empty();
      for (const p of this.plugin.settings.profiles) {
        const isActive = p.id === this.activeProfileId;
        const btn = tabRow.createEl("button", {
          text: p.name,
          attr: { style: `padding:4px 14px; border-radius:6px; border:1px solid var(--color-border-tertiary); cursor:pointer; font-size:13px; background:${isActive ? "var(--interactive-accent)" : "var(--background-secondary)"}; color:${isActive ? "var(--text-on-accent)" : "var(--text-normal)"};` },
        });
        btn.addEventListener("click", () => { this.activeProfileId = p.id; this.display(); });
      }
      const addBtn = tabRow.createEl("button", {
        text: t.addProfile,
        attr: { style: "padding:4px 14px; border-radius:6px; border:1px dashed var(--color-border-secondary); cursor:pointer; font-size:13px;" },
      });
      addBtn.addEventListener("click", () => {
        void (async () => {
          const p = defaultProfile(genId(), `Account ${this.plugin.settings.profiles.length + 1}`);
          this.plugin.settings.profiles.push(p);
          this.activeProfileId = p.id;
          await this.plugin.saveSettings();
          this.display();
        })();
      });
    };
    renderTabs();

    const profile = this.plugin.settings.profiles.find((p) => p.id === this.activeProfileId);
    if (!profile) return;

    const nameRow = new Setting(containerEl).setName(t.profileName)
      .addText((tx) => tx.setValue(profile.name).onChange(async (v) => {
        profile.name = v || "Unnamed"; await this.plugin.saveSettings(); renderTabs();
      }));
    if (this.plugin.settings.profiles.length > 1) {
      nameRow.addButton((btn) => btn.setButtonText(t.profileDelete).setWarning().onClick(async () => {
        this.plugin.settings.profiles = this.plugin.settings.profiles.filter((p) => p.id !== profile.id);
        this.activeProfileId = this.plugin.settings.profiles[0]?.id ?? "";
        await this.plugin.saveSettings(); this.display();
      }));
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionAuth).setHeading();
    new Setting(containerEl).setName(t.tokenName).setDesc(t.tokenDesc)
      .addText((tx) => tx.setPlaceholder(t.tokenPlaceholder).setValue(profile.githubToken)
        .onChange(async (v) => { profile.githubToken = v.trim(); await this.plugin.saveSettings(); }));

    // ── Stars ─────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionStars).setHeading();
    new Setting(containerEl).setName(t.syncStars)
      .addToggle((tg) => tg.setValue(profile.syncStars).onChange(async (v) => { profile.syncStars = v; await this.plugin.saveSettings(); }));
    this.addFolderSetting(containerEl, t.starsFolder, "", profile.starsFolder, profile.starsFolderParent,
      async (tv, dv) => { if (tv !== null) profile.starsFolder = tv; if (dv !== null) profile.starsFolderParent = dv; await this.plugin.saveSettings(); });

    // ── My Repos ──────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionMyRepos).setHeading();
    new Setting(containerEl).setName(t.syncMyRepos)
      .addToggle((tg) => tg.setValue(profile.syncMyRepos).onChange(async (v) => { profile.syncMyRepos = v; await this.plugin.saveSettings(); }));
    this.addFolderSetting(containerEl, t.myReposFolder, "", profile.myReposFolder, profile.myReposFolderParent,
      async (tv, dv) => { if (tv !== null) profile.myReposFolder = tv; if (dv !== null) profile.myReposFolderParent = dv; await this.plugin.saveSettings(); });
    new Setting(containerEl).setName(t.includeForks).setDesc(t.includeForksDesc)
      .addToggle((tg) => tg.setValue(profile.myReposIncludeForks).onChange(async (v) => { profile.myReposIncludeForks = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t.includePrivate)
      .addToggle((tg) => tg.setValue(profile.myReposIncludePrivate).onChange(async (v) => { profile.myReposIncludePrivate = v; await this.plugin.saveSettings(); }));

    // ── Organizations ─────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionOrgs).setHeading();
    new Setting(containerEl).setName(t.orgNames).setDesc(t.orgNamesDesc)
      .addTextArea((ta) => {
        ta.setPlaceholder(t.orgNamesPlaceholder)
          .setValue((profile.orgNames ?? []).join("\n"))
          .onChange(async (v) => {
            profile.orgNames = v.split("\n").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          });
        ta.inputEl.addClass("repo-notes-full-width");
        ta.inputEl.rows = 3;
      });

    // ── Note content ──────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionNoteContent).setHeading();
    const toggles: Array<[keyof Profile, string, string]> = [
      ["includeDescription", t.includeDescription, t.includeDescriptionDesc],
      ["includeTopics", t.includeTopics, t.includeTopicsDesc],
      ["includeStats", t.includeStats, t.includeStatsDesc],
      ["includeCommitCount", t.includeCommitCount, t.includeCommitCountDesc],
      ["includeLastUpdated", t.includeLastUpdated, t.includeLastUpdatedDesc],
      ["includeStarredDate", t.includeStarredDate, t.includeStarredDateDesc],
      ["overwriteExisting", t.overwriteExisting, t.overwriteExistingDesc],
    ];
    for (const [key, name, desc] of toggles) {
      new Setting(containerEl).setName(name).setDesc(desc)
        .addToggle((tg) => tg.setValue(profile[key] as boolean).onChange(async (v) => {
          (profile[key] as boolean) = v; await this.plugin.saveSettings();
        }));
    }

    // ── README ────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionReadme).setHeading();
    new Setting(containerEl).setName(t.includeReadmeRaw).setDesc(t.includeReadmeRawDesc)
      .addToggle((tg) => tg.setValue(profile.includeReadmeRaw).onChange(async (v) => { profile.includeReadmeRaw = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t.includeReadmeSummary).setDesc(t.includeReadmeSummaryDesc)
      .addToggle((tg) => tg.setValue(profile.includeReadmeExcerpt).onChange(async (v) => { profile.includeReadmeExcerpt = v; await this.plugin.saveSettings(); }));

    // ── Shared ────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionShared).setHeading();
    new Setting(containerEl).setName(t.summaryProvider).setDesc(t.summaryProviderDesc)
      .addDropdown((d) =>
        /* eslint-disable obsidianmd/ui/sentence-case -- proper nouns: Anthropic, OpenAI, Ollama, LM Studio, vLLM */
        d.addOption("anthropic", "Anthropic (Claude)")
         .addOption("openai-compatible", "OpenAI-compatible (Ollama, LM Studio, vLLM...)")
        /* eslint-enable obsidianmd/ui/sentence-case */
         .setValue(this.plugin.settings.summaryProvider)
         .onChange(async (v) => {
           this.plugin.settings.summaryProvider = v as "anthropic" | "openai-compatible";
           await this.plugin.saveSettings();
           this.display();
         })
      );
    if (this.plugin.settings.summaryProvider === "anthropic") {
      this.addApiKeySetting(containerEl, t.anthropicKey, t.anthropicKeyDesc, t.anthropicKeyPlaceholder,
        () => this.plugin.settings.anthropicApiKey,
        async (v) => { this.plugin.settings.anthropicApiKey = v; await this.plugin.saveSettings(); });
      const anthropicModelSetting = new Setting(containerEl).setName(t.anthropicModel).setDesc(t.anthropicModelDesc);
      const renderAnthropicModelControl = (models: string[] | null) => {
        anthropicModelSetting.controlEl.empty();
        if (models && models.length > 0) {
          new DropdownComponent(anthropicModelSetting.controlEl)
            .addOptions(Object.fromEntries(models.map((m) => [m, m])))
            .setValue(this.plugin.settings.anthropicModel || models[0])
            .onChange(async (v) => { this.plugin.settings.anthropicModel = v; await this.plugin.saveSettings(); });
        } else {
          new TextComponent(anthropicModelSetting.controlEl)
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- model identifier, not UI text
            .setPlaceholder("claude-haiku-4-5-20251001")
            .setValue(this.plugin.settings.anthropicModel)
            .onChange(async (v) => { this.plugin.settings.anthropicModel = v.trim(); await this.plugin.saveSettings(); });
        }
        const btn = anthropicModelSetting.controlEl.createEl("button", { text: t.summaryModelFetch, cls: "repo-notes-model-btn" });
        btn.addEventListener("click", () => {
          void (async () => {
            btn.disabled = true;
            btn.setText(t.summaryModelFetching);
            try {
              const fetched = await this.plugin.fetchAnthropicModels();
              renderAnthropicModelControl(fetched);
            } catch (e) {
              console.error("[repo-notes] fetchAnthropicModels failed:", e);
              renderAnthropicModelControl(null);
            }
          })();
        });
      };
      renderAnthropicModelControl(null);
    }
    if (this.plugin.settings.summaryProvider === "openai-compatible") {
      new Setting(containerEl).setName(t.summaryPreset).setDesc(t.summaryPresetDesc)
        .addDropdown((d) => {
          d.addOption("", "Custom")
           /* eslint-disable obsidianmd/ui/sentence-case -- proper nouns: Ollama, LM Studio */
           .addOption("ollama", "Ollama (localhost:11434)")
           .addOption("lmstudio", "LM Studio (localhost:1234)")
           /* eslint-enable obsidianmd/ui/sentence-case */
           .setValue("")
           .onChange(async (v) => {
             if (v === "ollama") this.plugin.settings.summaryBaseUrl = "http://localhost:11434/v1";
             else if (v === "lmstudio") this.plugin.settings.summaryBaseUrl = "http://localhost:1234/v1";
             await this.plugin.saveSettings();
             this.display();
           });
        });
      new Setting(containerEl).setName(t.summaryBaseUrl).setDesc(t.summaryBaseUrlDesc)
        .addText((tx) => tx.setPlaceholder(t.summaryBaseUrlPlaceholder).setValue(this.plugin.settings.summaryBaseUrl)
          .onChange(async (v) => { this.plugin.settings.summaryBaseUrl = v.trim(); await this.plugin.saveSettings(); }));
      const modelSetting = new Setting(containerEl).setName(t.summaryModel).setDesc(t.summaryModelDesc);
      const renderModelControl = (models: string[] | null) => {
        modelSetting.controlEl.empty();
        if (models && models.length > 0) {
          new DropdownComponent(modelSetting.controlEl)
            .addOptions(Object.fromEntries([[" ", t.summaryModelSelect], ...models.map((m) => [m, m])]))
            .setValue(this.plugin.settings.summaryModel || " ")
            .onChange(async (v) => { this.plugin.settings.summaryModel = v.trim(); await this.plugin.saveSettings(); });
        } else {
          new TextComponent(modelSetting.controlEl)
            .setPlaceholder(t.summaryModelPlaceholder)
            .setValue(this.plugin.settings.summaryModel)
            .onChange(async (v) => { this.plugin.settings.summaryModel = v.trim(); await this.plugin.saveSettings(); });
        }
        const btn = modelSetting.controlEl.createEl("button", { text: t.summaryModelFetch, cls: "repo-notes-model-btn" });
        btn.addEventListener("click", () => {
          void (async () => {
            btn.disabled = true;
            btn.setText(t.summaryModelFetching);
            try {
              const fetched = await this.plugin.fetchAvailableModels(this.plugin.settings.summaryBaseUrl);
              renderModelControl(fetched);
            } catch (e) {
              console.error("[repo-notes] fetchAvailableModels failed:", e);
              renderModelControl(null);
            }
          })();
        });
      };
      renderModelControl(null);
      this.addApiKeySetting(containerEl, t.summaryApiKey, t.summaryApiKeyDesc, t.summaryApiKeyPlaceholder,
        () => this.plugin.settings.summaryApiKey,
        async (v) => { this.plugin.settings.summaryApiKey = v; await this.plugin.saveSettings(); });
    }
    new Setting(containerEl).setName(t.summaryLang)
      .addDropdown((d) => d.addOption("en", "English").addOption("ja", "日本語")
        .setValue(this.plugin.settings.readmeSummaryLang)
        .onChange(async (v) => { this.plugin.settings.readmeSummaryLang = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t.autoSync)
      .addToggle((tg) => tg.setValue(this.plugin.settings.autoSyncOnStartup).onChange(async (v) => {
        this.plugin.settings.autoSyncOnStartup = v; await this.plugin.saveSettings(); this.display();
      }));
    if (this.plugin.settings.autoSyncOnStartup && this.plugin.settings.profiles.length > 1) {
      new Setting(containerEl).setName(t.autoSyncProfile)
        .addDropdown((d) => {
          for (const p of this.plugin.settings.profiles) d.addOption(p.id, p.name);
          d.setValue(this.plugin.settings.autoSyncProfileId || this.plugin.settings.profiles[0]?.id)
            .onChange(async (v) => { this.plugin.settings.autoSyncProfileId = v; await this.plugin.saveSettings(); });
        });
    }

    // ── Actions ───────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t.sectionActions).setHeading();
    new Setting(containerEl).setName(t.syncNow).setDesc(t.syncNowDesc(profile.name))
      .addButton((btn) => btn.setButtonText(t.modalSyncBtn).setCta().onClick(() => new SyncModal(this.app, this.plugin, profile.id).open()));
  }

  private addApiKeySetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    placeholder: string,
    getValue: () => string,
    setValue: (v: string) => Promise<void>
  ) {
    const t = this.plugin.t;
    let inputEl: HTMLInputElement;
    new Setting(containerEl).setName(name).setDesc(desc)
      .addText((tx) => {
        inputEl = tx.inputEl;
        inputEl.type = "password";
        tx.setPlaceholder(placeholder).setValue(getValue())
          .onChange(async (v) => { await setValue(v.trim()); });
      })
      .addExtraButton((btn) => {
        btn.setIcon("eye").setTooltip(t.showApiKey)
          .onClick(() => {
            if (inputEl.type === "password") {
              inputEl.type = "text";
              btn.setIcon("eye-off");
              btn.setTooltip(t.hideApiKey);
            } else {
              inputEl.type = "password";
              btn.setIcon("eye");
              btn.setTooltip(t.showApiKey);
            }
          });
      });
  }

  private addFolderSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    textValue: string,
    dropValue: string,
    onChange: (textValue: string | null, dropValue: string | null) => Promise<void>
  ) {
    const t = this.plugin.t;
    const PLACEHOLDER = t.folderParentPlaceholder;
    const folders: string[] = [PLACEHOLDER];
    this.app.vault.getAllFolders().forEach((f) => folders.push(f.path));
    folders.sort((a, b) => a === PLACEHOLDER ? -1 : b === PLACEHOLDER ? 1 : a.localeCompare(b));

    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    let previewEl: HTMLElement;
    const updatePreview = (drop: string, text: string) => {
      const parts = [drop, text].filter(Boolean);
      previewEl.setText("→ " + (parts.join("/") || t.folderRoot));
    };

    setting.addDropdown((drop) => {
      for (const f of folders) drop.addOption(f, f);
      drop.setValue(folders.includes(dropValue) ? dropValue : PLACEHOLDER);
      drop.onChange(async (value) => {
        const resolved = value === PLACEHOLDER ? "" : value;
        updatePreview(resolved, textInput?.value ?? textValue);
        await onChange(null, resolved);
      });
    });

    setting.controlEl.createSpan({ text: "/", attr: { style: "margin:0 4px; color:var(--text-muted);" } });

    let textInput: HTMLInputElement;
    setting.addText((tx) => {
      textInput = tx.inputEl;
      tx.setPlaceholder(t.folderSubPlaceholder).setValue(textValue)
        .onChange(async (value) => {
          updatePreview(folders.includes(dropValue) ? dropValue : "", value);
          await onChange(value, null);
        });
      tx.inputEl.addClass("repo-notes-folder-input");
    });

    previewEl = setting.controlEl.createEl("span", { attr: { style: "margin-left:8px; font-size:12px; color:var(--text-muted);" } });
    updatePreview(folders.includes(dropValue) ? dropValue : "", textValue);
  }
}
