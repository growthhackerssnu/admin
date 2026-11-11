import { describe, expect, it } from "vitest";
import { tipsIndustryCodes } from "@/dh/inngest/tips";
import { domainExclusion } from "./domainExclusion";

describe("domain exclusion rule", () => {
  it("excludes drug, semiconductor and material companies without a software code", () => {
    expect(domainExclusion(tipsIndustryCodes(["BIO"], ["BIO_MED"]))?.category).toBe("생명·신약");
    expect(domainExclusion(tipsIndustryCodes(["SEMI"], ["ELEC"]))?.reason).toContain("반도체");
    expect(domainExclusion(tipsIndustryCodes(["MOBILITY"], ["CHEM"]))?.category).toBe("화학");
  });

  it("keeps boundary companies that also have a software code", () => {
    expect(domainExclusion(tipsIndustryCodes(["AI"], ["BIO_MED"]))).toBeNull();
    expect(domainExclusion(tipsIndustryCodes(["BIO"], ["ICT"]))).toBeNull();
  });

  it("keeps domains outside the exclusion list (approved examples)", () => {
    expect(domainExclusion(tipsIndustryCodes(["MOBILITY"], ["MECH_MAT"]))).toBeNull(); // 자율주행 SW
    expect(domainExclusion(tipsIndustryCodes(["ROBOT"], ["MECH_MAT"]))).toBeNull();
    expect(domainExclusion([])).toBeNull();
  });
});
