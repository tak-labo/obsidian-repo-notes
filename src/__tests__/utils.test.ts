import { describe, it, expect } from "vitest";
import { sanitizeFilename, buildNote, defaultProfile, checkCanSummarize, resolveUiLang, extractMemo, extractSummary } from "../main";
import type { StarredItem, GitHubRepo } from "../main";

// ─── Test fixtures ────────────────────────────────────────────────────────────

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

  it("auto + zh-TW → en (unsupported locale falls back to en)", () => {
    expect(resolveUiLang("auto", "zh-TW")).toBe("en");
  });

  it("auto + empty string → en", () => {
    expect(resolveUiLang("auto", "")).toBe("en");
  });

  it("manual en returns en regardless of locale", () => {
    expect(resolveUiLang("en", "ja")).toBe("en");
    expect(resolveUiLang("en", "ja-JP")).toBe("en");
  });

  it("manual ja returns ja regardless of locale", () => {
    expect(resolveUiLang("ja", "en")).toBe("ja");
    expect(resolveUiLang("ja", "en-US")).toBe("ja");
  });
});

// ─── checkCanSummarize ────────────────────────────────────────────────────────

describe("checkCanSummarize", () => {
  it("Anthropic provider with API key → true", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "anthropic",
        anthropicApiKey: "sk-ant-api03-xxx",
        summaryBaseUrl: "",
        summaryModel: "",
      })
    ).toBe(true);
  });

  it("Anthropic provider without API key → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "anthropic",
        anthropicApiKey: "",
        summaryBaseUrl: "",
        summaryModel: "",
      })
    ).toBe(false);
  });

  it("OpenAI-compatible provider with base URL and model → true", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "",
        summaryBaseUrl: "http://localhost:11434/v1",
        summaryModel: "llama3.2",
      })
    ).toBe(true);
  });

  it("OpenAI-compatible provider without base URL → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "sk-ant-api03-xxx",
        summaryBaseUrl: "",
        summaryModel: "llama3.2",
      })
    ).toBe(false);
  });

  it("OpenAI-compatible provider without model → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "sk-ant-api03-xxx",
        summaryBaseUrl: "http://localhost:11434/v1",
        summaryModel: "",
      })
    ).toBe(false);
  });

  it("OpenAI-compatible provider without base URL or model → false", () => {
    expect(
      checkCanSummarize({
        summaryProvider: "openai-compatible",
        anthropicApiKey: "",
        summaryBaseUrl: "",
        summaryModel: "",
      })
    ).toBe(false);
  });

  it("OpenAI-compatible provider with base URL and model but no API key → true (Ollama use case)", () => {
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
  it("returns plain filenames unchanged", () => {
    expect(sanitizeFilename("hello-world")).toBe("hello-world");
    expect(sanitizeFilename("my_repo")).toBe("my_repo");
  });

  it("converts slashes to hyphens", () => {
    expect(sanitizeFilename("owner/repo")).toBe("owner-repo");
  });

  it("converts Windows-forbidden characters to hyphens", () => {
    expect(sanitizeFilename("repo:name")).toBe("repo-name");
    expect(sanitizeFilename("repo*name")).toBe("repo-name");
    expect(sanitizeFilename('repo"name')).toBe("repo-name");
    expect(sanitizeFilename("repo<name>")).toBe("repo-name-");
    expect(sanitizeFilename("repo|name")).toBe("repo-name");
    expect(sanitizeFilename("repo?name")).toBe("repo-name");
  });

  it("converts backslashes to hyphens", () => {
    expect(sanitizeFilename("repo\\name")).toBe("repo-name");
  });

  it("converts Obsidian-forbidden characters to hyphens", () => {
    expect(sanitizeFilename("repo#name")).toBe("repo-name");
    expect(sanitizeFilename("repo^name")).toBe("repo-name");
    expect(sanitizeFilename("repo[name]")).toBe("repo-name-");
  });
});

// ─── defaultProfile ───────────────────────────────────────────────────────────

describe("defaultProfile", () => {
  it("creates a profile with the given id and name", () => {
    const p = defaultProfile("abc123", "Personal");
    expect(p.id).toBe("abc123");
    expect(p.name).toBe("Personal");
  });

  it("sets correct default values", () => {
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

  it("generates Markdown with YAML frontmatter", () => {
    const note = buildNote(profile, mockStarredItem);
    expect(note).toContain("---");
    expect(note).toContain('repo: "owner/my-repo"');
    expect(note).toContain('url: "https://github.com/owner/my-repo"');
    expect(note).toContain('profile: "Personal"');
  });

  it("defaults to stars mode with source: starred", () => {
    const note = buildNote(profile, mockStarredItem);
    expect(note).toContain("source: starred");
  });

  it("mine mode outputs source: my-repo", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "mine");
    expect(note).toContain("source: my-repo");
  });

  it("org mode outputs source: org-repo", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "org");
    expect(note).toContain("source: org-repo");
  });

  it("includeStats=true includes language, stars, and forks", () => {
    const p = { ...profile, includeStats: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("language: TypeScript");
    expect(note).toContain("stars: 100");
    expect(note).toContain("forks: 10");
  });

  it("includeStats=false excludes language, stars, and forks", () => {
    const p = { ...profile, includeStats: false };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("language:");
    expect(note).not.toContain("stars:");
    expect(note).not.toContain("forks:");
  });

  it("includeTopics=true includes topics as tags", () => {
    const p = { ...profile, includeTopics: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain('tags: ["obsidian", "plugin"]');
  });

  it("includeTopics=false excludes tags", () => {
    const p = { ...profile, includeTopics: false };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("tags:");
  });

  it("includeDescription=true includes description", () => {
    const p = { ...profile, includeDescription: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain('description: "A test repository"');
  });

  it("includeDescription=false excludes description", () => {
    const p = { ...profile, includeDescription: false };
    const note = buildNote(p, mockStarredItem);
    expect(note).not.toContain("description:");
  });

  it("includes commits when commitCount >= 0", () => {
    const p = { ...profile, includeCommitCount: true };
    const note = buildNote(p, mockStarredItem, 42);
    expect(note).toContain("commits: 42");
  });

  it("excludes commits when commitCount is -1", () => {
    const p = { ...profile, includeCommitCount: true };
    const note = buildNote(p, mockStarredItem, -1);
    expect(note).not.toContain("commits:");
  });

  it("includeStarredDate=true includes starred_at", () => {
    const p = { ...profile, includeStarredDate: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("starred_at: 2024-11-15");
  });

  it("includeLastUpdated=true includes last_updated", () => {
    const p = { ...profile, includeLastUpdated: true };
    const note = buildNote(p, mockStarredItem);
    expect(note).toContain("last_updated: 2024-06-01");
  });

  it("escapes double quotes in description", () => {
    const repoWithQuote = { ...mockRepo, description: 'He said "hello"' };
    const item: StarredItem = { starred_at: undefined, repo: repoWithQuote };
    const p = { ...profile, includeDescription: true };
    const note = buildNote(p, item);
    expect(note).toContain('description: "He said \\"hello\\""');
  });

  it("includes website when homepage is set", () => {
    const repoWithHome = { ...mockRepo, homepage: "https://example.com" };
    const item: StarredItem = { repo: repoWithHome };
    const note = buildNote(profile, item);
    expect(note).toContain('website: "https://example.com"');
  });

  it("mine mode includes Private/Public badge", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "mine");
    expect(note).toContain("> 🔒 Public");
  });

  it("includes README summary section", () => {
    const p = { ...profile, includeReadmeExcerpt: true };
    const note = buildNote(p, mockStarredItem, -1, "This is a summary.", null);
    expect(note).toContain("## Summary");
    expect(note).toContain("This is a summary.");
  });

  it("includes raw README section", () => {
    const p = { ...profile, includeReadmeRaw: true };
    const note = buildNote(p, mockStarredItem, -1, null, "# Full README");
    expect(note).toContain("## README");
    expect(note).toContain("# Full README");
  });

  it("always includes ## Memo section", () => {
    const note = buildNote(profile, mockStarredItem);
    expect(note).toContain("## Memo");
  });

  it("preserves existingMemo content", () => {
    const note = buildNote(profile, mockStarredItem, -1, null, null, "stars", null, "my preserved note\n");
    expect(note).toContain("my preserved note");
  });

  it("writes summaryMeta to frontmatter", () => {
    const note = buildNote(profile, mockStarredItem, -1, "summary text", null, "stars", {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    expect(note).toContain("summary_provider: anthropic");
    expect(note).toContain("summary_model: claude-haiku-4-5-20251001");
  });

  it("Memo section appears before Summary section", () => {
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
  it("returns empty string when Memo section is absent", () => {
    expect(extractMemo("---\nfoo: bar\n---\n## Summary\ntext")).toBe("");
  });

  it("extracts Memo content", () => {
    const content = "---\n---\n## Memo\nmy note\n\n## Summary\nai text";
    expect(extractMemo(content)).toBe("my note\n\n");
  });

  it("extracts Memo at end of file", () => {
    const content = "---\n---\n## Memo\nmy note here";
    expect(extractMemo(content)).toContain("my note here");
  });

  it("returns newline for empty Memo section", () => {
    const content = "---\n---\n## Memo\n\n## Summary\ntext";
    expect(extractMemo(content)).toBe("\n");
  });
});

// ─── extractSummary ───────────────────────────────────────────────────────────

describe("extractSummary", () => {
  it("returns empty string when Summary section is absent", () => {
    expect(extractSummary("---\nfoo: bar\n---\n## Memo\ntext")).toBe("");
  });

  it("extracts Summary content", () => {
    const content = "---\n---\n## Memo\n\n## Summary\nai generated text\n\n## README\nraw";
    expect(extractSummary(content)).toBe("ai generated text");
  });

  it("extracts Summary at end of file", () => {
    const content = "---\n---\n## Memo\n\n## Summary\nonly summary here";
    expect(extractSummary(content)).toBe("only summary here");
  });

  it("extracts multi-line Summary", () => {
    const content = "---\n---\n## Summary\nline one\nline two\n\n## README\nraw";
    expect(extractSummary(content)).toBe("line one\nline two");
  });
});
