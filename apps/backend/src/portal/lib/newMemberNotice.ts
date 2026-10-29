// 새 회원이 생기면 그핵드인 Slack 앱으로 #pr-알럼-업데이트(프로필 수정 요청 알림과 같은 채널)에
// 알린다. 회원이 생기는 세 경로 모두에서 부른다: 직접 가입(OTP 인증), 관리자 등록, 노션 명단 자동 가입.
// Slack이 실패해도 가입 자체는 성공으로 둔다.
import { EDIT_REQUEST_CHANNEL_ID, slackApi } from "@/hr/lib/slack";

const MEMBERS_URL = "https://admin.ghsnu.com/admin";

const SOURCE_LABEL = {
  signup: "직접 가입",
  admin: "관리자 등록",
  notion: "노션 명단 자동 가입",
} as const;

export type NewMember = {
  name: string;
  cohort: string | null;
  email: string;
  role: "admin" | "acting" | "alumni";
  source: keyof typeof SOURCE_LABEL;
};

export function newMemberMessage({ name, cohort, email, role, source }: NewMember) {
  const who = `${cohort ? `${cohort}기 ` : ""}${name}`;
  return {
    text: `${who}님이 회원으로 가입했습니다.`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:wave: *${who}*님이 회원으로 가입했습니다.\n${email} · ${role} · ${SOURCE_LABEL[source]}\n<${MEMBERS_URL}|회원 관리에서 보기>`,
        },
      },
    ],
  };
}

export async function notifyNewMember(member: NewMember) {
  if (!process.env.SLACK_GHEDIN_BOT_TOKEN) return;
  await slackApi("chat.postMessage", { channel: EDIT_REQUEST_CHANNEL_ID, ...newMemberMessage(member) }).catch((error) =>
    console.error("[slack:ghedin] new member notify failed", error),
  );
}
