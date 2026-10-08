import { AppButton as Button } from "@/components/ui/app-button";
import { Meter, money, shortDate, signed, useNut } from "../shared";

type Tab = "ledger" | "claims" | "budget" | "teams";

// 요약: "지금 얼마 있고, 처리할 게 뭐고, 예산은 어디가 빠듯한가"를 한 화면에.
export default function OverviewView({
  onOpen,
}: {
  onOpen: (tab: Tab) => void;
}) {
  const { data } = useNut();
  const manage = data.viewer.canEdit;
  const pending = data.claims.filter((claim) =>
    manage
      ? claim.status === "review" || claim.status === "approved"
      : claim.mine && claim.status !== "paid",
  );
  const majors = data.budgetTree
    .filter((node) => node.parentId === null && node.kind === "expense")
    .sort((a, b) => a.order - b.order);
  const over = majors.filter((node) => node.actual > node.budget);
  const recent = [...data.ledger].reverse().slice(0, 6);
  const budgetLeft = data.expenseBudget - data.expenseActual;

  return (
    <div className="nut-overview">
      <div className="nut-balance">
        <div className="nut-balance__main">
          <span>지금 통장 잔액</span>
          <strong>{money(data.carriedCash?.amount ?? data.currentCash)}</strong>
          {data.carriedCash && (
            <small>
              아직 시작 전인 반기라 {data.carriedCash.label} 잔액을 보여줍니다
            </small>
          )}
        </div>
        <dl className="nut-balance__facts">
          <div>
            <dt>이번 반기 들어온 돈</dt>
            <dd>{money(data.actual.income)}</dd>
          </div>
          <div>
            <dt>이번 반기 쓴 돈</dt>
            <dd>{money(data.actual.expense)}</dd>
          </div>
          <div>
            <dt>남은 지출 예산</dt>
            <dd className={budgetLeft < 0 ? "nut-negative" : undefined}>
              {money(budgetLeft)}
              <small> / {money(data.expenseBudget)}</small>
            </dd>
          </div>
        </dl>
      </div>

      <div className="nut-overview__grid">
        <section className="nut-panel" aria-labelledby="todo-title">
          <header className="nut-panel__head">
            <h2 id="todo-title">{manage ? "처리할 청구서" : "내 청구서"}</h2>
            <Button type="link" onClick={() => onOpen("claims")}>
              청구서로 가기
            </Button>
          </header>
          {pending.length === 0 ? (
            <p className="nut-empty">
              {manage
                ? "처리할 청구서가 없습니다."
                : "진행 중인 청구서가 없습니다. 청구는 Slack 청구서 워크플로로 올립니다."}
            </p>
          ) : (
            <ul className="nut-list">
              {pending.slice(0, 6).map((claim) => (
                <li key={claim.id} className="nut-list__row">
                  <div>
                    <strong>{claim.detail}</strong>
                    <span>
                      {claim.claimant} · {shortDate(claim.date)} ·{" "}
                      {claim.bucket}
                    </span>
                  </div>
                  <div className="nut-list__end">
                    <span className="nut-amount">{money(claim.amount)}</span>
                    <span className={"nut-status nut-status--" + claim.status}>
                      {statusLabel[claim.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="nut-panel" aria-labelledby="budget-title">
          <header className="nut-panel__head">
            <h2 id="budget-title">예산 사용</h2>
            <Button type="link" onClick={() => onOpen("budget")}>
              예산 보기
            </Button>
          </header>
          {over.length > 0 && (
            <p className="nut-callout">
              예산을 넘긴 항목: {over.map((node) => node.name).join(", ")}
            </p>
          )}
          <ul className="nut-list">
            {majors.map((node) => (
              <li key={node.id} className="nut-budget-row">
                <div className="nut-budget-row__top">
                  <strong>{node.name}</strong>
                  <span
                    className={node.remaining < 0 ? "nut-negative" : undefined}
                  >
                    {node.remaining < 0
                      ? `${money(-node.remaining)} 초과`
                      : `${money(node.remaining)} 남음`}
                  </span>
                </div>
                <Meter
                  used={node.actual}
                  total={node.budget}
                  label={`${node.name} 예산 사용`}
                />
                <span className="nut-budget-row__sub">
                  {money(node.actual)} / {money(node.budget)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="nut-panel" aria-labelledby="recent-title">
        <header className="nut-panel__head">
          <h2 id="recent-title">최근 거래</h2>
          <Button type="link" onClick={() => onOpen("ledger")}>
            전체 거래 내역
          </Button>
        </header>
        {recent.length === 0 ? (
          <p className="nut-empty">이 반기에는 아직 거래가 없습니다.</p>
        ) : (
          <ul className="nut-list">
            {recent.map((entry) => (
              <li key={entry.id} className="nut-list__row">
                <div>
                  <strong>{entry.detail}</strong>
                  <span>
                    {shortDate(entry.date)} · {entry.bucket}
                    {entry.claimant ? ` · ${entry.claimant}` : ""}
                  </span>
                </div>
                <span className={"nut-amount nut-amount--" + entry.type}>
                  {signed(
                    entry.type === "income" ? entry.amount : -entry.amount,
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export const statusLabel = {
  review: "검토 중",
  approved: "승인",
  paid: "지급 완료",
  rejected: "반려",
} as const;
