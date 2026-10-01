import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  Empty,
  Input,
  Typography,
} from "antd";
import { FilterOutlined, SearchOutlined } from "@ant-design/icons";
import { SidePane } from "@dhbot/ui-shell";
import { LoadingScreen } from "../../lib/LoadingScreen";
import { HrNav } from "../components/HrNav";
import { PersonAvatar } from "../components/PersonAvatar";
import { COMPACT_QUERY, PHONE_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { ApiClientError, getMe, getPeople, peekCached, type Me, type PersonSummary } from "../lib/api";
import {
  computeFacets,
  comparePeople,
  groupByCohort,
  matchesFilters,
  NONE_LABEL,
  type FacetOption,
} from "../lib/directory";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";
import "./Directory.css";

// 디렉토리(/hr) — 로그인 후 기본 화면. ARCHITECTURE.md §12.2 와이어프레임 그대로:
// 실시간 검색 + 체크박스 패싯 필터(기수/직무계열/소속팀) + 4열 고정 그리드
// (데스크톱 전용) + "내 프로필" 카드 고정(그리드에선 본인 제외).
export function Directory() {
  const session = useSession();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>();
  const [people, setPeople] = useState<PersonSummary[]>();
  const [error, setError] = useState<string>();

  const [search, setSearch] = useState("");
  const [cohorts, setCohorts] = useState<Set<string>>(new Set());
  const [jobFields, setJobFields] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<Set<string>>(new Set());
  // 접어둔 기수 목록. "펼친 기수"가 아니라 "접은 기수"를 기억해서, 필터로 새로
  // 나타나는 기수는 항상 기본(펼침)으로 보이게 한다. 표시 전용 상태라 필터와 무관.
  const [collapsedCohorts, setCollapsedCohorts] = useState<Set<number>>(new Set());
  // 태블릿 이하에선 왼쪽 레일(내 프로필+패싯)이 없어지고, 필터는 서랍으로 연다.
  const compact = useMediaQuery(COMPACT_QUERY);
  const phone = useMediaQuery(PHONE_QUERY);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (session === undefined) return; // 아직 세션 확인 중
    if (session === null) {
      navigate("/login", { replace: true });
      return;
    }
    const userId = session.user.id;

    // 이전에 받아둔 응답이 있으면 즉시 보여주고(재방문·프로필 상세에서 돌아온 경우),
    // 아래에서 새로 받아 덮어쓴다.
    const cachedMe = peekCached<Me>(userId, "me");
    const cachedPeople = peekCached<PersonSummary[]>(userId, "people");
    if (cachedMe && cachedPeople) {
      setMe(cachedMe);
      setPeople(cachedPeople);
    }

    (async () => {
      try {
        const [meResult, peopleResult] = await Promise.all([
          getMe(session.access_token, userId),
          getPeople(session.access_token, userId),
        ]);
        setMe(meResult);
        setPeople(peopleResult);
      } catch (e) {
        // 캐시로 이미 화면이 떠 있으면 조용히 유지하고, 아무것도 없을 때만 오류를 보인다.
        if (!cachedPeople) {
          setError(e instanceof ApiClientError ? e.message : "디렉토리 정보를 불러오지 못했습니다.");
        }
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

  // 화면 표시용으로만 기수별로 묶는다(필터·정렬 결과는 그대로).
  const cohortGroups = useMemo(() => groupByCohort(filtered), [filtered]);

  const activeFilterCount = cohorts.size + jobFields.size + teams.size;

  function resetFilters() {
    setCohorts(new Set());
    setJobFields(new Set());
    setTeams(new Set());
  }

  // 패싯 섹션 묶음. 데스크톱 레일에서는 기본이 모두 접힘(defaultOpen=false)이고,
  // 모바일 서랍에서는 서랍 자체가 필터 전용 화면이라 모두 펼쳐서 보여준다.
  // 접혀 있어도 선택된 개수는 제목 옆에 보여준다.
  const facetPanel = (defaultOpen: boolean) => (
    <Collapse
      ghost
      size="small"
      defaultActiveKey={defaultOpen ? ["cohort", "jobField", "team"] : []}
      items={[
        facetItem("cohort", "기수", facets.cohorts, cohorts, setCohorts),
        facetItem("jobField", "직무 계열", facets.jobFields, jobFields, setJobFields),
        facetItem("team", "소속팀", facets.teams, teams, setTeams),
      ].filter((item) => item !== null)}
    />
  );

  // 화면 코드 로딩 단계(RouteFallback)와 같은 로딩 화면을 이어서 보여준다(lib/LoadingScreen.tsx).
  if (session === undefined || session === null || (!people && !error)) {
    return <LoadingScreen />;
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
      <SidePane role={me.role} current="hr" />
      <main>
        <div className="row section-gap">
          <div>
            <div className="hr-eyebrow">ALUMNI DIRECTORY</div>
            <Typography.Title level={3} className="hr-page-title">
              그핵드인
            </Typography.Title>
            <Typography.Text type="secondary">알럼나이 디렉토리 · {people.length}명</Typography.Text>
          </div>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <HrNav role={me.role} />

        <div className={compact ? "directory-layout directory-layout-compact" : "directory-layout"}>
          {!compact && (
            <aside className="directory-side">
              {/* 내 프로필은 본문 전체 폭이 아니라 왼쪽 레일(패싯 위)에 그리드 카드와 같은 모양으로 둔다 —
                  본문 폭만큼 늘어나 옆이 휑해 보이던 문제(2026-10-01 피드백). */}
              {myProfile && <PersonCard person={myProfile} highlight />}
              <div className="directory-facets">{facetPanel(false)}</div>
            </aside>
          )}

          <div className="directory-main">
            {/* 레일이 없는 화면에선 내 프로필을 목록 맨 위에 그리드 한 칸 폭으로 둔다. */}
            {compact && myProfile && (
              <div className="person-grid directory-me-compact">
                <PersonCard person={myProfile} highlight />
              </div>
            )}

            <div className="directory-toolbar">
              <Input
                className="directory-search"
                placeholder="이름으로 검색"
                prefix={<SearchOutlined style={{ color: "#8da0c9" }} />}
                size="large"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
              {compact && (
                <Button size="large" icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>
                  필터
                  {activeFilterCount > 0 && <span className="hr-count-badge">{activeFilterCount}</span>}
                </Button>
              )}
            </div>

            {filtered.length === 0 ? (
              <Empty description="조건에 맞는 사람이 없습니다" style={{ marginTop: 48 }} />
            ) : (
              // 기수별로 접었다 펼 수 있다(기본은 전부 펼침). 사람이 하나도 없는 기수는
              // 그룹 자체가 안 생긴다.
              <Collapse
                ghost
                className="cohort-collapse"
                activeKey={cohortGroups
                  .filter((g) => !collapsedCohorts.has(g.cohort))
                  .map((g) => String(g.cohort))}
                onChange={(keys) => {
                  const open = new Set((Array.isArray(keys) ? keys : [keys]).map(Number));
                  setCollapsedCohorts(new Set(cohortGroups.filter((g) => !open.has(g.cohort)).map((g) => g.cohort)));
                }}
                items={cohortGroups.map((group) => ({
                  key: String(group.cohort),
                  // 인원수는 표시하지 않는다 — "내 프로필"이 위로 따로 빠져 있어 이 그룹의
                  // 숫자가 실제 기수 인원과 달라 보인다(패싯에 전체 인원수가 있다).
                  label: (
                    <span className="cohort-heading">
                      <span className="cohort-dot" aria-hidden="true" />
                      {group.cohort}기
                    </span>
                  ),
                  // 카드 최소 폭을 기준으로 열 수가 알아서 정해진다(데스크톱 4열 → 태블릿
                  // 2~3열 → 휴대폰 1열). 고정 4열이던 걸 반응형으로 바꾼 것.
                  children: (
                    <div className="person-grid">
                      {group.people.map((person) => (
                        <PersonCard key={person.notionPageId} person={person} />
                      ))}
                    </div>
                  ),
                }))}
              />
            )}
          </div>
        </div>
      </main>

      {/* 모바일 필터 서랍(아래에서 올라오는 시트) */}
      <Drawer
        open={compact && filterOpen}
        onClose={() => setFilterOpen(false)}
        placement="bottom"
        rootClassName="hr-filter-drawer"
        height={phone ? "82%" : 520}
        title="필터"
        footer={
          <div className="filter-drawer-footer">
            <Button size="large" onClick={resetFilters} disabled={activeFilterCount === 0}>
              초기화
            </Button>
            <Button size="large" type="primary" onClick={() => setFilterOpen(false)}>
              {filtered.length}명 보기
            </Button>
          </div>
        }
      >
        {facetPanel(true)}
      </Drawer>
    </div>
  );
}

function PersonCard({ person, highlight }: { person: PersonSummary; highlight?: boolean }) {
  return (
    <Link to={`/hr/people/${person.notionPageId}`} className="person-card-link">
      <Card size="small" className={highlight ? "person-card person-card-highlight" : "person-card"}>
        {highlight && <span className="hr-badge">내 프로필</span>}
        <div className="person-card-body">
          <PersonAvatar src={person.profileImageUrl} size={64} />
          <div className="person-card-info">
            <div className="person-card-name">{person.name}</div>
            {/* 학과는 카드에 안 보여준다(2026-09-28 결정) — 복수전공이 많아
                줄 길이가 들쭉날쭉해지고 카드 높이가 흔들려서 가독성이
                떨어졌다. 기수+현재 직무 정도면 카드 용도(빠른 식별)엔 충분. */}
            <div className="person-card-meta">
              {person.cohort}기{person.jobField.length > 0 ? ` · ${person.jobField.join(", ")}` : ""}
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

// 패싯 한 섹션을 Collapse 항목으로 만든다(옵션이 없으면 null → 섹션 자체를 숨김).
// 체크박스 동작(카테고리 내 OR)은 예전과 완전히 같고, 접었다 펼치는 껍데기만 추가했다.
function facetItem(
  key: string,
  title: string,
  options: FacetOption[],
  selected: Set<string>,
  onChange: (next: Set<string>) => void,
) {
  if (options.length === 0) return null;

  function toggle(optionKey: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(optionKey);
    else next.delete(optionKey);
    onChange(next);
  }

  return {
    key,
    label: (
      <Typography.Text strong>
        {title}
        {selected.size > 0 && <span className="hr-count-badge">{selected.size}</span>}
      </Typography.Text>
    ),
    children: (
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
    ),
  };
}
