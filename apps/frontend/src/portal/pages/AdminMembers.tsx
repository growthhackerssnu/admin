import { PersonLink } from "../../lib/PersonLink";
import { AppButton as Button } from "@/components/ui/app-button";
import { AppTag as Tag } from "@/components/ui/app-tag";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  App as AntApp,
  Alert,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Popover,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import { AppShell } from "@/components/ui/app-shell";
import { AdminNav } from "../components/AdminNav";
import {
  addMember,
  ApiClientError,
  changeMemberRole,
  deactivateMembers,
  getMe,
  listAdminMembers,
  reactivateMembers,
  type AdminMember,
  type OpsRole,
  type OpsRoleAssignment,
} from "../lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";
import { LoadingScreen } from "../../lib/LoadingScreen";
import "./AdminMembers.css";

const ROLE_LABEL: Record<AdminMember["role"], string> = {
  admin: "admin",
  acting: "acting",
  alumni: "alumni",
};
const ROLE_COLOR: Record<AdminMember["role"], string> = {
  admin: "gold",
  acting: "blue",
  alumni: "default",
};

// 운영팀 직책의 한국어 이름과 그룹. 백엔드 src/portal/lib/opsRoles.ts와 같은 목록이며,
// 프론트는 백엔드 코드를 import하지 않으므로 여기 한 벌 더 둔다(ROLE_LABEL도 같다).
// 값을 추가할 때는 양쪽을 같이 고친다.
const OPS_ROLE_LABEL: Record<OpsRole, string> = {
  president: "회장",
  vice_president: "부회장",
  treasurer: "총무",
  external_lead: "대외협력 팀장",
  hr_lead: "HR 팀장",
  pr_lead: "PR 팀장",
  edu_lead: "에듀 팀장",
  external_member: "대외협력 팀원",
  hr_member: "HR 팀원",
  pr_member: "PR 팀원",
  edu_member: "에듀 팀원",
};

// 직책(임원·팀장): 한 사람이 하나만, 같은 직책은 기수마다 한 명(인수인계 기간엔 두 기수가
// 함께 있을 수 있다). 팀원: 여러 팀을 동시에 할 수 있다. 서버도 같은 규칙으로 거절한다.
const OFFICE_GROUPS: { label: string; roles: OpsRole[] }[] = [
  { label: "임원", roles: ["president", "vice_president", "treasurer"] },
  { label: "팀장", roles: ["external_lead", "hr_lead", "pr_lead", "edu_lead"] },
];
const OFFICE_ROLES = new Set<OpsRole>(OFFICE_GROUPS.flatMap((g) => g.roles));
const TEAM_ROLES: OpsRole[] = [
  "external_member",
  "hr_member",
  "pr_member",
  "edu_member",
];

function opsRoleTitle(role: OpsRoleAssignment) {
  return role.cohort
    ? `${role.cohort}기 ${OPS_ROLE_LABEL[role.opsRole]}`
    : OPS_ROLE_LABEL[role.opsRole];
}

// 직책의 기수는 고르지 않는다 — 19기는 19기 회장만 될 수 있어서 서버가 그 사람의 기수로 채운다.
// initialTeams는 대화상자를 열 때 체크돼 있던 팀이다. 여럿을 골랐을 때는 여기서 바뀐 팀만
// 보낸다(넣은 팀·뺀 팀) — 통째로 보내면 한 사람에게만 있던 팀이 지워진다.
type OpsRoleDraft = {
  office: OpsRole | undefined;
  teams: OpsRole[];
  initialTeams: OpsRole[];
};

// 직책 목록 맨 위의 "직책 없음" — 고르면 지금 직책을 뺀다.
const NO_OFFICE = "none";

// 직책 선택 + 팀원 체크. 대화상자(일괄)와 표 칸 편집기(한 명)가 같이 쓴다.
// showOffice가 false면 팀원만(여럿을 골랐을 때 — 직책은 한 명씩 지정한다).
function OpsRoleFields({
  draft,
  onChange,
  showOffice,
}: {
  draft: OpsRoleDraft;
  onChange: (next: OpsRoleDraft) => void;
  showOffice: boolean;
}) {
  return (
    <>
      {showOffice && (
        <div>
          <div className="meta" style={{ marginBottom: 4 }}>
            직책
          </div>
          <Select<OpsRole | typeof NO_OFFICE>
            style={{ width: "100%" }}
            // 목록을 편집기 안에 띄운다 — 바깥(body)에 띄우면 고르는 순간 칸 편집기가
            // 바깥을 누른 걸로 알고 닫힌다.
            getPopupContainer={(node) => node.parentElement ?? document.body}
            value={draft.office ?? NO_OFFICE}
            onChange={(office) =>
              onChange({
                ...draft,
                office: office === NO_OFFICE ? undefined : office,
              })
            }
            options={[
              { value: NO_OFFICE, label: "직책 없음" },
              ...OFFICE_GROUPS.map((group) => ({
                label: group.label,
                options: group.roles.map((role) => ({
                  value: role,
                  label: OPS_ROLE_LABEL[role],
                })),
              })),
            ]}
          />
        </div>
      )}
      <div>
        <div className="meta" style={{ marginBottom: 4 }}>
          팀원
        </div>
        <Checkbox.Group
          value={draft.teams}
          onChange={(teams) =>
            onChange({ ...draft, teams: teams as OpsRole[] })
          }
          options={TEAM_ROLES.map((role) => ({
            value: role,
            label: OPS_ROLE_LABEL[role],
          }))}
        />
      </div>
    </>
  );
}

// 한 사람의 지금 직책·팀에서 시작하는 편집 초안.
function draftFor(m: AdminMember): OpsRoleDraft {
  const office = m.opsRoles.find((r) => OFFICE_ROLES.has(r.opsRole));
  const teams = m.opsRoles
    .filter((r) => !OFFICE_ROLES.has(r.opsRole))
    .map((r) => r.opsRole);
  return { office: office?.opsRole, teams, initialTeams: teams };
}

// 노션처럼 칸을 눌러 그 자리에서 고치는 칸. 누르면 content가 팝오버로 열린다.
// editable이 false(관리자 계정 등)면 그냥 보여주기만 한다.
function InlineCell({
  open,
  onOpenChange,
  editable,
  content,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable: boolean;
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!editable) return <>{children}</>;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      content={content}
      destroyOnHidden
    >
      <div
        role="button"
        tabIndex={0}
        className={
          open ? "inline-edit-cell inline-edit-cell-open" : "inline-edit-cell"
        }
        // 칸을 눌러도 행 선택이 바뀌지 않게 한다.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        {children}
      </div>
    </Popover>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

export function AdminMembers() {
  const session = useSession();
  const { message, modal } = AntApp.useApp();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AdminMember[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<"all" | "active" | "inactive">("all");
  // 기수 필터(여럿 고르면 그중 하나). 비어 있으면 전체.
  const [cohortFilter, setCohortFilter] = useState<string[]>([]);
  // 표 정렬은 여기서 들고 있는다 — 저장 후 명단을 다시 불러와도 정렬이 풀리지 않게.
  const [sort, setSort] = useState<SorterResult<AdminMember>>({});
  const [opsRoleModalOpen, setOpsRoleModalOpen] = useState(false);
  const [opsRoleDraft, setOpsRoleDraft] = useState<OpsRoleDraft>({
    office: undefined,
    teams: [],
    initialTeams: [],
  });
  // 표에서 지금 열려 있는 칸 편집기(한 번에 하나). 운영팀 칸은 초안을 따로 들고 있는다.
  const [editing, setEditing] = useState<{
    id: string;
    field: "role" | "ops" | "active";
  } | null>(null);
  const [inlineDraft, setInlineDraft] = useState<OpsRoleDraft>({
    office: undefined,
    teams: [],
    initialTeams: [],
  });
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState<{
    name: string;
    cohort: number | null;
    email: string;
  }>({ name: "", cohort: null, email: "" });

  const token = session?.access_token;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await listAdminMembers(token);
      setMembers(result.items);
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : "명단을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setChecking(true);
      try {
        const me = await getMe(token);
        setIsAdmin(me.role === "admin");
      } catch {
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (session === undefined || checking) {
    return <LoadingScreen />;
  }
  if (session === null) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <main>
        <Alert
          type="error"
          showIcon
          message="접근 권한이 없습니다"
          description="관리자 계정만 이 페이지를 볼 수 있습니다."
          action={<Button onClick={() => void signOut()}>로그아웃</Button>}
        />
      </main>
    );
  }

  // keepSelection: 표 칸에서 한 사람만 고칠 땐 골라둔 행을 그대로 둔다.
  async function withBusyReload(
    action: () => Promise<unknown>,
    successText: string,
    { keepSelection = false }: { keepSelection?: boolean } = {},
  ) {
    setBusy(true);
    try {
      await action();
      void message.success(successText);
      if (!keepSelection) setSelectedIds([]);
      await load();
    } catch (e) {
      void message.error(
        e instanceof ApiClientError ? e.message : "요청이 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmDeactivate() {
    modal.confirm({
      title: `${selectedIds.length}명을 정말 삭제(비활성화)할까요?`,
      content:
        "선택한 회원은 로그인은 되지만 모든 기능 접근이 막힙니다. 나중에 재활성화할 수 있습니다.",
      okText: "삭제",
      okButtonProps: { danger: true },
      cancelText: "취소",
      onOk: () =>
        withBusyReload(
          () => deactivateMembers(token!, selectedIds),
          "선택한 회원을 비활성화했습니다.",
        ),
    });
  }

  const selectedMembers =
    members?.filter((m) => selectedIds.includes(m.id)) ?? [];
  const hasAdminSelected = selectedMembers.some((m) => m.role === "admin");
  const hasInactiveSelected = selectedMembers.some((m) => !m.active);
  const hasActiveSelected = selectedMembers.some((m) => m.active);

  const viewCounts = {
    all: members?.length ?? 0,
    active: members?.filter((m) => m.active).length ?? 0,
    inactive: members?.filter((m) => !m.active).length ?? 0,
  };
  const cohortOptions = [...new Set((members ?? []).map((m) => m.cohort ?? ""))]
    .sort((a, b) => (Number(b) || -1) - (Number(a) || -1))
    .map((cohort) => ({
      value: cohort,
      label: cohort ? `${cohort}기` : "기수 없음",
    }));
  const visibleMembers = (members ?? []).filter((m) => {
    if (cohortFilter.length > 0 && !cohortFilter.includes(m.cohort ?? ""))
      return false;
    if (view === "active") return m.active;
    if (view === "inactive") return !m.active;
    return true;
  });
  const sortOrderOf = (key: string) =>
    sort.columnKey === key ? (sort.order ?? null) : null;

  // 선택한 사람이 전부 이미 acting이면 이 버튼은 "직책만 바꾸는" 동작이 된다.
  const allSelectedActing =
    selectedMembers.length > 0 &&
    selectedMembers.every((m) => m.role === "acting");

  // 직책은 한 명씩만 지정한다 — 여럿을 고르면 지금 직책은 그대로 두고 팀원만 바꾼다.
  const singleSelected =
    selectedMembers.length === 1 ? selectedMembers[0] : undefined;

  function openOpsRoleModal() {
    // 한 명만 골랐으면 그 사람의 지금 직책·팀에서 시작한다. 여럿이면 모두가 함께 속한 팀에서.
    if (singleSelected) {
      setOpsRoleDraft(draftFor(singleSelected));
    } else {
      const teams = TEAM_ROLES.filter((team) =>
        selectedMembers.every((m) =>
          m.opsRoles.some((r) => r.opsRole === team),
        ),
      );
      setOpsRoleDraft({ office: undefined, teams, initialTeams: teams });
    }
    setOpsRoleModalOpen(true);
  }

  // 여럿을 골랐을 때 넣을 팀과 뺄 팀. 체크 상태를 바꾸지 않은 팀은 각자 그대로다.
  const addTeams = opsRoleDraft.teams.filter(
    (t) => !opsRoleDraft.initialTeams.includes(t),
  );
  const removeTeams = opsRoleDraft.initialTeams.filter(
    (t) => !opsRoleDraft.teams.includes(t),
  );

  // 저장 후 직책이나 팀이 하나도 없는 사람이 생기면 안 된다(acting은 하나 이상).
  const draftLeavesSomeoneEmpty = singleSelected
    ? opsRoleDraft.teams.length === 0 && !opsRoleDraft.office
    : selectedMembers.some(
        (m) =>
          addTeams.length === 0 &&
          !m.opsRoles.some(
            (r) =>
              OFFICE_ROLES.has(r.opsRole) || !removeTeams.includes(r.opsRole),
          ),
      );
  const draftInvalid = draftLeavesSomeoneEmpty;

  function submitOpsRole() {
    if (draftInvalid) return;
    const { office, teams } = opsRoleDraft;
    setOpsRoleModalOpen(false);
    void withBusyReload(
      () =>
        changeMemberRole(
          token!,
          selectedIds,
          singleSelected
            ? { role: "acting", teams, office: office ?? null }
            : // 여럿이면 바뀐 팀만 보내고 office는 보내지 않는다 = 각자 지금 직책·다른 팀은 그대로.
              { role: "acting", addTeams, removeTeams },
        ),
      allSelectedActing
        ? "운영팀 직책을 변경했습니다."
        : "acting으로 변경했습니다.",
    );
  }

  function confirmToAlumni() {
    modal.confirm({
      title: `${selectedIds.length}명을 alumni로 변경할까요?`,
      content:
        "alumni에게는 운영팀 직책이 없습니다 — 지금 지정된 직책은 지워집니다. 다시 acting으로 올릴 때 새로 지정하면 됩니다.",
      okText: "alumni로 변경",
      cancelText: "취소",
      onOk: () =>
        withBusyReload(
          () => changeMemberRole(token!, selectedIds, { role: "alumni" }),
          "alumni로 변경했습니다.",
        ),
    });
  }

  // ---- 표 칸 편집(한 사람) ----
  const isEditing = (id: string, field: "role" | "ops" | "active") =>
    editing?.id === id && editing.field === field;

  function setCellOpen(
    m: AdminMember,
    field: "role" | "ops" | "active",
    open: boolean,
  ) {
    if (!open) {
      if (isEditing(m.id, field)) setEditing(null);
      return;
    }
    if (field === "ops") setInlineDraft(draftFor(m));
    setEditing({ id: m.id, field });
  }

  function changeRoleInline(m: AdminMember, role: "acting" | "alumni") {
    setEditing(null);
    if (role === m.role) return;
    if (role === "acting") {
      // acting에게는 직책이나 팀이 하나 이상 있어야 한다 — 바로 운영팀 편집기를 연다.
      setCellOpen(m, "ops", true);
      return;
    }
    modal.confirm({
      title: `${m.displayName} 님을 alumni로 변경할까요?`,
      content:
        "alumni에게는 운영팀 직책이 없습니다 — 지금 지정된 직책과 팀은 지워집니다.",
      okText: "alumni로 변경",
      cancelText: "취소",
      onOk: () =>
        withBusyReload(
          () => changeMemberRole(token!, [m.id], { role: "alumni" }),
          `${m.displayName} 님을 alumni로 변경했습니다.`,
          { keepSelection: true },
        ),
    });
  }

  function saveOpsInline(m: AdminMember) {
    const { office, teams } = inlineDraft;
    if (!office && teams.length === 0) return;
    setEditing(null);
    void withBusyReload(
      () =>
        changeMemberRole(token!, [m.id], {
          role: "acting",
          teams,
          office: office ?? null,
        }),
      m.role === "acting"
        ? `${m.displayName} 님의 운영팀 직책을 변경했습니다.`
        : `${m.displayName} 님을 acting으로 변경했습니다.`,
      { keepSelection: true },
    );
  }

  function changeActiveInline(m: AdminMember, active: boolean) {
    setEditing(null);
    if (active === m.active) return;
    if (active) {
      void withBusyReload(
        () => reactivateMembers(token!, [m.id]),
        `${m.displayName} 님을 재활성화했습니다.`,
        { keepSelection: true },
      );
      return;
    }
    modal.confirm({
      title: `${m.displayName} 님을 비활성화할까요?`,
      content:
        "로그인은 되지만 모든 기능 접근이 막힙니다. 나중에 재활성화할 수 있습니다.",
      okText: "비활성화",
      okButtonProps: { danger: true },
      cancelText: "취소",
      onOk: () =>
        withBusyReload(
          () => deactivateMembers(token!, [m.id]),
          `${m.displayName} 님을 비활성화했습니다.`,
          { keepSelection: true },
        ),
    });
  }

  // 권한·상태 칸의 선택 메뉴. 지금 값에는 ✓를 붙인다.
  function menu<T extends string | boolean>(
    current: T,
    items: { value: T; label: React.ReactNode }[],
    onPick: (value: T) => void,
  ) {
    return (
      <div className="inline-edit-menu" role="menu">
        {items.map((item) => (
          <button
            key={String(item.value)}
            type="button"
            role="menuitem"
            className="inline-edit-menu-item"
            disabled={busy}
            onClick={() => onPick(item.value)}
          >
            {item.label}
            {item.value === current && <span aria-label="현재 값">✓</span>}
          </button>
        ))}
      </div>
    );
  }

  const columns: ColumnsType<AdminMember> = [
    {
      title: "기수",
      key: "cohort",
      dataIndex: "cohort",
      width: 90,
      sorter: (a, b) => (Number(a.cohort) || 0) - (Number(b.cohort) || 0),
      sortOrder: sortOrderOf("cohort"),
      render: (cohort: string | null) => cohort ?? "—",
    },
    {
      title: "회원",
      key: "member",
      render: (_, m) => (
        <div>
          <div>
            <PersonLink name={m.displayName} cohort={m.cohort} />
          </div>
          <div className="meta">{m.email}</div>
        </div>
      ),
    },
    {
      title: "권한",
      dataIndex: "role",
      width: 110,
      // 관리자 계정의 role은 이 화면에서 바꾸지 않는다(서버도 거절한다).
      render: (role: AdminMember["role"], m) => (
        <InlineCell
          editable={role !== "admin"}
          open={isEditing(m.id, "role")}
          onOpenChange={(open) => setCellOpen(m, "role", open)}
          content={menu(
            role,
            (["acting", "alumni"] as const).map((value) => ({
              value,
              label: <Tag color={ROLE_COLOR[value]}>{ROLE_LABEL[value]}</Tag>,
            })),
            (value) => {
              if (value !== "admin") changeRoleInline(m, value);
            },
          )}
        >
          <Tag color={ROLE_COLOR[role]}>{ROLE_LABEL[role]}</Tag>
        </InlineCell>
      ),
    },
    {
      title: "운영팀",
      dataIndex: "opsRoles",
      width: 220,
      render: (opsRoles: AdminMember["opsRoles"], m) => (
        <InlineCell
          editable={m.role !== "admin"}
          open={isEditing(m.id, "ops")}
          onOpenChange={(open) => setCellOpen(m, "ops", open)}
          content={
            <div className="inline-ops-editor">
              {m.role !== "acting" && (
                <Typography.Text type="secondary">
                  저장하면 {m.displayName} 님이 acting으로 바뀝니다.
                </Typography.Text>
              )}
              <OpsRoleFields
                draft={inlineDraft}
                onChange={setInlineDraft}
                showOffice
              />
              {!inlineDraft.office && inlineDraft.teams.length === 0 && (
                <Typography.Text type="warning">
                  acting 회원에게는 직책이나 팀이 하나 이상 있어야 합니다.
                  운영팀에서 빠지는 거라면 권한을 alumni로 바꾸세요.
                </Typography.Text>
              )}
              <div className="inline-ops-editor-footer">
                <Button size="small" onClick={() => setEditing(null)}>
                  취소
                </Button>
                <Button
                  size="small"
                  type="primary"
                  disabled={
                    busy ||
                    (!inlineDraft.office && inlineDraft.teams.length === 0)
                  }
                  onClick={() => saveOpsInline(m)}
                >
                  저장
                </Button>
              </div>
            </div>
          }
        >
          {opsRolesView(opsRoles, m)}
        </InlineCell>
      ),
    },
    {
      title: "상태",
      dataIndex: "active",
      width: 100,
      render: (active: boolean, m) => (
        <InlineCell
          editable={m.role !== "admin"}
          open={isEditing(m.id, "active")}
          onOpenChange={(open) => setCellOpen(m, "active", open)}
          content={menu(
            active,
            [
              { value: true, label: <Tag color="green">활성</Tag> },
              { value: false, label: <Tag>비활성</Tag> },
            ],
            (value) => changeActiveInline(m, value),
          )}
        >
          {active ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>}
        </InlineCell>
      ),
    },
    { title: "가입일", dataIndex: "createdAt", width: 180, render: formatDate },
    {
      title: "최근 접속일",
      dataIndex: "lastLoginAt",
      width: 180,
      render: formatDate,
    },
  ];

  // 운영팀 칸에 보이는 태그들.
  function opsRolesView(opsRoles: AdminMember["opsRoles"], m: AdminMember) {
    // acting인데 직책이 비어 있으면 아직 직책을 지정하지 않은 회원이다.
    if (opsRoles.length === 0)
      return m.role === "acting" ? <Tag color="orange">미지정</Tag> : "—";
    return (
      <Space size={[4, 4]} wrap>
        {opsRoles.map((r) =>
          // 직책의 기수는 그 사람의 기수다. 그핵드인 명단에 기수가 없는 사람이면 모른다.
          OFFICE_ROLES.has(r.opsRole) && !r.cohort ? (
            <Tag key={r.opsRole} color="orange">
              {OPS_ROLE_LABEL[r.opsRole]} · 기수 미지정
            </Tag>
          ) : (
            <Tag
              key={r.opsRole}
              color={OFFICE_ROLES.has(r.opsRole) ? "blue" : "default"}
            >
              {opsRoleTitle(r)}
            </Tag>
          ),
        )}
      </Space>
    );
  }

  // 이 화면에 도달했다는 건 위에서 isAdmin이 true로 확인됐다는 뜻이라
  // role="admin"으로 고정해도 된다 — dh·hr로 오가는 side pane(§3.1).
  return (
    <AppShell role="admin" current="admin">
      <main>
        <div className="row section-gap">
          <div>
            <div className="hr-eyebrow">MEMBER ADMIN</div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              회원 관리
            </Typography.Title>
            <Typography.Text type="secondary">
              기수, 이름, 이메일, 권한, 가입일, 최근 접속일 · 권한·운영팀·상태
              칸을 누르면 그 자리에서 고칠 수 있습니다
            </Typography.Text>
          </div>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <AdminNav />

        {error && (
          <Alert
            className="feedback"
            type="error"
            showIcon
            message={error}
            action={<Button onClick={() => void load()}>다시 불러오기</Button>}
          />
        )}

        <div className="surface">
          <Space wrap style={{ marginBottom: 16 }}>
            <Segmented
              value={view}
              onChange={(v) => {
                setView(v as typeof view);
                setSelectedIds([]);
              }}
              options={[
                { label: `전체 (${viewCounts.all})`, value: "all" },
                { label: `활성 (${viewCounts.active})`, value: "active" },
                { label: `비활성 (${viewCounts.inactive})`, value: "inactive" },
              ]}
            />
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 180 }}
              placeholder="기수 전체"
              value={cohortFilter}
              onChange={(next: string[]) => {
                setCohortFilter(next);
                setSelectedIds([]);
              }}
              options={cohortOptions}
            />
          </Space>

          <div style={{ marginBottom: 16 }}>
            <Button type="primary" onClick={() => setAdding(true)}>
              회원 추가
            </Button>
          </div>

          {selectedIds.length > 0 && (
            <div
              className="actions"
              style={{
                marginTop: 0,
                paddingTop: 0,
                borderTop: "none",
                marginBottom: 16,
              }}
            >
              <span>{selectedIds.length}명 선택됨</span>
              <Space wrap>
                <Button
                  disabled={busy || hasAdminSelected}
                  onClick={openOpsRoleModal}
                >
                  {allSelectedActing ? "운영팀 직책 변경" : "acting으로 변경"}
                </Button>
                <Button
                  disabled={busy || hasAdminSelected}
                  onClick={confirmToAlumni}
                >
                  alumni로 변경
                </Button>
                {hasInactiveSelected && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      withBusyReload(
                        () => reactivateMembers(token!, selectedIds),
                        "선택한 회원을 재활성화했습니다.",
                      )
                    }
                  >
                    재활성화
                  </Button>
                )}
                {hasActiveSelected && (
                  <Button
                    danger
                    disabled={busy || hasAdminSelected}
                    onClick={confirmDeactivate}
                  >
                    삭제
                  </Button>
                )}
              </Space>
            </div>
          )}

          {/* 처음 불러올 때만 스켈레톤. 저장 후 다시 불러올 땐 표를 그대로 두고 로딩만 표시한다 —
              표를 빼면 정렬·스크롤이 처음으로 돌아간다. */}
          {!members ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <Table
              rowKey="id"
              loading={loading}
              dataSource={visibleMembers}
              columns={columns}
              pagination={false}
              onChange={(_pagination, _filters, sorter) => {
                if (!Array.isArray(sorter)) setSort(sorter);
              }}
              // 좁은 화면에선 표를 가로로 밀어서 본다(승인 큐와 같은 방식).
              scroll={{ x: "max-content" }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
                getCheckboxProps: (m) => ({ disabled: m.role === "admin" }),
              }}
            />
          )}
        </div>

        <Modal
          title="회원 추가"
          open={adding}
          onCancel={() => setAdding(false)}
          okText="추가"
          cancelText="취소"
          okButtonProps={{
            disabled:
              busy ||
              !newMember.name.trim() ||
              !newMember.cohort ||
              !newMember.email.trim(),
          }}
          onOk={async () => {
            setBusy(true);
            try {
              await addMember(token!, {
                name: newMember.name.trim(),
                cohort: newMember.cohort!,
                email: newMember.email.trim(),
              });
              message.success(
                `${newMember.name.trim()}님을 acting 회원으로 추가하고 그핵드인 노션 페이지를 만들었습니다.`,
              );
              setAdding(false);
              setNewMember({ name: "", cohort: null, email: "" });
              await load();
            } catch (e) {
              message.error(
                e instanceof ApiClientError
                  ? e.message
                  : "회원을 추가하지 못했습니다.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted">
            acting 회원으로 등록하고 그핵드인(노션 People DB)에 프로필 페이지를
            만듭니다. 운영팀 직책은 추가한 뒤 지정하세요.
          </p>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input
              placeholder="이름"
              value={newMember.name}
              onChange={(event) =>
                setNewMember({ ...newMember, name: event.target.value })
              }
            />
            <InputNumber
              style={{ width: "100%" }}
              placeholder="기수 (예: 21)"
              min={1}
              precision={0}
              addonAfter="기"
              value={newMember.cohort}
              onChange={(cohort) => setNewMember({ ...newMember, cohort })}
            />
            <Input
              type="email"
              placeholder="Slack 이메일"
              value={newMember.email}
              onChange={(event) =>
                setNewMember({ ...newMember, email: event.target.value })
              }
            />
          </Space>
        </Modal>

        <Modal
          title={allSelectedActing ? "운영팀 직책 변경" : "acting으로 변경"}
          open={opsRoleModalOpen}
          onCancel={() => setOpsRoleModalOpen(false)}
          onOk={submitOpsRole}
          okText="저장"
          cancelText="취소"
          okButtonProps={{ disabled: draftInvalid || busy }}
        >
          <p className="muted">
            직책(임원·팀장)은 한 사람이 하나만, 팀원은 여러 팀을 함께 할 수
            있습니다. 직책은 그 사람의 기수로 지정되고(19기 → 19기 회장), 같은
            직책은 기수마다 한 명이라 인수인계 기간엔 두 기수가 함께 맡을 수
            있습니다.
          </p>
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {!singleSelected && (
              <Typography.Text type="secondary">
                {selectedIds.length}명을 골랐습니다. 직책(임원·팀장)은 한 명씩
                지정합니다. 여기서 체크하거나 해제한 팀만 모두에게 넣고 빼며,
                각자 지금 직책과 다른 팀은 그대로 둡니다.
              </Typography.Text>
            )}
            <OpsRoleFields
              draft={opsRoleDraft}
              onChange={setOpsRoleDraft}
              showOffice={singleSelected !== undefined}
            />
            {draftLeavesSomeoneEmpty && (
              <Typography.Text type="warning">
                acting 회원에게는 직책이나 팀이 하나 이상 있어야 합니다.
                운영팀에서 빠지는 거라면 권한을 alumni로 바꾸세요.
              </Typography.Text>
            )}
          </Space>
        </Modal>
      </main>
    </AppShell>
  );
}
