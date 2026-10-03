import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppButton } from "./app-button";

describe("existing form actions through the shared button", () => {
  it("preserves submit behavior while ordinary actions do not submit", () => {
    const submit = renderToStaticMarkup(
      <AppButton htmlType="submit">저장</AppButton>,
    );
    const cancel = renderToStaticMarkup(<AppButton>취소</AppButton>);
    expect(submit).toContain('type="submit"');
    expect(cancel).toContain('type="button"');
  });
  it("blocks repeated submission while loading and keeps the action label", () => {
    const busy = renderToStaticMarkup(
      <AppButton htmlType="submit" type="primary" loading>
        저장
      </AppButton>,
    );
    expect(busy).toContain('disabled=""');
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain("저장");
  });
});
