import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ListFilter } from "@/components/ui/list-filter";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";
import { WorkspaceTable } from "@/components/ui/workspace-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { WorkspaceError } from "@/components/ui/workspace-error";
import { WorkspaceDisclosure } from "@/components/ui/workspace-disclosure";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  WorkspaceStatus,
  type WorkspaceTone,
} from "@/components/ui/workspace-status";
import { WorkspaceIconButton } from "@/components/ui/workspace-icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DhWorkspaceNavigation } from "./DhWorkspaceNavigation";
import { safeUrl } from "./contracts";
import {
  collaborationCompany,
  outcomeLabels,
  projectLabels,
  type HistoryCompany,
  type HistoryData,
  type HistoryKind,
  type HistoryCommand,
  type HistoryProject,
  type HistoryRepository,
  type HistoryFilters as Filters,
  SavedHistoryRefreshError,
} from "./historyContracts";
import { historyTabs, type HistoryTab } from "./historyNavigation";
import { HistoryComposer, type ComposerForms } from "./HistoryComposer";
import {
  HistoryProjectForm,
  type ProjectFormMemory,
} from "./HistoryProjectForm";
import "./history-workspace.css";

const initialFilters = (): Filters => ({
  query: "",
  outcome: "all",
  quarter: "all",
  owner: "all",
  work: "all",
  sort: "recent",
  page: 1,
});
const savedNotices: Partial<Record<HistoryCommand["type"], string>> = {
  purpose: "연락 목적을 저장했습니다.",
  recipient: "수신자를 저장했습니다.",
  draft: "수정한 메시지를 저장했습니다.",
  project: "프로젝트를 저장했습니다.",
  send: "발송 완료를 기록했습니다.",
};
export interface HistoryMemory {
  forms: ComposerForms;
  projects: Record<string, ProjectFormMemory>;
  filters: Record<HistoryKind, Filters>;
  scroll: Record<HistoryKind, { top: number; left: number }>;
  selected: Record<HistoryKind, string | null>;
  cursors: Record<HistoryKind, (string | null)[]>;
}
export const createHistoryMemory = (): HistoryMemory => ({
  forms: {},
  projects: {},
  filters: {
    "contact-history": initialFilters(),
    "collaboration-history": initialFilters(),
  },
  scroll: {
    "contact-history": { top: 0, left: 0 },
    "collaboration-history": { top: 0, left: 0 },
  },
  selected: { "contact-history": null, "collaboration-history": null },
  cursors: { "contact-history": [null], "collaboration-history": [null] },
});
function Status({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: WorkspaceTone;
}) {
  return <WorkspaceStatus tone={tone}>{label}</WorkspaceStatus>;
}
function latestProject(company: HistoryCompany) {
  if (company.list) return company.list.latestProject;
  return [...company.projects].sort(
    (a, b) =>
      (b.year ?? 0) * 4 +
      (b.quarter ?? 0) -
      ((a.year ?? 0) * 4 + (a.quarter ?? 0)),
  )[0];
}
const quarterLabel = (q: string) =>
  /^\d{4}-Q[1-4]$/.test(q) ? q.replace("-Q", "년 ") + "분기" : q;
const dateLabel = (date?: string) =>
  date ? new Date(date).toLocaleDateString("ko-KR") : "—";
function previousSend(company: HistoryCompany) {
  if (company.list) return company.list.previousContact;
  return company.sends.find((send) => send.id !== company.work?.sent?.id);
}

export function HistoryWorkspace({
  kind,
  repository,
  memory,
  onTabChange,
  selectedId,
  onSelect,
  scenario = "",
}: {
  kind: HistoryKind;
  repository: HistoryRepository;
  memory: HistoryMemory;
  onTabChange: (tab: HistoryTab) => void | boolean | Promise<void | boolean>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  scenario?: string;
}) {
  const [data, setData] = useState<HistoryData>();
  const [loading, setLoading] = useState(repository.mode !== "unavailable");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [detail, setDetail] = useState<HistoryCompany>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [refreshFailure, setRefreshFailure] = useState(false);
  const [filters, setFilters] = useState(memory.filters[kind]);
  const [mode, setMode] = useState<"detail" | "compose" | "project">("detail");
  const [project, setProject] = useState<HistoryProject>();
  const [addingProject, setAddingProject] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(Boolean(selectedId));
  const scroll = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const requestNumber = useRef(0);
  const savedCompany = useRef<string>();
  const live = repository.mode === "live";
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const searchCompanies = useCallback(
    (query: string) =>
      repository.searchCompanies?.(query) ?? Promise.resolve([]),
    [repository],
  );
  const fetchCompany = useCallback(
    (id: string) =>
      repository.loadCompany
        ? repository.loadCompany(id)
        : Promise.reject(new Error("기업 조회를 사용할 수 없습니다.")),
    [repository],
  );
  const load = useCallback(async () => {
    if (repository.mode === "unavailable") return;
    const request = ++requestNumber.current;
    setLoading(true);
    setError("");
    try {
      if (!live && scenario === "error")
        throw new Error("이력 자료를 불러오지 못했습니다.");
      const current = filtersRef.current;
      const result = await repository.load({
        kind,
        filters: current,
        cursor: memory.cursors[kind][current.page - 1],
      });
      if (alive.current && request === requestNumber.current)
        setData(
          !live && scenario === "empty"
            ? { ...result, companies: [] }
            : !live && scenario === "no-round"
              ? { ...result, round: null }
              : result,
        );
      return true;
    } catch (e) {
      if (alive.current && request === requestNumber.current)
        setData((previous) =>
          previous ? { ...previous, companies: [], page: undefined } : previous,
        );
      if (alive.current && request === requestNumber.current)
        setError(
          e instanceof Error ? e.message : "자료를 불러오지 못했습니다.",
        );
      return false;
    } finally {
      if (alive.current && request === requestNumber.current) setLoading(false);
    }
  }, [repository, scenario, live, kind, memory]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestNumber.current++;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => void load(),
      live && filters.query ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      requestNumber.current++;
    };
  }, [load, live ? filters : null]);
  const loadDetail = useCallback(async () => {
    if (!selectedId || !repository.loadCompany) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const company = await repository.loadCompany(selectedId);
      if (alive.current) {
        setDetail(company);
        setRefreshFailure(false);
      }
    } catch (e) {
      if (alive.current)
        setDetailError(
          e instanceof Error ? e.message : "기업 이력을 불러오지 못했습니다.",
        );
    } finally {
      if (alive.current) setDetailLoading(false);
    }
  }, [repository, selectedId]);
  useEffect(() => {
    if (!live || !selectedId || !repository.loadCompany) return;
    let active = true;
    setDetail(undefined);
    setDetailLoading(true);
    setDetailError("");
    void repository
      .loadCompany(selectedId)
      .then((c) => {
        if (active) setDetail(c);
      })
      .catch((e) => {
        if (active)
          setDetailError(
            e instanceof Error ? e.message : "기업 이력을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, selectedId, live]);
  const retry = async () => {
    if (!(await load())) return;
    if (refreshFailure && savedCompany.current && repository.loadCompany) {
      try {
        const company = await repository.loadCompany(savedCompany.current);
        if (alive.current) {
          if (selectedId === company.id) setDetail(company);
          setRefreshFailure(false);
          setError("");
        }
      } catch (e) {
        if (alive.current)
          setError(
            e instanceof Error ? e.message : "저장된 자료를 다시 조회해주세요.",
          );
      }
    } else await loadDetail();
  };
  useEffect(() => {
    const f = memory.filters[kind];
    setFilters(f);
    setMode("detail");
  }, [kind, memory]);
  useEffect(() => {
    setDrawerOpen(Boolean(selectedId));
  }, [selectedId]);
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = memory.scroll[kind].top;
      scroll.current.scrollLeft = memory.scroll[kind].left;
    }
  }, [kind, loading, memory]);
  const updateFilter = (patch: Partial<Filters>) => {
    if (busy.current) return;
    if (live) setLoading(true);
    if (patch.page === undefined) memory.cursors[kind] = [null];
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    memory.filters[kind] = next;
    setFilters(next);
  };
  const execute = async (
    command: HistoryCommand,
    companyId = selectedId,
  ): Promise<boolean> => {
    if (!companyId || !data || busy.current || refreshFailure) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const company =
        detail?.id === companyId
          ? detail
          : data.companies.find((c) => c.id === companyId);
      const next = await repository.execute(
        companyId,
        company?.work?.version ?? null,
        command,
      );
      if (alive.current) {
        setData(next);
        if (live && selectedId === companyId)
          setDetail(repository.getCompany?.(companyId));
        const notice = savedNotices[command.type];
        if (notice) toast.success(notice);
      }
      return true;
    } catch (e) {
      if (e instanceof SavedHistoryRefreshError && alive.current) {
        savedCompany.current = e.companyId;
        setRefreshFailure(true);
      }
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "저장하지 못했습니다. 입력은 유지됩니다.",
        );
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  };
  const collaboration = kind === "collaboration-history";
  const companies = data?.companies ?? [];
  const selected = live
    ? detail?.id === selectedId
      ? detail
      : companies.find((c) => c.id === selectedId)
    : companies.find((c) => c.id === selectedId);
  const actionPending = pending || refreshFailure;
  const start = async () => {
    if (await execute({ type: "start" })) setMode("compose");
  };
  const all = live
    ? companies
    : companies.filter((c) =>
        collaboration
          ? collaborationCompany(c)
          : c.sends.length > 0 && !collaborationCompany(c),
      );
  const owners = [
    ...new Set(
      all
        .map((c) =>
          collaboration
            ? latestProject(c)?.ownerName
            : previousSend(c)?.owner.name,
        )
        .filter(Boolean),
    ),
  ] as string[];
  const quarters =
    data?.quarters ??
    [
      ...new Set(
        all.flatMap((c) =>
          collaboration
            ? [
                ...c.projects
                  .filter((p) => p.year && p.quarter)
                  .map((p) => `${p.year}-Q${p.quarter}`),
                ...(c.wonQuarter ? [c.wonQuarter] : []),
              ]
            : previousSend(c)
              ? [previousSend(c)!.quarter]
              : [],
        ),
      ),
    ]
      .sort()
      .reverse();
  const filtered = live
    ? all
    : all
        .filter((c) => {
          const previous = previousSend(c);
          const p = latestProject(c);
          const w = c.work;
          if (
            !`${c.name} ${c.description}`
              .toLocaleLowerCase()
              .includes(filters.query.toLocaleLowerCase())
          )
            return false;
          if (
            filters.outcome !== "all" &&
            (collaboration
              ? (p?.status ?? (c.projects.length ? "unknown" : "won_only"))
              : (previous?.outcome ?? "unrecorded")) !== filters.outcome
          )
            return false;
          if (
            filters.owner !== "all" &&
            (collaboration ? p?.ownerName : previous?.owner.name) !==
              filters.owner
          )
            return false;
          if (
            filters.quarter !== "all" &&
            (collaboration
              ? !c.projects.some(
                  (p) => `${p.year}-Q${p.quarter}` === filters.quarter,
                ) && c.wonQuarter !== filters.quarter
              : previous?.quarter !== filters.quarter)
          )
            return false;
          if (filters.work === "none" && w) return false;
          if (
            filters.work === "mine" &&
            (!w || w.owner.id !== data?.actor.id || w.sent)
          )
            return false;
          if (
            filters.work === "others" &&
            (!w || w.owner.id === data?.actor.id || w.sent)
          )
            return false;
          if (filters.work === "sent" && !w?.sent) return false;
          return true;
        })
        .sort((a, b) => {
          if (filters.sort === "name")
            return a.name.localeCompare(b.name, "ko");
          const value = (c: HistoryCompany) =>
            collaboration
              ? (latestProject(c)?.year ?? 0) * 4 +
                  (latestProject(c)?.quarter ?? 0) ||
                Number(c.wonQuarter?.replace(/\D/g, "")) ||
                0
              : Date.parse(c.sends[0]?.at ?? "") || 0;
          return (
            (filters.sort === "oldest"
              ? value(a) - value(b)
              : value(b) - value(a)) || a.id.localeCompare(b.id)
          );
        });
  const maxPage = Math.max(1, Math.ceil(filtered.length / 15));
  const page = live ? filters.page : Math.min(filters.page, maxPage);
  const rows = live ? filtered : filtered.slice((page - 1) * 15, page * 15);
  const open = Boolean((drawerOpen && selectedId) || addingProject);
  return (
    <SidebarProvider
      defaultOpen
      className="ds-workspace dw-section-workspace uw-shell hw-shell"
    >
      <DhWorkspaceNavigation
        value={kind}
        onChange={onTabChange}
        canManageOps={data?.canManage}
      />
      <SidebarInset className="uw-inset hw-inset">
        <header className="hw-topbar">
          <h1 className="ds-section-page-title">
            {historyTabs.find((tab) => tab.value === kind)?.label}
          </h1>
          {repository.mode === "mock" && (
            <WorkspaceStatus className="hw-mock-label">
              목업 데이터
            </WorkspaceStatus>
          )}
          <span className="hw-top-meta">
            {repository.mode === "preview" ? "개발용 예시 데이터" : ""}
            {data?.round && <span>{quarterLabel(data.round.quarter)}</span>}
          </span>
        </header>
        {repository.mode === "unavailable" ? (
          <div className="hw-unavailable">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>이력 API 연결 준비 중</EmptyTitle>
              </EmptyHeader>
              <p>
                이 화면은 준비되어 있으며, 실제 이력 조회는 API 연결 후 사용할
                수 있습니다.
              </p>
              <Button variant="outline" onClick={() => onTabChange("review")}>
                신규 발굴로 이동
              </Button>
            </Empty>
          </div>
        ) : (
          <div className="hw-data-region">
            <section className="hw-table-tools" aria-label="이력 검색 및 필터">
              <InputGroup className="hw-search">
                <InputGroupAddon>
                  <Search size={16} />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="기업명 또는 설명 검색"
                  placeholder="기업명 또는 설명 검색"
                  value={filters.query}
                  onChange={(e) => updateFilter({ query: e.target.value })}
                />
              </InputGroup>
              <div className="hw-tool-filters">
                <ListFilter
                  label="분기 필터"
                  value={filters.quarter}
                  options={[
                    { value: "all", label: "전체 분기" },
                    ...quarters.map((q) => ({
                      value: q,
                      label: quarterLabel(q),
                    })),
                  ]}
                  onChange={(quarter) => updateFilter({ quarter })}
                />
                <ListFilter
                  label="결과·진행 상태 필터"
                  value={filters.outcome}
                  options={[
                    { value: "all", label: "전체 상태" },
                    ...(collaboration
                      ? Object.entries(projectLabels).map(([value, label]) => ({
                          value,
                          label,
                        }))
                      : Object.entries(outcomeLabels)
                          .filter(([v]) => v !== "won")
                          .map(([value, label]) => ({ value, label }))),
                    {
                      value: collaboration ? "unknown" : "unrecorded",
                      label: "상태 미기록",
                    },
                    ...(collaboration
                      ? [{ value: "won_only", label: "프로젝트 미입력" }]
                      : []),
                  ]}
                  onChange={(outcome) => updateFilter({ outcome })}
                />
                <ListFilter
                  label="담당자 필터"
                  value={filters.owner}
                  options={[
                    { value: "all", label: "전체 담당" },
                    ...(live
                      ? (data?.owners ?? []).map((owner) => ({
                          value: owner.id,
                          label: owner.name,
                        }))
                      : owners.map((owner) => ({
                          value: owner,
                          label: owner,
                        }))),
                  ]}
                  onChange={(owner) => updateFilter({ owner })}
                />
                {(!live || !collaboration) && (
                  <ListFilter
                    label="이번 작업 필터"
                    value={filters.work}
                    options={[
                      { value: "all", label: "이번 작업 전체" },
                      { value: "none", label: "작업 없음" },
                      { value: "mine", label: "내 작성 중" },
                      { value: "others", label: "다른 담당자" },
                      { value: "sent", label: "발송 완료" },
                    ]}
                    onChange={(work) => updateFilter({ work })}
                  />
                )}
                {(!live || !collaboration) && (
                  <ListFilter
                    label="정렬"
                    value={filters.sort}
                    options={[
                      {
                        value: "recent",
                        label: collaboration ? "최근 협업순" : "최근 연락순",
                      },
                      { value: "oldest", label: "오래된 순" },
                      { value: "name", label: "기업명순" },
                    ]}
                    onChange={(sort) => updateFilter({ sort })}
                  />
                )}
              </div>
              {collaboration && data?.canManage && (
                <Button
                  size="sm"
                  onClick={() => {
                    onSelect(null);
                    setAddingProject(true);
                    setMode("project");
                    setProject(undefined);
                  }}
                >
                  <Plus size={15} />
                  협업 추가
                </Button>
              )}
            </section>
            {error && !open && (
              <WorkspaceError message={error} onRetry={() => void retry()} />
            )}
            <WorkspaceTable
              caption={`${collaboration ? "재수주" : "과거 컨택"} 기업별 목록`}
              columns={[
                { key: "company", label: "기업" },
                {
                  key: "latest",
                  label: collaboration ? "최근 프로젝트" : "최근 연락",
                },
                {
                  key: "quarter",
                  label: collaboration ? "진행 분기" : "이전 제안 분기",
                },
                {
                  key: "status",
                  label: collaboration ? "진행 상태" : "이전 연락 결과",
                },
                ...(collaboration
                  ? [{ key: "count", label: "협업 건수" }]
                  : []),
                {
                  key: "owner",
                  label: collaboration ? "담당자" : "이전 담당자",
                },
                { key: "work", label: "이번 작업" },
              ]}
              className="hw-table"
              loading={loading || (!live && scenario === "loading")}
              empty={!rows.length}
              emptyTitle={
                !data && error
                  ? "조회 결과 없음"
                  : all.length
                    ? "조건에 맞는 기업이 없습니다."
                    : "아직 이력이 없습니다."
              }
              emptyAction={
                all.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      memory.filters[kind] = initialFilters();
                      memory.cursors[kind] = [null];
                      setFilters(initialFilters());
                    }}
                  >
                    필터 초기화
                  </Button>
                ) : undefined
              }
              containerProps={{
                ref: scroll,
                onScroll: (e) => {
                  memory.scroll[kind] = {
                    top: e.currentTarget.scrollTop,
                    left: e.currentTarget.scrollLeft,
                  };
                },
              }}
            >
              {rows.map((c) => {
                const previous = previousSend(c);
                const p = latestProject(c);
                const work = c.list?.currentWork ?? c.work;
                const workSent =
                  work &&
                  ("sent" in work
                    ? Boolean(work.sent)
                    : work.sendStatus === "sent");
                return (
                  <TableRow
                    key={c.id}
                    data-state={selectedId === c.id ? "selected" : undefined}
                    data-clickable="true"
                    onClick={() => {
                      if (pending) return;
                      setDrawerOpen(true);
                      setAddingProject(false);
                      setMode("detail");
                      onSelect(c.id);
                    }}
                  >
                    <TableCell>
                      <button
                        className="hw-company-button"
                        type="button"
                        aria-label={`${c.name} 이력 보기`}
                        onClick={() => {
                          if (pending) return;
                          setDrawerOpen(true);
                          setAddingProject(false);
                          setMode("detail");
                          onSelect(c.id);
                        }}
                      >
                        <strong className="ds-table-primary">{c.name}</strong>
                        <span className="ds-table-secondary">
                          {c.description}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      {collaboration ? (
                        <span className="hw-project-title">
                          {p?.title ?? "프로젝트 정보 미입력"}
                        </span>
                      ) : (
                        dateLabel(live ? previous?.at : c.sends[0]?.at)
                      )}
                    </TableCell>
                    <TableCell>
                      {collaboration
                        ? p?.year && p.quarter
                          ? quarterLabel(`${p.year}-Q${p.quarter}`)
                          : c.wonQuarter
                            ? quarterLabel(c.wonQuarter)
                            : "미기록"
                        : previous
                          ? quarterLabel(previous.quarter)
                          : "—"}
                    </TableCell>
                    <TableCell>
                      {collaboration ? (
                        <Status
                          label={
                            p?.status
                              ? projectLabels[p.status]
                              : (c.list?.projectCount ?? c.projects.length)
                                ? "상태 미기록"
                                : "프로젝트 미입력"
                          }
                          tone={
                            p?.status === "completed"
                              ? "success"
                              : p?.status === "in_progress"
                                ? "info"
                                : "neutral"
                          }
                        />
                      ) : (
                        <Status
                          label={
                            previous?.outcome
                              ? outcomeLabels[previous.outcome]
                              : "결과 미기록"
                          }
                          tone={
                            previous?.outcome === "rejected"
                              ? "danger"
                              : "neutral"
                          }
                        />
                      )}
                    </TableCell>
                    {collaboration && (
                      <TableCell>
                        {c.list?.projectCount ?? c.projects.length}건
                      </TableCell>
                    )}
                    <TableCell>
                      {collaboration
                        ? p?.ownerName || "미기록"
                        : (previous?.owner.name ?? "—")}
                    </TableCell>
                    <TableCell>
                      {work ? (
                        <div className="hw-work-cell">
                          <Status
                            label={
                              workSent
                                ? "발송 완료"
                                : work.owner.id === data?.actor.id
                                  ? "내 작성 중"
                                  : "다른 담당자 작성 중"
                            }
                            tone={workSent ? "success" : "neutral"}
                          />
                          <small className="ds-table-secondary">
                            {work.owner.name}
                          </small>
                        </div>
                      ) : (
                        <span className="hw-muted">작업 없음</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </WorkspaceTable>
            <DataTablePagination
              summary={
                loading || (!live && scenario === "loading")
                  ? "불러오는 중"
                  : filtered.length
                    ? live
                      ? `${(page - 1) * 15 + 1}–${(page - 1) * 15 + rows.length}`
                      : `${(page - 1) * 15 + 1}–${Math.min(page * 15, filtered.length)} / ${filtered.length}`
                    : "0개"
              }
              canPrevious={page > 1}
              canNext={live ? Boolean(data?.page?.hasMore) : page < maxPage}
              pending={pending || loading || (!live && scenario === "loading")}
              onPrevious={() => updateFilter({ page: page - 1 })}
              onNext={() => {
                if (live)
                  memory.cursors[kind][page] = data?.page?.nextCursor ?? null;
                updateFilter({ page: page + 1 });
              }}
            />
          </div>
        )}
      </SidebarInset>
      <Sheet
        open={open}
        modal={false}
        onOpenChange={(value) => {
          if (!value && !pending) {
            setDrawerOpen(false);
            setAddingProject(false);
          }
        }}
      >
        <SheetContent
          showOverlay={false}
          showCloseButton={false}
          className={`ds-workspace dw-section-workspace hw-drawer ${mode === "compose" ? "hw-drawer-wide" : ""}`}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <header className="hw-drawer-head">
            {mode !== "detail" && !addingProject && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="이전 이력 보기"
                disabled={pending}
                onClick={() => setMode("detail")}
              >
                <ArrowLeft size={17} />
              </Button>
            )}
            <div>
              <SheetTitle>
                {addingProject
                  ? "협업 추가"
                  : mode === "project"
                    ? project
                      ? "프로젝트 수정"
                      : "프로젝트 추가"
                    : selected?.name}
              </SheetTitle>
              <SheetDescription>
                {repository.mode === "mock" ? "목업 · " : ""}
                {mode === "compose"
                  ? "메시지 작성"
                  : (selected?.description ?? "프로젝트 등록")}
              </SheetDescription>
            </div>
            <WorkspaceIconButton
              icon="close"
              label="이력 패널 닫기"
              disabled={pending}
              onClick={() => {
                setDrawerOpen(false);
                setAddingProject(false);
              }}
            />
          </header>
          {error && (
            <WorkspaceError message={error} onRetry={() => void retry()} />
          )}
          {detailError && (
            <WorkspaceError
              message={detailError}
              onRetry={() => void loadDetail()}
            />
          )}
          {detailLoading && !addingProject && (
            <div
              className="hw-drawer-scroll"
              role="status"
              aria-label="기업 이력 불러오는 중"
            >
              <Skeleton className="h-20 w-full" />
              <Skeleton className="mt-6 h-40 w-full" />
            </div>
          )}
          {mode === "project" &&
            data?.canManage &&
            !detailLoading &&
            !detailError && (
              <HistoryProjectForm
                key={project?.id ?? selected?.id ?? "new"}
                companies={companies}
                company={addingProject ? undefined : selected}
                project={project}
                memory={memory.projects}
                pending={actionPending}
                members={live ? data.members : undefined}
                searchCompanies={live ? searchCompanies : undefined}
                loadCompany={live ? fetchCompany : undefined}
                onCancel={() => {
                  if (addingProject) setAddingProject(false);
                  else setMode("detail");
                }}
                onSave={(id, project, newCompany) =>
                  execute({ type: "project", project, newCompany }, id)
                }
              />
            )}
          {mode === "compose" &&
            selected?.work &&
            data &&
            !detailLoading &&
            !detailError && (
              <HistoryComposer
                key={selected.work.id}
                company={selected}
                data={data}
                forms={memory.forms}
                mock={repository.mode === "mock"}
                pending={actionPending}
                execute={execute}
              />
            )}
          {mode === "detail" &&
            selected &&
            data &&
            !detailLoading &&
            !detailError && (
              <>
                <div className="hw-drawer-scroll">
                  <section className="hw-current">
                    <h3>이번 작업</h3>
                    {selected.work ? (
                      <>
                        <Status
                          label={selected.work.sent ? "발송 완료" : "작성 중"}
                          tone={selected.work.sent ? "success" : "neutral"}
                        />
                        <p>{selected.work.owner.name} 담당</p>
                      </>
                    ) : (
                      <p className="hw-muted">아직 시작하지 않았습니다.</p>
                    )}
                  </section>
                  {collaboration && (
                    <section>
                      <div className="hw-section-head">
                        <h3>프로젝트 {selected.projects.length}건</h3>
                        {data.canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setProject(undefined);
                              setMode("project");
                            }}
                          >
                            <Plus size={15} />
                            추가
                          </Button>
                        )}
                      </div>
                      {!selected.projects.length && (
                        <div className="hw-project-missing">
                          <Status label="프로젝트 정보 미입력" />
                          <p>
                            수주 완료 ·{" "}
                            {selected.wonQuarter
                              ? quarterLabel(selected.wonQuarter)
                              : "분기 미기록"}
                          </p>
                        </div>
                      )}
                      {[...selected.projects]
                        .sort(
                          (a, b) =>
                            (b.year ?? 0) * 4 +
                            (b.quarter ?? 0) -
                            ((a.year ?? 0) * 4 + (a.quarter ?? 0)),
                        )
                        .map((p) => (
                          <article className="hw-project" key={p.id}>
                            <div className="hw-section-head">
                              <strong>{p.title}</strong>
                              {data.canManage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setProject(p);
                                    setMode("project");
                                  }}
                                >
                                  수정
                                </Button>
                              )}
                            </div>
                            <p className="hw-muted">
                              {p.year && p.quarter
                                ? quarterLabel(`${p.year}-Q${p.quarter}`)
                                : "분기 미기록"}{" "}
                              ·{" "}
                              {p.status
                                ? projectLabels[p.status]
                                : "상태 미기록"}
                            </p>
                            {p.summary && <p>{p.summary}</p>}
                            {p.ownerName && (
                              <p className="hw-muted">담당 · {p.ownerName}</p>
                            )}
                            {p.contactName && (
                              <p className="hw-muted">
                                관계자 · {p.contactName}
                              </p>
                            )}
                            {safeUrl(p.resultUrl) && (
                              <a
                                href={safeUrl(p.resultUrl)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                결과 자료
                              </a>
                            )}
                          </article>
                        ))}
                    </section>
                  )}
                  <section>
                    <h3>이전 연락 {selected.sends.length}건</h3>
                    {!selected.sends.length && (
                      <p className="hw-muted">발송 기록이 없습니다.</p>
                    )}
                    {selected.sends.map((s) => (
                      <article className="hw-send" key={s.id}>
                        <div className="hw-section-head">
                          <strong>{quarterLabel(s.quarter)}</strong>
                          <Status
                            label={
                              s.outcome
                                ? outcomeLabels[s.outcome]
                                : "결과 미기록"
                            }
                            tone={
                              s.outcome === "won"
                                ? "success"
                                : s.outcome === "rejected"
                                  ? "danger"
                                  : "neutral"
                            }
                          />
                        </div>
                        <p className="hw-muted">
                          {dateLabel(s.at)} · {s.owner.name}
                        </p>
                        <p>
                          {s.recipient.name} ·{" "}
                          {s.recipient.channel === "linkedin"
                            ? "LinkedIn"
                            : "이메일"}
                        </p>
                        {s.response ? (
                          <p className="hw-response">{s.response}</p>
                        ) : (
                          <p className="hw-muted">답변 미기록</p>
                        )}
                        <WorkspaceDisclosure label="당시 메시지">
                          <strong>{s.subject}</strong>
                          <p className="hw-snapshot">{s.body}</p>
                        </WorkspaceDisclosure>
                      </article>
                    ))}
                  </section>
                  <section>
                    <h3>저장된 기업 정보</h3>
                    <p>{selected.research ?? "저장된 조사 자료가 없습니다."}</p>
                  </section>
                  <section>
                    <h3>관계자</h3>
                    {selected.contacts.length ? (
                      selected.contacts.map((r, i) => (
                        <div
                          className="hw-contact-summary"
                          key={`${r.address}-${i}`}
                        >
                          <strong>{r.name}</strong>
                          <span>
                            {r.title} ·{" "}
                            {r.channel === "linkedin" ? "LinkedIn" : "이메일"}
                          </span>
                          {r.channel === "linkedin" && safeUrl(r.address) ? (
                            <a
                              href={safeUrl(r.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              프로필 열기
                            </a>
                          ) : (
                            <span>{r.address}</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="hw-muted">저장된 관계자가 없습니다.</p>
                    )}
                  </section>
                </div>
                <footer className="hw-composer-footer">
                  {!data.round && (
                    <p className="hw-block-reason">
                      현재 수주 회차가 설정되지 않았습니다.
                    </p>
                  )}
                  <Button
                    disabled={actionPending || (!selected.work && !data.round)}
                    onClick={() =>
                      selected.work ? setMode("compose") : void start()
                    }
                  >
                    {selected.work?.sent
                      ? "발송 기록 보기"
                      : selected.work
                        ? selected.work.owner.id === data.actor.id
                          ? "이어서 작성"
                          : "작업 보기"
                        : "메시지 작성"}
                  </Button>
                </footer>
              </>
            )}
        </SheetContent>
      </Sheet>
      <Toaster
        theme="light"
        className="ds-workspace ds-toaster"
        position="bottom-right"
      />
    </SidebarProvider>
  );
}
