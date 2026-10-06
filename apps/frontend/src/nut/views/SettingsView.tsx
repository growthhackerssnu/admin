import { Input, InputNumber, Popconfirm, Select } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { budgetApi } from "../api";
import { money, useNut } from "../shared";
import type { BudgetNode, BudgetParameter, FinanceOverview } from "../types";

// 설정: 예전 시트 '예산안'처럼 인원·단가를 바꾸면 그 값을 쓰는 예산이 바로 다시 계산된다.
// 보기는 모두, 고치기는 총무·admin만.
// 무엇을 위한 돈인지 순서대로. 인원은 위의 표로 따로 보여준다.
const CATEGORIES = [
  "인원",
  "방학 프로젝트",
  "정규 프로젝트",
  "운영팀 지원",
  "행사·복지",
  "구독·환율",
  "기타",
];
const TEAMS = [
  { key: "business", label: "대협" },
  { key: "hr", label: "HR" },
  { key: "pr", label: "PR" },
];
// 운영 기수·신입 기수. 열 제목은 반기의 운영팀 기수로 채운다(2026-2 → 19기·20기).
const COHORTS = ["senior", "junior"] as const;

function identifiers(expression: string | undefined) {
  return new Set(expression?.match(/[a-z][a-z0-9-]*/g) ?? []);
}

// 이 기준을 (직접 또는 총원·참여 인원 같은 계산 기준을 거쳐) 쓰는 예산 항목.
function usedBy(data: FinanceOverview, id: string) {
  const ids = new Set([id]);
  data.derivedParameters.forEach((derived) => {
    if ([...identifiers(derived.expression)].some((name) => ids.has(name)))
      ids.add(derived.id);
  });
  return data.budgetTree.filter((node) =>
    [...identifiers(node.formulaExpression)].some((name) => ids.has(name)),
  );
}

function format(value: number, unit: string) {
  const text = Number.isInteger(value)
    ? value.toLocaleString("ko-KR")
    : String(value);
  return unit === "$" ? `$${text}` : `${text}${unit}`;
}

// 저장 후 안내: 어떤 예산이 얼마나 바뀌었는지.
function changeSummary(
  before: BudgetNode[],
  after: FinanceOverview,
  label: string,
  value: number,
  unit: string,
) {
  const old = new Map(before.map((node) => [node.id, node.budget]));
  const changed = after.budgetTree.filter(
    (node) =>
      node.level === "minor" &&
      old.has(node.id) &&
      old.get(node.id) !== node.budget,
  );
  const head = `${label}을 ${format(value, unit)}로 바꿨습니다.`;
  if (!changed.length) return `${head} 바뀐 예산은 없습니다.`;
  const parts = changed.slice(0, 3).map((node) => {
    const diff = node.budget - old.get(node.id)!;
    return `${node.name} ${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`;
  });
  return `${head} ${parts.join(", ")}${changed.length > 3 ? ` 외 ${changed.length - 3}개` : ""}`;
}

export default function SettingsView() {
  const { data } = useNut();
  const canEdit = data.viewer.canEdit;
  const [adding, setAdding] = useState(false);
  const byId = new Map(
    data.parameters.map((parameter) => [parameter.id, parameter]),
  );
  const derived = new Map(
    data.derivedParameters.map((item) => [item.id, item]),
  );
  const grid = TEAMS.every((team) =>
    COHORTS.every((cohort) => byId.has(`${team.key}-${cohort}`)),
  );
  const gridIds = new Set(
    grid
      ? TEAMS.flatMap((team) =>
          COHORTS.map((cohort) => `${team.key}-${cohort}`),
        )
      : [],
  );
  const groups = CATEGORIES.map((category) => ({
    category,
    items: data.parameters
      .filter(
        (parameter) =>
          (CATEGORIES.includes(parameter.category)
            ? parameter.category
            : "기타") === category,
      )
      .filter((parameter) => !gridIds.has(parameter.id)),
  }));

  return (
    <div className="nut-settings">
      <p className="nut-claims__intro">
        예산 계산에 쓰는 인원과 단가입니다. 값을 바꾸면 그 값을 쓰는 예산이 바로
        다시 계산됩니다.
        {canEdit ? "" : " 수정은 총무와 관리자만 할 수 있습니다."}
      </p>

      {grid && (
        <section className="nut-panel" aria-labelledby="headcount">
          <header className="nut-panel__head">
            <div>
              <h2 id="headcount">운영팀 인원</h2>
              <p className="nut-panel__sub">
                기수별 총원과 프로젝트 참여 인원은 여기서 자동으로 계산됩니다.
              </p>
            </div>
          </header>
          <table className="nut-headcount">
            <thead>
              <tr>
                <th scope="col">팀</th>
                {COHORTS.map((cohort) => (
                  <th scope="col" key={cohort}>
                    {cohort === "senior"
                      ? data.period.operatingCohort
                      : data.period.operatingCohort + 1}
                    기
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEAMS.map((team) => (
                <tr key={team.key}>
                  <th scope="row">{team.label}</th>
                  {COHORTS.map((cohort) => (
                    <td key={cohort}>
                      <ParameterInput
                        parameter={byId.get(`${team.key}-${cohort}`)!}
                        canEdit={canEdit}
                        compact
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">총원</th>
                {COHORTS.map((cohort) => (
                  <td key={cohort}>
                    {derived.get(`cohort-${cohort}`)?.value ?? "−"}명
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section
            key={group.category}
            className="nut-panel"
            aria-label={group.category}
          >
            <header className="nut-panel__head">
              <h2>{group.category}</h2>
            </header>
            {data.derivedParameters.some(
              (item) =>
                item.category === group.category &&
                !item.id.startsWith("cohort-"),
            ) && (
              <ul className="nut-derived">
                {data.derivedParameters
                  .filter(
                    (item) =>
                      item.category === group.category &&
                      !item.id.startsWith("cohort-"),
                  )
                  .map((item) => (
                    <li key={item.id}>
                      <span>{item.label} (자동 계산)</span>
                      <strong>{format(item.value, item.unit)}</strong>
                    </li>
                  ))}
              </ul>
            )}
            <ul className="nut-setting-list">
              {group.items.map((parameter) => (
                <SettingRow
                  key={parameter.id}
                  parameter={parameter}
                  canEdit={canEdit}
                />
              ))}
            </ul>
          </section>
        ))}

      {canEdit &&
        (adding ? (
          <NewSetting onDone={() => setAdding(false)} />
        ) : (
          <div>
            <Button onClick={() => setAdding(true)}>기준 추가</Button>
          </div>
        ))}
    </div>
  );
}

function SettingRow({
  parameter,
  canEdit,
}: {
  parameter: BudgetParameter;
  canEdit: boolean;
}) {
  const { data, run } = useNut();
  const uses = usedBy(data, parameter.id);
  return (
    <li className="nut-setting">
      <div className="nut-setting__label">
        <strong>{parameter.label}</strong>
        {parameter.description && <span>{parameter.description}</span>}
        {uses.length > 0 ? (
          <span className="nut-setting__uses">
            쓰는 곳:{" "}
            {uses
              .map((node) => `${node.name} ${money(node.budget)}`)
              .join(" · ")}
          </span>
        ) : (
          <span className="nut-setting__uses">
            아직 이 값을 쓰는 예산이 없습니다.
          </span>
        )}
      </div>
      <div className="nut-setting__value">
        <ParameterInput parameter={parameter} canEdit={canEdit} />
        {canEdit && uses.length === 0 && (
          <Popconfirm
            title={`'${parameter.label}' 기준을 지울까요?`}
            okText="지우기"
            cancelText="그대로 두기"
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              void run(
                () => budgetApi.removeParameter(data.period.id, parameter.id),
                "기준을 지웠습니다.",
              )
            }
          >
            <Button type="text" size="small">
              지우기
            </Button>
          </Popconfirm>
        )}
      </div>
    </li>
  );
}

// 값을 바꾸고 칸을 벗어나거나 Enter를 누르면 저장한다.
function ParameterInput({
  parameter,
  canEdit,
  compact,
}: {
  parameter: BudgetParameter;
  canEdit: boolean;
  compact?: boolean;
}) {
  const { data, run } = useNut();
  const [value, setValue] = useState<number | null>(parameter.value);
  const decimals =
    !Number.isInteger(parameter.value) ||
    parameter.unit === "$" ||
    parameter.unit === "개월";
  if (!canEdit)
    return (
      <span className="nut-setting__readonly">
        {format(parameter.value, parameter.unit)}
      </span>
    );

  const save = () => {
    if (value === null || value === parameter.value) return;
    const before = data.budgetTree;
    void run(
      () => budgetApi.updateParameter(data.period.id, parameter.id, value),
      (next) =>
        changeSummary(before, next, parameter.label, value, parameter.unit),
    );
  };
  return (
    <InputNumber
      className={
        compact
          ? "nut-setting__input nut-setting__input--compact"
          : "nut-setting__input"
      }
      aria-label={parameter.label}
      min={0}
      step={decimals ? 0.01 : parameter.unit === "원" ? 1000 : 1}
      value={value}
      addonAfter={parameter.unit === "$" ? undefined : parameter.unit}
      addonBefore={parameter.unit === "$" ? "$" : undefined}
      formatter={(input) =>
        input === undefined || String(input) === ""
          ? ""
          : decimals
            ? String(input)
            : Number(input).toLocaleString("ko-KR")
      }
      parser={(input) =>
        Number((input ?? "").replace(decimals ? /[^\d.]/g : /[^\d]/g, ""))
      }
      onChange={setValue}
      onBlur={save}
      onPressEnter={save}
    />
  );
}

function NewSetting({ onDone }: { onDone: () => void }) {
  const { data, run } = useNut();
  const [draft, setDraft] = useState({
    label: "",
    id: "",
    value: 0,
    unit: "원",
    category: "행사·복지",
    description: "",
  });
  const validId = /^[a-z][a-z0-9-]{1,63}$/.test(draft.id);
  return (
    <form
      className="nut-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.label.trim() || !validId) return;
        if (
          await run(
            () => budgetApi.createParameter(data.period.id, draft),
            `${draft.label} 기준을 추가했습니다.`,
          )
        )
          onDone();
      }}
    >
      <label>
        이름
        <Input
          autoFocus
          placeholder="예: 홈커밍 1인당 지원"
          value={draft.label}
          onChange={(event) =>
            setDraft({ ...draft, label: event.target.value })
          }
        />
      </label>
      <label>
        계산식에 쓸 영문 이름
        <Input
          placeholder="예: homecoming-per-person"
          value={draft.id}
          status={draft.id && !validId ? "error" : undefined}
          onChange={(event) =>
            setDraft({ ...draft, id: event.target.value.trim() })
          }
        />
        <small>예산 항목의 계산식에서 이 이름으로 씁니다.</small>
      </label>
      <label>
        묶음
        <Select
          value={draft.category}
          options={CATEGORIES.map((category) => ({
            value: category,
            label: category,
          }))}
          onChange={(category) => setDraft({ ...draft, category })}
        />
      </label>
      <label>
        값
        <InputNumber
          min={0}
          value={draft.value}
          onChange={(value) => setDraft({ ...draft, value: value ?? 0 })}
        />
      </label>
      <label>
        단위
        <Input
          value={draft.unit}
          onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
        />
      </label>
      <div className="nut-form-actions">
        <Button onClick={onDone}>취소</Button>
        <Button
          type="primary"
          htmlType="submit"
          disabled={!draft.label.trim() || !validId}
        >
          추가
        </Button>
      </div>
    </form>
  );
}
