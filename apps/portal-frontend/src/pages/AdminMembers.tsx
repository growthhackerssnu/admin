import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { App as AntApp, Alert, Button, Skeleton, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ApiClientError,
  changeMemberRole,
  deactivateMembers,
  getMe,
  listAdminMembers,
  reactivateMembers,
  type AdminMember,
} from "../lib/api";
import { useSession } from "../hooks/useSession";
import { signOut } from "../lib/supabase";

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

  const token = session?.access_token;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await listAdminMembers(token);
      setMembers(result.items);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "명단을 불러오지 못했습니다.");
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
    return (
      <main>
        <Skeleton active paragraph={{ rows: 6 }} />
      </main>
    );
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

  async function withBusyReload(action: () => Promise<unknown>, successText: string) {
    setBusy(true);
    try {
      await action();
      void message.success(successText);
      setSelectedIds([]);
      await load();
    } catch (e) {
      void message.error(e instanceof ApiClientError ? e.message : "요청이 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDeactivate() {
    modal.confirm({
      title: `${selectedIds.length}명을 정말 삭제(비활성화)할까요?`,
      content: "선택한 회원은 로그인은 되지만 모든 기능 접근이 막힙니다. 나중에 재활성화할 수 있습니다.",
      okText: "삭제",
      okButtonProps: { danger: true },
      cancelText: "취소",
      onOk: () =>
        withBusyReload(() => deactivateMembers(token!, selectedIds), "선택한 회원을 비활성화했습니다."),
    });
  }

  const selectedMembers = members?.filter((m) => selectedIds.includes(m.id)) ?? [];
  const hasAdminSelected = selectedMembers.some((m) => m.role === "admin");
  const hasInactiveSelected = selectedMembers.some((m) => !m.active);
  const hasActiveSelected = selectedMembers.some((m) => m.active);

  const columns: ColumnsType<AdminMember> = [
    {
      title: "회원",
      key: "member",
      render: (_, m) => (
        <div>
          <div>{m.cohort ? `${m.cohort}기 ${m.displayName}` : m.displayName}</div>
          <div className="meta">{m.email}</div>
        </div>
      ),
    },
    {
      title: "권한",
      dataIndex: "role",
      width: 100,
      render: (role: AdminMember["role"]) => <Tag color={ROLE_COLOR[role]}>{ROLE_LABEL[role]}</Tag>,
    },
    {
      title: "상태",
      dataIndex: "active",
      width: 90,
      render: (active: boolean) => (active ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>),
    },
    { title: "가입일", dataIndex: "createdAt", width: 180, render: formatDate },
    { title: "최근 접속일", dataIndex: "lastLoginAt", width: 180, render: formatDate },
  ];

  return (
    <main>
      <div className="row section-gap">
        <div>
          <h1>회원 관리</h1>
          <p className="muted">기수+이름, 이메일, 권한, 가입일, 최근 접속일</p>
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
        {selectedIds.length > 0 && (
          <div className="actions" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", marginBottom: 16 }}>
            <span>{selectedIds.length}명 선택됨</span>
            <Space wrap>
              <Button
                disabled={busy || hasAdminSelected}
                onClick={() =>
                  withBusyReload(() => changeMemberRole(token!, selectedIds, "acting"), "acting으로 변경했습니다.")
                }
              >
                acting으로 변경
              </Button>
              <Button
                disabled={busy || hasAdminSelected}
                onClick={() =>
                  withBusyReload(() => changeMemberRole(token!, selectedIds, "alumni"), "alumni로 변경했습니다.")
                }
              >
                alumni로 변경
              </Button>
              {hasInactiveSelected && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    withBusyReload(() => reactivateMembers(token!, selectedIds), "선택한 회원을 재활성화했습니다.")
                  }
                >
                  재활성화
                </Button>
              )}
              {hasActiveSelected && (
                <Button danger disabled={busy || hasAdminSelected} onClick={confirmDeactivate}>
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
            dataSource={members}
            columns={columns}
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys as string[]),
              getCheckboxProps: (m) => ({ disabled: m.role === "admin" }),
            }}
          />
        )}
      </div>
    </main>
  );
}
