import { Button, Input, Select, Table, Tabs, Tag } from "antd";
import { useState } from "react";
import type { Company, Cycle } from "../models/outreach";
import { routes } from "../models/outreach";
import { inactiveStages } from "../models/policy";
import { Status } from "../components/Shared";
export function CompanyList({
  companies,
  cycle,
  onOpen,
  onSearch,
}: {
  companies: Company[];
  cycle: Cycle;
  onOpen: (c: Company) => void;
  onSearch: (fresh: boolean) => void;
}) {
  const [lane, setLane] = useState("all"),
    [stage, setStage] = useState("all"),
    [query, setQuery] = useState(""),
    [route, setRoute] = useState<string>(),
    [owner, setOwner] = useState<string>();
  const [page, setPage] = useState(1);
  const visible = companies.filter(
    (c) =>
      c.stage !== "논의 중" &&
      (lane === "all" ||
        (lane === "list"
          ? ["기업 검토", "관계자 선택"].includes(c.stage)
          : lane === "message"
            ? ["초안 검토", "발송 준비"].includes(c.stage)
            : ["응답 확인", ...inactiveStages].includes(c.stage))) &&
      (stage === "inactive"
        ? inactiveStages.includes(c.stage)
        : stage !== "all"
          ? c.stage === stage
          : lane === "status" || !inactiveStages.includes(c.stage)) &&
      (!query || (c.name + c.product).includes(query)) &&
      (!route || c.route === route) &&
      (!owner || c.owner === owner),
  );
  return (
    <>
      <div className="row section-gap">
        <div>
          <h1>기업 관리</h1>
          <span className="muted">
            수집 → 리스트업 → 메시지 초안·확정 → 상태 관리
          </span>
        </div>
        <div className="row">
          <Tag>{cycle.name}</Tag>
          <Button onClick={() => onSearch(true)}>새 수주 차수 시작</Button>
          <Button type="primary" onClick={() => onSearch(false)}>
            + 새 기업 탐색
          </Button>
        </div>
      </div>
      <section className="surface">
        <Tabs
          activeKey={lane}
          onChange={(v) => {
            setLane(v);
            setStage("all");
            setPage(1);
          }}
          items={[
            ["all", "전체"],
            ["list", "리스트업"],
            ["message", "메시지 초안·확정"],
            ["status", "상태 관리"],
          ].map(([key, label]) => ({ key, label }))}
        />
        <Tabs
          activeKey={stage}
          onChange={(v) => {
            setStage(v);
            setPage(1);
          }}
          items={[
            ["all", "전체"],
            ["기업 검토", "검토 필요"],
            ["관계자 선택", "관계자 선택"],
            ["초안 검토", "초안 검토"],
            ["발송 준비", "발송 준비"],
            ["응답 확인", "응답 확인"],
            ["inactive", "건너뛰기·제외"],
          ].map(([key, label]) => ({ key, label }))}
        />
        <div className="filters">
          <Input.Search
            aria-label="기업 검색"
            placeholder="기업명·서비스명 검색"
            value={query}
            allowClear
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <Select
            aria-label="컨택 경로"
            placeholder="컨택 경로 전체"
            value={route}
            allowClear
            onChange={(v) => {
              setRoute(v);
              setPage(1);
            }}
            options={routes.map((value) => ({ value, label: value }))}
          />
          <Select
            aria-label="담당자"
            placeholder="담당자"
            value={owner}
            allowClear
            onChange={(v) => {
              setOwner(v);
              setPage(1);
            }}
            options={["재욱", "민준"].map((value) => ({ value, label: value }))}
          />
          <Button
            onClick={() => {
              setQuery("");
              setRoute(undefined);
              setOwner(undefined);
              setStage("all");
              setLane("all");
              setPage(1);
            }}
          >
            초기화
          </Button>
        </div>
        <Table<Company>
          rowKey="id"
          dataSource={visible}
          size="middle"
          scroll={{ x: 850 }}
          locale={{ emptyText: "조건에 맞는 기업이 없습니다." }}
          pagination={{
            current: page,
            pageSize: 20,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (n) => `총 ${n}개`,
          }}
          columns={[
            {
              title: "기업",
              render: (_, c) => (
                <>
                  <Button type="link" onClick={() => onOpen(c)}>
                    {c.name}
                  </Button>
                  <div className="meta">
                    {c.domain} · {c.product}
                  </div>
                </>
              ),
            },
            { title: "컨택 경로", dataIndex: "route" },
            {
              title: "다음 할 일",
              render: (_, c) => (
                <>
                  <Status company={c} cycleId={cycle.id} />
                  {c.lastSentCycleId === cycle.id && (
                    <div className="meta">이번 차수 추가 컨택 불가</div>
                  )}
                </>
              ),
            },
            { title: "최근 발송", render: (_, c) => c.lastLabel || "—" },
            { title: "담당자", dataIndex: "owner" },
            {
              title: "",
              render: (_, c) => (
                <Button onClick={() => onOpen(c)}>요약 보기</Button>
              ),
            },
          ]}
        />
      </section>
      <p className="meta">
        가상 데이터 · 실제 발송 없음 · 이 브라우저에만 저장됩니다.
      </p>
    </>
  );
}
