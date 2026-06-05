import { describe, it, expect } from "vitest";
import { GLYPH_NAMES } from "./PipGlyph.jsx";
import { normalizeStructure } from "./MarkdownText.jsx";

// Mirrors the token regex MarkdownText builds. The safety property: only the
// whitelisted glyph names match, so ordinary text with colons is never touched.
function glyphRe() {
  return new RegExp(":(" + GLYPH_NAMES.join("|") + "):", "g");
}

describe("Pip glyph tokens", () => {
  it("matches whitelisted tokens", () => {
    expect(":fire:".match(glyphRe())).toEqual([":fire:"]);
    expect("## :win: Good news".match(glyphRe())).toEqual([":win:"]);
    expect("## :signal: Pattern".match(glyphRe())).toEqual([":signal:"]);
  });

  it("never matches times, ratios, urls, or stray colons", () => {
    expect("Meet at 8:00".match(glyphRe())).toBeNull();
    expect("a ratio of 3:1 today".match(glyphRe())).toBeNull();
    expect("https://folioshq.com".match(glyphRe())).toBeNull();
    expect("note: something here".match(glyphRe())).toBeNull();
  });

  it("ignores unknown glyph names so they can't leak as raw text handling", () => {
    expect(":rocket:".match(glyphRe())).toBeNull();
    expect(":fire :".match(glyphRe())).toBeNull();
  });
});

describe("normalizeStructure", () => {
  it("breaks inline headers and bullets onto their own lines", () => {
    var inline = "Headline here. ## :fire: Needs you today - Caliber thing → do it. - SE2 issue → fix it. ## :win: Good news - Power trending healthy.";
    var lines = normalizeStructure(inline).split("\n").filter(Boolean);
    expect(lines.some(function (l) { return l.indexOf("## :fire:") === 0; })).toBe(true);
    expect(lines.some(function (l) { return l.indexOf("## :win:") === 0; })).toBe(true);
    expect(lines.filter(function (l) { return l.indexOf("- ") === 0; }).length).toBe(3);
  });

  it("leaves already-structured text untouched", () => {
    var ok = "Headline\n\n## :fire: Now\n- one\n- two";
    expect(normalizeStructure(ok)).toBe(ok);
  });

  it("does not split hyphenated numbers or ampersand names", () => {
    expect(normalizeStructure("1-800 Radiator and B & R Automotive")).toBe("1-800 Radiator and B & R Automotive");
  });
});
