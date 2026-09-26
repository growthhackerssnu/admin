import { describe, expect, it } from "vitest";
import {
  buildLinkedinSearch,
  contactSearchStrategy,
  selectLinkedinProfile,
  selectOfficialSourceUrl,
  selectPublishedOfficialEmail,
  verifiedOfficialDomain,
} from "./contactResearch";

const company = {
  id: "company-1",
  name: "Example Labs",
  legalName: null,
  aliases: ["Example"],
  websiteUrl: "https://www.example.com",
  canonicalDomain: "example.com",
};

describe("contact research selection", () => {
  it("uses the publicly indexed C-level LinkedIn profile before a relevant lead", () => {
    const ceoQuote = "Example Labs — Jae Kim, CEO";
    const leadQuote = "Example Labs — Min Lee, Head of Product";
    expect(
      selectLinkedinProfile(
        [
          {
            profileUrl: "https://www.linkedin.com/in/min-lee",
            name: "Min Lee",
            title: "Head of Product",
            quote: leadQuote,
          },
          {
            profileUrl: "https://www.linkedin.com/in/jae-kim",
            name: "Jae Kim",
            title: "CEO",
            quote: ceoQuote,
          },
        ],
        [
          "https://www.linkedin.com/in/min-lee",
          "https://www.linkedin.com/in/jae-kim",
        ],
        `${ceoQuote}\n${leadQuote}`,
        ["Example Labs", "Example"],
      )?.name,
    ).toBe("Jae Kim");
  });

  it("rejects profiles without the cited URL and exact company quotation", () => {
    expect(
      selectLinkedinProfile(
        [
          {
            profileUrl: "https://www.linkedin.com/in/jae-kim",
            name: "Jae Kim",
            title: "CEO",
            quote: "Other Company — Jae Kim, CEO",
          },
        ],
        ["https://www.linkedin.com/in/jae-kim"],
        "Other Company — Jae Kim, CEO",
        ["Example Labs"],
      ),
    ).toBeUndefined();
  });

  it("limits email fallback to a verified official-domain source and shared mailbox", () => {
    const domain = verifiedOfficialDomain(company);
    expect(domain).toBe("example.com");
    expect(
      selectOfficialSourceUrl(
        ["https://news.example.net/contact", "https://www.example.com/contact"],
        domain ?? "",
      ),
    ).toBe("https://www.example.com/contact");
    expect(
      selectPublishedOfficialEmail(
        "Contact alice@example.com or partnerships@example.com",
        domain ?? "",
      ),
    ).toBe("partnerships@example.com");
  });

  it("asks for public web snippets without LinkedIn login or internal search", () => {
    const input = buildLinkedinSearch(company);
    expect(input).toContain("public snippets only");
    expect(input).toContain("Do not log in to LinkedIn");
    expect(input).toContain("Do not");
  });

  it("uses a non-executive query on later contact rounds", () => {
    const strategy = contactSearchStrategy([
      "contact_search_round:2",
      "contact_strategy:functional_leads",
    ]);
    expect(strategy).toBe("functional_leads");
    expect(buildLinkedinSearch(company, strategy)).toContain(
      "Do not return C-level leaders",
    );
  });
});
