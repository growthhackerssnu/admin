import { Checkbox, Input, InputNumber, Popconfirm, Popover, Segmented, Select } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { claimApi, type ClaimInput } from "../api";
import { defaultDate, expenseCategories, money, shortDate, today, useNut } from "../shared";
import type { Claim, ClaimStatus } from "../types";
import { statusLabel } from "./OverviewView";

type Filter = "todo" | "mine" | ClaimStatus | "all";

// 청구서: 회원은 청구하고 진행 상황을 보고, 총무·회장단은 승인·반려·지급한다.
// 지급하면 거래 내역에 자동으로 기록된다.
export default function ClaimsView() {
  const { data } = useNut();
  const manage = data.viewer.canManageClaims;
  const [filter, setFilter] = useState<Filter>(manage ? "todo" : "mine");
  const [formOpen, setFormOpen] = useState(!manage && !data.claims.some((claim) => claim.mine));

  const matches = (claim: Claim, value: Filter) =>
    value === "all" ||
    (value === "todo" && (claim.status === "review" || claim.status === "approved")) ||
    (value === "mine" && claim.mine) ||
    claim.status === value;
  const count = (value: Filter) => data.claims.filter((claim) => matches(claim, value)).length;
  const filters: Filter[] = manage ? ["todo", "paid", "rejected", "all"] : ["mine", "all"];
  const filterLabel: Record<Filter, string> = {
    todo: "처리할 것",
    mine: "내 청구서",
    review: "검토 중",
    approved: "승인",
    paid: "지급 완료",
    rejected: "반려",
    all: "전체",
  };
  const shown = data.claims.filter((claim) => matches(claim, filter));

  return (
    <div className="nut-claims">
      {formOpen ? (
        <ClaimForm onClose={() => setFormOpen(false)} />
      ) : (
        <div className="nut-claims__intro">
          <p>학회 일로 먼저 결제했다면 영수증 금액을 청구하세요. 총무가 확인 후 계좌로 보내드립니다.</p>
          <Button type="primary" onClick={() => setFormOpen(true)}>
            청구하기
          </Button>
        </div>
      )}

      <div className="nut-toolbar">
        <Segmented
          value={filter}
          options={filters.map((value) => ({ value, label: `${filterLabel[value]} ${count(value)}` }))}
          onChange={(value) => setFilter(value as Filter)}
        />
      </div>

      {shown.length === 0 ? (
        <p className="nut-empty">
          {filter === "todo" ? "처리할 청구서가 없습니다." : filter === "mine" ? "아직 올린 청구서가 없습니다." : "해당하는 청구서가 없습니다."}
        </p>
      ) : (
        <ul className="nut-list nut-claim-list">
          {shown.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimForm({ onClose }: { onClose: () => void }) {
  const { data, run } = useNut();
  const [value, setValue] = useState<Omit<ClaimInput, "amount"> & { amount: number | null }>({
    date: defaultDate(data.period),
    detail: "",
    amount: null,
    bucket: "",
    bankAccount: "",
    prepaid: true,
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const ready = value.detail.trim() && value.amount && value.amount > 0 && value.bucket;

  return (
    <form
      className="nut-panel nut-claim-form"
      aria-label="청구하기"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        setSaving(true);
        const ok = await run(
          () => claimApi.create(data.period.id, { ...value, amount: value.amount! }),
          "청구서를 올렸습니다. 총무가 확인하면 상태가 바뀝니다.",
        );
        setSaving(false);
        if (ok) onClose();
      }}
    >
      <header className="nut-panel__head">
        <h2>청구하기</h2>
      </header>
      <div className="nut-form-grid">
        <label className="nut-form-grid__wide">
          무엇에 쓴 돈인가요?
          <Input
            autoFocus
            placeholder="예: 리크루팅 포스터 인쇄"
            value={value.detail}
            onChange={(event) => setValue({ ...value, detail: event.target.value })}
          />
        </label>
        <label>
          금액
          <InputNumber
            min={0}
            step={1000}
            placeholder="영수증 금액"
            addonAfter="원"
            value={value.amount}
            formatter={(amount) => (amount ? Number(amount).toLocaleString("ko-KR") : "")}
            parser={(amount) => Number((amount ?? "").replace(/[^\d]/g, ""))}
            onChange={(amount) => setValue({ ...value, amount })}
          />
        </label>
        <label>
          쓴 날짜
          <Input type="date" value={value.date} max={today()} onChange={(event) => setValue({ ...value, date: event.target.value })} />
        </label>
        <label>
          예산 항목
          <Select
            showSearch
            placeholder="어느 예산에서?"
            value={value.bucket || undefined}
            options={expenseCategories(data).map((node) => ({ value: node.name, label: node.name }))}
            onChange={(bucket) => setValue({ ...value, bucket })}
          />
        </label>
        <label>
          받을 계좌
          <Input
            placeholder="예: 토스뱅크 1000-0000-0000"
            value={value.bankAccount}
            onChange={(event) => setValue({ ...value, bankAccount: event.target.value })}
          />
          <small>총무·회장단만 볼 수 있습니다.</small>
        </label>
        <label className="nut-form-grid__wide">
          메모 (선택)
          <Input
            placeholder="영수증 위치, 나눠서 결제한 내역 등"
            value={value.note}
            onChange={(event) => setValue({ ...value, note: event.target.value })}
          />
        </label>
        <Checkbox checked={value.prepaid} onChange={(event) => setValue({ ...value, prepaid: event.target.checked })}>
          내 돈으로 먼저 결제했어요 (선결제 후지급)
        </Checkbox>
      </div>
      <div className="nut-form-actions">
        <Button onClick={onClose}>취소</Button>
        <Button type="primary" htmlType="submit" disabled={!ready} loading={saving}>
          청구서 올리기
        </Button>
      </div>
    </form>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const { data, run } = useNut();
  const manage = data.viewer.canManageClaims;
  const uncategorized = claim.bucket === "미분류";
  // 지급일은 총무가 고른 '보낸 날짜' = 거래 내역의 날짜.
  const paidOn = data.ledger.find((entry) => entry.id === claim.ledgerEntryId)?.date;

  return (
    <li className="nut-claim">
      <div className="nut-claim__main">
        <div className="nut-claim__title">
          <strong>{claim.detail}</strong>
          <span className={"nut-status nut-status--" + claim.status}>{statusLabel[claim.status]}</span>
        </div>
        <span className="nut-claim__meta">
          {claim.claimant} · {shortDate(claim.date)} 사용 ·{" "}
          <span className={uncategorized ? "nut-negative" : undefined}>{uncategorized ? "예산 항목 미정" : claim.bucket}</span>
          {claim.source === "Slack" ? " · Slack으로 접수" : ""}
        </span>
        {claim.bankAccount && <span className="nut-claim__meta">입금 계좌 {claim.bankAccount}</span>}
        {claim.note && <span className="nut-claim__meta">메모: {claim.note}</span>}
        {claim.status === "rejected" && claim.rejectReason && (
          <span className="nut-claim__reason">반려 사유: {claim.rejectReason}</span>
        )}
        {claim.status === "paid" && paidOn && <span className="nut-claim__meta">{shortDate(paidOn)} 지급 · 거래 내역에 기록됨</span>}
      </div>
      <div className="nut-claim__side">
        <span className="nut-amount">{money(claim.amount)}</span>
        <div className="nut-claim__actions">
          {manage && (claim.status === "review" || claim.status === "approved") && (
            <>
              <RejectButton claim={claim} />
              {claim.status === "review" && !uncategorized && (
                <Button onClick={() => void run(() => claimApi.approve(claim.id), "승인했습니다.")}>승인</Button>
              )}
              <PayButton claim={claim} />
            </>
          )}
          {manage && claim.status === "rejected" && (
            <Button type="text" onClick={() => void run(() => claimApi.reopen(claim.id), "다시 검토 중으로 돌렸습니다.")}>
              다시 열기
            </Button>
          )}
          {!manage && claim.mine && claim.status === "review" && (
            <Popconfirm
              title="청구를 취소할까요?"
              okText="취소하기"
              cancelText="그대로 두기"
              onConfirm={() => void run(() => claimApi.cancel(claim.id), "청구를 취소했습니다.")}
            >
              <Button type="text">청구 취소</Button>
            </Popconfirm>
          )}
        </div>
      </div>
    </li>
  );
}

function RejectButton({ claim }: { claim: Claim }) {
  const { run } = useNut();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      title="반려 사유"
      content={
        <div className="nut-popover-form">
          <Input.TextArea
            autoFocus
            rows={2}
            placeholder="청구인에게 보이는 사유 (예: 영수증이 없습니다)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            type="primary"
            danger
            disabled={!reason.trim()}
            onClick={async () => {
              if (await run(() => claimApi.reject(claim.id, reason), "반려했습니다.")) setOpen(false);
            }}
          >
            반려하기
          </Button>
        </div>
      }
    >
      <Button type="text" danger>
        반려
      </Button>
    </Popover>
  );
}

function PayButton({ claim }: { claim: Claim }) {
  const { data, run } = useNut();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate(data.period));
  const [bucket, setBucket] = useState(claim.bucket === "미분류" ? "" : claim.bucket);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      title={`${money(claim.amount)} 지급`}
      content={
        <div className="nut-popover-form">
          <label>
            보낸 날짜
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            예산 항목
            <Select
              showSearch
              placeholder="어느 예산에서?"
              value={bucket || undefined}
              options={expenseCategories(data).map((node) => ({ value: node.name, label: node.name }))}
              onChange={setBucket}
            />
          </label>
          <p className="nut-hint">지급 완료로 바꾸고 거래 내역에 지출로 기록합니다.</p>
          <Button
            type="primary"
            disabled={!bucket || !date}
            onClick={async () => {
              if (await run(() => claimApi.pay(claim.id, date, bucket), `${claim.claimant}님에게 ${money(claim.amount)} 지급을 기록했습니다.`))
                setOpen(false);
            }}
          >
            지급 완료
          </Button>
        </div>
      }
    >
      <Button type="primary">지급</Button>
    </Popover>
  );
}
