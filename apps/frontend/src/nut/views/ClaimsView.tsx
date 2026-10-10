import { PersonLink } from "../../lib/PersonLink";
import { Input, Popover, Segmented, Select } from "antd";
import { useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { claimApi } from "../api";
import {
  defaultDate,
  defaultTeamId,
  expenseCategories,
  money,
  shortDate,
  teamsFor,
  useNut,
} from "../shared";
import type { Claim, ClaimStatus } from "../types";
import { statusLabel } from "./OverviewView";

type Filter = "todo" | "mine" | ClaimStatus | "all";

// 청구서: Slack 청구서 워크플로로 들어온 청구를 총무가 승인·반려·지급한다.
// 지급하면 거래 내역에 자동으로 기록된다. 다른 회원은 진행 상황만 본다.
// 법인카드 결제는 돌려줄 돈 없이 기록만 하고, 개인 카드 결제는 영수증이 있는 Slack 스레드를 잇는다.
export default function ClaimsView() {
  const { data } = useNut();
  const manage = data.viewer.canEdit;
  const [filter, setFilter] = useState<Filter>(manage ? "todo" : "mine");

  const matches = (claim: Claim, value: Filter) =>
    value === "all" ||
    (value === "todo" &&
      (claim.status === "review" || claim.status === "approved")) ||
    (value === "mine" && claim.mine) ||
    claim.status === value;
  const count = (value: Filter) =>
    data.claims.filter((claim) => matches(claim, value)).length;
  const filters: Filter[] = manage
    ? ["todo", "paid", "rejected", "all"]
    : ["mine", "all"];
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
      <p className="nut-claims__intro">
        청구는 Slack의 청구서 워크플로로 올립니다. 올라온 청구서는 여기서{" "}
        {manage ? "확인하고 승인·지급합니다." : "진행 상황을 볼 수 있습니다."}
      </p>

      <div className="nut-toolbar">
        <Segmented
          value={filter}
          options={filters.map((value) => ({
            value,
            label: `${filterLabel[value]} ${count(value)}`,
          }))}
          onChange={(value) => setFilter(value as Filter)}
        />
      </div>

      {shown.length === 0 ? (
        <p className="nut-empty">
          {filter === "todo"
            ? "처리할 청구서가 없습니다."
            : filter === "mine"
              ? "아직 올린 청구서가 없습니다. Slack 워크플로로 올린 청구서가 여기 보입니다."
              : "해당하는 청구서가 없습니다."}
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

function ClaimRow({ claim }: { claim: Claim }) {
  const { data, run } = useNut();
  const manage = data.viewer.canEdit;
  const uncategorized = claim.bucket === "미분류";
  // 지급일은 총무가 고른 '보낸 날짜' = 거래 내역의 날짜.
  const paidOn = data.ledger.find(
    (entry) => entry.id === claim.ledgerEntryId,
  )?.date;

  return (
    <li className="nut-claim">
      <div className="nut-claim__main">
        <div className="nut-claim__title">
          <strong>{claim.detail}</strong>
          <span className={"nut-status nut-status--" + claim.status}>
            {statusLabel[claim.status]}
          </span>
        </div>
        <span className="nut-claim__meta">
          <PersonLink name={claim.claimant} /> · {shortDate(claim.date)} 사용 ·{" "}
          <span className={uncategorized ? "nut-negative" : undefined}>
            {uncategorized ? "예산 항목 미정" : claim.bucket}
          </span>
          {claim.source === "Slack" ? " · Slack으로 접수" : ""}
        </span>
        <span className="nut-claim__meta">
          {claim.prepaid ? "개인 카드 · 돌려줄 돈" : "법인카드"}
          {claim.slackLink ? (
            <>
              {" · "}
              <a href={claim.slackLink} target="_blank" rel="noreferrer">
                Slack 스레드
              </a>
            </>
          ) : (
            claim.prepaid && (
              <span className="nut-negative"> · 영수증 스레드 없음</span>
            )
          )}
        </span>
        {claim.prepaid && claim.bankAccount && (
          <span className="nut-claim__meta">입금 계좌 {claim.bankAccount}</span>
        )}
        {claim.note && (
          <span className="nut-claim__meta">메모: {claim.note}</span>
        )}
        {claim.status === "rejected" && claim.rejectReason && (
          <span className="nut-claim__reason">
            반려 사유: {claim.rejectReason}
          </span>
        )}
        {claim.status === "paid" && paidOn && (
          <span className="nut-claim__meta">
            {shortDate(paidOn)} {claim.prepaid ? "지급" : "결제"} · 거래 내역에
            기록됨
          </span>
        )}
      </div>
      <div className="nut-claim__side">
        <span className="nut-amount">{money(claim.amount)}</span>
        <div className="nut-claim__actions">
          {manage &&
            (claim.status === "review" || claim.status === "approved") && (
              <>
                <RejectButton claim={claim} />
                {claim.status === "review" && !uncategorized && (
                  <Button
                    onClick={() =>
                      void run(
                        () => claimApi.approve(claim.id),
                        "승인했습니다.",
                      )
                    }
                  >
                    승인
                  </Button>
                )}
                <PayButton claim={claim} />
              </>
            )}
          {manage && claim.status === "rejected" && (
            <Button
              type="text"
              onClick={() =>
                void run(
                  () => claimApi.reopen(claim.id),
                  "다시 검토 중으로 돌렸습니다.",
                )
              }
            >
              다시 열기
            </Button>
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
              if (
                await run(
                  () => claimApi.reject(claim.id, reason),
                  "반려했습니다.",
                )
              )
                setOpen(false);
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
  const [bucket, setBucket] = useState(
    claim.bucket === "미분류" ? "" : claim.bucket,
  );
  const [teamId, setTeamId] = useState<string | undefined>(
    defaultTeamId(data, claim.bucket),
  );
  const teams = teamsFor(data, bucket);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      title={`${money(claim.amount)} ${claim.prepaid ? "지급" : "기록"}`}
      content={
        <div className="nut-popover-form">
          <label>
            {claim.prepaid ? "보낸 날짜" : "결제한 날짜"}
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            예산 항목
            <Select
              showSearch
              placeholder="어느 예산에서?"
              value={bucket || undefined}
              options={expenseCategories(data).map((node) => ({
                value: node.name,
                label: node.name,
              }))}
              onChange={(value) => {
                setBucket(value);
                setTeamId(defaultTeamId(data, value));
              }}
            />
          </label>
          {teams.length > 0 && (
            <label>
              어느 팀 돈인가요?
              <Select
                placeholder="팀 고르기"
                value={teamId}
                options={teams.map((team) => ({
                  value: team.id,
                  label: team.name,
                }))}
                onChange={setTeamId}
              />
            </label>
          )}
          <p className="nut-hint">
            {claim.prepaid
              ? "지급 완료로 바꾸고 거래 내역에 지출로 기록합니다."
              : "법인카드 결제라 돌려줄 돈은 없습니다. 거래 내역에 지출로 기록합니다."}
          </p>
          <Button
            type="primary"
            disabled={!bucket || !date || (teams.length > 0 && !teamId)}
            onClick={async () => {
              if (
                await run(
                  () => claimApi.pay(claim.id, date, bucket, teamId),
                  claim.prepaid
                    ? `${claim.claimant}님에게 ${money(claim.amount)} 지급을 기록했습니다.`
                    : `법인카드 ${money(claim.amount)} 결제를 기록했습니다.`,
                )
              )
                setOpen(false);
            }}
          >
            {claim.prepaid ? "지급 완료" : "기록"}
          </Button>
        </div>
      }
    >
      <Button type="primary">{claim.prepaid ? "지급" : "기록"}</Button>
    </Popover>
  );
}
