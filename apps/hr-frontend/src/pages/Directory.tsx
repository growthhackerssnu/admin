import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Input,
  Row,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import { SidePane } from "@dhbot/ui-shell";
import { HrNav } from "../components/HrNav";
import { ApiClientError, getMe, getPeople, type Me, type PersonSummary } from "../lib/api";
import {
  computeFacets,
  comparePeople,
  matchesFilters,
  NONE_LABEL,
  type FacetOption,
} from "../lib/directory";
import { hrefForApp, loginHref } from "../lib/redirect";
import { useSession } from "../hooks/useSession";
import { signOut } from "../lib/supabase";
import "./Directory.css";

// 디렉토리(/hr) — 로그인 후 기본 화면. ARCHITECTURE.md §12.2 와이어프레임 그대로:
// 실시간 검색 + 체크박스 패싯 필터(기수/직무계열/소속팀) + 4열 고정 그리드
// (데스크톱 전용) + "내 프로필" 카드 고정(그리드에선 본인 제외).
export function Directory() {
  const session = useSession();
  const [me, setMe] = useState<Me>();
  const [people, setPeople] = useState<PersonSummary[]>();
  const [error, setError] = useState<string>();

  const [search, setSearch] = useState("");
  const [cohorts, setCohorts] = useState<Set<string>>(new Set());
  const [jobFields, setJobFields] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (session === undefined) return; // 아직 세션 확인 중
    if (session === null) {
      window.location.href = loginHref();
      return;
    }
    (async () => {
      try {
        const [meResult, peopleResult] = await Promise.all([
          getMe(session.access_token),
          getPeople(session.access_token),
        ]);
        setMe(meResult);
        setPeople(peopleResult);
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : "디렉토리 정보를 불러오지 못했습니다.");
      }
    })();
  }, [session]);

  const myProfile = useMemo(
    () => people?.find((p) => p.notionPageId === me?.notionPageId),
    [people, me],
  );

  // "내 프로필" 카드가 위에 고정으로 따로 뜨므로, 그리드에선 본인을 제외한다
  // (같은 사람이 화면에 중복으로 보이는 걸 방지, §12.2).
  const gridSource = useMemo(
    () => (people ?? []).filter((p) => p.notionPageId !== me?.notionPageId),
    [people, me],
  );

  const facets = useMemo(() => computeFacets(people ?? []), [people]);

  const filtered = useMemo(() => {
    return gridSource
      .filter((p) => matchesFilters(p, { search, cohorts, jobFields, teams }))
      .sort(comparePeople);
  }, [gridSource, search, cohorts, jobFields, teams]);

  if (session === undefined || session === null || (!people && !error)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  if (error || !people || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "디렉토리 정보를 불러오지 못했습니다."}
            action={<Button onClick={() => void signOut()}>로그아웃</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SidePane role={me.role} current="hr" hrefFor={hrefForApp} />
      <main>
        <div className="row section-gap">
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              그핵드인
            </Typography.Title>
            <Typography.Text type="secondary">알럼나이 디렉토리 · {people.length}명</Typography.Text>
          </div>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <HrNav />

        {myProfile && (
          <div className="section-gap">
            <PersonCard person={myProfile} highlight />
          </div>
        )}

        <div className="directory-layout">
          <aside className="directory-facets">
            <FacetGroup title="기수" options={facets.cohorts} selected={cohorts} onChange={setCohorts} />
            <FacetGroup
              title="직무 계열"
              options={facets.jobFields}
              selected={jobFields}
              onChange={setJobFields}
            />
            <FacetGroup title="소속팀" options={facets.teams} selected={teams} onChange={setTeams} />
          </aside>

          <div className="directory-main">
            <Input
              className="directory-search"
              placeholder="이름으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />

            {filtered.length === 0 ? (
              <Empty description="조건에 맞는 사람이 없습니다" style={{ marginTop: 48 }} />
            ) : (
              <Row gutter={[16, 16]}>
                {filtered.map((person) => (
                  <Col span={6} key={person.notionPageId}>
                    <PersonCard person={person} />
                  </Col>
                ))}
              </Row>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function PersonCard({ person, highlight }: { person: PersonSummary; highlight?: boolean }) {
  return (
    <Link to={`/people/${person.notionPageId}`} className="person-card-link">
      <Card size="small" className={highlight ? "person-card person-card-highlight" : "person-card"}>
        {highlight && (
          <Tag color="blue" style={{ marginBottom: 8 }}>
            내 프로필
          </Tag>
        )}
        <div className="person-card-body">
          <Avatar shape="square" size={64} src={person.profileImageUrl ?? undefined}>
            {person.name.slice(0, 1)}
          </Avatar>
          <div className="person-card-info">
            <div className="person-card-name">{person.name}</div>
            {/* 학과는 카드에 안 보여준다(2026-09-28 결정) — 복수전공이 많아
                줄 길이가 들쭉날쭉해지고 카드 높이가 흔들려서 가독성이
                떨어졌다. 기수+현재 직무 정도면 카드 용도(빠른 식별)엔 충분. */}
            <div className="person-card-meta">
              {person.cohort}기{person.jobField ? ` · ${person.jobField}` : ""}
            </div>
            {person.currentCareerOneLine && (
              <div className="person-card-career">{person.currentCareerOneLine}</div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function FacetGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FacetOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (options.length === 0) return null;

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(next);
  }

  return (
    <div className="facet-group">
      <Typography.Text strong>{title}</Typography.Text>
      <div className="facet-options">
        {options.map((opt) => (
          <Checkbox
            key={opt.key}
            checked={selected.has(opt.key)}
            onChange={(e) => toggle(opt.key, e.target.checked)}
          >
            {opt.label === NONE_LABEL ? <Typography.Text type="secondary">{opt.label}</Typography.Text> : opt.label}{" "}
            <Typography.Text type="secondary">({opt.count})</Typography.Text>
          </Checkbox>
        ))}
      </div>
    </div>
  );
}
