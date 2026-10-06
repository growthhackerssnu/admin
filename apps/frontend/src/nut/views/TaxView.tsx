import {
  App as AntApp,
  Alert,
  InputNumber,
  Select,
  Skeleton,
  Switch,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { fetchTax, ledgerApi, saveTaxInput } from "../api";
import { money, shortDate, useNut } from "../shared";
import type { TaxClass, TaxOverview } from "../types";
import { taxClassLabel } from "./LedgerView";

// 세금: 회계연도(12월 1일 ~ 11월 30일) 기준 법인세, 달력 반기 기준 부가세, 원천징수세.
// 금액은 회계 행의 세금 분류에서 나온다 — 아래 '분류 확인'에서 바로 고칠 수 있다.
export default function TaxView() {
  const { data, run } = useNut();
  const { message } = AntApp.useApp();
  const canEdit = data.viewer.canEdit;
  const [tax, setTax] = useState<TaxOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fy?: number) => {
    try {
      setError(null);
      setTax(await fetchTax(fy));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "세금 정보를 불러오지 못했습니다.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveInput(key: string, value: number) {
    if (!tax) return;
    try {
      setTax(await saveTaxInput(tax.fiscalYear, key, value));
      message.success("저장했습니다.");
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "저장하지 못했습니다.",
      );
    }
  }

  async function reclassify(id: string, taxClass: TaxClass) {
    if (!tax) return;
    if (
      await run(
        () => ledgerApi.update(id, { taxClass }),
        "세금 분류를 바꿨습니다.",
      )
    )
      await load(tax.fiscalYear);
  }

  if (error) return <Alert type="error" showIcon message={error} />;
  if (!tax) return <Skeleton active paragraph={{ rows: 8 }} />;

  const c = tax.corporate;
  const fyLabel = (fy: number) => `${fy} 회계연도`;
  return (
    <div className="nut-tax">
      <div className="nut-toolbar">
        <Select
          className="nut-toolbar__select nut-toolbar__select--wide"
          aria-label="회계연도"
          value={tax.fiscalYear}
          options={tax.fiscalYears.map((fy) => ({
            value: fy,
            label: fyLabel(fy),
          }))}
          onChange={(fy) => void load(fy)}
        />
        <p className="nut-summary-line">
          {tax.range.start.replaceAll("-", ".")} –{" "}
          {tax.range.end.replaceAll("-", ".")} · 법인세 신고 기한{" "}
          {tax.filingDue.replaceAll("-", ".")}
        </p>
      </div>
      <p className="nut-claims__intro">
        회계연도는 운영팀 반기와 달리 12월 1일부터 11월 30일까지입니다.
        {tax.range.start === tax.taxStart &&
          ` 학회는 ${tax.taxStart.replaceAll("-", ".")}부터 세금을 계산하므로 이번 회계연도는 그날부터이고, 그 전 거래는 넣지 않습니다.`}{" "}
        아래 금액은 계산을 돕기 위한 추정이며, 신고 전에 세무사와 확인하세요.
      </p>

      <section className="nut-panel" aria-labelledby="corporate">
        <header className="nut-panel__head">
          <div>
            <h2 id="corporate">법인세</h2>
            <p className="nut-panel__sub">
              세율{" "}
              {c.rates.map((rate) => `${Math.round(rate * 100)}%`).join(" · ")}{" "}
              (
              {c.newRates
                ? "2026년 이후 시작한 사업연도"
                : "2025년 이전 시작한 사업연도"}
              )
            </p>
          </div>
          <strong className="nut-tax__total">{money(c.total)}</strong>
        </header>
        <dl className="nut-tax__lines">
          <div>
            <dt>과세 수익</dt>
            <dd>{money(tax.totals.taxableGains)}</dd>
          </div>
          <div>
            <dt>− 손금 비용</dt>
            <dd>{money(tax.totals.deductibleExpenses)}</dd>
          </div>
          <div className="nut-tax__sub">
            <dt>수익사업 소득</dt>
            <dd>{money(c.businessIncome)}</dd>
          </div>
          <div>
            <dt>
              − 고유목적사업준비금
              {canEdit ? (
                <InputNumber
                  size="small"
                  min={0}
                  max={100}
                  defaultValue={c.reserveRate}
                  addonAfter="%"
                  className="nut-tax__rate"
                  onBlur={(event) => {
                    const value = Number(event.target.value || 0);
                    if (value !== c.reserveRate)
                      void saveInput(
                        `fy:${tax.fiscalYear}:reserve-rate`,
                        value,
                      );
                  }}
                />
              ) : (
                ` ${c.reserveRate}%`
              )}
            </dt>
            <dd>{money(c.reserve)}</dd>
          </div>
          <div className="nut-tax__sub">
            <dt>과세표준</dt>
            <dd>{money(c.taxBase)}</dd>
          </div>
          {c.lines.map((line) => (
            <div key={line.from} className="nut-tax__detail">
              <dt>
                {money(line.from)} 초과 ~ {money(line.to)} ×{" "}
                {Math.round(line.rate * 100)}%
              </dt>
              <dd>{money(line.tax)}</dd>
            </div>
          ))}
          <div>
            <dt>법인세</dt>
            <dd>{money(c.tax)}</dd>
          </div>
          <div>
            <dt>지방소득세 (법인세의 10%)</dt>
            <dd>{money(c.local)}</dd>
          </div>
        </dl>
        <p className="nut-hint">
          비과세 수익 {money(tax.totals.nonTaxableGains)}, 손금불산입 비용{" "}
          {money(tax.totals.nonDeductibleExpenses)}은 계산에서 뺐습니다.
        </p>
      </section>

      <section className="nut-panel" aria-labelledby="vat">
        <header className="nut-panel__head">
          <div>
            <h2 id="vat">부가세</h2>
            <p className="nut-panel__sub">
              달력 기준 1기(1~6월)·2기(7~12월). 과세 수익 입금액에서 공급가액을
              계산합니다.
            </p>
          </div>
        </header>
        <div className="nut-vat-grid">
          {tax.vat.map((period) => (
            <div key={period.key} className="nut-vat">
              <div className="nut-vat__head">
                <strong>
                  {period.key.slice(0, 4)}년{" "}
                  {period.key.endsWith("-1") ? "1기" : "2기"}
                </strong>
                <span>신고 {shortDate(period.due)}</span>
              </div>
              <dl className="nut-tax__lines">
                <div>
                  <dt>과세 수익 입금액</dt>
                  <dd>{money(period.receipts)}</dd>
                </div>
                <div>
                  <dt>
                    입금액에 부가세 포함
                    <Switch
                      size="small"
                      checked={period.included}
                      disabled={!canEdit}
                      onChange={(checked) =>
                        void saveInput(
                          `vat:${period.key}:vat-included`,
                          checked ? 1 : 0,
                        )
                      }
                    />
                  </dt>
                  <dd>공급가액 {money(period.supply)}</dd>
                </div>
                <div>
                  <dt>매출세액 (10%)</dt>
                  <dd>{money(period.outputTax)}</dd>
                </div>
                <div>
                  <dt>− 매입세액 (받은 세금계산서)</dt>
                  <dd>
                    {canEdit ? (
                      <InputNumber
                        size="small"
                        min={0}
                        defaultValue={period.inputTax}
                        addonAfter="원"
                        className="nut-tax__amount"
                        formatter={(input) =>
                          input ? Number(input).toLocaleString("ko-KR") : ""
                        }
                        parser={(input) =>
                          Number((input ?? "").replace(/[^\d]/g, ""))
                        }
                        onBlur={(event) => {
                          const value = Number(
                            event.target.value.replace(/[^\d]/g, "") || 0,
                          );
                          if (value !== period.inputTax)
                            void saveInput(
                              `vat:${period.key}:input-tax`,
                              value,
                            );
                        }}
                      />
                    ) : (
                      money(period.inputTax)
                    )}
                  </dd>
                </div>
                <div className="nut-tax__sub">
                  <dt>{period.payable < 0 ? "환급 예상" : "낼 부가세"}</dt>
                  <dd>{money(Math.abs(period.payable))}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="nut-panel" aria-labelledby="withholding">
        <header className="nut-panel__head">
          <div>
            <h2 id="withholding">원천징수세</h2>
            <p className="nut-panel__sub">
              외부 강연자·프리랜서에게 준 돈. 지급한 다음 달 10일까지
              신고·납부합니다.
            </p>
          </div>
        </header>
        <dl className="nut-tax__lines">
          {(
            [
              ["business", "사업소득 (3.3%)", "프리랜서 용역비 등"],
              ["other", "기타소득 (8.8%)", "일시적인 강연료 등 (필요경비 60%)"],
            ] as const
          ).map(([kind, label, hint]) => {
            const row = tax.withholding[kind];
            return (
              <div key={kind}>
                <dt>
                  {label}
                  <small>{hint}</small>
                  {canEdit ? (
                    <InputNumber
                      size="small"
                      min={0}
                      defaultValue={row.paid}
                      addonBefore="지급액"
                      addonAfter="원"
                      className="nut-tax__amount"
                      formatter={(input) =>
                        input ? Number(input).toLocaleString("ko-KR") : ""
                      }
                      parser={(input) =>
                        Number((input ?? "").replace(/[^\d]/g, ""))
                      }
                      onBlur={(event) => {
                        const value = Number(
                          event.target.value.replace(/[^\d]/g, "") || 0,
                        );
                        if (value !== row.paid)
                          void saveInput(
                            `fy:${tax.fiscalYear}:${kind}-paid`,
                            value,
                          );
                      }}
                    />
                  ) : (
                    ` 지급액 ${money(row.paid)}`
                  )}
                </dt>
                <dd>
                  {money(row.national + row.local)}
                  <small>
                    국세 {money(row.national)} + 지방 {money(row.local)}
                  </small>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="nut-panel" aria-labelledby="classes">
        <header className="nut-panel__head">
          <div>
            <h2 id="classes">분류 확인</h2>
            <p className="nut-panel__sub">
              이 회계연도의 거래 {tax.entries.length}건. 분류를 바꾸면 위 세금이
              다시 계산됩니다.
            </p>
          </div>
        </header>
        <ul className="nut-list">
          {tax.entries.map((entry) => (
            <li key={entry.id} className="nut-list__row">
              <div>
                <strong>{entry.detail}</strong>
                <span>
                  {shortDate(entry.date)} · {entry.bucket}
                </span>
              </div>
              <div className="nut-list__end">
                <span className={"nut-amount nut-amount--" + entry.type}>
                  {entry.type === "income" ? "+" : "−"}
                  {entry.amount.toLocaleString("ko-KR")}원
                </span>
                {canEdit ? (
                  <Select
                    size="small"
                    className="nut-tax__class"
                    value={entry.taxClass}
                    options={(entry.type === "income"
                      ? (["taxable_gain", "non_taxable_gain"] as const)
                      : ([
                          "tax_deductible_expense",
                          "non_tax_deductible_expense",
                          "tax",
                        ] as const)
                    ).map((taxClass) => ({
                      value: taxClass,
                      label: taxClassLabel[taxClass],
                    }))}
                    onChange={(taxClass) => void reclassify(entry.id, taxClass)}
                  />
                ) : (
                  <span className="nut-status">
                    {taxClassLabel[entry.taxClass]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
