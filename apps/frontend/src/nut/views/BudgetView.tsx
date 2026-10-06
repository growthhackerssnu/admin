import { Input, InputNumber, Popconfirm, Radio } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { budgetApi, createPeriod } from "../api";
import { Meter, money, taxClassFor, useNut } from "../shared";
import type { BudgetNode } from "../types";

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

      {data.incomeLines.length > 0 && (
        <section className="nut-panel" aria-labelledby="income-plan">
          <header className="nut-panel__head">
            <h2 id="income-plan">수입 계획</h2>
          </header>
          <ul className="nut-list">
            {data.incomeLines.map((line) => {
              const actual = ledgerIncome.get(line.name) ?? line.actual;
              return (
                <li key={line.id} className="nut-budget-row">
                  <div className="nut-budget-row__top">
                    <strong>{line.name}</strong>
                    <span>
                      {money(actual)} / {money(line.budget)}
                    </span>
                  </div>
                  {line.note && (
                    <span className="nut-budget-row__sub">{line.note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.viewer.canEdit && <NewPeriod onCreated={onPeriodCreated} />}
    </div>
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
            {(node.formulaExpression || node.note) && (
              <small>
                {node.formulaExpression
                  ? `계산식 ${node.formulaExpression}`
                  : node.note}
              </small>
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
    budget: node.budget,
    formulaExpression: node.formulaExpression ?? "",
    note: node.note ?? "",
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

// 반기가 바뀔 때 한 번. 지금 보고 있는 반기의 예산 구조·계산 기준·운영팀을 복사해서 시작한다.
function NewPeriod({ onCreated }: { onCreated: (id: string) => void }) {
  const { data, run } = useNut();
  const [open, setOpen] = useState(false);
  const nextStart = new Date(`${data.period.end}T00:00:00Z`);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const year = nextStart.getUTCFullYear();
  const half = nextStart.getUTCMonth() < 6 ? 1 : 2;
  const [value, setValue] = useState({
    id: `${year}-${half}h`,
    label: `${year} ${half === 1 ? "상반기" : "하반기"}`,
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
            {data.period.label}의 예산 구조·계산 기준·운영팀 목록을 복사합니다.
            기초 잔액은 지금 잔액 {money(data.currentCash)}입니다.
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
