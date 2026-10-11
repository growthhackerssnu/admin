import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Mrkdwn, type MrkdwnContext } from "./mrkdwn";

const ctx: MrkdwnContext = {
  userName: (id) => ({ U1: "jay" })[id] ?? id,
  channelName: (id) => ({ C1: "general" })[id] ?? id,
  emoji: (name) => (name === "smile" ? "😄" : null),
};
const html = (text: string) => renderToStaticMarkup(<Mrkdwn text={text} ctx={ctx} />);

describe("Mrkdwn", () => {
  it("renders bold, italic, strike and inline code", () => {
    expect(html("*a* _b_ ~c~ `d *e*`")).toBe("<b>a</b> <i>b</i> <s>c</s> <code>d *e*</code>");
  });
  it("leaves snake_case words alone", () => {
    expect(html("file_name_here")).toBe("file_name_here");
  });
  it("renders links, mentions and specials", () => {
    expect(html("<https://x.com|site> <https://y.com> <@U1> <#C1> <#C2|random> <!here>")).toBe(
      '<a href="https://x.com" target="_blank" rel="noreferrer">site</a> <a href="https://y.com" target="_blank" rel="noreferrer">https://y.com</a> <span class="slk-mention">@jay</span> <span class="slk-mention">#general</span> <span class="slk-mention">#random</span> <span class="slk-mention">@here</span>',
    );
  });
  it("unescapes entities and renders quotes and code blocks", () => {
    expect(html("&gt; quoted &amp; more\nnext")).toBe("<blockquote>quoted &amp; more</blockquote>next");
    expect(html("```a &lt;b&gt;\n*c*```")).toBe("<pre>a &lt;b&gt;\n*c*</pre>");
  });
  it("renders emoji shortcodes and keeps unknown ones", () => {
    expect(html(":smile: :nope:")).toBe("😄 :nope:");
  });
  it("does not allow javascript links", () => {
    expect(html("<javascript:alert(1)|x>")).toBe("x");
  });
});
