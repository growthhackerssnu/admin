import { useState } from "react";
import { WorkspaceTable } from "@/components/ui/workspace-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { WorkspaceCombobox } from "@/components/ui/workspace-combobox";
import { WorkspaceError } from "@/components/ui/workspace-error";
import { WorkspaceDisclosure } from "@/components/ui/workspace-disclosure";
import { WorkspaceStatus } from "@/components/ui/workspace-status";
import { ListFilter } from "@/components/ui/list-filter";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search } from "lucide-react";
import { toast } from "sonner";
import "./workspace.css";
import "./data-preview.css";

const companies = [
  {
    id: "morningloop",
    name: "모닝루프",
    description: "팀의 반복 업무를 자동화하는 B2B 서비스",
    status: "결과 미기록",
  },
  {
    id: "thevc",
    name: "더브이씨",
    description: "기업·투자 정보 서비스",
    status: "진행 중",
  },
  {
    id: "flowdata",
    name: "플로우데이터",
    description:
      "긴 설명도 표의 열 너비를 유지하고 정해진 영역 안에서 줄바꿈합니다. 기업 정보와 판단 근거를 길게 기록한 예시입니다.",
    status: "검토 필요",
  },
  {
    id: "supercent",
    name: "슈퍼센트",
    description: "모바일 게임 퍼블리셔",
    status: "완료",
  },
];

export function DataPreview() {
  const [state, setState] = useState("ready");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const filtered = companies.filter((company) =>
    `${company.name} ${company.description}`.includes(query),
  );
  const rows = filtered.slice((page - 1) * 3, page * 3);
  return (
    <section id="data-components" className="ds-workspace ds-data-preview">
      <p className="ds-overline">Data components & feedback</p>
      <h2 className="ds-headline-5">표·기업 선택·피드백</h2>
      <p className="ds-body-2 ds-muted">
        운영 화면과 같은 공통 컴포넌트입니다. 아래 자료는 예시이며 저장하지
        않습니다.
      </p>
      <div className="ds-data-demo-table">
        <div className="ds-data-demo-tools">
          <InputGroup className="ds-data-demo-search">
            <InputGroupAddon>
              <Search size={16} />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="표 예시 기업 검색"
              placeholder="기업명 또는 설명 검색"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </InputGroup>
          <ListFilter
            label="표 상태 예시"
            value={state}
            onChange={(value) => {
              setState(value);
              setPage(1);
            }}
            options={[
              { value: "ready", label: "정상" },
              { value: "loading", label: "불러오는 중" },
              { value: "empty", label: "빈 결과" },
              { value: "error", label: "조회 오류" },
            ]}
          />
        </div>
        {state === "error" && (
          <WorkspaceError
            message="자료를 불러오지 못했습니다."
            onRetry={() => setState("ready")}
          />
        )}
        <WorkspaceTable
          caption="기업 이력 표 예시"
          columns={[
            { key: "company", label: "기업" },
            { key: "description", label: "설명" },
            { key: "status", label: "상태" },
          ]}
          loading={state === "loading"}
          empty={state === "empty" || state === "error" || !rows.length}
          emptyTitle={
            state === "error" ? "조회 결과 없음" : "아직 이력이 없습니다."
          }
        >
          {rows.map((company) => (
            <TableRow
              key={company.id}
              data-clickable="true"
              data-state={selected === company.id ? "selected" : undefined}
              onClick={() => setSelected(company.id)}
            >
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(company.id)}
                >
                  {company.name}
                </Button>
              </TableCell>
              <TableCell>{company.description}</TableCell>
              <TableCell>
                <WorkspaceStatus
                  tone={
                    company.status === "완료"
                      ? "success"
                      : company.status === "진행 중"
                        ? "info"
                        : "neutral"
                  }
                >
                  {company.status}
                </WorkspaceStatus>
              </TableCell>
            </TableRow>
          ))}
        </WorkspaceTable>
        <DataTablePagination
          summary={
            state === "ready"
              ? filtered.length
                ? `${(page - 1) * 3 + 1}–${Math.min(page * 3, filtered.length)} / ${filtered.length}`
                : "0개"
              : state === "loading"
                ? "불러오는 중"
                : "0개"
          }
          canPrevious={page > 1 && state === "ready"}
          canNext={page * 3 < filtered.length && state === "ready"}
          pending={state === "loading"}
          onPrevious={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
        />
      </div>
      <div className="ds-component-grid">
        <div className="ds-demo">
          <h3>Combobox · Command + Popover</h3>
          <Field>
            <FieldLabel htmlFor="ds-company-picker">기업 검색 선택</FieldLabel>
            <WorkspaceCombobox
              id="ds-company-picker"
              value={selected}
              onChange={setSelected}
              options={companies.map((company) => ({
                value: company.id,
                label: company.name,
                keywords: [company.description],
              }))}
              placeholder="기업 선택"
              searchLabel="기업 검색 예시"
            />
          </Field>
        </div>
        <div className="ds-demo">
          <h3>Collapsible · 저장된 내용</h3>
          <WorkspaceDisclosure label="당시 메시지">
            <strong>산학협력 제안</strong>
            <p>발송 당시 제목과 본문을 필요할 때 열어봅니다.</p>
          </WorkspaceDisclosure>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toast.success("저장 알림 예시입니다.")}
          >
            Sonner 알림 보기
          </Button>
        </div>
      </div>
    </section>
  );
}
