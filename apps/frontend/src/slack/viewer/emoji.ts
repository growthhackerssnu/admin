// 슬랙 표준 이모지 이름(:thumbsup:) → 글자. 슬랙은 iamcal 이름표를 쓴다.
import shortcodes from "emojibase-data/en/shortcodes/iamcal.json";

const byName = new Map<string, string>();
for (const [hex, names] of Object.entries(
  shortcodes as Record<string, string | string[]>,
)) {
  const char = String.fromCodePoint(
    ...hex.split("-").map((h) => parseInt(h, 16)),
  );
  for (const name of Array.isArray(names) ? names : [names])
    byName.set(name, char);
}
// 슬랙만 쓰는 별칭 몇 개
byName.set("thumbsup", byName.get("+1") ?? "👍");
byName.set("thumbsdown", byName.get("-1") ?? "👎");

const SKIN = ["", "🏻", "🏼", "🏽", "🏾", "🏿"];

/** "+1::skin-tone-3" 같은 이름도 받는다. 모르는 이름이면 null. */
export function standardEmoji(name: string) {
  const [base, tone] = name.split("::");
  const char = byName.get(base);
  if (!char) return null;
  const skin = tone?.match(/skin-tone-(\d)/)?.[1];
  return skin ? char + (SKIN[Number(skin) - 1] ?? "") : char;
}
