import { App as AntApp, Alert, ConfigProvider, Select, Skeleton } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { signOut } from "../lib/supabase";
import { fetchOverview } from "./api";
import { NutContext, today } from "./shared";
import type { FinanceOverview } from "./types";
import OverviewView from "./views/OverviewView";
import LedgerView from "./views/LedgerView";
import ClaimsView from "./views/ClaimsView";
import BudgetView from "./views/BudgetView";
import TeamsView from "./views/TeamsView";
import SettingsView from "./views/SettingsView";
import TaxView from "./views/TaxView";
import RefundAccountsView from "./views/RefundAccountsView";
import AttendanceView from "./views/AttendanceView";

type View =
  | "overview"
  | "ledger"
  | "claims"
  | "budget"
  | "teams"
  | "settings"
  | "accounts"
  | "attendance"
  | "tax";

function initialView(): View {
  const saved = new URLSearchParams(window.location.search).get(
    "tab",
  ) as View | null;
  return saved &&
    [
      "overview",
      "ledger",
      "claims",
      "budget",
      "teams",
      "settings",
      "accounts",
      "attendance",
      "tax",
    ].includes(saved)
    ? saved
    : "overview";
}

export default function App() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);

  const load = useCallback(async (periodId?: string) => {
    setError(null);
    try {
      const next = await fetchOverview(periodId);
      setData(next);
      setView((current) => current ?? initialView());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "NUT 데이터를 불러오지 못했습니다.",
      );
    }
  }, []);

  useEffect(() => {
    void load(
      new URLSearchParams(window.location.search).get("period") ?? undefined,
    );
  }, [load]);

  // 탭·반기를 주소에 남겨서 새로고침하거나 링크를 공유해도 같은 화면이 열리게 한다.
  useEffect(() => {
    if (!data || !view) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", view);
    params.set("period", data.period.id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  }, [data, view]);

  const run = useCallback(
    async (
      action: () => Promise<FinanceOverview>,
      success: string | ((next: FinanceOverview) => string),
    ) => {
      try {
        const next = await action();
        setData(next);
        message.success(
          typeof success === "function" ? success(next) : success,
        );
        return next;
      } catch (err) {
        message.error(
          err instanceof Error
            ? err.message
            : "저장하지 못했습니다. 다시 시도하세요.",
        );
        return null;
      }
    },
    [message],
  );

  const context = useMemo(
    () =>
      data && {
        data,
        run,
        isPastPeriod: data.period.end < today(),
      },
    [data, run],
  );

  if (error && !data)
    return (
      <div className="nut">
        <Alert
          type="error"
          showIcon
          message="NUT를 열 수 없습니다"
          description={error}
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </div>
    );

  if (!data || !context || !view)
    return (
      <div className="nut" aria-busy="true">
        <Skeleton active paragraph={{ rows: 1 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );

  const waiting = data.claims.filter((claim) =>
    data.viewer.canEdit
      ? claim.status === "review" || claim.status === "approved"
      : claim.mine && claim.status === "review",
  ).length;
  const tabs: Array<{ id: View; label: string; badge?: number }> = [
    { id: "overview", label: "요약" },
    { id: "ledger", label: "거래 내역" },
    { id: "claims", label: "청구서", badge: waiting || undefined },
    { id: "budget", label: "예산" },
    { id: "teams", label: "팀별 지원비" },
    { id: "attendance", label: "출석체크" },
    { id: "tax", label: "세금" },
    { id: "settings", label: "설정" },
    ...(data.viewer.canEdit
      ? [{ id: "accounts" as const, label: "환급 계좌" }]
      : []),
  ];

  return (
    <NutContext.Provider value={context}>
      <ConfigProvider
        renderEmpty={() => (
          <span className="nut-hint">맞는 항목이 없습니다</span>
        )}
      >
        <div className="nut">
          <header className="nut-header">
            <div className="nut-header__period">
              <span className="nut-header__app">NUT 재무</span>
              <Select
                className="nut-period-select"
                variant="borderless"
                value={data.period.id}
                popupMatchSelectWidth={false}
                aria-label="반기 선택"
                options={data.periods.map((period) => ({
                  value: period.id,
                  label: period.label,
                }))}
                onChange={(periodId) => void load(periodId)}
              />
              <span className="nut-header__dates">
                {data.period.start.replaceAll("-", ".")} –{" "}
                {data.period.end.replaceAll("-", ".")}
              </span>
            </div>
            <Button type="text" onClick={() => void signOut()}>
              로그아웃
            </Button>
          </header>

          {context.isPastPeriod && (
            <Alert
              className="nut-past-banner"
              type="info"
              showIcon
              message={`지난 반기(${data.period.label})를 보고 있습니다. 고칠 수는 있지만 새 거래는 지금 반기에 기록하세요.`}
            />
          )}

          <nav className="nut-tabs" aria-label="NUT 화면">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={
                  "nut-tab" + (view === tab.id ? " nut-tab--active" : "")
                }
                aria-current={view === tab.id ? "page" : undefined}
                onClick={() => setView(tab.id)}
              >
                {tab.label}
                {tab.badge ? (
                  <span className="nut-tab__badge">{tab.badge}</span>
                ) : null}
              </button>
            ))}
          </nav>

          <section className="nut-body">
            {view === "overview" && <OverviewView onOpen={setView} />}
            {view === "ledger" && <LedgerView />}
            {view === "claims" && <ClaimsView />}
            {view === "budget" && (
              <BudgetView onPeriodCreated={(id) => void load(id)} />
            )}
            {view === "teams" && <TeamsView />}
            {view === "attendance" && <AttendanceView />}
            {view === "settings" && <SettingsView />}
            {view === "tax" && <TaxView />}
            {view === "accounts" && data.viewer.canEdit && (
              <RefundAccountsView />
            )}
          </section>
        </div>
      </ConfigProvider>
    </NutContext.Provider>
  );
}
