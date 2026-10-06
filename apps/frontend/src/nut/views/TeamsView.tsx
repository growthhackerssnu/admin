import { Input, InputNumber, Popconfirm, Segmented } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { accountingApi } from "../api";
import { Meter, money, shortDate, useNut } from "../shared";
import type { AccountingDetail, AccountingSummary } from "../types";

type Scope = "project" | "team";
type Term = "summer" | "regular";
const TERM_LABEL: Record<Term, string> = {
  summer: "방학 프로젝트",
  regular: "정규 프로젝트",
};

// 팀별 지원비: 거래 내역에서 팀을 지정한 회계 행을 팀별로 모은다(그래서 거래 내역과 늘 같다).
// 프로젝트는 방학·정규를 나란히 보여준다 — 같은 이름의 팀이 두 학기에 있어도 헷갈리지 않게.
export default function TeamsView() {
  const { data } = useNut();
  const [scope, setScope] = useState<Scope>("project");
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
          onChange={(value) => setScope(value as Scope)}
        />
        <p className="nut-summary-line">
          지원비 {money(budget)} 중 {money(spent)} 사용 · 남음{" "}
          <b>{money(budget - spent)}</b>
        </p>
      </div>
      <p className="nut-claims__intro">
        쓴 내역은 거래 내역에서 기록할 때 팀을 고르면 여기에 모입니다. 팀을 안
        고른 지원비 거래는 거래 내역에 ‘팀 미지정’으로 표시됩니다.
      </p>
      {scope === "project" ? (
        <div className="nut-term-columns">
          {(["summer", "regular"] as const).map((term) => (
            <TeamColumn
              key={term}
              title={TERM_LABEL[term]}
              scope="project"
              term={term}
              teams={teams.filter((team) => team.term === term)}
            />
          ))}
        </div>
      ) : (
        <TeamColumn title="운영팀" scope="team" term="" teams={teams} />
      )}
    </div>
  );
}

function TeamColumn({
  title,
  scope,
  term,
  teams,
}: {
  title: string;
  scope: Scope;
  term: Term | "";
  teams: AccountingSummary[];
}) {
  const { data } = useNut();
  const [adding, setAdding] = useState(false);
  return (
    <section className="nut-term-column" aria-label={title}>
      <header className="nut-term-column__head">
        <h2>{title}</h2>
        {data.viewer.canEdit && !adding && (
          <Button size="small" onClick={() => setAdding(true)}>
            팀 추가
          </Button>
        )}
      </header>
      {adding && (
        <TeamForm scope={scope} term={term} onDone={() => setAdding(false)} />
      )}
      {teams.length === 0 && !adding ? (
        <p className="nut-empty">등록된 팀이 없습니다.</p>
      ) : (
        <div className="nut-team-list">
          {teams.map((team) => (
            <TeamSection
              key={team.id}
              team={team}
              entries={data.accountingDetails.filter(
                (detail) => detail.teamId === team.id,
              )}
            />
          ))}
        </div>
      )}
    </section>
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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // 운영팀은 지원비 하나뿐이다. 프로젝트 팀은 팀지원비·기술지원비.
  const categories =
    team.scope === "team"
      ? ([{ key: "support", label: "지원비" }] as const)
      : ([
          { key: "support", label: "팀지원비" },
          { key: "technical", label: "기술지원비" },
        ] as const);

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
        {data.viewer.canEdit && (
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
          term={team.term}
          team={team}
          onDone={() => setEditing(false)}
        />
      )}
      <div className="nut-team__meters">
        {categories.map(({ key, label }) => {
          const budget =
            key === "support" ? team.supportBudget : team.technicalBudget;
          const used =
            key === "support" ? team.supportSpent : team.technicalSpent;
          return (
            <div key={key} className="nut-team__meter">
              <div className="nut-budget-row__top">
                <span>{label}</span>
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
                label={`${team.name} ${label}`}
              />
              <span className="nut-budget-row__sub">
                {money(used)} / {money(budget)}
              </span>
            </div>
          );
        })}
      </div>
      {open &&
        (entries.length === 0 ? (
          <p className="nut-empty">아직 이 팀으로 지정된 거래가 없습니다.</p>
        ) : (
          <ul className="nut-list nut-team__body">
            {[...entries].reverse().map((entry) => (
              <li key={entry.id} className="nut-list__row">
                <div>
                  <strong>{entry.detail}</strong>
                  <span>
                    {shortDate(entry.date)}
                    {team.scope === "project"
                      ? ` · ${entry.category === "technical" ? "기술지원비" : "팀지원비"}`
                      : ""}
                    {entry.claimant ? ` · ${entry.claimant}` : ""}
                  </span>
                </div>
                <div className="nut-entry__end">
                  <span className="nut-amount">
                    −{entry.amount.toLocaleString("ko-KR")}원
                  </span>
                  <span className="nut-entry__balance">
                    남음 {money(entry.balance)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function TeamForm({
  scope,
  term,
  team,
  onDone,
}: {
  scope: Scope;
  term: Term | "";
  team?: AccountingSummary;
  onDone: () => void;
}) {
  const { data, run } = useNut();
  const [value, setValue] = useState({
    name: team?.name ?? "",
    supportBudget: team?.supportBudget ?? 0,
    technicalBudget: team?.technicalBudget ?? 0,
  });
  const amount = (key: "supportBudget" | "technicalBudget", label: string) => (
    <label>
      {label}
      <InputNumber
        min={0}
        addonAfter="원"
        value={value[key]}
        formatter={(input) =>
          input ? Number(input).toLocaleString("ko-KR") : ""
        }
        parser={(input) => Number((input ?? "").replace(/[^\d]/g, ""))}
        onChange={(input) => setValue({ ...value, [key]: input ?? 0 })}
      />
    </label>
  );
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
              term,
              name: value.name.trim(),
              supportBudget: value.supportBudget,
              technicalBudget: scope === "team" ? 0 : value.technicalBudget,
            }),
          team
            ? `${value.name} 예산을 고쳤습니다.`
            : `${value.name}을 추가했습니다.`,
        );
        if (ok) onDone();
      }}
    >
      <label>
        팀 이름
        <Input
          autoFocus
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
      </label>
      {scope === "team"
        ? amount("supportBudget", "지원비 예산")
        : amount("supportBudget", "팀지원비 예산")}
      {scope === "project" && amount("technicalBudget", "기술지원비 예산")}
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
