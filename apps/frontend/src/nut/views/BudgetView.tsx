import { Input, InputNumber, Popconfirm, Radio, Select } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { budgetApi, createPeriod, incomeApi } from "../api";
import { Meter, money, taxClassFor, useNut } from "../shared";
import type {
  Billing,
  BudgetNode,
  FinanceOverview,
  IncomeLine,
} from "../types";

// 계산식을 설정 이름으로 읽기 쉽게: "summer-support-per-person * summer-participants"
// → "팀지원비 (1인당) × 방학 프로젝트 참여 인원".
function readableFormula(data: FinanceOverview, expression: string) {
  const labels = new Map<string, string>([
    ...data.parameters.map(
      (parameter) => [parameter.id, parameter.label] as [string, string],
    ),
    ...data.derivedParameters.map(
      (derived) => [derived.id, derived.label] as [string, string],
    ),
  ]);
  const functions: Record<string, string> = {
    round: "반올림",
    ceil: "올림",
    floor: "내림",
    min: "최소",
    max: "최대",
    abs: "절댓값",
  };
  return expression
    .replace(
      /[a-z][a-z0-9-]*/g,
      (name) => labels.get(name) ?? functions[name] ?? name,
    )
    .replaceAll("*", "×")
    .replaceAll("/", "÷");
}

// 같은 계산식에 지금 설정 값을 넣어 보여준다: "20,000원 × 올림((13명 + 13명) ÷ 2)".
// 메모에 숫자를 따로 적지 않아도 설정을 바꾸면 바로 맞는 계산 내역이 나온다.
function formulaWithValues(data: FinanceOverview, expression: string) {
  const values = new Map<string, string>([
    ...data.parameters.map(
      (parameter) =>
        [parameter.id, withUnit(parameter.value, parameter.unit)] as [
          string,
          string,
        ],
    ),
    ...data.derivedParameters.map(
      (derived) =>
        [derived.id, withUnit(derived.value, derived.unit)] as [
          string,
          string,
        ],
    ),
  ]);
  return readableFormula(
    data,
    expression.replace(
      /[a-z][a-z0-9-]*/g,
      (name) => values.get(name) ?? name,
    ),
  );
}

function withUnit(value: number, unit: string) {
  const number = value.toLocaleString("ko-KR");
  if (unit === "$") return `$${number}`;
  if (unit === "원/$") return `${number}원`;
  return `${number}${unit}`;
}

export const billingLabel: Record<Billing, string> = {
  every: "매 반기",
  spring: "봄·여름 반기만",
  fall: "가을·겨울 반기만",
  once: "이번 반기만",
};

const levelBelow = { major: "middle", middle: "minor" } as const;
const levelName = {
  major: "대분류",
  middle: "중분류",
  minor: "소분류",
} as const;

// 예산: 반기 예산을 트리로 보고, 그 자리에서 고친다.
export default function BudgetView({
  onPeriodCreated,
}: {
  onPeriodCreated: (id: string) => void;
}) {
  const { data } = useNut();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ parent: BudgetNode | null } | null>(
    null,
  );
  const children = new Map<string | null, BudgetNode[]>();
  data.budgetTree.forEach((node) =>
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]),
  );
  children.forEach((list) => list.sort((a, b) => a.order - b.order));

  const ledgerIncome = new Map<string, number>();
  data.ledger
    .filter((entry) => entry.type === "income")
    .forEach((entry) =>
      ledgerIncome.set(
        entry.bucket,
        (ledgerIncome.get(entry.bucket) ?? 0) + entry.income,
      ),
    );

  const rows: Array<{ node: BudgetNode; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) =>
    (children.get(parentId) ?? []).forEach((node) => {
      rows.push({ node, depth });
      if (!collapsed.has(node.id)) visit(node.id, depth + 1);
    });
  visit(null, 0);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="nut-budget">
      <ProjectedBalance />

      <section className="nut-panel" aria-labelledby="expense-budget">
        <header className="nut-panel__head">
          <div>
            <h2 id="expense-budget">지출 예산</h2>
            <p className="nut-panel__sub">
              예산 {money(data.expenseBudget)} · 사용{" "}
              {money(data.expenseActual)} · 남음{" "}
              <span
                className={
                  data.expenseBudget - data.expenseActual < 0
                    ? "nut-negative"
                    : undefined
                }
              >
                {money(data.expenseBudget - data.expenseActual)}
              </span>
            </p>
          </div>
          <div className="nut-panel__tools">
            <Button
              type="text"
              onClick={() =>
                setCollapsed(
                  collapsed.size
                    ? new Set()
                    : new Set(
                        data.budgetTree
                          .filter((node) => node.level === "major")
                          .map((node) => node.id),
                      ),
                )
              }
            >
              {collapsed.size ? "모두 펼치기" : "대분류만 보기"}
            </Button>
            {data.viewer.canEdit && (
              <Button onClick={() => setAdding({ parent: null })}>
                대분류 추가
              </Button>
            )}
          </div>
        </header>
        {adding?.parent === null && (
          <NodeForm parent={null} onDone={() => setAdding(null)} />
        )}
        <div className="nut-tree" role="treegrid" aria-label="지출 예산">
          <div className="nut-tree__row nut-tree__row--head" role="row">
            <span role="columnheader">항목</span>
            <span role="columnheader">예산</span>
            <span role="columnheader">쓴 돈</span>
            <span role="columnheader">남은 돈</span>
            <span role="columnheader" className="nut-visually-hidden">
              관리
            </span>
          </div>
          {rows.map(({ node, depth }) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={depth}
              siblings={children.get(node.parentId) ?? []}
              hasChildren={(children.get(node.id) ?? []).length > 0}
              collapsed={collapsed.has(node.id)}
              onToggle={() => toggle(node.id)}
              adding={adding?.parent?.id === node.id}
              onAddChild={() => setAdding({ parent: node })}
              onAddDone={() => setAdding(null)}
            />
          ))}
        </div>
      </section>

      <IncomePlan actualByName={ledgerIncome} />

      {data.viewer.canEdit && <NewPeriod onCreated={onPeriodCreated} />}
    </div>
  );
}

// 예상 잔액: 반기 말에 남을 돈 = 기초 잔액 + 수입 계획 − 지출 예산.
// 실제 기준(지금 잔액 + 아직 안 들어온 수입 − 아직 안 쓴 예산)도 같이 보여준다.
function ProjectedBalance() {
  const { data } = useNut();
  const planned = data.openingCash + data.plan.income - data.plan.expense;
  const incomeLeft = data.incomeLines.reduce(
    (sum, line) => sum + Math.max(0, line.budget - line.actual),
    0,
  );
  const leaves = data.budgetTree.filter(
    (node) =>
      node.kind === "expense" &&
      !data.budgetTree.some((child) => child.parentId === node.id),
  );
  const expenseLeft = leaves.reduce(
    (sum, node) => sum + Math.max(0, node.budget - node.actual),
    0,
  );
  const started = data.ledger.length > 0;
  const forecast = data.currentCash + incomeLeft - expenseLeft;
  return (
    <section className="nut-panel" aria-labelledby="projected-balance">
      <header className="nut-panel__head">
        <div>
          <h2 id="projected-balance">예상 잔액</h2>
          <p className="nut-panel__sub">
            {data.openingCash ? `기초 잔액 ${money(data.openingCash)} + ` : ""}
            수입 계획 {money(data.plan.income)} − 지출 예산{" "}
            {money(data.plan.expense)}
          </p>
        </div>
      </header>
      <dl className="nut-balance__facts nut-projection">
        <div>
          <dt>예산안 기준 반기 말 잔액</dt>
          <dd className={planned < 0 ? "nut-negative" : undefined}>
            {money(planned)}
          </dd>
        </div>
        {started && (
          <div>
            <dt>실제 기준 반기 말 잔액</dt>
            <dd className={forecast < 0 ? "nut-negative" : undefined}>
              {money(forecast)}
              <small>
                {" "}
                지금 {money(data.currentCash)} + 들어올 수입{" "}
                {money(incomeLeft)} − 남은 예산 {money(expenseLeft)}
              </small>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function TreeRow({
  node,
  depth,
  siblings,
  hasChildren,
  collapsed,
  onToggle,
  adding,
  onAddChild,
  onAddDone,
}: {
  node: BudgetNode;
  depth: number;
  siblings: BudgetNode[];
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  adding: boolean;
  onAddChild: () => void;
  onAddDone: () => void;
}) {
  const { data, run } = useNut();
  const canEdit = data.viewer.canEdit;
  const [editing, setEditing] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const index = siblings.findIndex((item) => item.id === node.id);
  const move = (offset: number) => {
    const ids = siblings.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    void run(() => budgetApi.reorder(ids), "순서를 바꿨습니다.");
  };

  return (
    <>
      <div className={"nut-tree__row nut-tree__row--" + node.level} role="row">
        <span
          className="nut-tree__name"
          role="gridcell"
          style={{ paddingLeft: depth * 20 }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="nut-tree__toggle"
              aria-expanded={!collapsed}
              aria-label={`${node.name} ${collapsed ? "펼치기" : "접기"}`}
              onClick={onToggle}
            >
              {collapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="nut-tree__toggle" aria-hidden />
          )}
          <span>
            <strong>{node.name}</strong>
            {node.billing !== "every" && (
              <small className="nut-billing">
                {billingLabel[node.billing]}
                {node.offSeason && ` · 이번 반기 0원 (평소 ${money(node.amount)})`}
              </small>
            )}
            {node.formulaExpression && (
              <small>{formulaWithValues(data, node.formulaExpression)}</small>
            )}
            {node.note && <small>{node.note}</small>}
            {node.formulaExpression && (
              <button
                type="button"
                className="nut-formula-toggle"
                aria-expanded={showFormula}
                onClick={() => setShowFormula((value) => !value)}
              >
                {showFormula
                  ? readableFormula(data, node.formulaExpression)
                  : "계산식 보기"}
              </button>
            )}
          </span>
        </span>
        <span role="gridcell" className="nut-tree__num">
          {money(node.budget)}
        </span>
        <span role="gridcell" className="nut-tree__num">
          {money(node.actual)}
          <Meter
            used={node.actual}
            total={node.budget}
            label={`${node.name} 예산 사용`}
          />
        </span>
        <span
          role="gridcell"
          className={
            "nut-tree__num" + (node.remaining < 0 ? " nut-negative" : "")
          }
        >
          {node.remaining < 0
            ? `${money(-node.remaining)} 초과`
            : money(node.remaining)}
        </span>
        <span role="gridcell" className="nut-tree__actions">
          {canEdit && (
            <>
              <Button
                type="text"
                size="small"
                disabled={index <= 0}
                aria-label={`${node.name} 위로`}
                onClick={() => move(-1)}
              >
                ↑
              </Button>
              <Button
                type="text"
                size="small"
                disabled={index >= siblings.length - 1}
                aria-label={`${node.name} 아래로`}
                onClick={() => move(1)}
              >
                ↓
              </Button>
              {node.level !== "minor" && (
                <Button type="text" size="small" onClick={onAddChild}>
                  {levelName[levelBelow[node.level]]} 추가
                </Button>
              )}
              <Button
                type="text"
                size="small"
                onClick={() => setEditing((value) => !value)}
              >
                수정
              </Button>
            </>
          )}
        </span>
      </div>
      {editing && (
        <NodeEditor
          node={node}
          hasChildren={hasChildren}
          onDone={() => setEditing(false)}
        />
      )}
      {adding && <NodeForm parent={node} onDone={onAddDone} />}
    </>
  );
}

function NodeEditor({
  node,
  hasChildren,
  onDone,
}: {
  node: BudgetNode;
  hasChildren: boolean;
  onDone: () => void;
}) {
  const { run } = useNut();
  const [mode, setMode] = useState<"amount" | "formula">(
    node.formulaExpression ? "formula" : "amount",
  );
  const [value, setValue] = useState({
    name: node.name,
    budget: node.amount,
    formulaExpression: node.formulaExpression ?? "",
    note: node.note ?? "",
    billing: node.billing,
  });
  return (
    <div className="nut-inline-form">
      <label>
        이름
        <Input
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
      </label>
      {hasChildren ? (
        <p className="nut-hint">예산은 하위 항목의 합계입니다.</p>
      ) : (
        <>
          <Radio.Group
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <Radio value="amount">금액 직접 입력</Radio>
            <Radio value="formula">계산식</Radio>
          </Radio.Group>
          {mode === "amount" ? (
            <label>
              예산
              <InputNumber
                min={0}
                addonAfter="원"
                value={value.budget}
                formatter={(amount) =>
                  amount ? Number(amount).toLocaleString("ko-KR") : ""
                }
                parser={(amount) =>
                  Number((amount ?? "").replace(/[^\d]/g, ""))
                }
                onChange={(budget) =>
                  setValue({ ...value, budget: budget ?? 0 })
                }
              />
            </label>
          ) : (
            <label>
              계산식
              <Input
                placeholder="예: 80000 * summer-participants"
                value={value.formulaExpression}
                onChange={(event) =>
                  setValue({ ...value, formulaExpression: event.target.value })
                }
              />
              <small>'설정' 탭의 영문 이름을 쓸 수 있습니다.</small>
            </label>
          )}
        </>
      )}
      <label>
        결제 시기
        <Select
          value={value.billing}
          options={(Object.keys(billingLabel) as Billing[]).map((billing) => ({
            value: billing,
            label: billingLabel[billing],
          }))}
          onChange={(billing) => setValue({ ...value, billing })}
        />
        <small>
          {value.billing === "once"
            ? "새 반기를 시작할 때 복사하지 않습니다."
            : value.billing === "every"
              ? "매 반기 예산에 잡힙니다."
              : "다른 반기에는 0원으로 잡히고 금액은 남겨 둡니다."}
        </small>
      </label>
      <label className="nut-inline-form__wide">
        메모
        <Input
          value={value.note}
          onChange={(event) => setValue({ ...value, note: event.target.value })}
        />
      </label>
      <div className="nut-form-actions">
        <Popconfirm
          title={`'${node.name}'을 예산에서 뺄까요?`}
          description={
            hasChildren
              ? "하위 항목도 함께 보이지 않게 됩니다."
              : "이 항목으로 기록된 거래는 그대로 남습니다."
          }
          okText="빼기"
          cancelText="그대로 두기"
          okButtonProps={{ danger: true }}
          onConfirm={async () => {
            if (
              await run(
                () => budgetApi.removeNode(node.id),
                `${node.name}을 예산에서 뺐습니다.`,
              )
            )
              onDone();
          }}
        >
          <Button type="text" danger>
            예산에서 빼기
          </Button>
        </Popconfirm>
        <span className="nut-spacer" />
        <Button onClick={onDone}>취소</Button>
        <Button
          type="primary"
          disabled={!value.name.trim()}
          onClick={async () => {
            const ok = await run(
              () =>
                budgetApi.updateNode(node.id, {
                  name: value.name.trim(),
                  note: value.note || null,
                  billing: value.billing,
                  ...(hasChildren
                    ? {}
                    : mode === "formula"
                      ? { formulaExpression: value.formulaExpression || null }
                      : { budget: value.budget, formulaExpression: null }),
                }),
              "예산을 고쳤습니다.",
            );
            if (ok) onDone();
          }}
        >
          저장
        </Button>
      </div>
    </div>
  );
}

function NodeForm({
  parent,
  onDone,
}: {
  parent: BudgetNode | null;
  onDone: () => void;
}) {
  const { data, run } = useNut();
  const level = parent
    ? levelBelow[parent.level as "major" | "middle"]
    : "major";
  const [name, setName] = useState("");
  const [budget, setBudget] = useState<number | null>(null);
  return (
    <form
      className="nut-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const kind = parent?.kind ?? "expense";
        const ok = await run(
          () =>
            budgetApi.createNode(data.period.id, {
              name: name.trim(),
              parentId: parent?.id ?? null,
              level,
              kind,
              taxClass: parent?.taxClass ?? taxClassFor(kind),
              budget: budget ?? 0,
            }),
          `${name}을 추가했습니다.`,
        );
        if (ok) onDone();
      }}
    >
      <label>
        {parent ? `${parent.name} 아래 ${levelName[level]}` : "새 대분류"} 이름
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        예산
        <InputNumber
          min={0}
          addonAfter="원"
          value={budget}
          formatter={(amount) =>
            amount ? Number(amount).toLocaleString("ko-KR") : ""
          }
          parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
          onChange={setBudget}
        />
      </label>
      <div className="nut-form-actions">
        <Button onClick={onDone}>취소</Button>
        <Button type="primary" htmlType="submit" disabled={!name.trim()}>
          추가
        </Button>
      </div>
    </form>
  );
}

// 수입 계획: 반기 수입 목표. 실제 수입은 같은 이름의 회계 수입을 더한 값.
function IncomePlan({ actualByName }: { actualByName: Map<string, number> }) {
  const { data } = useNut();
  const [adding, setAdding] = useState(false);
  const planned = data.incomeLines.reduce((sum, line) => sum + line.budget, 0);
  const actual = data.incomeLines.reduce(
    (sum, line) => sum + (actualByName.get(line.name) ?? 0),
    0,
  );
  return (
    <section className="nut-panel" aria-labelledby="income-plan">
      <header className="nut-panel__head">
        <div>
          <h2 id="income-plan">수입 계획</h2>
          <p className="nut-panel__sub">
            계획 {money(planned)} · 실제 {money(actual)}
          </p>
        </div>
        {data.viewer.canEdit && !adding && (
          <Button onClick={() => setAdding(true)}>수입 추가</Button>
        )}
      </header>
      {adding && <IncomeForm onDone={() => setAdding(false)} />}
      <ul className="nut-list">
        {data.incomeLines.map((line) => (
          <IncomeRow
            key={line.id}
            line={line}
            actual={actualByName.get(line.name) ?? 0}
          />
        ))}
      </ul>
    </section>
  );
}

function IncomeRow({ line, actual }: { line: IncomeLine; actual: number }) {
  const { data } = useNut();
  const [editing, setEditing] = useState(false);
  if (editing)
    return <IncomeForm line={line} onDone={() => setEditing(false)} />;
  return (
    <li className="nut-budget-row nut-income-row">
      <div className="nut-budget-row__top">
        <strong>{line.name}</strong>
        <span>
          {money(actual)} / {money(line.budget)}
          {data.viewer.canEdit && (
            <Button type="text" size="small" onClick={() => setEditing(true)}>
              수정
            </Button>
          )}
        </span>
      </div>
      {line.note && <span className="nut-budget-row__sub">{line.note}</span>}
    </li>
  );
}

function IncomeForm({
  line,
  onDone,
}: {
  line?: IncomeLine;
  onDone: () => void;
}) {
  const { data, run } = useNut();
  const [value, setValue] = useState({
    name: line?.name ?? "",
    budget: line?.budget ?? 0,
    note: line?.note ?? "",
  });
  return (
    <form
      className="nut-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.name.trim()) return;
        const ok = await run(
          () =>
            incomeApi.save(data.period.id, {
              id: line?.id,
              name: value.name.trim(),
              budget: value.budget,
              note: value.note || null,
            }),
          line
            ? `${value.name}을 고쳤습니다.`
            : `${value.name}을 추가했습니다.`,
        );
        if (ok) onDone();
      }}
    >
      <label>
        이름
        <Input
          autoFocus
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
        {line && (
          <small>이름을 바꾸면 이 이름으로 기록된 수입도 같이 바뀝니다.</small>
        )}
      </label>
      <label>
        계획 금액
        <InputNumber
          min={0}
          addonAfter="원"
          value={value.budget}
          formatter={(input) =>
            input ? Number(input).toLocaleString("ko-KR") : ""
          }
          parser={(input) => Number((input ?? "").replace(/[^\d]/g, ""))}
          onChange={(input) => setValue({ ...value, budget: input ?? 0 })}
        />
      </label>
      <label className="nut-inline-form__wide">
        메모
        <Input
          value={value.note}
          onChange={(event) => setValue({ ...value, note: event.target.value })}
        />
      </label>
      <div className="nut-form-actions">
        {line && (
          <Popconfirm
            title={`'${line.name}'을 수입 계획에서 지울까요?`}
            description="이 이름으로 기록된 수입 거래는 그대로 남습니다."
            okText="지우기"
            cancelText="그대로 두기"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              if (
                await run(
                  () => incomeApi.remove(line.id),
                  `${line.name}을 지웠습니다.`,
                )
              )
                onDone();
            }}
          >
            <Button type="text" danger>
              지우기
            </Button>
          </Popconfirm>
        )}
        <span className="nut-spacer" />
        <Button onClick={onDone}>취소</Button>
        <Button type="primary" htmlType="submit" disabled={!value.name.trim()}>
          저장
        </Button>
      </div>
    </form>
  );
}

// 반기가 바뀔 때 한 번. 지금 보고 있는 반기의 예산 구조·계산 기준·운영팀을 복사해서 시작한다.
// 기초 잔액은 복사하지 않는다 — 잔금은 '잔금' 수입 줄로 계획하고 인계될 때 수입으로 기록한다.
function NewPeriod({ onCreated }: { onCreated: (id: string) => void }) {
  const { data, run } = useNut();
  const [open, setOpen] = useState(false);
  const nextStart = new Date(`${data.period.end}T00:00:00Z`);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const year = nextStart.getUTCFullYear();
  const half = nextStart.getUTCMonth() < 6 ? 1 : 2;
  const [value, setValue] = useState({
    id: `${year}-${half}h`,
    label: `${year}-${half} · ${data.period.operatingCohort + 1}기 운영팀 임기`,
    start: nextStart.toISOString().slice(0, 10),
    end: `${year}-${half === 1 ? "06-30" : "12-31"}`,
  });
  const exists = data.periods.some((period) => period.id === value.id);

  return (
    <section
      className="nut-panel nut-panel--quiet"
      aria-labelledby="new-period"
    >
      <header className="nut-panel__head">
        <div>
          <h2 id="new-period">새 반기 시작</h2>
          <p className="nut-panel__sub">
            {data.period.label}의 예산 구조·계산 기준·운영팀 목록을 복사합니다
            ('이번 반기만' 항목은 빼고). 기초 잔액은 0원에서 시작하고, 이번
            반기 잔액({money(data.currentCash)})은 새 반기에 잔금 수입으로
            기록합니다.
          </p>
        </div>
        {!open && <Button onClick={() => setOpen(true)}>새 반기 준비</Button>}
      </header>
      {open && (
        <div className="nut-inline-form">
          <label>
            이름
            <Input
              value={value.label}
              onChange={(event) =>
                setValue({ ...value, label: event.target.value })
              }
            />
          </label>
          <label>
            시작
            <Input
              type="date"
              value={value.start}
              onChange={(event) =>
                setValue({ ...value, start: event.target.value })
              }
            />
          </label>
          <label>
            끝
            <Input
              type="date"
              value={value.end}
              onChange={(event) =>
                setValue({ ...value, end: event.target.value })
              }
            />
          </label>
          {exists && (
            <p className="nut-negative">
              {value.id} 반기가 이미 있습니다. 위에서 반기를 바꿔 보세요.
            </p>
          )}
          <div className="nut-form-actions">
            <Button onClick={() => setOpen(false)}>취소</Button>
            <Button
              type="primary"
              disabled={exists || !value.label.trim()}
              onClick={async () => {
                const ok = await run(
                  () => createPeriod({ ...value, copyFromId: data.period.id }),
                  `${value.label}을 시작했습니다.`,
                );
                if (ok) onCreated(value.id);
              }}
            >
              {value.label} 시작
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
