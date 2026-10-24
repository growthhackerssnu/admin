import { AppButton as Button } from "@/components/ui/app-button";
import { AppTag as Tag } from "@/components/ui/app-tag";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Card, Checkbox, Empty, Input, Select, Typography } from "antd";
import { LockOutlined, SearchOutlined } from "@ant-design/icons";
import { AppShell } from "@/components/ui/app-shell";
import { LoadingScreen } from "../../lib/LoadingScreen";
import { ApiClientError, getMe, peekCached, type Me } from "../../hr/lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";
import {
  getProjects,
  peekProjects,
  prefetchProject,
  projectPath,
  ProjectsApiError,
  type Project,
} from "../api";
import { groupByQuarter, matchesProject } from "../lib/filter";
import { ProjectThumbnail } from "../components/ProjectThumbnail";
import "./ProjectList.css";

// 프로젝트(/projects) — Notion Projects DB의 프로젝트 백서 목록. 서버가 최신 분기순으로
// 주고, 화면은 분기별로 묶어 보여준다. 검색(기업·한줄설명·참여자·산업)과 분기·기술분류·내 프로젝트 필터는 메모리에서
// 거른다. alumni는 참여한 프로젝트만 백서 본문을 보고, 나머지는 개요만 본다(자물쇠 표시).
export function ProjectList() {
  const session = useSession();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>();
  const [projects, setProjects] = useState<Project[]>();
  const [error, setError] = useState<string>();

  const [search, setSearch] = useState("");
  const [quarters, setQuarters] = useState<string[]>([]);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      navigate("/login", { replace: true });
      return;
    }
    const userId = session.user.id;

    // 상세에서 돌아오면 받아둔 목록을 바로 보여주고 뒤에서 새로 받는다.
    const cachedMe = peekCached<Me>(userId, "me");
    const cached = peekProjects(userId);
    if (cachedMe && cached) {
      setMe(cachedMe);
      setProjects(cached);
    }

    (async () => {
      try {
        const [meResult, list] = await Promise.all([
          getMe(session.access_token, userId),
          getProjects(userId),
        ]);
        setMe(meResult);
        setProjects(list);
      } catch (e) {
        if (!cached) {
          setError(
            e instanceof ApiClientError || e instanceof ProjectsApiError
              ? e.message
              : "프로젝트 목록을 불러오지 못했습니다.",
          );
        }
      }
    })();
  }, [session]);

  // 서버가 이미 최신 분기순으로 정렬해서 주므로 등장 순서가 곧 분기 순서다.
  const quarterOptions = useMemo(
    () => unique((projects ?? []).map((p) => p.quarter)),
    [projects],
  );
  const technologyOptions = useMemo(
    () =>
      unique((projects ?? []).flatMap((p) => p.technology)).sort((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    [projects],
  );
  const hasMine = useMemo(
    () => (projects ?? []).some((p) => p.isMine),
    [projects],
  );
  const hasLocked = useMemo(
    () => (projects ?? []).some((p) => !p.canRead),
    [projects],
  );

  const filtered = useMemo(
    () =>
      (projects ?? []).filter((p) =>
        matchesProject(p, { search, quarters, technologies, mineOnly }),
      ),
    [projects, search, quarters, technologies, mineOnly],
  );

  const groups = useMemo(() => groupByQuarter(filtered), [filtered]);

  if (session === undefined || session === null || (!projects && !error)) {
    return <LoadingScreen />;
  }

  if (error || !projects || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "프로젝트 목록을 불러오지 못했습니다."}
            action={<Button onClick={() => void signOut()}>로그아웃</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <AppShell role={me.role} current="projects">
      <main>
        <div className="row section-gap">
          <div>
            <div className="hr-eyebrow">PROJECTS</div>
            <Typography.Title level={3} className="hr-page-title">
              프로젝트
            </Typography.Title>
            <Typography.Text type="secondary">
              그핵 프로젝트 백서 · {projects.length}건
            </Typography.Text>
          </div>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        {hasLocked && (
          <Typography.Paragraph
            type="secondary"
            className="project-access-note"
          >
            <LockOutlined /> 백서는 내부 문서라 내가 참여한 프로젝트만 볼 수
            있습니다. 다른 프로젝트는 홈페이지 공개 소개와 개요를 볼 수 있어요.
          </Typography.Paragraph>
        )}

        <div className="project-toolbar">
          <Input
            className="project-search"
            placeholder="기업·참여자·산업으로 검색"
            prefix={<SearchOutlined style={{ color: "var(--ds-gray-600)" }} />}
            size="large"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Select
            className="project-filter"
            mode="multiple"
            size="large"
            placeholder="분기"
            value={quarters}
            onChange={setQuarters}
            options={quarterOptions.map((q) => ({ value: q, label: q }))}
            maxTagCount="responsive"
            allowClear
          />
          <Select
            className="project-filter"
            mode="multiple"
            size="large"
            placeholder="기술분류"
            value={technologies}
            onChange={setTechnologies}
            options={technologyOptions.map((t) => ({ value: t, label: t }))}
            maxTagCount="responsive"
            allowClear
          />
          {hasMine && (
            <Checkbox
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            >
              내 프로젝트만
            </Checkbox>
          )}
        </div>

        {filtered.length === 0 ? (
          <Empty
            description="조건에 맞는 프로젝트가 없습니다"
            style={{ marginTop: 48 }}
          />
        ) : (
          groups.map((group) => (
            <section key={group.quarter ?? "none"} className="project-quarter">
              <h2 className="project-quarter-title">
                {group.label}
                <span className="project-quarter-count">
                  {group.projects.length}건
                </span>
              </h2>
              <div className="project-grid">
                {group.projects.map((p) => (
                  <ProjectCard
                    key={p.notionPageId}
                    project={p}
                    onIntent={() =>
                      prefetchProject(p.notionPageId, session.user.id)
                    }
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </AppShell>
  );
}

// onIntent: 마우스를 올리거나 누르기 시작하면 상세를 미리 받는다.
function ProjectCard({
  project,
  onIntent,
}: {
  project: Project;
  onIntent: () => void;
}) {
  const pms = project.members.filter((m) => m.isPm);
  return (
    <Link
      to={projectPath(project.notionPageId)}
      className="project-card-link"
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
    >
      <Card
        size="small"
        className="project-card"
        cover={<ProjectThumbnail project={project} />}
      >
        <div className="project-card-title">{project.title}</div>
        {(project.oneLiner ?? project.publicTitle) && (
          <div className="project-card-oneliner">
            {project.oneLiner ?? project.publicTitle}
          </div>
        )}
        {(project.industry.length > 0 || project.technology.length > 0) && (
          <div className="project-card-tags">
            {project.industry.map((i) => (
              <Tag key={`i-${i}`}>{i}</Tag>
            ))}
            {project.technology.map((t) => (
              <Tag key={`t-${t}`} color="blue">
                {t}
              </Tag>
            ))}
          </div>
        )}
        <div className="project-card-meta">
          <span>
            {pms.length > 0 && `PM ${pms.map((m) => m.name).join(", ")} · `}
            참여 {project.members.length}명
          </span>
          {project.isMine ? (
            <span className="hr-badge">내 프로젝트</span>
          ) : (
            !project.canRead && (
              <span
                className="project-card-lock"
                title="백서는 참여자만 볼 수 있습니다"
              >
                <LockOutlined /> 공개 소개만
              </span>
            )
          )}
        </div>
      </Card>
    </Link>
  );
}

function unique<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null))];
}
