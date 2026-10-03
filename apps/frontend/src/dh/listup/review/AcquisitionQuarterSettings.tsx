import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import {
  quarterLabel,
  type AcquisitionRound,
  type TargetQuarter,
} from "./contracts";
import type { AcquisitionQuarterApi } from "./acquisitionQuarter";
import { HumanReviewApiError } from "./humanReviewApi";

/** Rendered only after the operations API confirms team-lead/admin access. */
export function AcquisitionQuarterSettings({
  api,
}: {
  api: AcquisitionQuarterApi;
}) {
  const [round, setRound] = useState<AcquisitionRound | null>(null);
  const [quarters, setQuarters] = useState<TargetQuarter[]>([]);
  const [selected, setSelected] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [part, setPart] = useState("1");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Keep the exact body and key when a response is lost; retries must not start a second round.
  const attempts = useRef(new Map<string, string>());
  const lock = useRef(false);
  const { confirm, dialog } = useConfirmation();
  const reload = useCallback(async () => {
    setReady(false);
    const [current, choices] = await Promise.all([
      api.current(),
      api.quarters(),
    ]);
    setRound(current);
    setQuarters(choices);
    setSelected(current?.targetQuarter.id ?? "");
    setReady(true);
  }, [api]);
  const act = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (
        failure instanceof HumanReviewApiError &&
        failure.code === "ROUND_CHANGED"
      ) {
        await reload().catch(() => setReady(false));
        setError(
          "다른 관리자가 수주 분기를 변경했습니다. 현재 설정을 확인한 뒤 다시 적용해주세요.",
        );
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : "수주 분기를 저장하지 못했습니다.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    void reload().catch(() =>
      setError("수주 분기 설정을 불러오지 못했습니다."),
    );
  }, [reload]);
  const keyFor = (signature: string) => {
    if (!attempts.current.has(signature))
      attempts.current.set(signature, crypto.randomUUID());
    return attempts.current.get(signature)!;
  };
  const selectedQuarter = quarters.find((item) => item.id === selected);
  return (
    <section className="uw-ops-section" aria-labelledby="ops-quarter-title">
      {dialog}
      <div className="uw-ops-section-head">
        <div>
          <h2 id="ops-quarter-title">수주 분기</h2>
          <p>신규 발굴·재연락 메시지에 공통으로 적용됩니다.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void act(reload)}
        >
          다시 불러오기
        </Button>
      </div>
      {!ready && !error && (
        <p className="uw-ops-loading" role="status">
          <Spinner /> 수주 분기를 불러오는 중…
        </p>
      )}
      {ready && (
        <>
          <p className="uw-ops-current-quarter">
            현재 ·{" "}
            {round
              ? `${quarterLabel(round.targetQuarter).replace("-Q", "년 ")}분기`
              : "미설정"}
          </p>
          <div className="uw-ops-quarter-controls">
            <Field>
              <FieldLabel htmlFor="ops-quarter" required>
                수주 분기
              </FieldLabel>
              <Select
                value={selected}
                disabled={busy}
                onValueChange={setSelected}
              >
                <SelectTrigger id="ops-quarter" aria-required="true">
                  <SelectValue placeholder="분기 선택" />
                </SelectTrigger>
                <SelectContent position="popper" className="dw-select-content">
                  {quarters.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {quarterLabel(item).replace("-Q", "년 ")}분기
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              disabled={
                busy || !selectedQuarter || selected === round?.targetQuarter.id
              }
              onClick={() =>
                void act(async () => {
                  if (!selectedQuarter) return;
                  const description = round
                    ? "현재 수주 분기가 종료됩니다. 기존 메시지 업무는 읽기 전용으로 전환되고, 발송 후 수주 결과가 미정인 기업은 미확인으로 기록됩니다. 새 수주 분기를 적용할까요?"
                    : "선택한 분기를 팀의 수주 분기로 적용할까요?";
                  if (!(await confirm(description, "수주 분기 적용", "적용")))
                    return;
                  const expected = round?.id ?? null;
                  const signature = JSON.stringify({ selected, expected });
                  const result = await api.set(
                    selected,
                    expected,
                    keyFor(signature),
                  );
                  setRound(result.currentRound);
                  setSelected(result.currentRound.targetQuarter.id);
                  setNotice(
                    result.closedRoundId
                      ? `수주 분기를 변경했습니다. 미확인 전환 ${result.unresolvedCount}건.`
                      : "수주 분기를 설정했습니다.",
                  );
                })
              }
            >
              {busy && <Spinner />} 적용
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setAdding(!adding)}
            >
              분기 추가
            </Button>
          </div>
          {adding && (
            <div className="uw-ops-quarter-controls">
              <Field>
                <FieldLabel htmlFor="ops-quarter-year" required>
                  연도
                </FieldLabel>
                <Input
                  id="ops-quarter-year"
                  type="number"
                  min={2000}
                  max={2100}
                  aria-required="true"
                  value={Number.isFinite(year) ? year : ""}
                  disabled={busy}
                  onChange={(event) => setYear(event.target.valueAsNumber)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ops-quarter-part" required>
                  분기
                </FieldLabel>
                <Select value={part} disabled={busy} onValueChange={setPart}>
                  <SelectTrigger id="ops-quarter-part" aria-required="true">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dw-select-content">
                    {[1, 2, 3, 4].map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {item}분기
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                variant="outline"
                disabled={
                  busy || !Number.isInteger(year) || year < 2000 || year > 2100
                }
                onClick={() =>
                  void act(async () => {
                    const signature = JSON.stringify({ year, part });
                    const registered = await api.register(
                      year,
                      Number(part),
                      keyFor(signature),
                    );
                    setQuarters((previous) =>
                      [
                        ...previous.filter((item) => item.id !== registered.id),
                        registered,
                      ].sort(
                        (a, b) => a.year - b.year || a.quarter - b.quarter,
                      ),
                    );
                    setSelected(registered.id);
                    setAdding(false);
                    setNotice(
                      "분기를 추가했습니다. 적용하면 팀의 수주 분기가 변경됩니다.",
                    );
                  })
                }
              >
                추가
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="uw-ops-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="uw-ops-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
