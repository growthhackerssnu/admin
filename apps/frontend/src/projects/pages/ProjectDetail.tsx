import { AppButton as Button } from "@/components/ui/app-button";
import { AppTag as Tag } from "@/components/ui/app-tag";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Descriptions, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { AppShell } from "@/components/ui/app-shell";
import { LoadingScreen } from "../../lib/LoadingScreen";
import { PHONE_QUERY, useMediaQuery } from "../../hr/lib/useMediaQuery";
import { ApiClientError, getMe, type Me } from "../../hr/lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";
import {
  getProject,
  ProjectsApiError,
  type ProjectDetail as Detail,
  type ProjectMember,
  type PublicInfo,
} from "../api";
import { NotionBlocks } from "../components/NotionBlocks";
import { ProjectThumbnail } from "../components/ProjectThumbnail";
import "./ProjectDetail.css";

// 프로젝트 상세(/projects/:notionPageId) — 개요(분기·산업·기술·PM·참여인원)와 홈페이지
// 공개 소개는 누구나, 백서(내부 문서) 본문은 볼 수 있는 사람(canRead)에게만 보여준다. 못 보는 경우 서버가 본문을
// 아예 안 보내므로(blocks 없음) 여기선 안내만 한다. 참여인원은 각자의 그핵드인 프로필로 잇는다.
export function ProjectDetail() {
  const { notionPageId } = useParams<{ notionPageId: string }>();
  const session = useSession();
  const navigate = useNavigate();
  const phone = useMediaQuery(PHONE_QUERY);
  const [me, setMe] = useState<Me>();
  const [project, setProject] = useState<Detail>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      navigate("/login", { replace: true });
      return;
    }
    if (!notionPageId) return;
    (async () => {
      try {
        const [meResult, detail] = await Promise.all([
          getMe(session.access_token, session.user.id),
          getProject(notionPageId),
        ]);
        setMe(meResult);
        setProject(detail);
      } catch (e) {
        setError(
          e instanceof ApiClientError || e instanceof ProjectsApiError
            ? e.message
            : "프로젝트를 불러오지 못했습니다.",
        );
      }
    })();
  }, [session, notionPageId]);

  if (session === undefined || session === null || (!project && !error)) {
    return <LoadingScreen />;
  }

  if (error || !project || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "프로젝트를 불러오지 못했습니다."}
            action={<Link to="/projects">프로젝트 목록으로</Link>}
          />
        </div>
      </div>
    );
  }

  const pms = project.members.filter((m) => m.isPm);
  const members = project.members.filter((m) => !m.isPm);

  return (
    <AppShell role={me.role} current="projects">
      <main>
        <div className="row section-gap">
          <Link to="/projects">← 프로젝트 목록으로</Link>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <div className="project-hero section-gap">
          <ProjectThumbnail project={project} className="project-hero-thumb" />
          <div>
            <div className="hr-eyebrow">
              WHITEPAPER{project.quarter ? ` · ${project.quarter}` : ""}
            </div>
            <Typography.Title level={3} className="hr-page-title">
              {project.title}
            </Typography.Title>
            {(project.oneLiner ?? project.publicTitle) && (
              <Typography.Text type="secondary">
                {project.oneLiner ?? project.publicTitle}
              </Typography.Text>
            )}
            {project.isMine && (
              <div>
                <span className="hr-badge">내 프로젝트</span>
              </div>
            )}
          </div>
        </div>

        <Descriptions
          column={1}
          bordered
          size="small"
          className="section-gap"
          layout={phone ? "vertical" : "horizontal"}
        >
          {project.industry.length > 0 && (
            <Descriptions.Item label="산업 분류">
              <TagList values={project.industry} />
            </Descriptions.Item>
          )}
          {project.technology.length > 0 && (
            <Descriptions.Item label="기술분류">
              <TagList values={project.technology} color="blue" />
            </Descriptions.Item>
          )}
          {pms.length > 0 && (
            <Descriptions.Item label="PM">
              <MemberLinks members={pms} />
            </Descriptions.Item>
          )}
          {members.length > 0 && (
            <Descriptions.Item label="참여인원">
              <MemberLinks members={members} />
            </Descriptions.Item>
          )}
        </Descriptions>

        {project.publicInfo && <PublicSection info={project.publicInfo} />}

        <h2 className="project-section-title">
          백서 <span className="project-section-note">내부 문서</span>
        </h2>
        {project.canRead ? (
          <>
            <article className="project-body notion-body section-gap">
              {project.blocks && project.blocks.length > 0 ? (
                <NotionBlocks blocks={project.blocks} />
              ) : (
                <Typography.Text type="secondary">
                  아직 작성된 내용이 없습니다.
                </Typography.Text>
              )}
            </article>
            {project.notionUrl && (
              <a href={project.notionUrl} target="_blank" rel="noreferrer">
                Notion 원본에서 보기 ↗
              </a>
            )}
          </>
        ) : (
          <div className="project-locked section-gap">
            <LockOutlined className="project-locked-icon" />
            <div>
              <div className="project-locked-title">
                백서는 참여자만 볼 수 있습니다
              </div>
              <Typography.Text type="secondary">
                내가 참여한 프로젝트는 백서 전체를 볼 수 있어요.
                {project.publicInfo
                  ? " 위 공개 소개를 참고하거나 참여자에게 물어보세요."
                  : " 궁금한 점은 위 참여자에게 물어보세요."}
              </Typography.Text>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

// 홈페이지(ghsnu.com/PROJECT)에 공개된 소개 — 누구나 본다.
function PublicSection({ info }: { info: PublicInfo }) {
  return (
    <>
      <h2 className="project-section-title">
        프로젝트 소개{" "}
        <span className="project-section-note">홈페이지 공개</span>
      </h2>
      <section className="project-public section-gap">
        {info.headline.length > 0 && (
          <div className="project-public-headline">
            {info.headline.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
        {info.intro.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
        {info.goals.length > 0 && (
          <>
            <div className="project-public-label">세부 목표</div>
            <ul className="project-public-goals">
              {info.goals.map((goal, i) => (
                // "1-1." 같은 하위 목표는 들여쓴다.
                <li key={i} className={/^\d+-\d+/.test(goal) ? "is-sub" : ""}>
                  {goal}
                </li>
              ))}
            </ul>
          </>
        )}
        <a href={info.url} target="_blank" rel="noreferrer">
          홈페이지에서 전체 보기 ↗
        </a>
      </section>
    </>
  );
}

function TagList({ values, color }: { values: string[]; color?: string }) {
  return (
    <span className="project-tags">
      {values.map((v) => (
        <Tag key={v} color={color}>
          {v}
        </Tag>
      ))}
    </span>
  );
}

function MemberLinks({ members }: { members: ProjectMember[] }) {
  return (
    <span className="project-members">
      {members.map((m) => (
        <Link key={m.notionPageId} to={`/hr/people/${m.notionPageId}`}>
          {m.name}
          <span className="project-member-cohort">{m.cohort}기</span>
        </Link>
      ))}
    </span>
  );
}
