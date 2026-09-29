import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Empty, Modal, Skeleton, Table, Typography } from "antd";
import { SidePane } from "@dhbot/ui-shell";
import { HrNav } from "../components/HrNav";
import { EditRequestDiff } from "../components/EditRequestDiff";
import { EditRequestStatusTag } from "../components/EditRequestStatusTag";
import { ApiClientError, getMe, getMyEditRequests, type EditRequest, type Me } from "../lib/api";
import { summarizeDiff } from "../lib/editRequestDisplay";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";

// 내 수정 요청(/hr/requests, ARCHITECTURE.md §12.5) — 본인이 제출한
// edit_requests 이력 전체(상태 무관). 승인 큐의 "읽기 전용 + 본인 것만"
// 부분집합이라, 검색·상태 필터는 없다. 반려된 건은 사유까지 같이 보여줘서
// §12.3에서 미해결이던 "반려 사유를 본인이 볼 수 있어야 하나" 질문을
// 이 화면으로 해결한다.
export function MyRequests() {
  const session = useSession();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>();
  const [requests, setRequests] = useState<EditRequest[]>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<EditRequest | null>(null);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      navigate("/login", { replace: true });
      return;
    }
    (async () => {
      try {
        const [meResult, requestsResult] = await Promise.all([
          getMe(session.access_token),
          getMyEditRequests(session.access_token),
        ]);
        setMe(meResult);
        setRequests(requestsResult);
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : "수정 요청 이력을 불러오지 못했습니다.");
      }
    })();
  }, [session]);

  if (session === undefined || session === null || (!requests && !error)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  if (error || !requests || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "수정 요청 이력을 불러오지 못했습니다."}
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
            내 수정 요청
          </Typography.Title>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <HrNav role={me.role} />

        {requests.length === 0 ? (
          <Empty description="제출한 수정 요청이 없습니다" style={{ marginTop: 48 }} />
        ) : (
          <Table
            rowKey="id"
            dataSource={requests}
            pagination={false}
            onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: "pointer" } })}
            columns={[
              {
                title: "제출일시",
                dataIndex: "submittedAt",
                render: (value: string) => new Date(value).toLocaleString("ko-KR"),
              },
              { title: "변경 항목", render: (_, record) => summarizeDiff(record.diff) },
              {
                title: "상태",
                dataIndex: "status",
                render: (status: EditRequest["status"]) => <EditRequestStatusTag status={status} />,
              },
              {
                title: "반려 사유",
                render: (_, record) => (record.status === "rejected" ? (record.reviewNote ?? "-") : "-"),
              },
            ]}
          />
        )}

        <Modal open={selected !== null} onCancel={() => setSelected(null)} footer={null} title="수정 요청 상세">
          {selected && <EditRequestDiff diff={selected.diff} />}
        </Modal>
      </main>
    </div>
  );
}
