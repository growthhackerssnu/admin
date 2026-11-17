import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceError } from "@/components/ui/workspace-error";
import { WorkspaceStatus } from "@/components/ui/workspace-status";
import "@/design-system/globals.css";
import "@/design-system/workspace.css";
import { AcquisitionQuarterSettings } from "./AcquisitionQuarterSettings";
import type { AssignmentMember, OperationsSummary } from "./liveRepository";
import { MessageTemplateSettings } from "./MessageTemplateSettings";
import type { MessageTemplateData, SenderInfo } from "./messageTemplates";
import { QueueAssignmentSettings } from "./QueueAssignmentSettings";
import type { SettingsRepository } from "./settingsRepository";
import "./operations.css";

export const settingsSections = [
  { value: "quarter", label: "수주 분기" },
  { value: "queue", label: "검토 큐와 배정" },
  { value: "templates", label: "메일 양식" },
  { value: "sender", label: "발신 정보" },
] as const;
type SectionValue = (typeof settingsSections)[number]["value"];
export const settingsSection = (value: string | null): SectionValue =>
  settingsSections.find((item) => item.value === value)?.value ?? "quarter";

const message = (failure: unknown, fallback: string) =>
  failure instanceof Error && failure.message ? failure.message : fallback;

function SenderInfoSettings({ sender }: { sender: SenderInfo }) {
  const rows = [
    {
      label: "팀장 이름",
      value: sender.leadName,
      missing:
        "노션 명단에서 대외협력 팀장을 찾지 못했습니다. 노션 명단을 채우면 동기화됩니다.",
    },
    {
      label: "팀장 전화번호",
      value: sender.leadPhone,
      missing:
        "노션 명단에 전화번호가 없습니다. 노션 명단을 채우면 동기화됩니다.",
    },
    { label: "학회 메일", value: sender.email, missing: "" },
  ];
  return (
    <section className="uw-ops-section" aria-labelledby="uw-sender-title">
      <div className="uw-ops-section-head">
        <div>
          <h2 id="uw-sender-title">발신 정보</h2>
          <p>
            메일 양식의 자동 입력에 쓰는 값입니다. 노션 명단에서 가져오며 이
            화면에서는 고칠 수 없습니다.
          </p>
        </div>
      </div>
      <dl className="uw-sender">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              {row.value ? (
                row.value
              ) : (
                <>
                  <WorkspaceStatus tone="warning">없음</WorkspaceStatus>
                  <span role="alert">{row.missing}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 대외협력 설정. 관리자와 대외협력 팀장만 내용을 본다(서버의 canManage 기준). */
export function SettingsPage({ repository }: { repository: SettingsRepository }) {
  const [params, setParams] = useSearchParams();
  const section = settingsSection(params.get("section"));
  const [operations, setOperations] = useState<{
    summary: OperationsSummary;
    members: AssignmentMember[];
  } | null>(null);
  const [error, setError] = useState("");
  const [templateData, setTemplateData] = useState<MessageTemplateData | null>(
    null,
  );
  const [templateError, setTemplateError] = useState("");
  const reloadOperations = useCallback(async () => {
    setOperations(await repository.loadOperations());
  }, [repository]);
  const reloadTemplates = useCallback(async () => {
    setTemplateData(await repository.messageTemplates.load());
  }, [repository]);
  const loadTemplates = useCallback(() => {
    setTemplateError("");
    void reloadTemplates().catch((failure) =>
      setTemplateError(message(failure, "메일 양식을 불러오지 못했습니다.")),
    );
  }, [reloadTemplates]);
  useEffect(() => {
    void reloadOperations().catch((failure) =>
      setError(message(failure, "설정을 불러오지 못했습니다.")),
    );
  }, [reloadOperations]);
  const canManage = operations?.summary.canManage === true;
  useEffect(() => {
    if (canManage) loadTemplates();
  }, [canManage, loadTemplates]);

  const templateFallback = templateError ? (
    <WorkspaceError message={templateError} onRetry={loadTemplates} />
  ) : (
    <p className="uw-ops-loading" role="status">
      <Spinner /> 메일 양식을 불러오는 중…
    </p>
  );
  return (
    <main className="ds-workspace uw-ops uw-settings">
      <header className="uw-ops-head">
        <Link to={{ search: "" }}>
          <ArrowLeft size={16} /> 기업 검토
        </Link>
      </header>
      <div className="uw-ops-body">
        <div className="uw-ops-intro">
          <p>대외협력</p>
          <h1>설정</h1>
          <span>
            수주 분기, 검토 큐와 배정, 메일 양식, 발신 정보를 관리합니다.
          </span>
        </div>
        {error && (
          <WorkspaceError
            message={error}
            onRetry={() => {
              setError("");
              void reloadOperations().catch((failure) =>
                setError(message(failure, "설정을 불러오지 못했습니다.")),
              );
            }}
          />
        )}
        {!operations ? (
          !error && (
            <p className="uw-ops-loading" role="status">
              <Spinner /> 설정을 불러오는 중…
            </p>
          )
        ) : !canManage ? (
          <p role="alert">팀장 또는 관리자만 설정을 볼 수 있습니다.</p>
        ) : (
          <Tabs
            className="uw-settings-tabs"
            value={section}
            onValueChange={(value) => {
              const next = new URLSearchParams(params);
              next.set("section", value);
              setParams(next, { replace: true });
            }}
          >
            <TabsList aria-label="설정 구역">
              {settingsSections.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {/* 구역을 옮겨도 입력 중인 내용이 남도록 모두 마운트해 두고 숨기기만 한다. */}
            <TabsContent value="quarter" forceMount>
              <div className="uw-settings-panel">
                <AcquisitionQuarterSettings api={repository.acquisitionQuarters} />
              </div>
            </TabsContent>
            <TabsContent value="queue" forceMount>
              <QueueAssignmentSettings
                repository={repository}
                summary={operations.summary}
                members={operations.members}
                reload={reloadOperations}
              />
            </TabsContent>
            <TabsContent value="templates" forceMount>
              {templateData ? (
                <MessageTemplateSettings
                  store={repository.messageTemplates}
                  data={templateData}
                  onChange={setTemplateData}
                  reload={reloadTemplates}
                />
              ) : (
                templateFallback
              )}
            </TabsContent>
            <TabsContent value="sender" forceMount>
              <div className="uw-settings-panel">
                {templateData ? (
                  <SenderInfoSettings sender={templateData.sender} />
                ) : (
                  templateFallback
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
