import { describe, it, expect } from "vitest";
import { GLYPH_NAMES } from "./PipGlyph.jsx";

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
