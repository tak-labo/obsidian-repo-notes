import { describe, it, expect } from "vitest";
import { sanitizeFilename, buildNote, defaultProfile, checkCanSummarize, resolveUiLang, extractMemo } from "../main";
import type { StarredItem, GitHubRepo } from "../main";

// ─── テスト用フィクスチャ ─────────────────────────────────────────────────────

const mockRepo: GitHubRepo = {
  full_name: "owner/my-repo",
  html_url: "https://github.com/owner/my-repo",
  homepage: null,
  description: "A test repository",
  language: "TypeScript",
  stargazers_count: 100,
  forks_count: 10,
  topics: ["obsidian", "plugin"],
  default_branch: "main",
  pushed_at: "2024-06-01T12:00:00Z",
  updated_at: "2024-06-01T12:00:00Z",
  created_at: "2023-01-01T00:00:00Z",
  private: false,
  fork: false,
};

const mockStarredItem: StarredItem = {
  starred_at: "2024-11-15T00:00:00Z",
  repo: mockRepo,
};

// ─── resolveUiLang ───────────────────────────────────────────────────────────

describe("resolveUiLang", () => {
  it("auto + ja-JP → ja", () => {
    expect(resolveUiLang("auto", "ja-JP")).toBe("ja");
  });

  it("auto + ja → ja", () => {
    expect(resolveUiLang("auto", "ja")).toBe("ja");
  });

  it("auto + en → en", () => {
    expect(resolveUiLang("auto", "en")).toBe("en");
  });

  it("auto + en-US → en", () => {
    expect(resolveUiLang("auto", "en-US")).toBe("en");
  });

  it("auto + zh-TW → en（未対応言語はenにフォールバック）", () => {
    expect(resolveUiLang("auto", "zh-TW")).toBe("en");
  });

  it("auto + 空文字 → en", () => {
    expect(resolveUiLang("auto", "")).toBe("en");
  });

  it("手動設定 en はlocaleに関わらず en を返す", () => {
    expect(resolveUiLang("en", "ja")).toBe("en");
    expect(resolveUiLang("en", "ja-JP")).toBe("en");
  });

  it("手動設定 ja はlocaleに関わらず ja を返す", () => {
    expect(resolveUiLang("ja", "en")).toBe("ja");
    expect(resolveUiLang("ja", "en-US")).toBe("ja");
  });
});

// ─── checkCanSummarize ────────────────────────────────────────────────────────

describe("checkCanSummarize", () => {
  it("Anthropicプロバイダー: APIキーあり → true", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "anthropic",
        anthropicApiKey: "sk-ant-api03-xxx",
        summaryBaseUrl: "",
        summaryModel: "",
      })
    ).toBe(true);
  });

  it("Anthropicプロバイダー: APIキーなし → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "anthropic",
        anthropicApiKey: "",
        summaryBaseUrl: "",
        summaryModel: "",
      })
    ).toBe(false);
  });

  it("OpenAI互換プロバイダー: BaseURLとモデルあり → true", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "",
        summaryBaseUrl: "http://localhost:11434/v1",
        summaryModel: "llama3.2",
      })
    ).toBe(true);
  });

  it("OpenAI互換プロバイダー: BaseURLなし → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "sk-ant-api03-xxx",
        summaryBaseUrl: "",
        summaryModel: "llama3.2",
      })
    ).toBe(false);
  });

  it("OpenAI互換プロバイダー: モデルなし → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "sk-ant-api03-xxx",
        summaryBaseUrl: "http://localhost:11434/v1",
        summaryModel: "",
      })
    ).toBe(false);
  });

  it("OpenAI互換プロバイダー: BaseURLとモデル両方なし → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "",
        summaryBaseUrl: "",
        summaryModel: "",
      })
    ).toBe(false);
  });

  it("OpenAI互換プロバイダー: APIキーなしでもBaseURL+モデルがあれば true（Ollama想定）", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "",
        summaryBaseUrl: "http://localhost:11434/v1",
        summaryModel: "mistral",
      })
    ).toBe(true);
  });
});

// ─── sanitizeFilename ─────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("通常のファイル名はそのまま返す", () => {
    expect(sanitizeFilename("hello-world")).toBe("hello-world");
    expect(sanitizeFilename("my_repo")).toBe("my_repo");
  });

  it("スラッシュをハイフンに変換する", () => {
    expect(sanitizeFilename("owner/repo")).toBe("owner-repo");
  });

  it("Windowsの禁止文字をハイフンに変換する", () => {
    expect(sanitizeFilename("repo:name")).toBe("repo-name");
    expect(sanitizeFilename("repo*name")).toBe("repo-name");
    expect(sanitizeFilename('repo"name')).toBe("repo-name");
    expect(sanitizeFilename("repo<name>")).toBe("repo-name-");
    expect(sanitizeFilename("repo|name")).toBe("repo-name");
    expect(sanitizeFilename("repo?name")).toBe("repo-name");
  });

  it("バックスラッシュをハイフンに変換する", () => {
    expect(sanitizeFilename("repo\\name")).toBe("repo-name");
  });

  it("Obsidian特有の禁止文字をハイフンに変換する", () => {
    expect(sanitizeFilename("repo#name")).toBe("repo-name");
    expect(sanitizeFilename("repo^name")).toBe("repo-name");
    expect(sanitizeFilename("repo[name]")).toBe("repo-name-");
  });
});

// ─── defaultProfile ───────────────────────────────────────────────────────────

describe("defaultProfile", () => {
  it("指定したidとnameでプロファイルを生成する", () => {
    const p = defaultProfile("abc123", "Personal");
    expect(p.id).toBe("abc123");
    expect(p.name).toBe("Personal");
  });

  it("デフォルト値が正しく設定されている", () => {
    const p = defaultProfile("id", "name");
    expect(p.githubToken).toBe("");
    expect(p.syncStars).toBe(true);
    expect(p.syncMyRepos).toBe(false);
    expect(p.starsFolder).toBe("GitHub Stars");
    expect(p.myReposFolder).toBe("My Repos");
    expect(p.myReposIncludeForks).toBe(false);
    expect(p.myReposIncludePrivate).toBe(true);
    expect(p.includeDescription).toBe(true);
    expect(p.includeTopics).toBe(true);
    expect(p.includeStats).toBe(true);
    expect(p.overwriteExisting).toBe(true);
    expect(p.orgNames).toEqual([]);
    expect(p.hiddenProps).toEqual([]);
  });
});

// ─── buildNote ────────────────────────────────────────────────────────────────

describe("buildNote", () => {
  const profile = defaultProfile("test-id", "Personal");

  it("YAMLフロントマターを含むMarkdownを生成する", () => {
    const note = buildNote(profile, mockStarredItem);
    expect(note).toContain("---");
    expect(note).toContain('repo: "owner/my-repo"');
    expect(note).toContain('url: "https://github.com/owner/my-repo"');
    expect(note).toContain('profile: "Personal"');
  });

  it("デフォルトはstarsモードでsource: starredを出力する", () => {
    const note = buildNote(profile, mockStarredItem);
    expect(note).toContain("source: starred");
  });

  it("mineモードでsource: my-repoを出力する", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "mine");
    expect(note).toContain("source: my-repo");
  });

  it("orgモードでsource: org-repoを出力する", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "org");
    expect(note).toContain("source: org-repo");
  });

  it("includeStats=trueで言語・Star数・Fork数を含む", () => {
    const p = { ...profile, includeStats: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("language: TypeScript");
    expect(note).toContain("stars: 100");
    expect(note).toContain("forks: 10");
  });

  it("includeStats=falseで言語・Star数・Fork数を含まない", () => {
    const p = { ...profile, includeStats: false };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("language:");
    expect(note).not.toContain("stars:");
    expect(note).not.toContain("forks:");
  });

  it("includeTopics=trueでトピックをタグとして含む", () => {
    const p = { ...profile, includeTopics: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain('tags: ["obsidian", "plugin"]');
  });

  it("includeTopics=falseでタグを含まない", () => {
    const p = { ...profile, includeTopics: false };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("tags:");
  });

  it("includeDescription=trueで説明文を含む", () => {
    const p = { ...profile, includeDescription: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain('description: "A test repository"');
  });

  it("includeDescription=falseで説明文を含まない", () => {
    const p = { ...profile, includeDescription: false };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("description:");
  });

  it("commitCountが0以上のとき commits を含む", () => {
    const p = { ...profile, includeCommitCount: true };
    const note = buildNote(p, mockStarredItem, 42);
    expect(note).toContain("commits: 42");
  });

  it("commitCountが-1のとき commits を含まない", () => {
    const p = { ...profile, includeCommitCount: true };
    const note = buildNote(p, mockStarredItem, -1);
    expect(note).not.toContain("commits:");
  });

  it("includeStarredDate=trueでstarred_atを含む", () => {
    const p = { ...profile, includeStarredDate: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("starred_at: 2024-11-15");
  });

  it("includeLastUpdated=trueでlast_updatedを含む", () => {
    const p = { ...profile, includeLastUpdated: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("last_updated: 2024-06-01");
  });

  it("説明文中のダブルクォートをエスケープする", () => {
    const repoWithQuote = { ...mockRepo, description: 'He said "hello"' };
    const item: StarredItem = { starred_at: undefined, repo: repoWithQuote };
    const p = { ...profile, includeDescription: true };
    const note = buildNote(p, item);
    expect(note).toContain('description: "He said \\"hello\\""');
  });

  it("homepageがあればwebsiteを含む", () => {
    const repoWithHome = { ...mockRepo, homepage: "https://example.com" };
    const item: StarredItem = { repo: repoWithHome };
    const note = buildNote(profile, item);
    expect(note).toContain('website: "https://example.com"');
  });

  it("mineモードでPrivate/Publicバッジを含む", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "mine");
    expect(note).toContain("> 🔒 Public");
  });

  it("READMEサマリーを含む", () => {
    const p = { ...profile, includeReadmeExcerpt: true };
    const note = buildNote(p, mockStarredItem, -1, "This is a summary.", null);
    expect(note).toContain("## Summary");
    expect(note).toContain("This is a summary.");
  });

  it("README全文を含む", () => {
    const p = { ...profile, includeReadmeRaw: true };
    const note = buildNote(p, mockStarredItem, -1, null, "# Full README");
    expect(note).toContain("## README");
    expect(note).toContain("# Full README");
  });

  it("常に ## Memo セクションを含む", () => {
    const note = buildNote(profile, mockStarredItem);
    expect(note).toContain("## Memo");
  });

  it("existingMemo を保持する", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "stars", null, "my preserved note\n");
    expect(note).toContain("my preserved note");
  });

  it("summaryMeta を frontmatter に記録する", () => {
    const note = buildNote(profile, mockStarredItem, -1, "summary text", null, "stars", {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    expect(note).toContain("summary_provider: anthropic");
    expect(note).toContain("summary_model: claude-haiku-4-5-20251001");
  });

  it("Memo セクションが Summary より前に来る", () => {
    const p = { ...profile, includeReadmeExcerpt: true };
    const note = buildNote(p, mockStarredItem, -1, "ai summary", null, "stars", null, "memo text\n");
    const memoIdx = note.indexOf("## Memo");
    const summaryIdx = note.indexOf("## Summary");
    expect(memoIdx).toBeLessThan(summaryIdx);
  });
});

// ─── buildNote hiddenProps ────────────────────────────────────────────────────

describe("buildNote hiddenProps", () => {
  const base = defaultProfile("test-id", "Personal");

  it("hides description when in hiddenProps", () => {
    const p = { ...base, includeDescription: true, hiddenProps: ["description"] };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("description:");
  });

  it("shows description when hiddenProps is empty", () => {
    const p = { ...base, includeDescription: true, hiddenProps: [] };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("description:");
  });

  it("hides stats when in hiddenProps", () => {
    const p = { ...base, includeStats: true, hiddenProps: ["stats"] };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("language:");
    expect(note).not.toContain("stars:");
    expect(note).not.toContain("forks:");
  });

  it("hides commits when in hiddenProps", () => {
    const p = { ...base, includeCommitCount: true, hiddenProps: ["commits"] };
    const note = buildNote(p, mockStarredItem, 42);
    expect(note).not.toContain("commits:");
  });

  it("hides tags when in hiddenProps", () => {
    const p = { ...base, includeTopics: true, hiddenProps: ["tags"] };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("tags:");
  });

  it("hides summary section when in hiddenProps", () => {
    const p = { ...base, includeReadmeExcerpt: true, hiddenProps: ["summary"] };
    const note = buildNote(p, mockStarredItem, -1, "ai summary text");
    expect(note).not.toContain("## Summary");
  });

  it("shows summary section when hiddenProps is empty", () => {
    const p = { ...base, includeReadmeExcerpt: true, hiddenProps: [] };
    const note = buildNote(p, mockStarredItem, -1, "ai summary text");
    expect(note).toContain("## Summary");
  });
});

// ─── extractMemo ──────────────────────────────────────────────────────────────

describe("extractMemo", () => {
  it("Memo セクションがない場合は空文字を返す", () => {
    expect(extractMemo("---\nfoo: bar\n---\n## Summary\ntext")).toBe("");
  });

  it("Memo の内容を抽出する", () => {
    const content = "---\n---\n## Memo\nmy note\n\n## Summary\nai text";
    expect(extractMemo(content)).toBe("my note\n\n");
  });

  it("ファイル末尾の Memo を抽出する", () => {
    const content = "---\n---\n## Memo\nmy note here";
    expect(extractMemo(content)).toContain("my note here");
  });

  it("空の Memo セクションの場合", () => {
    const content = "---\n---\n## Memo\n\n## Summary\ntext";
    expect(extractMemo(content)).toBe("\n");
  });
});
