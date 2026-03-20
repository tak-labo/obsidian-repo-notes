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
});
