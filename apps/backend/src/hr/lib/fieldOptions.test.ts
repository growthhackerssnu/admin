import { describe, expect, it } from "vitest";
import { canonicalizeOptionValues } from "./fieldOptions";

describe("canonicalizeOptionValues", () => {
  const existing = ["PM", "데이터 사이언스", "의전원/치전원"];

  it("대소문자·공백만 다른 값은 기존 옵션 이름으로 맞춘다", () => {
    expect(canonicalizeOptionValues(["pm", " 데이터   사이언스 "], existing)).toEqual({
      values: ["PM", "데이터 사이언스"],
      newValues: [],
    });
  });

  it("기존에 없는 값은 새 옵션으로 표시한다(공백은 정리)", () => {
    expect(canonicalizeOptionValues(["PM", " 블록체인  "], existing)).toEqual({
      values: ["PM", "블록체인"],
      newValues: ["블록체인"],
    });
  });

  it("중복·빈 값은 제거한다", () => {
    expect(canonicalizeOptionValues(["PM", "pm", "  ", "블록체인", "블록체인"], existing)).toEqual({
      values: ["PM", "블록체인"],
      newValues: ["블록체인"],
    });
  });
});
