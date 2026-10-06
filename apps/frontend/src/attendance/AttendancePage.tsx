import {
  App as AntApp,
  Alert,
  Input,
  InputNumber,
  Popconfirm,
  Popover,
  Segmented,
  Select,
  Skeleton,
} from "antd";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { PersonLink } from "../lib/PersonLink";
import { attendanceApi, type AttendanceInput } from "../nut/api";
import { dateLabel, defaultDate, money, today } from "../nut/shared";
import type {
  AttendanceData,
  AttendanceRecord,
  AttendanceType,
  Excuse,
} from "../nut/types";

// /attendance — Slack '출석핑' 워크플로가 쌓은 기록과 사람별 벌점·벌금(예전 시트의 출석체크·벌점벌금 탭).
// 반기는 NUT와 같다. 보기는 전원, 고치기는 회장단·총무·관리자만(서버가 canEdit으로 알려준다).
export default function AttendancePage() {
  const { message } = AntApp.useApp();
  // 반기를 주소에 남겨서 새로고침·링크 공유에도 같은 반기가 열리게 한다. 없으면 서버가 오늘의 반기를 고른다.
  const [periodId, setPeriodId] = useState(
    () => new URLSearchParams(window.location.search).get("period") ?? "",
  );
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    attendanceApi
      .fetch(periodId)
      .then((next) => {
        setData(next);
        const params = new URLSearchParams(window.location.search);
        params.set("period", next.period.id);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?${params}`,
        );
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "출석 기록을 불러오지 못했습니다.",
        ),
      );
  }, [periodId]);

  const save = useCallback(
    async (action: () => Promise<AttendanceData>, success: string) => {
      try {
        setData(await action());
        message.success(success);
        return true;
      } catch (err) {
        message.error(
          err instanceof Error
            ? err.message
            : "저장하지 못했습니다. 다시 시도하세요.",
        );
        return false;
      }
    },
    [message],
  );

  if (error)
    return (
      <Alert
        type="error"
        showIcon
        message="출석 기록을 불러오지 못했습니다"
        description={error}
      />
    );
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;
  const canEdit = data.canEdit;
  const cohortOf = new Map(
    data.roster.map((person) => [person.name, person.cohort]),
  );

  const missing = data.records.filter(
    (record) => record.penalty.needsMinutes,
  ).length;
  return (
    <div className="nut nut-attendance">
      <header className="nut-header">
        <div className="nut-header__period">
          <span className="nut-header__app">출석체크</span>
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
            onChange={setPeriodId}
          />
          <span className="nut-header__dates">
            {data.period.start.replaceAll("-", ".")} –{" "}
            {data.period.end.replaceAll("-", ".")}
          </span>
        </div>
      </header>
      <p className="nut-claims__intro">
        Slack 출석핑 워크플로의 출석체크·'지각했어용' 답변이 여기 쌓입니다. 지각
        비율은 세션 {data.sessionMinutes}분 기준이고, 벌점·벌금 기준은 맨
        아래에서 바꿉니다.
        {canEdit
          ? " 사유가 일부만 인정되면 기록을 눌러 '부분 사유'로 바꾸세요."
          : " 수정은 회장단·총무·관리자만 할 수 있습니다."}
      </p>
      {missing > 0 && (
        <Alert
          className="nut-past-banner"
          type="warning"
          showIcon
          message={`지각 시간이 없는 기록이 ${missing}건 있습니다. 시간을 넣기 전까지 벌점이 매겨지지 않습니다.`}
        />
      )}
      <Summary
        data={data}
        actions={
          canEdit && (
            <ClearPenalties
              data={data}
              onClear={(through) =>
                save(
                  () => attendanceApi.clear(data.period.id, through),
                  `${dateLabel(through)}까지의 벌점·벌금을 초기화했습니다.`,
                )
              }
              onUndo={() =>
                save(
                  () => attendanceApi.undoClear(data.period.id),
                  "마지막 초기화를 되돌렸습니다.",
                )
              }
            />
          )
        }
      />
      <section className="nut-panel" aria-labelledby="attendance-records">
        <header className="nut-panel__head">
          <h2 id="attendance-records">기록</h2>
          {canEdit && (
            <Button onClick={() => setAdding(true)}>기록 추가</Button>
          )}
        </header>
        {adding && (
          <RecordForm
            period={data.period}
            names={data.roster.map((person) => person.name)}
            onSave={(input) =>
              save(
                () => attendanceApi.save(data.period.id, input),
                `${input.name} 기록을 저장했습니다.`,
              )
            }
            onDone={() => setAdding(false)}
          />
        )}
        {data.records.length === 0 ? (
          <p className="nut-empty">이 반기의 출석 기록이 없습니다.</p>
        ) : (
          <ul className="nut-list">
            {data.records.map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                cohort={cohortOf.get(record.name)}
                period={data.period}
                canEdit={canEdit}
                names={data.roster.map((person) => person.name)}
                onSave={(input) =>
                  save(
                    () => attendanceApi.save(data.period.id, input),
                    `${input.name} 기록을 고쳤습니다.`,
                  )
                }
                onRemove={() =>
                  save(
                    () => attendanceApi.remove(data.period.id, record.id),
                    "기록을 지웠습니다.",
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
      <Rules
        data={data}
        canEdit={canEdit}
        onSave={(key, value, label) =>
          save(
            () => attendanceApi.saveRule(data.period.id, key, value),
            `${label} 기준을 바꿨습니다. 벌점이 다시 계산됐습니다.`,
          )
        }
      />
    </div>
  );
}

// 벌점·벌금 기준(반기별). 바꾸면 이 반기의 모든 기록이 새 기준으로 다시 계산된다.
function Rules({
  data,
  canEdit,
  onSave,
}: {
  data: AttendanceData;
  canEdit: boolean;
  onSave: (key: string, value: number, label: string) => Promise<boolean>;
}) {
  return (
    <section className="nut-panel" aria-labelledby="attendance-rules">
      <header className="nut-panel__head">
        <div>
          <h2 id="attendance-rules">벌점·벌금 기준</h2>
          <p className="nut-panel__sub">
            이 반기에만 적용됩니다. 사유(전부 인정)는 벌점이 없습니다. 지각
            비율은 지각 분 ÷ 세션 길이입니다.
          </p>
        </div>
      </header>
      <table className="nut-headcount nut-attendance__table">
        <thead>
          <tr>
            <th scope="col">종류</th>
            <th scope="col">벌점</th>
            <th scope="col">벌금</th>
          </tr>
        </thead>
        <tbody>
          {data.rules.map((rule) => (
            <tr key={rule.id}>
              <th scope="row">{rule.label}</th>
              <td>
                <RuleInput
                  label={`${rule.label} 벌점`}
                  value={rule.points}
                  unit="점"
                  canEdit={canEdit}
                  onSave={(value) =>
                    onSave(`${rule.id}.points`, value, `${rule.label} 벌점`)
                  }
                />
              </td>
              <td>
                <RuleInput
                  label={`${rule.label} 벌금`}
                  value={rule.fine}
                  unit="원"
                  canEdit={canEdit}
                  onSave={(value) =>
                    onSave(`${rule.id}.fine`, value, `${rule.label} 벌금`)
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">세션 길이</th>
            <td colSpan={2}>
              <RuleInput
                label="세션 길이"
                value={data.sessionMinutes}
                unit="분"
                canEdit={canEdit}
                onSave={(value) =>
                  onSave("session-minutes", value, "세션 길이")
                }
              />
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// 입력을 마치면(포커스를 옮기거나 Enter) 저장한다. 설정 탭의 단가 입력과 같은 방식.
function RuleInput({
  label,
  value,
  unit,
  canEdit,
  onSave,
}: {
  label: string;
  value: number;
  unit: string;
  canEdit: boolean;
  onSave: (value: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<number | null>(value);
  useEffect(() => setDraft(value), [value]);
  if (!canEdit)
    return (
      <span className="nut-setting__readonly">
        {value.toLocaleString("ko-KR")}
        {unit}
      </span>
    );
  const commit = () => {
    if (draft === null || draft === value) return;
    void onSave(draft).then((ok) => ok || setDraft(value));
  };
  return (
    <InputNumber
      className="nut-setting__input nut-setting__input--compact"
      aria-label={label}
      min={0}
      step={unit === "원" ? 1000 : 1}
      precision={0}
      value={draft}
      addonAfter={unit}
      formatter={(input) =>
        input === undefined || String(input) === ""
          ? ""
          : Number(input).toLocaleString("ko-KR")
      }
      parser={(input) => Number((input ?? "").replace(/[^\d]/g, ""))}
      onChange={setDraft}
      onBlur={commit}
      onPressEnter={commit}
    />
  );
}

type PersonRow = {
  name: string;
  cohort: string | null;
  points: number;
  fine: number;
  records: AttendanceRecord[];
};

// 사람별 합계를 기수별로 접고 편다. 기록이 없는 학회원(환급 계좌 명단)도 0점으로 보인다.
function Summary({
  data,
  actions,
}: {
  data: AttendanceData;
  actions?: ReactNode;
}) {
  // 벌점 열 머리를 누르면 많은 순 ↔ 적은 순으로 바뀐다.
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const groups = useMemo(() => {
    const byName = new Map<string, PersonRow>(
      data.roster.map((person) => [
        person.name,
        { ...person, points: 0, fine: 0, records: [] },
      ]),
    );
    data.records.forEach((record) => {
      if (record.cleared) return;
      const row = byName.get(record.name) ?? {
        name: record.name,
        cohort: null,
        points: 0,
        fine: 0,
        records: [],
      };
      row.points += record.penalty.points;
      row.fine += record.penalty.fine;
      row.records.push(record);
      byName.set(record.name, row);
    });
    const byCohort = new Map<string, PersonRow[]>();
    byName.forEach((row) => {
      const cohort = row.cohort ?? "기수 미상";
      byCohort.set(cohort, [...(byCohort.get(cohort) ?? []), row]);
    });
    return [...byCohort.entries()]
      .sort(([a], [b]) => (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999))
      .map(([cohort, rows]) => ({
        cohort,
        rows: rows.sort(
          (a, b) =>
            (order === "desc" ? 1 : -1) *
              (b.points - a.points || b.fine - a.fine) ||
            a.name.localeCompare(b.name, "ko"),
        ),
      }));
  }, [data, order]);
  const totalFine = data.records.reduce(
    (sum, record) => sum + (record.cleared ? 0 : record.penalty.fine),
    0,
  );
  return (
    <section className="nut-panel" aria-labelledby="attendance-summary">
      <header className="nut-panel__head">
        <div>
          <h2 id="attendance-summary">벌점·벌금</h2>
          <p className="nut-panel__sub">
            {data.clearedThrough
              ? `${dateLabel(data.clearedThrough)} 초기화 이후 합계`
              : "이 반기 합계"}
            . 벌금 총액 {money(totalFine)}. 기수를 눌러 접고, 기록 수를 눌러
            종류별로 봅니다.
          </p>
        </div>
        {actions}
      </header>
      {groups.map((group) => (
        <details key={group.cohort} className="nut-attendance__cohort" open>
          <summary>
            <strong>{group.cohort}</strong>
            <span>
              {group.rows.length}명 · 벌점{" "}
              {group.rows.reduce((sum, row) => sum + row.points, 0)}점 · 벌금{" "}
              {money(group.rows.reduce((sum, row) => sum + row.fine, 0))}
            </span>
          </summary>
          <table className="nut-headcount nut-attendance__table">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">기록</th>
                <th
                  scope="col"
                  aria-sort={order === "desc" ? "descending" : "ascending"}
                >
                  <button
                    type="button"
                    className="nut-attendance__count"
                    onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
                  >
                    벌점 {order === "desc" ? "↓" : "↑"}
                  </button>
                </th>
                <th scope="col">벌금</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">
                    <PersonLink name={row.name} cohort={row.cohort} />
                  </th>
                  <td>
                    <Breakdown records={row.records} />
                  </td>
                  <td>{row.points}점</td>
                  <td>{money(row.fine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </section>
  );
}

// 벌점 초기화(분기마다). 고른 날짜까지의 기록은 남겨두고 합계에서만 뺀다. 가장 최근 초기화는 되돌릴 수 있다.
function ClearPenalties({
  data,
  onClear,
  onUndo,
}: {
  data: AttendanceData;
  onClear: (through: string) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
}) {
  const [through, setThrough] = useState(today());
  const [open, setOpen] = useState(false);
  return (
    <div className="nut-panel__tools">
      {data.clearedThrough && (
        <Popconfirm
          title="마지막 초기화를 되돌릴까요?"
          description={`${dateLabel(data.clearedThrough)}까지의 기록이 다시 합계에 들어갑니다.`}
          okText="되돌리기"
          cancelText="그대로 두기"
          onConfirm={() => void onUndo()}
        >
          <Button type="text">초기화 되돌리기</Button>
        </Popconfirm>
      )}
      <Popover
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomRight"
        content={
          <form
            className="nut-popover-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (through && (await onClear(through))) setOpen(false);
            }}
          >
            <label>
              이 날짜까지의 기록을 초기화
              <Input
                type="date"
                value={through}
                onChange={(event) => setThrough(event.target.value)}
              />
            </label>
            <p className="nut-hint">
              기록은 지우지 않고 벌점·벌금 합계에서만 뺍니다.
            </p>
            <Button type="primary" danger htmlType="submit" disabled={!through}>
              초기화
            </Button>
          </form>
        }
      >
        <Button danger>벌점 초기화</Button>
      </Popover>
    </div>
  );
}

// 기록 수를 누르면 종류(벌점벌금 탭의 열)별 건수와 벌점·벌금이 펼쳐진다.
function Breakdown({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) return <span className="nut-hint">0건</span>;
  const byLabel = new Map<
    string,
    { count: number; points: number; fine: number }
  >();
  records.forEach(({ penalty }) => {
    const label = penalty.needsMinutes
      ? `${penalty.label}(시간 미입력)`
      : penalty.label;
    const item = byLabel.get(label) ?? { count: 0, points: 0, fine: 0 };
    byLabel.set(label, {
      count: item.count + 1,
      points: item.points + penalty.points,
      fine: item.fine + penalty.fine,
    });
  });
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      content={
        <table className="nut-headcount nut-attendance__breakdown">
          <tbody>
            {[...byLabel.entries()].map(([label, item]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{item.count}건</td>
                <td>{item.points}점</td>
                <td>{money(item.fine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <button type="button" className="nut-attendance__count">
        {records.length}건 ▾
      </button>
    </Popover>
  );
}

function RecordRow({
  record,
  cohort,
  period,
  canEdit,
  names,
  onSave,
  onRemove,
}: {
  record: AttendanceRecord;
  cohort?: string | null;
  period: AttendanceData["period"];
  canEdit: boolean;
  names: string[];
  onSave: (input: AttendanceInput) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <li>
        <RecordForm
          record={record}
          period={period}
          names={names}
          onSave={onSave}
          onRemove={onRemove}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  const { penalty } = record;
  const content = (
    <>
      <span className="nut-entry__main">
        <strong>
          <PersonLink name={record.name} cohort={cohort} /> · {penalty.label}
          {record.minutesLate != null ? ` ${record.minutesLate}분` : ""}
        </strong>
        <span>
          {record.cleared ? "초기화됨 · " : ""}
          {dateLabel(record.date)}
          {record.project ? ` · ${record.project}` : ""}
          {record.note ? ` · ${record.note}` : ""}
          {record.source === "Slack" ? " · Slack" : ""}
        </span>
      </span>
      <span className="nut-entry__end">
        {penalty.needsMinutes ? (
          <span className="nut-status nut-status--review">지각 시간 필요</span>
        ) : (
          <span>
            {penalty.points}점 · {money(penalty.fine)}
          </span>
        )}
      </span>
    </>
  );
  // 이름이 그핵드인 링크라서 줄 전체를 버튼으로 만들지 않고 '수정' 버튼을 따로 둔다.
  return (
    <li>
      <div
        className={
          "nut-entry nut-entry--static" +
          (record.cleared ? " nut-attendance__cleared" : "")
        }
      >
        {content}
        {canEdit && (
          <Button
            type="text"
            size="small"
            onClick={() => setEditing(true)}
            aria-label={`${record.name} 기록 수정`}
          >
            수정
          </Button>
        )}
      </div>
    </li>
  );
}

function RecordForm({
  record,
  period,
  names,
  onSave,
  onRemove,
  onDone,
}: {
  record?: AttendanceRecord;
  period: AttendanceData["period"];
  names: string[];
  onSave: (input: AttendanceInput) => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  onDone: () => void;
}) {
  const [value, setValue] = useState<AttendanceInput>({
    id: record?.id,
    date: record?.date ?? defaultDate(period),
    name: record?.name ?? "",
    project: record?.project ?? "",
    type: record?.type ?? "late",
    excuse: record?.excuse ?? "unexcused",
    minutesLate: record?.minutesLate ?? null,
    note: record?.note ?? "",
  });
  const ready = value.name.trim() && value.date;
  return (
    <form
      className="nut-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (ready && (await onSave(value))) onDone();
      }}
    >
      <label>
        날짜
        <Input
          type="date"
          value={value.date}
          onChange={(event) => setValue({ ...value, date: event.target.value })}
        />
      </label>
      <label>
        이름
        <Select
          showSearch
          value={value.name || undefined}
          placeholder="학회원"
          options={names.map((name) => ({ value: name, label: name }))}
          onChange={(name) => setValue({ ...value, name })}
        />
      </label>
      <label>
        종류
        <Segmented<AttendanceType>
          value={value.type}
          options={[
            { value: "late", label: "지각" },
            { value: "absent", label: "결석" },
            { value: "quest", label: "퀘스트 미제출" },
          ]}
          onChange={(type) => setValue({ ...value, type })}
        />
      </label>
      <label>
        사유
        <Segmented<Excuse>
          value={value.excuse}
          options={[
            { value: "unexcused", label: "무단" },
            { value: "partial", label: "부분 사유" },
            { value: "excused", label: "사유" },
          ]}
          onChange={(excuse) => setValue({ ...value, excuse })}
        />
      </label>
      {value.type === "late" && (
        <label>
          지각 시간(분)
          <InputNumber
            min={0}
            value={value.minutesLate}
            onChange={(minutesLate) =>
              setValue({ ...value, minutesLate: minutesLate ?? null })
            }
          />
        </label>
      )}
      <label>
        프로젝트·세션
        <Input
          value={value.project ?? ""}
          onChange={(event) =>
            setValue({ ...value, project: event.target.value })
          }
        />
      </label>
      <label className="nut-inline-form__wide">
        메모
        <Input
          value={value.note ?? ""}
          onChange={(event) => setValue({ ...value, note: event.target.value })}
        />
      </label>
      <div className="nut-form-actions">
        {record && onRemove && (
          <Popconfirm
            title={`${record.name}의 이 기록을 지울까요?`}
            okText="지우기"
            cancelText="그대로 두기"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              if (await onRemove()) onDone();
            }}
          >
            <Button type="text" danger>
              지우기
            </Button>
          </Popconfirm>
        )}
        <span className="nut-spacer" />
        <Button onClick={onDone}>취소</Button>
        <Button type="primary" htmlType="submit" disabled={!ready}>
          저장
        </Button>
      </div>
    </form>
  );
}
