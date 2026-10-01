import { describe, expect, it } from "vitest";
import {
  buildLinkedinSearch,
  buildRepresentativeSearch,
  contactSearchStrategy,
  directUrlsFromSearchText,
  selectLinkedinProfile,
  selectOfficialSourceUrls,
  selectPublishedOfficialEmail,
  selectRepresentative,
  textFromHtml,
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
          },
          {
            profileUrl: "https://www.linkedin.com/in/jae-kim",
            name: "Jae Kim",
            title: "CEO",
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

  it("rejects profiles without a company match", () => {
    expect(
      selectLinkedinProfile(
        [
          {
            profileUrl: "https://www.linkedin.com/in/jae-kim",
            name: "Jae Kim",
            title: "CEO",
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
      selectOfficialSourceUrls(
        ["https://news.example.net/contact", "https://www.example.com/contact"],
        domain ?? "",
      ),
    ).toEqual(["https://www.example.com/contact"]);
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
    expect(input).toContain('"Example Labs" OR "Example" LinkedIn');
    expect(input).toContain("Do not log in to LinkedIn");
    expect(input).toContain("Do not");
  });

  it("resolves a cited representative before making a name-specific LinkedIn query", () => {
    const quote = "Example Labs — Jae Kim, CEO";
    const representative = selectRepresentative(
      [{ name: "Jae Kim", title: "CEO", quote }],
      ["https://news.example.com/example-labs"],
      quote,
      ["Example Labs"],
    );
    expect(buildRepresentativeSearch(company)).toContain("CEO OR founder");
    expect(
      buildLinkedinSearch(company, "executive", representative),
    ).toContain('"Jae Kim" "Example Labs" LinkedIn');
  });

  it("falls back to the company-name LinkedIn query when no representative is cited", () => {
    expect(selectRepresentative([], [], "", ["Example Labs"])).toBeUndefined();
    expect(buildLinkedinSearch(company)).toContain(
      '"Example Labs" OR "Example" LinkedIn',
    );
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
    expect(buildLinkedinSearch(company, strategy)).toContain("Director OR Manager");
  });

  it("allows a named email only when an official page presents it for a business inquiry", () => {
    const domain = verifiedOfficialDomain(company) ?? "";
    expect(
      selectPublishedOfficialEmail(
        "Partnership inquiry: Alice Kim alice@example.com",
        domain,
      ),
    ).toBe("alice@example.com");
    expect(
      selectPublishedOfficialEmail("Team directory alice@example.com", domain),
    ).toBeNull();
  });

  it("permits cited company-matched pages to establish an official email source", () => {
    expect(
      selectOfficialSourceUrls(["https://example.com/contact"], null),
    ).toEqual(["https://example.com/contact"]);
  });

  it("uses a direct profile URL stated in a grounded LinkedIn search response", () => {
    const quote = "Example Labs — Jae Kim, CEO";
    const profileUrl = "https://www.linkedin.com/in/jae-kim";
    expect(
      selectLinkedinProfile(
        [{ profileUrl, name: "Jae Kim", title: "CEO" }],
        ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/example"],
        `${quote} ${profileUrl}`,
        ["Example Labs"],
        1,
      )?.profileUrl,
    ).toBe(profileUrl);
  });

  it("does not require a quotation when a required search returns a direct profile URL", () => {
    const profileUrl = "https://www.linkedin.com/in/jae-kim";
    expect(
      selectLinkedinProfile(
        [{ profileUrl, name: "Jae Kim", title: "CEO" }],
        [],
        `Example Labs Jae Kim CEO ${profileUrl}`,
        ["Example Labs"],
        1,
      )?.profileUrl,
    ).toBe(profileUrl);
  });

  it("uses only direct page URLs stated in search text, never a grounding redirect", () => {
    expect(
      directUrlsFromSearchText(
        "Official: https://www.example.com/contact and https://vertexaisearch.cloud.google.com/grounding-api-redirect/example",
      ),
    ).toEqual(["https://www.example.com/contact"]);
  });

  it("converts plainly stated official domains into HTTPS page candidates", () => {
    expect(
      directUrlsFromSearchText("Official website: www.example.co.kr/contact"),
    ).toEqual(["https://www.example.co.kr/contact"]);
  });

  it("extracts public emails from mailto, numeric entities, and Cloudflare encoding", () => {
    const text = textFromHtml(
      '<a href="mailto:team%40example.com">Contact</a> &#112;&#97;&#114;&#116;&#110;&#101;&#114;@example.com <span data-cfemail="126677616652776a737f627e773c717d7f"></span>',
    );
    expect(text).toContain("team@example.com");
    expect(text).toContain("partner@example.com");
    expect(text).toContain("test@example.com");
  });
});
