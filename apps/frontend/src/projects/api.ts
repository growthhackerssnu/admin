import { supabase } from "../lib/supabase";

// Projects 앱(/projects) API. 백엔드 경로는 /api/v1/whitepapers다(/api/v1/projects는 dh가 쓴다).
const baseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export class ProjectsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectsApiError";
  }
}

async function request<T>(path: string): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ProjectsApiError(
      payload?.error?.message ?? "알 수 없는 오류가 발생했습니다.",
    );
  }
  return payload.data as T;
}

export interface ProjectMember {
  notionPageId: string;
  name: string;
  cohort: number;
  isPm: boolean;
}

export interface Project {
  notionPageId: string;
  title: string;
  /** "26-4Q" 형식 */
  quarter: string | null;
  oneLiner: string | null;
  technology: string[];
  industry: string[];
  members: ProjectMember[];
  /** 홈페이지 로고 → Notion 이미지 순. 없으면 기업명으로 기본 썸네일을 그린다. */
  thumbnailUrl: string | null;
  /** 홈페이지(ghsnu.com/PROJECT)에 공개된 프로젝트 제목. 홈페이지에 없으면 null. */
  publicTitle: string | null;
  /** 내가 참여인원에 있는지 */
  isMine: boolean;
  /** 백서 본문을 볼 수 있는지(admin·acting은 전부, alumni는 참여한 것만) */
  canRead: boolean;
}

export interface RichTextSpan {
  text: string;
  href: string | null;
  bold?: true;
  italic?: true;
  strikethrough?: true;
  underline?: true;
  code?: true;
}

// 서버가 Notion 블록을 화면용으로 줄인 형태(apps/backend/src/hr/lib/whitepapers.ts).
export interface WhitepaperBlock {
  type: string;
  richText?: RichTextSpan[];
  children?: WhitepaperBlock[];
  checked?: boolean;
  icon?: string | null;
  url?: string | null;
  caption?: RichTextSpan[];
  title?: string;
  hasColumnHeader?: boolean;
  rows?: RichTextSpan[][][];
  columns?: WhitepaperBlock[][];
}

/** 홈페이지 공개 소개 본문 한 줄(서버에 저장된 복사본, 이미지도 복사본). */
export type PublicBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string; bold?: true; list?: true; quote?: true }
  | { type: "image"; url: string };

/** 홈페이지(ghsnu.com/PROJECT)에 공개된 소개를 복사해 둔 것. 누구나 본다. */
export interface PublicInfo {
  /** 원본 홈페이지 주소(출처 표시용) */
  sourceUrl: string;
  nameKo: string | null;
  nameEn: string | null;
  headline: string[];
  blocks: PublicBlock[];
}

/** canRead가 false면 notionUrl·blocks가 없다. */
export interface ProjectDetail extends Project {
  publicInfo: PublicInfo | null;
  notionUrl?: string;
  blocks?: WhitepaperBlock[];
}

// 상세에서 목록으로 돌아올 때 바로 보여주려고 마지막 목록을 들고 있는다(사용자별).
const lastLists = new Map<string, Project[]>();

export function peekProjects(userId: string): Project[] | undefined {
  return lastLists.get(userId);
}

export async function getProjects(userId: string): Promise<Project[]> {
  const { whitepapers } = await request<{ whitepapers: Project[] }>(
    "/api/v1/whitepapers",
  );
  lastLists.set(userId, whitepapers);
  return whitepapers;
}

export function getProject(notionPageId: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/v1/whitepapers/${notionPageId}`);
}

// 프로필 등 다른 앱에서 백서로 잇는 주소.
export function projectPath(notionPageId: string): string {
  return `/projects/${notionPageId}`;
}
