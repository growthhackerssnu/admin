import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, App as AntApp, Button, Modal, Skeleton, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SidePane } from "@dhbot/ui-shell";
import {
  ApiClientError,
  getMe,
  getGhbotTokenSecret,
  issueGhbotToken,
  listGhbotTokenMembers,
  revokeGhbotToken,
  type GhbotTokenMember,
} from "../lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

export function AdminGhbotTokens() {
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const session = useSession();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyMemberId, setBusyMemberId] = useState<string>();
  const [members, setMembers] = useState<GhbotTokenMember[]>([]);
  const [error, setError] = useState<string>();
  const [newToken, setNewToken] = useState<{ name: string; value: string }>();
  const accessToken = session?.access_token;

  const previewMembers: GhbotTokenMember[] = [
    { memberId: "preview-1", displayName: "김그핵", cohort: "21기", email: "gh@example.com", token: { id: "preview-token", prefix: "ghbot_abcd…wxyz12", issuedAt: "2026-10-01T04:00:00.000Z", lastUsedAt: "2026-10-01T05:10:00.000Z", expiresAt: null } },
    { memberId: "preview-2", displayName: "이액팅", cohort: "22기", email: "acting@example.com", token: null },
  ];

  const load = useCallback(async () => {
    if (preview) {
      setMembers(previewMembers);
      setLoading(false);
      return;
    }
    if (!accessToken) return;
    setLoading(true);
    setError(undefined);
    try {
      setMembers((await listGhbotTokenMembers(accessToken)).items);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "GH Bot 토큰 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, preview]);

  useEffect(() => {
    if (preview) {
      setIsAdmin(true);
      setChecking(false);
      return;
    }
    if (!accessToken) return;
    void getMe(accessToken)
      .then((me) => setIsAdmin(me.role === "admin"))
      .catch(() => setIsAdmin(false))
      .finally(() => setChecking(false));
  }, [accessToken, preview]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // `?preview=1` is a local-development-only fixture. It deliberately does
  // not initialize a real Supabase session or call the API.
  if (!preview && (session === undefined || checking)) return <Skeleton active style={{ padding: 24 }} />;
  if (!preview && session === null) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return <Alert type="error" showIcon message="접근 권한이 없습니다" description="관리자만 GH Bot 토큰을 관리할 수 있습니다." />;
  }

  async function issue(target: GhbotTokenMember) {
    setBusyMemberId(target.memberId);
    try {
      if (preview) {
        setNewToken({ name: target.displayName, value: "ghbot_preview_token_visible_once_only" });
        setMembers((current) => current.map((item) => item.memberId === target.memberId ? { ...item, token: { id: "preview-new", prefix: "ghbot_prev…nly", issuedAt: new Date().toISOString(), lastUsedAt: null, expiresAt: null } } : item));
        return;
      }
      const result = await issueGhbotToken(accessToken!, target.memberId);
      setNewToken({ name: target.displayName, value: result.token });
      await load();
    } catch (e) {
      void message.error(e instanceof ApiClientError ? e.message : "토큰을 발급하지 못했습니다.");
    } finally {
      setBusyMemberId(undefined);
    }
  }

  function confirmIssue(target: GhbotTokenMember) {
    const rotating = Boolean(target.token);
    modal.confirm({
      title: rotating ? `${target.displayName}님의 토큰을 재발급할까요?` : `${target.displayName}님에게 토큰을 발급할까요?`,
      content: rotating
        ? "기존 토큰은 즉시 사용할 수 없게 됩니다."
        : "발급된 원문 토큰은 이 화면에서 한 번만 확인할 수 있습니다.",
      okText: rotating ? "재발급" : "발급",
      cancelText: "취소",
      okButtonProps: { danger: rotating },
      onOk: () => issue(target),
    });
  }

  function confirmRevoke(target: GhbotTokenMember) {
    if (!target.token) return;
    modal.confirm({
      title: `${target.displayName}님의 GH Bot 접근을 회수할까요?`,
      content: "즉시 해당 토큰으로 로그인하거나 MCP를 사용할 수 없게 됩니다.",
      okText: "회수",
      cancelText: "취소",
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusyMemberId(target.memberId);
        try {
          if (preview) {
            setMembers((current) => current.map((item) => item.memberId === target.memberId ? { ...item, token: null } : item));
            return;
          }
          await revokeGhbotToken(accessToken!, target.token!.id);
          void message.success("토큰을 회수했습니다.");
          await load();
        } catch (e) {
          void message.error(e instanceof ApiClientError ? e.message : "토큰을 회수하지 못했습니다.");
        } finally {
          setBusyMemberId(undefined);
        }
      },
    });
  }

  async function copyIssuedToken() {
    if (!newToken?.value) return;
    try {
      await navigator.clipboard.writeText(newToken.value);
      void message.success("토큰을 복사했습니다.");
    } catch {
      void message.error("토큰 복사에 실패했습니다. 토큰을 선택해 직접 복사해 주세요.");
    }
  }

  async function copyStoredToken(target: GhbotTokenMember) {
    if (!target.token) return;
    setBusyMemberId(target.memberId);
    try {
      const token = preview
        ? "ghbot_preview_token_visible_once_only"
        : (await getGhbotTokenSecret(accessToken!, target.token.id)).token;
      await navigator.clipboard.writeText(token);
      void message.success(`${target.displayName}님의 토큰을 복사했습니다.`);
    } catch (e) {
      void message.error(e instanceof ApiClientError ? e.message : "토큰 복사에 실패했습니다.");
    } finally {
      setBusyMemberId(undefined);
    }
  }

  const columns: ColumnsType<GhbotTokenMember> = [
    { title: "기수", dataIndex: "cohort", width: 90, render: (value) => value ?? "—" },
    { title: "회원", key: "member", render: (_, row) => <><div>{row.displayName}</div><Typography.Text type="secondary">{row.email}</Typography.Text></> },
    {
      title: "토큰",
      key: "token",
      render: (_, row) => row.token ? (
        <Button
          type="text"
          size="small"
          loading={busyMemberId === row.memberId}
          title="클릭하면 원문 토큰을 복사합니다"
          onClick={() => void copyStoredToken(row)}
        >
          <Tag color="green">{row.token.prefix}</Tag>
        </Button>
      ) : <Tag>미발급</Tag>,
    },
    { title: "발급일", key: "issuedAt", render: (_, row) => formatDate(row.token?.issuedAt ?? null) },
    { title: "마지막 사용", key: "lastUsedAt", render: (_, row) => formatDate(row.token?.lastUsedAt ?? null) },
    {
      title: "관리",
      key: "actions",
      render: (_, row) => <Space><Button size="small" loading={busyMemberId === row.memberId} onClick={() => confirmIssue(row)}>{row.token ? "재발급" : "발급"}</Button>{row.token && <Button size="small" danger loading={busyMemberId === row.memberId} onClick={() => confirmRevoke(row)}>회수</Button>}</Space>,
    },
  ];

  return (
    <div className="app-shell">
      <SidePane role="admin" current="admin" />
      <main>
        <div className="row section-gap"><div><h1>GH Bot 접근 토큰</h1><p className="muted">활성 acting 회원만 발급 대상입니다. 마스킹된 토큰을 클릭하면 원문을 복사할 수 있습니다.</p></div><Space><Button onClick={() => navigate("/admin")}>회원 관리</Button><Button onClick={() => void signOut()}>로그아웃</Button></Space></div>
        {preview && <Alert className="feedback" type="info" showIcon message="개발용 화면 미리보기" description="실제 회원·토큰을 읽거나 쓰지 않습니다. 발급·회수 버튼은 화면 상태만 바꿉니다." />}
        {error && <Alert className="feedback" type="error" showIcon message={error} action={<Button onClick={() => void load()}>다시 불러오기</Button>} />}
        <div className="surface">{loading ? <Skeleton active paragraph={{ rows: 8 }} /> : <Table rowKey="memberId" dataSource={members} columns={columns} pagination={false} />}</div>
        <Modal title={`${newToken?.name ?? ""}님의 GH Bot 토큰`} open={Boolean(newToken)} onCancel={() => setNewToken(undefined)} footer={<Button type="primary" onClick={() => setNewToken(undefined)}>확인했습니다</Button>}>
          <Alert type="warning" showIcon message="토큰을 안전하게 전달하세요" description="창을 닫은 뒤에도 관리자 토큰 목록의 마스킹된 값을 클릭하면 원문을 다시 복사할 수 있습니다." />
          <Typography.Paragraph
            copyable={{ text: newToken?.value, tooltips: ["복사", "복사됨"] }}
            onClick={() => void copyIssuedToken()}
            title="클릭하면 토큰을 복사합니다"
            style={{ wordBreak: "break-all", marginTop: 16, cursor: "copy", padding: 12, background: "#fafafa", borderRadius: 6 }}
          >
            {newToken?.value}
          </Typography.Paragraph>
        </Modal>
      </main>
    </div>
  );
}
