import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  App as AntApp,
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Segmented,
  Space,
  Table,
  Typography,
} from "antd";
import { SidePane } from "@dhbot/ui-shell";
import { LoadingScreen } from "../../lib/LoadingScreen";
import { HrNav } from "../components/HrNav";
import { EditRequestDiff } from "../components/EditRequestDiff";
import { EditRequestStatusTag } from "../components/EditRequestStatusTag";
import {
  ApiClientError,
  approveEditRequest,
  getAdminEditRequests,
  getMe,
  rejectEditRequest,
  type AdminEditRequest,
  type EditRequestStatus,
  type Me,
} from "../lib/api";
import { summarizeDiff } from "../lib/editRequestDisplay";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";

type StatusFilter = "all" | EditRequestStatus;

// 승인 큐(/hr/admin, ARCHITECTURE.md §12.4) — admin 전용. 벤치마크는
// AdminMembers.tsx(Table+rowSelection 체크박스+Modal) 패턴(§12.4, 원래
// 참고하려던 dh SourcingPage.tsx는 개편으로 없어짐).
export function AdminQueue() {
  const session = useSession();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();

  const [me, setMe] = useState<Me>();
  const [requests, setRequests] = useState<AdminEditRequest[]>();
  const [error, setError] = useState<string>();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<AdminEditRequest | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(token: string) {
    const [meResult, requestsResult] = await Promise.all([getMe(token), getAdminEditRequests(token)]);
    setMe(meResult);
    setRequests(requestsResult);
  }

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      navigate("/login", { replace: true });
      return;
    }
    load(session.access_token).catch((e) => {
      setError(e instanceof ApiClientError ? e.message : "승인 큐를 불러오지 못했습니다.");
    });
  }, [session]);

  const counts = useMemo(() => {
    const base = { all: requests?.length ?? 0, pending: 0, approved: 0, rejected: 0 };
    for (const r of requests ?? []) base[r.status]++;
    return base;
  }, [requests]);

  const filtered = useMemo(() => {
    return (requests ?? []).filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search.trim() && !r.requesterName.includes(search.trim())) return false;
      return true;
    });
  }, [requests, statusFilter, search]);

  async function reload() {
    if (!session) return;
    await load(session.access_token);
  }

  async function handleApprove(id: string, reviewNote?: string) {
    if (!session) return;
    setBusy(true);
    try {
      await approveEditRequest(id, reviewNote, session.access_token);
      message.success("승인 완료. Notion에 반영됐습니다.");
      setDetail(null);
      setSelectedIds((ids) => ids.filter((i) => i !== id));
      await reload();
    } catch (e) {
      message.error(e instanceof ApiClientError ? e.message : "승인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function handleReject(id: string) {
    let reviewNote = "";
    modal.confirm({
      title: "반려 사유를 입력하세요",
      content: <Input.TextArea rows={3} onChange={(e) => (reviewNote = e.target.value)} />,
      okText: "반려",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!reviewNote.trim() || !session) {
          message.error("반려 사유를 입력하세요.");
          return Promise.reject(new Error("사유 없음"));
        }
        try {
          await rejectEditRequest(id, reviewNote.trim(), session.access_token);
          message.success("반려 처리했습니다.");
          setDetail(null);
          await reload();
        } catch (e) {
          message.error(e instanceof ApiClientError ? e.message : "반려에 실패했습니다.");
          throw e;
        }
      },
    });
  }

  async function handleBulkApprove() {
    if (!session || selectedIds.length === 0) return;
    setBusy(true);
    try {
      for (const id of selectedIds) {
        await approveEditRequest(id, undefined, session.access_token);
      }
      message.success(`${selectedIds.length}건 일괄 승인 완료.`);
      setSelectedIds([]);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiClientError ? e.message : "일괄 승인 중 일부가 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 화면 코드 로딩 단계(RouteFallback)와 같은 로딩 화면을 이어서 보여준다(lib/LoadingScreen.tsx).
  if (session === undefined || session === null || (!requests && !error)) {
    return <LoadingScreen />;
  }

  if (error || !requests || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "승인 큐를 불러오지 못했습니다."}
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
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            승인 큐
          </Typography.Title>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <HrNav role={me.role} />

        <div className="filters">
          <Segmented
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            options={[
              { label: `전체 (${counts.all})`, value: "all" },
              { label: `대기중 (${counts.pending})`, value: "pending" },
              { label: `승인됨 (${counts.approved})`, value: "approved" },
              { label: `반려됨 (${counts.rejected})`, value: "rejected" },
            ]}
          />
          <Input.Search
            placeholder="요청자 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="actions" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
            <span>{selectedIds.length}건 선택됨</span>
            <Space>
              <Button type="primary" loading={busy} onClick={handleBulkApprove}>
                선택 일괄 승인
              </Button>
            </Space>
          </div>
        )}

        {filtered.length === 0 ? (
          <Empty description="조건에 맞는 요청이 없습니다" style={{ marginTop: 48 }} />
        ) : (
          <Table
            rowKey="id"
            dataSource={filtered}
            pagination={false}
            // 좁은 화면에선 표를 가로로 밀어서 본다(열을 줄이지 않는다).
            scroll={{ x: "max-content" }}
            onRow={(record) => ({ onClick: () => setDetail(record), style: { cursor: "pointer" } })}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys as string[]),
              getCheckboxProps: (record) => ({ disabled: record.status !== "pending" }),
            }}
            columns={[
              { title: "요청자", dataIndex: "requesterName" },
              { title: "기수", dataIndex: "requesterCohort", render: (v: string | null) => (v ? `${v}기` : "-") },
              {
                title: "요청일시",
                dataIndex: "submittedAt",
                render: (value: string) => new Date(value).toLocaleString("ko-KR"),
              },
              { title: "변경 항목", render: (_, record) => summarizeDiff(record.diff) },
              {
                title: "상태",
                dataIndex: "status",
                render: (status: EditRequestStatus) => <EditRequestStatusTag status={status} />,
              },
            ]}
          />
        )}

        <Modal
          open={detail !== null}
          onCancel={() => setDetail(null)}
          width="min(720px, calc(100vw - 24px))"
          title={detail ? `${detail.requesterName}(${detail.requesterCohort ?? "-"}기) 수정 요청` : ""}
          footer={
            detail?.status === "pending"
              ? [
                  <Button key="reject" danger disabled={busy} onClick={() => detail && handleReject(detail.id)}>
                    반려
                  </Button>,
                  <Button
                    key="approve"
                    type="primary"
                    loading={busy}
                    onClick={() => detail && handleApprove(detail.id)}
                  >
                    승인
                  </Button>,
                ]
              : null
          }
        >
          {detail && <EditRequestDiff diff={detail.diff} newOptions={detail.newOptions} />}
          {detail && detail.status === "rejected" && detail.reviewNote && (
            <Alert style={{ marginTop: 16 }} type="warning" message={`반려 사유: ${detail.reviewNote}`} />
          )}
        </Modal>
      </main>
    </div>
  );
}
