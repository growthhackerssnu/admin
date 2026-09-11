import type { NextApiRequest, NextApiResponse } from "next";
import { receiver } from "@/slack/app";

// Slack 서명 검증(HMAC)은 원본 바디 바이트가 필요하므로 Next.js의 기본 바디 파서를 반드시 끈다.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await receiver.requestListener(req, res);
}
