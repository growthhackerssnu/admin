import { createHandler } from "@vercel/slack-bolt";
import { slackApp, receiver } from "@/slack/app";

export const POST = createHandler(slackApp, receiver);
