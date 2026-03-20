import { describe, it, expect } from "vitest";
import { getT } from "../i18n";

describe("getT", () => {
  it("英語の翻訳を返す", () => {
    const t = getT("en");
    expect(t.modalTitle).toBe("Repo Notes");
    expect(t.modalSyncBtn).toBe("Sync");
    expect(t.statSaved).toBe("SAVED");
  });

  it("日本語の翻訳を返す", () => {
    const t = getT("ja");
    expect(t.modalTitle).toBe("Repo Notes");
    expect(t.modalSyncBtn).toBe("同期開始");
    expect(t.statSaved).toBe("保存");
  });

  it("英語と日本語で異なる翻訳を持つ", () => {
    const en = getT("en");
    const ja = getT("ja");
    expect(en.modalProfile).not.toBe(ja.modalProfile);
    expect(en.modalClose).not.toBe(ja.modalClose);
  });

  it("関数型の翻訳キーが正しく動作する", () => {
    const en = getT("en");
    const ja = getT("ja");
    expect(en.syncNowDesc("Personal")).toBe("Sync [Personal]");
    expect(ja.syncNowDesc("Personal")).toBe("[Personal] を同期します");
  });

  it("英語のすべてのキーが存在する", () => {
    const t = getT("en");
    expect(t.noticeAutoSync("test")).toContain("test");
    expect(t.noticeNoToken("test")).toContain("test");
    expect(t.noticeError("ERR")).toContain("ERR");
  });

  it("AIプロバイダー関連の英語キーが存在する", () => {
    const t = getT("en");
    expect(t.summaryProvider).toBe("AI provider");
    expect(t.summaryProviderDesc).toBeTruthy();
    expect(t.summaryBaseUrl).toBe("Base URL");
    expect(t.summaryBaseUrlDesc).toBeTruthy();
    expect(t.summaryBaseUrlPlaceholder).toBe("http://localhost:11434/v1");
    expect(t.summaryModel).toBe("Model");
    expect(t.summaryModelDesc).toBeTruthy();
    expect(t.summaryModelPlaceholder).toBe("llama3.2");
    expect(t.summaryApiKey).toBe("API key");
    expect(t.summaryApiKeyDesc).toBeTruthy();
    expect(t.summaryApiKeyPlaceholder).toBe("sk-...");
    expect(t.showApiKey).toBe("Show");
    expect(t.hideApiKey).toBe("Hide");
  });

  it("AIプロバイダー関連の日本語キーが存在する", () => {
    const t = getT("ja");
    expect(t.summaryProvider).toBe("AIプロバイダー");
    expect(t.summaryBaseUrl).toBe("Base URL");
    expect(t.summaryModel).toBe("モデル");
    expect(t.summaryApiKey).toBe("API キー");
    expect(t.showApiKey).toBe("表示");
    expect(t.hideApiKey).toBe("非表示");
  });

  it("includeReadmeSummaryDescがAnthropicに依存しない文言になっている", () => {
    const en = getT("en");
    const ja = getT("ja");
    expect(en.includeReadmeSummaryDesc).not.toContain("Anthropic");
    expect(ja.includeReadmeSummaryDesc).not.toContain("Anthropic");
  });
});
