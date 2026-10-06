import { PersonLink } from "../../lib/PersonLink";
import { Input, Popconfirm } from "antd";
import { useMemo, useState } from "react";
import { AppButton as Button } from "@/components/ui/app-button";
import { refundApi, type RefundAccountInput } from "../api";
import { useNut } from "../shared";
import type { RefundAccount } from "../types";

// 환급 계좌: Slack으로 들어온 청구서에 계좌가 없으면 여기서 청구인의 이메일(없으면 이름)로 찾아 채운다.
// 총무·admin만 이 탭을 본다.
export default function RefundAccountsView() {
  const { data } = useNut();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const accounts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.refundAccounts.filter(
      (account) =>
        !term ||
        [account.name, account.cohort, account.email].some((value) =>
          value?.toLowerCase().includes(term),
        ),
    );
  }, [data.refundAccounts, query]);

  return (
    <div className="nut-accounts">
      <p className="nut-claims__intro">
        Slack 청구서에 계좌가 없으면 청구인의 Slack 이메일로, 그것도 없으면
        이름으로 여기서 찾아 채웁니다. 총무·관리자만 볼 수 있습니다.
      </p>
      <div className="nut-toolbar">
        <Input.Search
          allowClear
          className="nut-toolbar__search"
          placeholder="이름, 기수, 이메일로 찾기"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="nut-spacer" />
        <Button onClick={() => setAdding(true)}>계좌 추가</Button>
      </div>
      {adding && <AccountForm onDone={() => setAdding(false)} />}
      {accounts.length === 0 ? (
        <p className="nut-empty">
          {query ? "찾는 사람이 없습니다." : "등록된 환급 계좌가 없습니다."}
        </p>
      ) : (
        <div className="nut-panel nut-accounts__table-wrap">
          <table className="nut-accounts__table">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">기수</th>
                <th scope="col">Slack 이메일</th>
                <th scope="col">환급 계좌</th>
                <th scope="col">
                  <span className="nut-visually-hidden">관리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AccountRow({ account }: { account: RefundAccount }) {
  const { data, run } = useNut();
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <tr>
        <td colSpan={5}>
          <AccountForm account={account} onDone={() => setEditing(false)} />
        </td>
      </tr>
    );
  return (
    <tr>
      <th scope="row">
        <PersonLink name={account.name} cohort={account.cohort} />
      </th>
      <td>{account.cohort ?? "−"}</td>
      <td className="nut-accounts__email">
        {account.email ?? <span className="nut-hint">이메일 없음</span>}
      </td>
      <td className="nut-accounts__bank">{account.bankAccount}</td>
      <td className="nut-accounts__actions">
        <Button type="text" size="small" onClick={() => setEditing(true)}>
          수정
        </Button>
        <Popconfirm
          title={`${account.name} 계좌를 지울까요?`}
          okText="지우기"
          cancelText="그대로 두기"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            void run(
              () => refundApi.remove(data.period.id, account.id),
              `${account.name} 계좌를 지웠습니다.`,
            )
          }
        >
          <Button type="text" size="small" danger>
            지우기
          </Button>
        </Popconfirm>
      </td>
    </tr>
  );
}

function AccountForm({
  account,
  onDone,
}: {
  account?: RefundAccount;
  onDone: () => void;
}) {
  const { data, run } = useNut();
  const [value, setValue] = useState<RefundAccountInput>({
    id: account?.id,
    name: account?.name ?? "",
    cohort: account?.cohort ?? "",
    email: account?.email ?? "",
    bankAccount: account?.bankAccount ?? "",
  });
  const ready = value.name.trim() && value.bankAccount.trim();
  return (
    <form
      className="nut-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        const ok = await run(
          () => refundApi.save(data.period.id, value),
          `${value.name} 계좌를 저장했습니다.`,
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
      </label>
      <label>
        기수
        <Input
          placeholder="예: 20기"
          value={value.cohort ?? ""}
          onChange={(event) =>
            setValue({ ...value, cohort: event.target.value })
          }
        />
      </label>
      <label>
        Slack 이메일
        <Input
          placeholder="Slack에 쓰는 이메일"
          value={value.email ?? ""}
          onChange={(event) =>
            setValue({ ...value, email: event.target.value })
          }
        />
      </label>
      <label className="nut-inline-form__wide">
        환급 계좌
        <Input
          placeholder="예: 토스뱅크 1000-0000-0000"
          value={value.bankAccount}
          onChange={(event) =>
            setValue({ ...value, bankAccount: event.target.value })
          }
        />
      </label>
      <div className="nut-form-actions">
        {account && (
          <Popconfirm
            title={`${account.name} 계좌를 지울까요?`}
            okText="지우기"
            cancelText="그대로 두기"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              if (
                await run(
                  () => refundApi.remove(data.period.id, account.id),
                  "계좌를 지웠습니다.",
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
        <Button type="primary" htmlType="submit" disabled={!ready}>
          저장
        </Button>
      </div>
    </form>
  );
}
