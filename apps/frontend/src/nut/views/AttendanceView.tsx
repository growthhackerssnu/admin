import {
  App as AntApp,
  Alert,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { attendanceApi, type AttendanceInput } from "../api";
import { dateLabel, defaultDate, money, useNut } from "../shared";
import type {
  AttendanceData,
  AttendanceRecord,
  AttendanceType,
  Excuse,
} from "../types";

// 출석체크: Slack '출석핑' 워크플로가 쌓은 기록과 사람별 벌점·벌금(예전 시트의 출석체크·벌점벌금 탭).
// 보기는 전원, 고치기는 회장단·총무·관리자만.
export default function AttendanceView() {
  const { data: finance } = useNut();
  const { message } = AntApp.useApp();
  const periodId = finance.period.id;
  const canEdit = finance.viewer.canEditAttendance;
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    attendanceApi
      .fetch(periodId)
      .then(setData)
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

  const missing = data.records.filter(
    (record) => record.penalty.needsMinutes,
  ).length;
  return (
    <div className="nut-attendance">
      <p className="nut-claims__intro">
        Slack 출석핑 워크플로의 출석체크·'지각했어용' 답변이 여기 쌓입니다. 지각
        비율은 세션 {data.sessionMinutes / 60}시간 기준입니다.
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
      <Summary data={data} />
      <section className="nut-panel" aria-labelledby="attendance-records">
        <header className="nut-panel__head">
          <h2 id="attendance-records">기록</h2>
          {canEdit && (
            <Button onClick={() => setAdding(true)}>기록 추가</Button>
          )}
        </header>
        {adding && (
          <RecordForm
            names={data.roster.map((person) => person.name)}
            onSave={(input) =>
              save(
                () => attendanceApi.save(periodId, input),
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
                canEdit={canEdit}
                names={data.roster.map((person) => person.name)}
                onSave={(input) =>
                  save(
                    () => attendanceApi.save(periodId, input),
                    `${input.name} 기록을 고쳤습니다.`,
                  )
                }
                onRemove={() =>
                  save(
                    () => attendanceApi.remove(periodId, record.id),
                    "기록을 지웠습니다.",
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// 사람별 합계. 기록이 없는 학회원(환급 계좌 명단)도 0점으로 보인다.
function Summary({ data }: { data: AttendanceData }) {
  const rows = useMemo(() => {
    const byName = new Map(
      data.roster.map((person) => [
        person.name,
        { ...person, points: 0, fine: 0, count: 0 },
      ]),
    );
    data.records.forEach((record) => {
      const row = byName.get(record.name) ?? {
        name: record.name,
        cohort: null,
        points: 0,
        fine: 0,
        count: 0,
      };
      row.points += record.penalty.points;
      row.fine += record.penalty.fine;
      row.count += 1;
      byName.set(record.name, row);
    });
    return [...byName.values()].sort(
      (a, b) =>
        b.points - a.points ||
        b.fine - a.fine ||
        a.name.localeCompare(b.name, "ko"),
    );
  }, [data]);
  const totalFine = rows.reduce((sum, row) => sum + row.fine, 0);
  return (
    <section className="nut-panel" aria-labelledby="attendance-summary">
      <header className="nut-panel__head">
        <div>
          <h2 id="attendance-summary">벌점·벌금</h2>
          <p className="nut-panel__sub">
            이 반기 합계. 벌금 총액 {money(totalFine)}
          </p>
        </div>
      </header>
      <table className="nut-headcount nut-attendance__table">
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">기수</th>
            <th scope="col">기록</th>
            <th scope="col">벌점</th>
            <th scope="col">벌금</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td>{row.cohort ?? "—"}</td>
              <td>{row.count}건</td>
              <td>{row.points}점</td>
              <td>{money(row.fine)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RecordRow({
  record,
  canEdit,
  names,
  onSave,
  onRemove,
}: {
  record: AttendanceRecord;
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
          {record.name} · {penalty.label}
          {record.minutesLate != null ? ` ${record.minutesLate}분` : ""}
        </strong>
        <span>
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
  return (
    <li>
      {canEdit ? (
        <button
          type="button"
          className="nut-entry"
          onClick={() => setEditing(true)}
          aria-label={`${record.name} 기록 수정`}
        >
          {content}
        </button>
      ) : (
        <div className="nut-entry nut-entry--static">{content}</div>
      )}
    </li>
  );
}

function RecordForm({
  record,
  names,
  onSave,
  onRemove,
  onDone,
}: {
  record?: AttendanceRecord;
  names: string[];
  onSave: (input: AttendanceInput) => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  onDone: () => void;
}) {
  const { data } = useNut();
  const [value, setValue] = useState<AttendanceInput>({
    id: record?.id,
    date: record?.date ?? defaultDate(data.period),
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
