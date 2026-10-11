// 슬랙 API가 돌려주는 모양 중 백업·뷰어가 쓰는 필드만. 저장은 원본 JSON 그대로 한다.
export type SlackFile = {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  mode?: string;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
};

export type SlackReaction = { name: string; count: number; users?: string[] };

export type SlackMessage = {
  ts: string;
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  thread_ts?: string;
  reply_count?: number;
  edited?: { user?: string; ts: string };
  reactions?: SlackReaction[];
  files?: SlackFile[];
  /** 백업할 때 스레드 답글을 부모 아래에 넣어 둔다(슬랙 원본에는 없는 필드). */
  replies?: SlackMessage[];
  [key: string]: unknown;
};

export type SlackUser = {
  id: string;
  name: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: { display_name?: string; real_name?: string; image_72?: string };
};

export type SlackConversation = {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  /** DM 상대 */
  user?: string;
  created?: number;
};

export type SlackUserGroup = { id: string; handle: string; name?: string };

export type ConversationState = {
  /** 이번 실행에서 끝났는지. 실행이 끝나면 다음 실행 시작 때 다시 false로 돌린다. */
  done: boolean;
  latestTs?: string;
  /** 이 대화의 messages/<id>/<YYYY-MM>.json 목록(오름차순) */
  months: string[];
  error?: string;
};

export type Manifest = {
  version: 1;
  team: { id: string; name: string };
  exportedBy: string;
  startedAt: string;
  /** null이면 실행 중이거나 중간에 끊긴 상태 — 다시 열면 이어서 한다. */
  finishedAt: string | null;
  /** 이번 실행이 처음부터 전부 다시 받는 실행인지(이어 하기에도 유지) */
  fullRun?: boolean;
  /** 받을 파일 종류·사진 압축(없으면 전부 받고 압축). files.ts의 FileOptions */
  fileOptions?: {
    photos: boolean;
    videos: boolean;
    files: boolean;
    compressPhotos: boolean;
  };
  conversations: Record<string, ConversationState>;
};
