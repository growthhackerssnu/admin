import { Input, InputNumber, Popconfirm, Segmented, Select } from "antd";
import { useMemo, useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { claimApi, ledgerApi, type LedgerInput } from "../api";
import {
  dateLabel,
  defaultDate,
  expenseCategories,
  incomeCategories,
  money,
  defaultTeamId,
  signed,
  taxClassFor,
  teamsFor,
  teamTarget,
  useNut,
} from "../shared";
import type { LedgerEntry, TaxClass } from "../types";

export const taxClassLabel: Record<TaxClass, string> = {
  taxable_gain: "과세 수익",
  non_taxable_gain: "비과세 수익",
  tax_deductible_expense: "손금 비용",
  non_tax_deductible_expense: "손금불산입 비용",
  tax: "세금",
};

type Draft = Omit<LedgerInput, "taxClass" | "amount"> & {
  amount: number | null;
};

function emptyDraft(date: string): Draft {
  return {
    date,
    type: "expense",
    bucket: "",
    detail: "",
    amount: null,
    claimant: "",
    note: "",
    teamId: null,
  };
}

// 거래 내역: 가계부처럼 날짜별로 묶어서 보여주고, 맨 위에서 바로 기록한다.
export default function LedgerView() {
  const { data, run } = useNut();
  const canEdit = data.viewer.canEdit;
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(defaultDate(data.period)),
  );
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [type, setType] = useState<"all" | "income" | "expense">("all");

  const expenseOptions = expenseCategories(data).map((node) => ({
    value: node.name,
    label: node.name,
  }));
  const incomeOptions = incomeCategories(data).map((name) => ({
    value: name,
    label: name,
  }));
  const months = [...new Set(data.ledger.map((entry) => entry.month))].sort(
    (a, b) => a - b,
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.ledger.filter(
      (entry) =>
        (type === "all" || entry.type === type) &&
        (!category || entry.bucket === category) &&
        (!month || entry.month === month) &&
        (!term ||
          [entry.detail, entry.bucket, entry.claimant, entry.note].some(
            (value) => value?.toLowerCase().includes(term),
          )),
    );
  }, [data.ledger, query, category, month, type]);

  const groups = useMemo(() => {
    const byDate = new Map<string, LedgerEntry[]>();
    [...filtered]
      .reverse()
      .forEach((entry) =>
        byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]),
      );
    return [...byDate];
  }, [filtered]);

  const totals = filtered.reduce(
    (sum, entry) => ({
      income: sum.income + entry.income,
      expense: sum.expense + entry.expense,
    }),
    { income: 0, expense: 0 },
  );
  const filtering = Boolean(query || category || month || type !== "all");
  // 팀지원비·기술지원비·운영팀 지원비면 팀까지 골라야 팀별 지원비와 맞는다.
  const needsTeam = teamsFor(data, draft.bucket).length > 0;
  const canSave =
    (!needsTeam || Boolean(draft.teamId)) &&
    draft.bucket &&
    draft.detail.trim() &&
    draft.amount &&
    draft.amount > 0 &&
    draft.date;

  async function add() {
    if (!canSave) return;
    setSaving(true);
    const ok = await run(
      () =>
        ledgerApi.create(data.period.id, {
          ...draft,
          amount: draft.amount!,
          taxClass: taxClassFor(draft.type),
        }),
      `${draft.detail} ${money(draft.amount!)}을 기록했습니다.`,
    );
    setSaving(false);
    if (ok)
      setDraft({
        ...emptyDraft(draft.date),
        type: draft.type,
        bucket: draft.bucket,
      });
  }

  return (
    <div className="nut-ledger">
      {canEdit && (
        <form
          className="nut-quick-add"
          aria-label="거래 기록"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Segmented
            value={draft.type}
            options={[
              { value: "expense", label: "지출" },
              { value: "income", label: "수입" },
            ]}
            onChange={(value) =>
              setDraft({ ...draft, type: value as Draft["type"], bucket: "" })
            }
          />
          <Input
            type="date"
            aria-label="날짜"
            className="nut-quick-add__date"
            value={draft.date}
            min={data.period.start}
            max={data.period.end}
            onChange={(event) =>
              setDraft({ ...draft, date: event.target.value })
            }
          />
          <Select
            showSearch
            aria-label="항목"
            className="nut-quick-add__category"
            placeholder={
              draft.type === "expense" ? "어느 예산에서?" : "어떤 수입?"
            }
            value={draft.bucket || undefined}
            options={draft.type === "expense" ? expenseOptions : incomeOptions}
            onChange={(value) =>
              setDraft({
                ...draft,
                bucket: value,
                teamId: defaultTeamId(data, value) ?? null,
              })
            }
          />
          {teamsFor(data, draft.bucket).length > 0 && (
            <Select
              aria-label="팀"
              className="nut-quick-add__team"
              placeholder="어느 팀?"
              value={draft.teamId ?? undefined}
              options={teamsFor(data, draft.bucket).map((team) => ({
                value: team.id,
                label: team.name,
              }))}
              onChange={(teamId) => setDraft({ ...draft, teamId })}
            />
          )}
          <Input
            aria-label="내용"
            className="nut-quick-add__detail"
            placeholder="내용 (예: 9월 MT 숙소 예약금)"
            value={draft.detail}
            onChange={(event) =>
              setDraft({ ...draft, detail: event.target.value })
            }
          />
          <InputNumber
            aria-label="금액"
            className="nut-quick-add__amount"
            placeholder="금액"
            min={0}
            step={1000}
            value={draft.amount}
            formatter={(value) =>
              value ? Number(value).toLocaleString("ko-KR") : ""
            }
            parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))}
            addonAfter="원"
            onChange={(value) => setDraft({ ...draft, amount: value })}
          />
          <Input
            aria-label="청구인"
            className="nut-quick-add__claimant"
            placeholder="청구인 (선택)"
            value={draft.claimant ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, claimant: event.target.value })
            }
          />
          <Button
            type="primary"
            htmlType="submit"
            disabled={!canSave}
            loading={saving}
          >
            기록
          </Button>
        </form>
      )}

      <div className="nut-toolbar">
        <Input.Search
          allowClear
          className="nut-toolbar__search"
          placeholder="내용, 항목, 청구인으로 찾기"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Segmented
          value={type}
          options={[
            { value: "all", label: "전체" },
            { value: "expense", label: "지출" },
            { value: "income", label: "수입" },
          ]}
          onChange={(value) => setType(value as typeof type)}
        />
        <Select
          allowClear
          className="nut-toolbar__select"
          placeholder="모든 달"
          value={month ?? undefined}
          options={months.map((value) => ({ value, label: `${value}월` }))}
          onChange={(value) => setMonth(value ?? null)}
        />
        <Select
          allowClear
          showSearch
          className="nut-toolbar__select nut-toolbar__select--wide"
          placeholder="모든 항목"
          value={category ?? undefined}
          options={[...new Set(data.ledger.map((entry) => entry.bucket))].map(
            (value) => ({ value, label: value }),
          )}
          onChange={(value) => setCategory(value ?? null)}
        />
      </div>

      <p className="nut-summary-line" aria-live="polite">
        {filtering
          ? `찾은 거래 ${filtered.length}건`
          : `이번 반기 거래 ${filtered.length}건`}{" "}
        · 수입 <b>{money(totals.income)}</b> · 지출{" "}
        <b>{money(totals.expense)}</b>
        {filtering && (
          <Button
            type="link"
            onClick={() => {
              setQuery("");
              setCategory(null);
              setMonth(null);
              setType("all");
            }}
          >
            조건 지우기
          </Button>
        )}
      </p>

      {groups.length === 0 ? (
        <p className="nut-empty">
          {filtering
            ? "조건에 맞는 거래가 없습니다."
            : "이 반기에는 아직 거래가 없습니다."}
        </p>
      ) : (
        <div className="nut-days">
          {groups.map(([date, entries]) => {
            const net = entries.reduce(
              (sum, entry) => sum + entry.income - entry.expense,
              0,
            );
            return (
              <section key={date} className="nut-day">
                <header className="nut-day__head">
                  <h3>{dateLabel(date)}</h3>
                  <span>{signed(net)}</span>
                </header>
                <ul className="nut-list">
                  {entries.map((entry) =>
                    editing === entry.id ? (
                      <LedgerEditor
                        key={entry.id}
                        entry={entry}
                        onDone={() => setEditing(null)}
                      />
                    ) : (
                      <li key={entry.id}>
                        <EntryShell
                          canEdit={canEdit}
                          onEdit={() => setEditing(entry.id)}
                          label={`${entry.detail} 수정`}
                        >
                          <span className="nut-entry__main">
                            <span className="nut-entry__title">
                              <strong>{entry.detail}</strong>
                              <CardChip claimId={entry.claimId} />
                            </span>
                            <span>
                              {entry.bucket}
                              {entry.teamId
                                ? ` · ${data.accountingSummaries.find((team) => team.id === entry.teamId)?.name ?? ""}`
                                : ""}
                              {!entry.teamId && teamTarget(entry.bucket) ? (
                                <span className="nut-negative">
                                  {" "}
                                  · 팀 미지정
                                </span>
                              ) : null}
                              {entry.claimant ? ` · ${entry.claimant}` : ""}
                              {entry.note ? ` · ${entry.note}` : ""}
                            </span>
                          </span>
                          <span className="nut-entry__end">
                            <span
                              className={"nut-amount nut-amount--" + entry.type}
                            >
                              {signed(
                                entry.type === "income"
                                  ? entry.amount
                                  : -entry.amount,
                              )}
                            </span>
                            <span className="nut-entry__balance">
                              잔액 {money(entry.balance)}
                            </span>
                          </span>
                        </EntryShell>
                        <ClaimThreadLink claimId={entry.claimId} />
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 고칠 수 있으면 눌러서 여는 버튼, 아니면 그냥 줄.
export function EntryShell({
  canEdit,
  onEdit,
  label,
  children,
}: {
  canEdit: boolean;
  onEdit: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return canEdit ? (
    <button
      type="button"
      className="nut-entry"
      onClick={onEdit}
      aria-label={label}
    >
      {children}
    </button>
  ) : (
    <div className="nut-entry nut-entry--static">{children}</div>
  );
}

function LedgerEditor({
  entry,
  onDone,
}: {
  entry: LedgerEntry;
  onDone: () => void;
}) {
  const { data, run } = useNut();
  const [value, setValue] = useState({
    date: entry.date,
    bucket: entry.bucket,
    detail: entry.detail,
    amount: entry.amount,
    claimant: entry.claimant ?? "",
    note: entry.note ?? "",
    teamId: entry.teamId ?? null,
    taxClass: entry.taxClass,
  });
  // 청구서에서 온 행은 결제 수단(법인카드/개인카드)을 여기서 고친다. 값은 청구서에 있다.
  const claim = data.claims.find((item) => item.id === entry.claimId);
  const [prepaid, setPrepaid] = useState(claim?.prepaid);
  const teams = teamsFor(data, value.bucket);
  const options =
    entry.type === "expense"
      ? expenseCategories(data).map((node) => ({
          value: node.name,
          label: node.name,
        }))
      : incomeCategories(data).map((name) => ({ value: name, label: name }));

  return (
    <li className="nut-entry-editor">
      <div className="nut-entry-editor__fields">
        <label>
          날짜
          <Input
            type="date"
            value={value.date}
            onChange={(event) =>
              setValue({ ...value, date: event.target.value })
            }
          />
        </label>
        <label>
          항목
          <Select
            showSearch
            value={value.bucket}
            options={options}
            onChange={(bucket) =>
              setValue({
                ...value,
                bucket,
                teamId: defaultTeamId(data, bucket) ?? null,
              })
            }
          />
        </label>
        <label className="nut-entry-editor__wide">
          내용
          <Input
            value={value.detail}
            onChange={(event) =>
              setValue({ ...value, detail: event.target.value })
            }
          />
        </label>
        <label>
          금액
          <InputNumber
            min={0}
            value={value.amount}
            addonAfter="원"
            formatter={(amount) =>
              amount ? Number(amount).toLocaleString("ko-KR") : ""
            }
            parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
            onChange={(amount) => setValue({ ...value, amount: amount ?? 0 })}
          />
        </label>
        {teams.length > 0 && (
          <label>
            팀
            <Select
              placeholder="어느 팀?"
              value={value.teamId ?? undefined}
              options={teams.map((team) => ({
                value: team.id,
                label: team.name,
              }))}
              onChange={(teamId) => setValue({ ...value, teamId })}
            />
          </label>
        )}
        <label>
          세금 분류
          <Select
            value={value.taxClass}
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
            onChange={(taxClass) => setValue({ ...value, taxClass })}
          />
        </label>
        {claim && (
          <label>
            결제 수단
            <Segmented
              value={prepaid ? "personal" : "biz"}
              options={[
                { value: "biz", label: "법인카드" },
                { value: "personal", label: "개인카드" },
              ]}
              onChange={(card) => setPrepaid(card === "personal")}
            />
          </label>
        )}
        <label>
          청구인
          <Input
            value={value.claimant}
            onChange={(event) =>
              setValue({ ...value, claimant: event.target.value })
            }
          />
        </label>
        <label className="nut-entry-editor__wide">
          메모
          <Input
            value={value.note}
            onChange={(event) =>
              setValue({ ...value, note: event.target.value })
            }
          />
        </label>
      </div>
      <div className="nut-entry-editor__actions">
        <Popconfirm
          title="이 거래를 지울까요?"
          description={
            entry.claimId
              ? "청구서로 지급한 거래입니다. 지우면 청구서는 '승인'으로 돌아갑니다."
              : "지운 거래는 되돌릴 수 없습니다."
          }
          okText="지우기"
          cancelText="그대로 두기"
          okButtonProps={{ danger: true }}
          onConfirm={async () => {
            if (
              await run(() => ledgerApi.remove(entry.id), "거래를 지웠습니다.")
            )
              onDone();
          }}
        >
          <Button type="text" danger>
            지우기
          </Button>
        </Popconfirm>
        <span className="nut-spacer" />
        <Button onClick={onDone}>취소</Button>
        <Button
          type="primary"
          disabled={!value.detail.trim() || !value.bucket}
          onClick={async () => {
            if (
              await run(async () => {
                if (claim && prepaid !== undefined && prepaid !== claim.prepaid)
                  await claimApi.setCard(claim.id, prepaid);
                return ledgerApi.update(entry.id, value);
              }, "거래를 고쳤습니다.")
            )
              onDone();
          }}
        >
          저장
        </Button>
      </div>
    </li>
  );
}

// 청구서에서 온 행이 법인카드인지 개인 카드인지(직접 적은 행은 모르니 칩이 없다).
function CardChip({ claimId }: { claimId?: string }) {
  const { data } = useNut();
  const claim = data.claims.find((item) => item.id === claimId);
  if (!claim) return null;
  return (
    <span
      className={
        "nut-card-chip nut-card-chip--" + (claim.prepaid ? "personal" : "biz")
      }
    >
      {claim.prepaid ? "개인카드" : "법인카드"}
    </span>
  );
}

function ClaimThreadLink({ claimId }: { claimId?: string }) {
  const { data } = useNut();
  const link = data.claims.find((item) => item.id === claimId)?.slackLink;
  return link ? (
    <a className="nut-entry__link" href={link} target="_blank" rel="noreferrer">
      Slack 스레드 (영수증)
    </a>
  ) : null;
}
