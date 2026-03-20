import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
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
}

interface RepoNotesSettings {
  profiles: Profile[];
  anthropicApiKey: string;
  readmeSummaryLang: string;
  uiLang: Lang;
  autoSyncOnStartup: boolean;
  autoSyncProfileId: string;
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
  uiLang: "en",
  autoSyncOnStartup: false, autoSyncProfileId: "",
};

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ─── Main Plugin ──────────────────────────────────────────────────────────────

export default class RepoNotesPlugin extends Plugin {
  settings: RepoNotesSettings;

  get t(): T { return getT(this.settings.uiLang); }

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("star", "Repo Notes", () => new SyncModal(this.app, this).open());

    this.addCommand({
      id: "repo-notes-sync",
      name: "Repo Notes: Sync",
      callback: () => new SyncModal(this.app, this).open(),
    });

    this.addCommand({
      id: "open-settings",
      name: "Repo Notes: Open settings",
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
        this.app.workspace.onLayoutReady(async () => {
          new Notice(this.t.noticeAutoSync(profile.name));
          await this.syncProfile(profile, (msg) => console.log(msg));
        });
      }
    }
  }

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    // Migrate old single-account format
    if (saved && (saved as any).githubToken && !saved.profiles) {
      const p = defaultProfile("default", "Personal");
      const s = saved as any;
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
  }

  async saveSettings() { await this.saveData(this.settings); }

  // ─── Core Sync ───────────────────────────────────────────────────────────────

  async syncProfile(
    profile: Profile,
    onProgress: (msg: string) => void,
    onResult?: (saved: number, skipped: number, errors: number, total: number) => void
  ) {
    let totalSaved = 0, totalSkipped = 0, totalErrors = 0, totalCount = 0;
    const acc = (s: number, sk: number, e: number, t: number) => {
      totalSaved += s; totalSkipped += sk; totalErrors += e; totalCount += t;
    };
    if (profile.syncStars) {
      const parts = [profile.starsFolderParent, profile.starsFolder].filter(Boolean);
      await this.syncRepoList(profile, "stars", parts.join("/") || "GitHub Stars", onProgress, acc);
    }
    if (profile.syncMyRepos) {
      const parts = [profile.myReposFolderParent, profile.myReposFolder].filter(Boolean);
      await this.syncRepoList(profile, "mine", parts.join("/") || "My Repos", onProgress, acc);
    }
    for (const org of (profile.orgNames ?? [])) {
      const orgLogin = org.trim();
      if (!orgLogin) continue;
      const parts = [profile.myReposFolderParent, orgLogin].filter(Boolean);
      await this.syncRepoList(profile, "org", parts.join("/") || orgLogin, onProgress, acc, orgLogin);
    }
    onResult?.(totalSaved, totalSkipped, totalErrors, totalCount);
  }

  private async syncRepoList(
    profile: Profile,
    mode: "stars" | "mine" | "org",
    folder: string,
    onProgress: (msg: string) => void,
    onResult?: (saved: number, skipped: number, errors: number, total: number) => void,
    orgLogin?: string
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

      const commitCounts = new Map<string, number>();
      if (profile.includeCommitCount) {
        onProgress(t.progressCommits(profile.name));
        const repos = items.map((i) => (i.repo ?? i) as unknown as GitHubRepo);
        for (let b = 0; b < repos.length; b += 10) {
          await Promise.all(repos.slice(b, b + 10).map(async (repo) => {
            try {
              commitCounts.set(repo.full_name, await this.fetchCommitCount(profile.githubToken, repo.full_name, repo.default_branch ?? "main"));
            } catch { commitCounts.set(repo.full_name, -1); }
          }));
          onProgress(t.progressCommitsN(profile.name, Math.min(b + 10, repos.length), repos.length));
        }
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const repo = (item.repo ?? item) as unknown as GitHubRepo;
        const fname = this.sanitizeFilename(repo.full_name.replace("/", "_")) + ".md";
        const fpath = `${folder}/${fname}`;

        onProgress(`[${mode === "stars" ? "⭐" : mode === "org" ? "🏢" : "📁"} ${i + 1}/${total}] ${repo.full_name}`);

        try {
          const exists = this.app.vault.getAbstractFileByPath(fpath) instanceof TFile;
          if (exists && !profile.overwriteExisting) { skipped++; continue; }

          let readmeRaw: string | null = null;
          let readmeSummary: string | null = null;
          if (profile.includeReadmeRaw || profile.includeReadmeExcerpt) {
            readmeRaw = await this.fetchReadme(profile.githubToken, repo.full_name);
          }
          if (profile.includeReadmeExcerpt && this.settings.anthropicApiKey && readmeRaw) {
            readmeSummary = await this.summarizeReadme(readmeRaw, repo.full_name);
          }

          const content = this.buildNote(profile, item, commitCounts.get(repo.full_name) ?? -1, readmeSummary, readmeRaw, mode);
          if (exists) {
            await this.app.vault.modify(this.app.vault.getAbstractFileByPath(fpath) as TFile, content);
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
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: `Summarize the following README for GitHub repository "${repoName}" in ${lang}, in 3-5 sentences. Include what the tool/library does, key features, and target users. No preamble.\n\n---\n${readmeText}` }],
        }),
      });
      if (res.status !== 200) return null;
      return res.json?.content?.[0]?.text ?? null;
    } catch { return null; }
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

export function buildNote(profile: Profile, item: StarredItem, commitCount = -1, readmeSummary: string | null = null, readmeRaw: string | null = null, mode: "stars" | "mine" | "org" = "stars"): string {
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
  if (profile.includeTopics && repo.topics?.length)
    fm.push(`tags: [${repo.topics.map((t) => `"${t}"`).join(", ")}]`);
  fm.push("---\n");

  const lines: string[] = [];
  if (mode === "mine") lines.push(`> 🔒 ${repo.private ? "Private" : "Public"}\n`);
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
    this.progressEl.setText(t.modalReady);
    this.progressBar = progressWrap.createDiv("gs-track").createDiv("gs-fill");

    this.statsEl = contentEl.createDiv("gs-stats");
    this.statsEl.style.display = "none";
    this.logEl = contentEl.createDiv("gs-log");

    const btnRow = contentEl.createDiv("gs-btn-row");
    const syncBtn = btnRow.createEl("button", { text: t.modalSyncBtn, cls: "mod-cta" });

    syncBtn.addEventListener("click", async () => {
      if (this.running) return;
      const profile = this.plugin.settings.profiles.find((p) => p.id === selectedProfileId);
      if (!profile) return;

      this.running = true;
      syncBtn.disabled = true;
      syncBtn.setText(t.modalSyncing);
      this.logEl.empty();
      this.statsEl.style.display = "none";

      let count = 0;
      await this.plugin.syncProfile(
        profile,
        (msg) => {
          this.progressEl.setText(msg);
          this.appendLog(msg);
          count++;
          this.progressBar.style.width = `${Math.min(count * 2, 95)}%`;
        },
        (saved, skipped, errors, total) => {
          this.progressBar.style.width = "100%";
          this.showStats(saved, skipped, errors, total);
        }
      );

      this.running = false;
      syncBtn.disabled = false;
      syncBtn.setText(t.modalResync);
    });

    const closeBtn = btnRow.createEl("button", { text: t.modalClose });
    closeBtn.addEventListener("click", () => this.close());

    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (profile?.githubToken) syncBtn.click();
    else this.progressEl.setText(t.modalNoToken);
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
    this.statsEl.style.display = "flex";
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
    containerEl.createEl("h2", { text: t.settingsTitle });

    const profiles = this.plugin.settings.profiles;
    if (!profiles.find((p) => p.id === this.activeProfileId)) {
      this.activeProfileId = profiles[0]?.id ?? "";
    }

    // ── 言語設定（最上部）────────────────────────────────────────────────
    new Setting(containerEl).setName("Language / 言語")
      .addDropdown((d) =>
        d.addOption("en", "English").addOption("ja", "日本語")
          .setValue(this.plugin.settings.uiLang)
          .onChange(async (v) => {
            this.plugin.settings.uiLang = v as Lang;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // ── プロファイルタブ ──────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t.sectionProfiles });
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
      addBtn.addEventListener("click", async () => {
        const p = defaultProfile(genId(), `Account ${this.plugin.settings.profiles.length + 1}`);
        this.plugin.settings.profiles.push(p);
        this.activeProfileId = p.id;
        await this.plugin.saveSettings();
        this.display();
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
    containerEl.createEl("h3", { text: t.sectionAuth });
    new Setting(containerEl).setName(t.tokenName).setDesc(t.tokenDesc)
      .addText((tx) => tx.setPlaceholder(t.tokenPlaceholder).setValue(profile.githubToken)
        .onChange(async (v) => { profile.githubToken = v.trim(); await this.plugin.saveSettings(); }));

    // ── Stars ─────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t.sectionStars });
    new Setting(containerEl).setName(t.syncStars)
      .addToggle((tg) => tg.setValue(profile.syncStars).onChange(async (v) => { profile.syncStars = v; await this.plugin.saveSettings(); }));
    this.addFolderSetting(containerEl, t.starsFolder, "", profile.starsFolder, profile.starsFolderParent,
      async (tv, dv) => { if (tv !== null) profile.starsFolder = tv; if (dv !== null) profile.starsFolderParent = dv; await this.plugin.saveSettings(); });

    // ── My Repos ──────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t.sectionMyRepos });
    new Setting(containerEl).setName(t.syncMyRepos)
      .addToggle((tg) => tg.setValue(profile.syncMyRepos).onChange(async (v) => { profile.syncMyRepos = v; await this.plugin.saveSettings(); }));
    this.addFolderSetting(containerEl, t.myReposFolder, "", profile.myReposFolder, profile.myReposFolderParent,
      async (tv, dv) => { if (tv !== null) profile.myReposFolder = tv; if (dv !== null) profile.myReposFolderParent = dv; await this.plugin.saveSettings(); });
    new Setting(containerEl).setName(t.includeForks).setDesc(t.includeForksDesc)
      .addToggle((tg) => tg.setValue(profile.myReposIncludeForks).onChange(async (v) => { profile.myReposIncludeForks = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t.includePrivate)
      .addToggle((tg) => tg.setValue(profile.myReposIncludePrivate).onChange(async (v) => { profile.myReposIncludePrivate = v; await this.plugin.saveSettings(); }));

    // ── Organizations ─────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t.sectionOrgs });
    new Setting(containerEl).setName(t.orgNames).setDesc(t.orgNamesDesc)
      .addTextArea((ta) => {
        ta.setPlaceholder(t.orgNamesPlaceholder)
          .setValue((profile.orgNames ?? []).join("\n"))
          .onChange(async (v) => {
            profile.orgNames = v.split("\n").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          });
        ta.inputEl.style.width = "100%";
        ta.inputEl.rows = 3;
      });

    // ── Note content ──────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t.sectionNoteContent });
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
    containerEl.createEl("h3", { text: t.sectionReadme });
    new Setting(containerEl).setName(t.includeReadmeRaw).setDesc(t.includeReadmeRawDesc)
      .addToggle((tg) => tg.setValue(profile.includeReadmeRaw).onChange(async (v) => { profile.includeReadmeRaw = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t.includeReadmeSummary).setDesc(t.includeReadmeSummaryDesc)
      .addToggle((tg) => tg.setValue(profile.includeReadmeExcerpt).onChange(async (v) => { profile.includeReadmeExcerpt = v; await this.plugin.saveSettings(); }));

    // ── Shared ────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: t.sectionShared });
    new Setting(containerEl).setName(t.anthropicKey).setDesc(t.anthropicKeyDesc)
      .addText((tx) => tx.setPlaceholder(t.anthropicKeyPlaceholder).setValue(this.plugin.settings.anthropicApiKey)
        .onChange(async (v) => { this.plugin.settings.anthropicApiKey = v.trim(); await this.plugin.saveSettings(); }));
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
    containerEl.createEl("h3", { text: t.sectionActions });
    new Setting(containerEl).setName(t.syncNow).setDesc(t.syncNowDesc(profile.name))
      .addButton((btn) => btn.setButtonText(t.modalSyncBtn).setCta().onClick(() => new SyncModal(this.app, this.plugin, profile.id).open()));
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
      tx.inputEl.style.width = "140px";
    });

    previewEl = setting.controlEl.createEl("span", { attr: { style: "margin-left:8px; font-size:12px; color:var(--text-muted);" } });
    updatePreview(folders.includes(dropValue) ? dropValue : "", textValue);
  }
}
