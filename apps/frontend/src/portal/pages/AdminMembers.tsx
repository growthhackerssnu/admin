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
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
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
const TEAM_ROLES: OpsRole[] = ["external_member", "hr_member", "pr_member", "edu_member"];

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
  const [opsRoleModalOpen, setOpsRoleModalOpen] = useState(false);
  const [opsRoleDraft, setOpsRoleDraft] = useState<OpsRoleDraft>({
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

  async function withBusyReload(
    action: () => Promise<unknown>,
    successText: string,
  ) {
    setBusy(true);
    try {
      await action();
      void message.success(successText);
      setSelectedIds([]);
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
  const visibleMembers = (members ?? []).filter((m) => {
    if (view === "active") return m.active;
    if (view === "inactive") return !m.active;
    return true;
  });

  // 선택한 사람이 전부 이미 acting이면 이 버튼은 "직책만 바꾸는" 동작이 된다.
  const allSelectedActing =
    selectedMembers.length > 0 &&
    selectedMembers.every((m) => m.role === "acting");

  // 직책은 한 명씩만 지정한다 — 여럿을 고르면 지금 직책은 그대로 두고 팀원만 바꾼다.
  const singleSelected =
    selectedMembers.length === 1 ? selectedMembers[0] : undefined;

  // 직책마다 지금 누가(몇 기가) 맡고 있는지. 같은 직책이라도 기수가 다르면 지정할 수
  // 있어서(인수인계) 막지 않고 보여주기만 한다 — 같은 기수면 서버가 422로 거절한다.
  const officeHolders = new Map<OpsRole, string[]>();
  for (const m of members ?? []) {
    if (m.id === singleSelected?.id) continue;
    for (const r of m.opsRoles) {
      if (!OFFICE_ROLES.has(r.opsRole)) continue;
      const who = `${r.cohort ? `${r.cohort}기 ` : ""}${m.displayName}${m.active ? "" : " · 비활성"}`;
      officeHolders.set(r.opsRole, [...(officeHolders.get(r.opsRole) ?? []), who]);
    }
  }

  function openOpsRoleModal() {
    // 한 명만 골랐으면 그 사람의 지금 직책·팀에서 시작한다. 여럿이면 모두가 함께 속한 팀에서.
    if (singleSelected) {
      const office = singleSelected.opsRoles.find((r) => OFFICE_ROLES.has(r.opsRole));
      const teams = singleSelected.opsRoles
        .filter((r) => !OFFICE_ROLES.has(r.opsRole))
        .map((r) => r.opsRole);
      setOpsRoleDraft({ office: office?.opsRole, teams, initialTeams: teams });
    } else {
      const teams = TEAM_ROLES.filter((team) =>
        selectedMembers.every((m) => m.opsRoles.some((r) => r.opsRole === team)),
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

  const columns: ColumnsType<AdminMember> = [
    {
      title: "기수",
      dataIndex: "cohort",
      width: 90,
      sorter: (a, b) => (Number(a.cohort) || 0) - (Number(b.cohort) || 0),
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
      width: 100,
      render: (role: AdminMember["role"]) => (
        <Tag color={ROLE_COLOR[role]}>{ROLE_LABEL[role]}</Tag>
      ),
    },
    {
      title: "운영팀",
      dataIndex: "opsRoles",
      width: 220,
      render: (opsRoles: AdminMember["opsRoles"], m) => {
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
                <Tag key={r.opsRole} color={OFFICE_ROLES.has(r.opsRole) ? "blue" : "default"}>
                  {opsRoleTitle(r)}
                </Tag>
              ),
            )}
          </Space>
        );
      },
    },
    {
      title: "상태",
      dataIndex: "active",
      width: 90,
      render: (active: boolean) =>
        active ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>,
    },
    { title: "가입일", dataIndex: "createdAt", width: 180, render: formatDate },
    {
      title: "최근 접속일",
      dataIndex: "lastLoginAt",
      width: 180,
      render: formatDate,
    },
  ];

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
              기수, 이름, 이메일, 권한, 가입일, 최근 접속일
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
          <Segmented
            style={{ marginBottom: 16 }}
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

          {loading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <Table
              rowKey="id"
              dataSource={visibleMembers}
              columns={columns}
              pagination={false}
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
            {singleSelected ? (
              <Select
                style={{ width: "100%" }}
                allowClear
                placeholder="직책 없음"
                value={opsRoleDraft.office}
                onChange={(office?: OpsRole) =>
                  setOpsRoleDraft({ ...opsRoleDraft, office })
                }
                options={OFFICE_GROUPS.map((group) => ({
                  label: group.label,
                  options: group.roles.map((role) => {
                    const holders = officeHolders.get(role);
                    return {
                      value: role,
                      label: holders
                        ? `${OPS_ROLE_LABEL[role]} (${holders.join(", ")})`
                        : OPS_ROLE_LABEL[role],
                    };
                  }),
                }))}
              />
            ) : (
              <Typography.Text type="secondary">
                {selectedIds.length}명을 골랐습니다. 직책(임원·팀장)은 한 명씩
                지정합니다. 여기서 체크하거나 해제한 팀만 모두에게 넣고 빼며,
                각자 지금 직책과 다른 팀은 그대로 둡니다.
              </Typography.Text>
            )}
            <div>
              <div className="meta" style={{ marginBottom: 4 }}>
                팀원
              </div>
              <Checkbox.Group
                value={opsRoleDraft.teams}
                onChange={(teams) =>
                  setOpsRoleDraft({ ...opsRoleDraft, teams: teams as OpsRole[] })
                }
                options={TEAM_ROLES.map((role) => ({
                  value: role,
                  label: OPS_ROLE_LABEL[role],
                }))}
              />
            </div>
            {draftLeavesSomeoneEmpty && (
              <Typography.Text type="warning">
                acting 회원에게는 직책이나 팀이 하나 이상 있어야 합니다.
              </Typography.Text>
            )}
          </Space>
        </Modal>
      </main>
    </AppShell>
  );
}
