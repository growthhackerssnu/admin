import { AppButton as Button } from "@/components/ui/app-button";
import { AppTag as Tag } from "@/components/ui/app-tag";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert, Col, Row, Skeleton, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppShell } from "@/components/ui/app-shell";
import { AdminNav } from "../components/AdminNav";
import {
  ApiClientError,
  getCostSummary,
  getMe,
  type CostLine,
  type CostSummary,
} from "../lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";
import { LoadingScreen } from "../../lib/LoadingScreen";

function usd(value: number | null) {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

const CATEGORY_LABEL: Record<CostLine["category"], string> = {
  server: "서버",
  llm: "LLM",
};

export function AdminCosts() {
  const session = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CostSummary>();
  const [error, setError] = useState<string>();
  const accessToken = session?.access_token;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(undefined);
    try {
      setSummary(await getCostSummary(accessToken));
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : "비용 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void getMe(accessToken)
      .then((me) => setIsAdmin(me.role === "admin"))
      .catch(() => setIsAdmin(false))
      .finally(() => setChecking(false));
  }, [accessToken]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (session === undefined || checking) return <LoadingScreen />;
  if (session === null) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <Alert
        type="error"
        showIcon
        message="접근 권한이 없습니다"
        description="관리자만 비용을 볼 수 있습니다."
      />
    );
  }

  const columns: ColumnsType<CostLine> = [
    {
      title: "구분",
      dataIndex: "category",
      width: 80,
      render: (value: CostLine["category"]) => (
        <Tag color={value === "llm" ? "purple" : "blue"}>
          {CATEGORY_LABEL[value]}
        </Tag>
      ),
    },
    { title: "항목", dataIndex: "name" },
    {
      title: "사용량",
      key: "usage",
      render: (_, row) =>
        row.error ? (
          <Typography.Text type="danger">{row.error}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">{row.usage}</Typography.Text>
        ),
    },
    {
      title: "비용 (USD)",
      dataIndex: "costUsd",
      align: "right",
      width: 120,
      render: (value: number | null) => usd(value),
    },
  ];

  return (
    <AppShell role="admin" current="admin">
      <main>
        <div className="row section-gap">
          <div>
            <div className="hr-eyebrow">COSTS</div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              비용
            </Typography.Title>
            <Typography.Text type="secondary">
              이번 달 사용량에 공개 단가를 곱한 추정치입니다. 실제 청구 금액과
              다를 수 있습니다.
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
        {summary && !summary.totals.complete && (
          <Alert
            className="feedback"
            type="warning"
            showIcon
            message="일부 항목을 불러오지 못해 합계에서 빠졌습니다."
          />
        )}
        <div className="surface">
          {loading || !summary ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <>
              <Typography.Paragraph type="secondary">
                {formatDate(summary.period.start)} ~{" "}
                {formatDate(summary.period.end)} (UTC 기준 월)
              </Typography.Paragraph>
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} md={6}>
                  <Statistic
                    title="이번 달 합계"
                    value={usd(summary.totals.totalUsd)}
                  />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic
                    title="서버"
                    value={usd(summary.totals.serverUsd)}
                  />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="LLM" value={usd(summary.totals.llmUsd)} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic
                    title="월말 예상"
                    value={usd(summary.totals.forecastUsd)}
                  />
                </Col>
              </Row>
              <Table
                rowKey="key"
                dataSource={summary.lines}
                scroll={{ x: "max-content" }}
                columns={columns}
                pagination={false}
              />
              <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                LLM 비용은 백엔드가 기록한 Gemini 호출 사용량 기준입니다
                {summary.llmTrackingSince
                  ? ` (${formatDate(summary.llmTrackingSince)}부터 기록)`
                  : " (아직 기록된 호출이 없습니다)"}
                . Vercel·Supabase·Inngest·Resend는 각 서비스 대시보드에서
                확인해야 합니다.
              </Typography.Paragraph>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
