import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  App as AntApp,
  Alert,
  Button,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { SidePane } from "@dhbot/ui-shell";
import {
  ApiClientError,
  changeMemberRole,
  deactivateMembers,
  getMe,
  listAdminMembers,
  reactivateMembers,
  type AdminMember,
  type OpsRole,
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

// 운영팀 직책의 한국어 이름과 그룹. 백엔드 src/lib/opsRoles.ts와 같은 목록이며,
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
};

// single: 그 직책을 한 명만 가질 수 있다(임원·팀장). 서버도 같은 규칙으로 거절한다.
const OPS_ROLE_GROUPS: { label: string; single: boolean; roles: OpsRole[] }[] =
  [
    {
      label: "임원",
      single: true,
      roles: ["president", "vice_president", "treasurer"],
    },
    {
      label: "팀장",
      single: true,
      roles: ["external_lead", "hr_lead", "pr_lead", "edu_lead"],
    },
    {
      label: "팀원",
      single: false,
      roles: ["external_member", "hr_member", "pr_member"],
    },
  ];
const SINGLE_HOLDER_ROLES = new Set<OpsRole>(
  OPS_ROLE_GROUPS.filter((g) => g.single).flatMap((g) => g.roles),
);

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
  const [opsRoleDraft, setOpsRoleDraft] = useState<OpsRole>();

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

  // 1인 직책을 지금 누가 맡고 있는지. 선택 목록 안의 사람이면 자기 자리를 다시
  // 지정하는 것이라 막지 않는다(그 외에는 서버가 422로 거절하므로 미리 잠근다).
  const opsRoleHolders = new Map<OpsRole, AdminMember>();
  for (const m of members ?? []) {
    if (m.opsRole) opsRoleHolders.set(m.opsRole, m);
  }

  function opsRoleOptionNote(role: OpsRole): string | undefined {
    if (!SINGLE_HOLDER_ROLES.has(role)) return undefined;
    if (selectedIds.length > 1) return "한 명만 가능";
    const holder = opsRoleHolders.get(role);
    if (holder && !selectedIds.includes(holder.id)) {
      return holder.active
        ? holder.displayName
        : `${holder.displayName} · 비활성`;
    }
    return undefined;
  }

  function openOpsRoleModal() {
    // 한 명만 골랐고 이미 직책이 있으면 그 값에서 시작한다.
    setOpsRoleDraft(
      selectedMembers.length === 1
        ? (selectedMembers[0]?.opsRole ?? undefined)
        : undefined,
    );
    setOpsRoleModalOpen(true);
  }

  function submitOpsRole() {
    if (!opsRoleDraft) return;
    setOpsRoleModalOpen(false);
    void withBusyReload(
      () =>
        changeMemberRole(token!, selectedIds, {
          role: "acting",
          opsRole: opsRoleDraft,
        }),
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
          <div>{m.displayName}</div>
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
      dataIndex: "opsRole",
      width: 130,
      render: (opsRole: AdminMember["opsRole"], m) => {
        if (opsRole) return OPS_ROLE_LABEL[opsRole];
        // acting인데 직책이 비어 있으면 이 기능이 생기기 전에 등록된 회원이다.
        return m.role === "acting" ? <Tag color="orange">미지정</Tag> : "—";
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
    <div className="app-shell">
      <SidePane role="admin" current="admin" />
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
          title={allSelectedActing ? "운영팀 직책 변경" : "acting으로 변경"}
          open={opsRoleModalOpen}
          onCancel={() => setOpsRoleModalOpen(false)}
          onOk={submitOpsRole}
          okText="저장"
          cancelText="취소"
          okButtonProps={{ disabled: !opsRoleDraft || busy }}
        >
          <p className="muted">
            acting 회원에게는 운영팀 직책이 반드시 있어야 합니다. 선택한{" "}
            {selectedIds.length}명에게 지정할 직책을 고르세요.
          </p>
          <Select
            style={{ width: "100%" }}
            placeholder="운영팀 직책 선택"
            value={opsRoleDraft}
            onChange={setOpsRoleDraft}
            options={OPS_ROLE_GROUPS.map((group) => ({
              label: group.label,
              options: group.roles.map((role) => {
                const note = opsRoleOptionNote(role);
                return {
                  value: role,
                  disabled: note !== undefined,
                  label: note
                    ? `${OPS_ROLE_LABEL[role]} (${note})`
                    : OPS_ROLE_LABEL[role],
                };
              }),
            }))}
          />
        </Modal>
      </main>
    </div>
  );
}
