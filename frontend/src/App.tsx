import {
  Alert,
  App as AntApp,
  Button,
  Drawer,
  Modal,
  Select,
  Skeleton,
  Tag,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OutreachRepository } from "./services/outreachRepository";
import type { Scenario } from "./models/outreach";
import { useWorkspace } from "./hooks/useWorkspace";
import { CompanyList } from "./pages/CompanyList";
import { CompanyDetail } from "./pages/CompanyDetail";
import { History, Status } from "./components/Shared";
import { SearchDialog } from "./components/SearchDialog";
export default function App({
  repository,
  scenario,
  onScenario,
}: {
  repository: OutreachRepository;
  scenario: Scenario;
  onScenario: (value: Scenario) => void;
}) {
  const controller = useWorkspace(repository);
  const { data, loading, busy, error, templates } = controller;
  const [selected, setSelected] = useState<string>(),
    [detail, setDetail] = useState(false),
    [panel, setPanel] = useState(false),
    [settings, setSettings] = useState(false);
  const [search, setSearch] = useState<{ fresh: boolean; startedAt: string }>();
  const dirty = useRef(false);
  const scroll = useRef(0);
  const { modal, message } = AntApp.useApp();
  useEffect(() => {
    if (error) void message.error({ content: error, duration: 6 });
  }, [error, message]);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  function guard(fn: () => void) {
    if (busy) return;
    if (dirty.current)
      modal.confirm({
        title: "저장하지 않은 변경을 버릴까요?",
        content: "현재 입력은 저장되지 않았습니다.",
        okText: "변경 버리기",
        cancelText: "계속 편집",
        onOk: () => {
          dirty.current = false;
          fn();
        },
      });
    else fn();
  }
  const c = data?.companies.find((x) => x.id === selected);
  const cycle = data?.cycles.at(-1);
  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 이동
      </a>
      <header className="row">
        <div className="brand">
          대협 어드민 <span className="meta">GROWTHHACKERS</span>
        </div>
        <div className="row">
          <Tag>개발용 샘플 · 실제 발송 없음</Tag>
          <Button onClick={() => setSettings(true)}>운영·개발 설정</Button>
          <span>재욱 (샘플)</span>
        </div>
      </header>
      <main id="main">
        {error && (
          <Alert
            className="feedback"
            role="alert"
            type="error"
            showIcon
            message={error}
            description="실패한 저장은 반영되지 않았습니다. 입력을 보존한 채 다시 시도할 수 있습니다."
            action={
              <Button
                disabled={busy}
                onClick={() => guard(() => void controller.reload())}
              >
                다시 불러오기
              </Button>
            }
          />
        )}{" "}
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : data && cycle && templates ? (
          <fieldset disabled={busy} aria-busy={busy}>
            {detail && c && (
              <CompanyDetail
                key={c.id}
                company={c}
                cycle={cycle}
                templates={templates}
                busy={busy}
                onDirtyChange={onDirtyChange}
                guard={guard}
                onBack={() =>
                  guard(() => {
                    setDetail(false);
                    setTimeout(() => window.scrollTo(0, scroll.current), 0);
                  })
                }
                execute={async (command) => {
                  const ok = await controller.execute(c.id, c.version, command);
                  if (ok) void message.success("저장했습니다.");
                  return ok;
                }}
              />
            )}
            <div hidden={detail && !!c}>
              <CompanyList
                companies={data.companies}
                cycle={cycle}
                onOpen={(item) => {
                  setSelected(item.id);
                  setPanel(true);
                }}
                onSearch={(fresh) =>
                  setSearch({ fresh, startedAt: new Date().toISOString() })
                }
              />
            </div>
          </fieldset>
        ) : (
          !error && <Alert message="표시할 데이터가 없습니다." />
        )}
      </main>
      <Drawer
        title="기업 요약"
        open={panel}
        width={480}
        onClose={() => setPanel(false)}
        footer={
          <Button
            type="primary"
            block
            onClick={() => {
              scroll.current = window.scrollY;
              setPanel(false);
              setDetail(true);
              window.scrollTo(0, 0);
            }}
          >
            전체 상세 열기 →
          </Button>
        }
      >
        {c && cycle && (
          <div className="stack">
            <h1>{c.name}</h1>
            <p className="muted">{c.product}</p>
            <div>
              <Tag>{c.route}</Tag>
              <Status company={c} cycleId={cycle.id} />
            </div>
            <p>{c.reason}</p>
            <History company={c} />
          </div>
        )}
      </Drawer>
      {search && (
        <SearchDialog
          {...search}
          busy={busy}
          onClose={() => setSearch(undefined)}
          onSearch={controller.search}
        />
      )}
      <Modal
        title="운영·개발 설정"
        open={settings}
        onCancel={() => setSettings(false)}
        footer={<Button onClick={() => setSettings(false)}>닫기</Button>}
      >
        <div className="stack">
          <Alert
            type="info"
            message="샘플 모드만 제공됩니다. 인증·실제 발송·백엔드는 미연결입니다."
          />
          <p>
            현재 차수: {cycle?.name || "불러오기 전"}
            <br />
            시작:{" "}
            {cycle?.startedAt
              ? new Date(cycle.startedAt).toLocaleString("ko-KR")
              : "미기록"}
          </p>
          <p>
            동일 차수 무응답 기업 추가 컨택 금지
            <br />
            지정 템플릿: 모든 경로 미연결
            <br />
            수주 확정·Notion 연결: 미정
          </p>
          <label>
            개발 시나리오
            <Select
              style={{ width: "100%" }}
              aria-label="개발 시나리오"
              value={scenario}
              disabled={busy}
              onChange={(v) =>
                guard(() => {
                  setDetail(false);
                  setPanel(false);
                  setSelected(undefined);
                  setSearch(undefined);
                  onScenario(v);
                })
              }
              options={[
                ["normal", "정상"],
                ["slow", "느린 요청"],
                ["empty", "빈 목록"],
                ["read-error", "조회 실패"],
                ["save-error", "저장 실패"],
                ["forbidden", "권한 없음"],
              ].map(([value, label]) => ({ value, label }))}
            />
          </label>
          <Button
            danger
            disabled={busy}
            onClick={() =>
              modal.confirm({
                title: "개발용 데이터를 초기화할까요?",
                content:
                  "이 프론트의 샘플 편집과 발송 기록만 초기화합니다. 기존 목업 저장 데이터는 그대로 남습니다.",
                okText: "초기화",
                cancelText: "취소",
                onOk: async () => {
                  if (await controller.reset()) {
                    setSelected(undefined);
                    setDetail(false);
                    setPanel(false);
                    setSettings(false);
                  }
                },
              })
            }
          >
            샘플 데이터 초기화
          </Button>
        </div>
      </Modal>
    </>
  );
}
