import { WebClient } from "@slack/web-api";

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export const SLACK_APPROVAL_CHANNEL_ID = process.env.SLACK_APPROVAL_CHANNEL_ID ?? "";
