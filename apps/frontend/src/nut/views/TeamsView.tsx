import { Input, InputNumber, Popconfirm, Segmented, Select } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { accountingApi } from "../api";
import { defaultDate, Meter, money, shortDate, useNut } from "../shared";
import { EntryShell } from "./LedgerView";
import type { AccountingDetail, AccountingSummary } from "../types";

type Scope = "project" | "team";
const categoryName = { support: "팀지원비", technical: "기술지원비" } as const;

// 팀별 지원비: 프로젝트 팀·운영팀마다 받은 지원비를 얼마나 썼는지, 무엇에 썼는지.
export default function TeamsView() {
  const { data } = useNut();
  const [scope, setScope] = useState<Scope>("project");
  const [adding, setAdding] = useState(false);
  const teams = data.accountingSummaries.filter(
    (summary) => summary.scope === scope,
  );
  const budget = teams.reduce(
    (sum, team) => sum + team.supportBudget + team.technicalBudget,
    0,
  );
  const spent = teams.reduce(
    (sum, team) => sum + team.supportSpent + team.technicalSpent,
    0,
  );

  return (
    <div className="nut-teams">
      <div className="nut-toolbar">
        <Segmented
          value={scope}
          options={[
            { value: "project", label: "프로젝트 팀" },
            { value: "team", label: "운영팀" },
          ]}
          onChange={(value) => {
            setScope(value as Scope);
            setAdding(false);
          }}
        />
        <p className="nut-summary-line">
          지원비 {money(budget)} 중 {money(spent)} 사용 · 남음{" "}
          <b>{money(budget - spent)}</b>
        </p>
        <span className="nut-spacer" />
        {data.viewer.canEdit && (
          <Button onClick={() => setAdding(true)}>
            {scope === "project" ? "프로젝트 팀 추가" : "운영팀 추가"}
          </Button>
        )}
      </div>
      {adding && <TeamForm scope={scope} onDone={() => setAdding(false)} />}
      {teams.length === 0 && !adding ? (
        <p className="nut-empty">
          {scope === "project"
            ? "이 반기에 등록된 프로젝트 팀이 없습니다."
            : "이 반기에 등록된 운영팀이 없습니다."}
        </p>
      ) : (
        <div className="nut-team-list">
          {teams.map((team) => (
            <TeamSection
              key={team.id}
              team={team}
              entries={data.accountingDetails.filter(
                (detail) =>
                  detail.scope === team.scope && detail.owner === team.name,
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamSection({
  team,
  entries,
}: {
  team: AccountingSummary;
  entries: AccountingDetail[];
}) {
  const { data } = useNut();
  const canEdit = data.viewer.canEdit;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const categories = (["support", "technical"] as const).filter((category) =>
    category === "support"
      ? team.supportBudget > 0 || team.supportSpent > 0
      : team.technicalBudget > 0 || team.technicalSpent > 0,
  );

  return (
    <section className="nut-panel nut-team">
      <header className="nut-team__head">
        <button
          type="button"
          className="nut-team__toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          <strong>{team.name}</strong>
          <span className="nut-team__count">내역 {team.entryCount}건</span>
        </button>
        {canEdit && (
          <Button
            type="text"
            size="small"
            onClick={() => setEditing((value) => !value)}
          >
            예산 수정
          </Button>
        )}
      </header>
      {editing && (
        <TeamForm
          scope={team.scope}
          team={team}
          onDone={() => setEditing(false)}
        />
      )}
      <div className="nut-team__meters">
        {categories.length === 0 && (
          <p className="nut-hint">아직 지원비 예산이 없습니다.</p>
        )}
        {categories.map((category) => {
          const budget =
            category === "support" ? team.supportBudget : team.technicalBudget;
          const used =
            category === "support" ? team.supportSpent : team.technicalSpent;
          return (
            <div key={category} className="nut-team__meter">
              <div className="nut-budget-row__top">
                <span>{categoryName[category]}</span>
                <span
                  className={budget - used < 0 ? "nut-negative" : undefined}
                >
                  {budget - used < 0
                    ? `${money(used - budget)} 초과`
                    : `${money(budget - used)} 남음`}
                </span>
              </div>
              <Meter
                used={used}
                total={budget}
                label={`${team.name} ${categoryName[category]}`}
              />
              <span className="nut-budget-row__sub">
                {money(used)} / {money(budget)}
              </span>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="nut-team__body">
          {canEdit && <EntryForm team={team} />}
          {entries.length === 0 ? (
            <p className="nut-empty">아직 쓴 내역이 없습니다.</p>
          ) : (
            <ul className="nut-list">
              {[...entries].reverse().map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function EntryForm({ team }: { team: AccountingSummary }) {
  const { data, run } = useNut();
  const empty = {
    date: defaultDate(data.period),
    category: (team.supportBudget > 0 || team.technicalBudget === 0
      ? "support"
      : "technical") as "support" | "technical",
    detail: "",
    amount: null as number | null,
    claimant: "",
  };
  const [value, setValue] = useState(empty);
  const ready = value.detail.trim() && value.amount && value.amount > 0;
  return (
    <form
      className="nut-quick-add nut-quick-add--compact"
      aria-label={`${team.name} 사용 내역 추가`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        const ok = await run(
          () =>
            accountingApi.addEntry(data.period.id, {
              ...value,
              amount: value.amount!,
              scope: team.scope,
              owner: team.name,
            }),
          `${team.name} ${money(value.amount!)} 사용을 기록했습니다.`,
        );
        if (ok)
          setValue({ ...empty, date: value.date, category: value.category });
      }}
    >
      <Input
        type="date"
        aria-label="날짜"
        className="nut-quick-add__date"
        value={value.date}
        onChange={(event) => setValue({ ...value, date: event.target.value })}
      />
      <Select
        aria-label="지원비 종류"
        value={value.category}
        options={[
          { value: "support", label: "팀지원비" },
          { value: "technical", label: "기술지원비" },
        ]}
        onChange={(category) => setValue({ ...value, category })}
      />
      <Input
        aria-label="내용"
        className="nut-quick-add__detail"
        placeholder="내용 (예: 회의 다과)"
        value={value.detail}
        onChange={(event) => setValue({ ...value, detail: event.target.value })}
      />
      <InputNumber
        aria-label="금액"
        className="nut-quick-add__amount"
        placeholder="금액"
        min={0}
        addonAfter="원"
        value={value.amount}
        formatter={(amount) =>
          amount ? Number(amount).toLocaleString("ko-KR") : ""
        }
        parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
        onChange={(amount) => setValue({ ...value, amount })}
      />
      <Input
        aria-label="쓴 사람"
        className="nut-quick-add__claimant"
        placeholder="쓴 사람 (선택)"
        value={value.claimant}
        onChange={(event) =>
          setValue({ ...value, claimant: event.target.value })
        }
      />
      <Button type="primary" htmlType="submit" disabled={!ready}>
        기록
      </Button>
    </form>
  );
}

function EntryRow({ entry }: { entry: AccountingDetail }) {
  const { data, run } = useNut();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState({
    date: entry.date,
    detail: entry.detail,
    amount: entry.amount,
    claimant: entry.claimant ?? "",
  });

  if (editing)
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
              addonAfter="원"
              value={value.amount}
              formatter={(amount) =>
                amount ? Number(amount).toLocaleString("ko-KR") : ""
              }
              parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
              onChange={(amount) => setValue({ ...value, amount: amount ?? 0 })}
            />
          </label>
          <label>
            쓴 사람
            <Input
              value={value.claimant}
              onChange={(event) =>
                setValue({ ...value, claimant: event.target.value })
              }
            />
          </label>
        </div>
        <div className="nut-entry-editor__actions">
          <Popconfirm
            title="이 내역을 지울까요?"
            okText="지우기"
            cancelText="그대로 두기"
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              void run(
                () => accountingApi.removeEntry(entry.id),
                "내역을 지웠습니다.",
              )
            }
          >
            <Button type="text" danger>
              지우기
            </Button>
          </Popconfirm>
          <span className="nut-spacer" />
          <Button onClick={() => setEditing(false)}>취소</Button>
          <Button
            type="primary"
            disabled={!value.detail.trim()}
            onClick={async () => {
              if (
                await run(
                  () => accountingApi.updateEntry(entry.id, value),
                  "내역을 고쳤습니다.",
                )
              )
                setEditing(false);
            }}
          >
            저장
          </Button>
        </div>
      </li>
    );

  return (
    <li>
      <EntryShell
        canEdit={data.viewer.canEdit}
        onEdit={() => setEditing(true)}
        label={`${entry.detail} 수정`}
      >
        <span className="nut-entry__main">
          <strong>{entry.detail}</strong>
          <span>
            {shortDate(entry.date)} · {categoryName[entry.category]}
            {entry.claimant ? ` · ${entry.claimant}` : ""}
          </span>
        </span>
        <span className="nut-entry__end">
          <span className="nut-amount nut-amount--expense">
            −{entry.amount.toLocaleString("ko-KR")}원
          </span>
          <span className="nut-entry__balance">
            남음 {money(entry.balance)}
          </span>
        </span>
      </EntryShell>
    </li>
  );
}

function TeamForm({
  scope,
  team,
  onDone,
}: {
  scope: Scope;
  team?: AccountingSummary;
  onDone: () => void;
}) {
  const { data, run } = useNut();
  const [value, setValue] = useState({
    name: team?.name ?? "",
    supportBudget: team?.supportBudget ?? 0,
    technicalBudget: team?.technicalBudget ?? 0,
  });
  return (
    <form
      className="nut-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const ok = await run(
          () =>
            accountingApi.saveTeam(data.period.id, {
              id: team?.id,
              scope,
              ...value,
              name: value.name.trim(),
            }),
          team
            ? `${value.name} 예산을 고쳤습니다.`
            : `${value.name}을 추가했습니다.`,
        );
        if (ok) onDone();
      }}
    >
      <label>
        {scope === "project" ? "프로젝트 팀 이름" : "운영팀 이름"}
        <Input
          autoFocus
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        팀지원비 예산
        <InputNumber
          min={0}
          addonAfter="원"
          value={value.supportBudget}
          formatter={(amount) =>
            amount ? Number(amount).toLocaleString("ko-KR") : ""
          }
          parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
          onChange={(amount) =>
            setValue({ ...value, supportBudget: amount ?? 0 })
          }
        />
      </label>
      <label>
        기술지원비 예산
        <InputNumber
          min={0}
          addonAfter="원"
          value={value.technicalBudget}
          formatter={(amount) =>
            amount ? Number(amount).toLocaleString("ko-KR") : ""
          }
          parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
          onChange={(amount) =>
            setValue({ ...value, technicalBudget: amount ?? 0 })
          }
        />
      </label>
      <div className="nut-form-actions">
        {team && team.entryCount === 0 && (
          <Popconfirm
            title={`'${team.name}'을 지울까요?`}
            okText="지우기"
            cancelText="그대로 두기"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              if (
                await run(
                  () => accountingApi.removeTeam(team.id),
                  `${team.name}을 지웠습니다.`,
                )
              )
                onDone();
            }}
          >
            <Button type="text" danger>
              팀 지우기
            </Button>
          </Popconfirm>
        )}
        <span className="nut-spacer" />
        <Button onClick={onDone}>취소</Button>
        <Button type="primary" htmlType="submit" disabled={!value.name.trim()}>
          {team ? "저장" : "추가"}
        </Button>
      </div>
    </form>
  );
}
