import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceCombobox } from "@/components/ui/workspace-combobox";
import { WorkspaceError } from "@/components/ui/workspace-error";
import type { Actor } from "./contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  projectLabels,
  type HistoryCompany,
  type HistoryProject,
  type ProjectStatus,
} from "./historyContracts";

export interface ProjectFormMemory {
  companyId: string;
  newName: string;
  newDescription: string;
  project: HistoryProject;
}
export function HistoryProjectForm({
  companies,
  company,
  project,
  memory,
  pending,
  onSave,
  onCancel,
  members,
  searchCompanies,
  loadCompany,
}: {
  companies: HistoryCompany[];
  company?: HistoryCompany;
  project?: HistoryProject;
  memory: Record<string, ProjectFormMemory>;
  pending: boolean;
  onSave: (
    companyId: string,
    project: HistoryProject,
    newCompany?: { name: string; description: string },
  ) => Promise<boolean>;
  onCancel: () => void;
  members?: Actor[];
  searchCompanies?: (query: string) => Promise<HistoryCompany[]>;
  loadCompany?: (id: string) => Promise<HistoryCompany>;
}) {
  const key = project?.id ?? company?.id ?? "new";
  const liveSource = !project
    ? company?.wonSources?.find((s) => s.quarter)
    : undefined;
  const inferred = (liveSource?.quarter ?? company?.wonQuarter)?.match(
    /^(\d{4})-Q([1-4])$/,
  );
  const wonSource =
    !project && !company?.projects.length
      ? company?.sends.find((s) => s.outcome === "won")
      : undefined;
  const [form, setForm] = useState<ProjectFormMemory>(
    () =>
      memory[key] ?? {
        companyId: company?.id ?? "",
        newName: "",
        newDescription: "",
        project: project
          ? { ...project }
          : {
              id: crypto.randomUUID(),
              title: "",
              year: inferred ? Number(inferred[1]) : null,
              quarter: inferred ? Number(inferred[2]) : null,
              status: null,
              summary: "",
              ownerName: "",
              contactName: "",
              resultUrl: "",
              version: 0,
              sourceOutreachId: company?.wonSources
                ? liveSource?.outreachId
                : wonSource?.id,
              expectedSourceOutreachVersion: liveSource?.version,
            },
      },
  );
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<HistoryCompany[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<HistoryCompany>();
  const [searching, setSearching] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  useEffect(() => {
    if (!searchCompanies) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      setLookupError("");
      void searchCompanies(query)
        .then((rows) => {
          if (active) setOptions(rows);
        })
        .catch((e) => {
          if (active)
            setLookupError(
              e instanceof Error ? e.message : "기업 검색에 실패했습니다.",
            );
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, searchCompanies]);
  useEffect(() => {
    if (
      !loadCompany ||
      !form.companyId ||
      form.companyId === "new" ||
      company?.id === form.companyId
    )
      return;
    let active = true;
    setSelectedDetail(undefined);
    setCompanyLoading(true);
    setLookupError("");
    void loadCompany(form.companyId)
      .then((c) => {
        if (active) setSelectedDetail(c);
      })
      .catch((e) => {
        if (active)
          setLookupError(
            e instanceof Error ? e.message : "관계자를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setCompanyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form.companyId, loadCompany, company?.id]);
  const patch = (value: Partial<ProjectFormMemory>) =>
    setForm((old) => {
      const next = { ...old, ...value };
      memory[key] = next;
      return next;
    });
  const patchProject = (value: Partial<HistoryProject>) =>
    patch({ project: { ...form.project, ...value } });
  const choices = [
    ...new Map(
      [
        ...(searchCompanies && query.trim() ? [] : companies),
        ...options,
        ...(company ? [company] : []),
        ...(selectedDetail &&
        (!query.trim() || selectedDetail.name.includes(query.trim()))
          ? [selectedDetail]
          : []),
      ].map((c) => [c.id, c]),
    ).values(),
  ];
  const selected =
    selectedDetail?.id === form.companyId
      ? selectedDetail
      : company?.id === form.companyId
        ? company
        : (companies.find((c) => c.id === form.companyId) ??
          options.find((c) => c.id === form.companyId));
  const contacts = [
    ...new Map(
      (selected?.contacts ?? []).map((c) => [
        members ? c.contactId : c.name,
        c,
      ]),
    ).values(),
  ];
  const p = form.project;
  const sourceLocked = Boolean(p.sourceOutreachId);
  const missing = [
    ...(!(form.companyId === "new" ? form.newName.trim() : form.companyId)
      ? [
          {
            label: "기업",
            id: form.companyId === "new" ? "hp-name" : "hp-company",
          },
        ]
      : []),
    ...(!p.title.trim() ? [{ label: "프로젝트명", id: "hp-title" }] : []),
    ...(!p.year || !Number.isInteger(p.year) || p.year < 2000 || p.year > 2100
      ? [{ label: "진행 연도", id: "hp-year" }]
      : []),
    ...(!p.quarter ? [{ label: "진행 분기", id: "hp-quarter" }] : []),
    ...(!p.status ? [{ label: "진행 상태", id: "hp-status" }] : []),
  ];
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (memory[key]) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [memory, key]);
  const valid =
    (form.companyId === "new" ? form.newName.trim() : form.companyId) &&
    p.title.trim() &&
    p.year &&
    Number.isInteger(p.year) &&
    p.year >= 2000 &&
    p.year <= 2100 &&
    p.quarter &&
    p.status;
  return (
    <form
      className="hw-project-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || pending || companyLoading || lookupError) return;
        if (
          await onSave(
            form.companyId,
            p,
            form.companyId === "new"
              ? {
                  name: form.newName.trim(),
                  description: form.newDescription.trim(),
                }
              : undefined,
          )
        ) {
          delete memory[key];
          onCancel();
        }
      }}
    >
      <div className="hw-drawer-scroll">
        {lookupError && <WorkspaceError message={lookupError} />}
        <Field>
          <FieldLabel htmlFor="hp-company" required>
            기업
          </FieldLabel>
          <WorkspaceCombobox
            id="hp-company"
            required
            value={form.companyId}
            disabled={pending || Boolean(company || project)}
            onChange={(companyId) =>
              patch({
                companyId,
                project: {
                  ...form.project,
                  contactId: null,
                  contactName: "",
                  sourceOutreachId: undefined,
                  expectedSourceOutreachVersion: undefined,
                },
              })
            }
            onSearch={searchCompanies ? setQuery : undefined}
            loading={searching}
            placeholder="기업 선택"
            searchLabel="기업명 검색"
            options={[
              ...choices.map((c) => ({
                value: c.id,
                label: c.name,
                keywords: [c.description],
              })),
              { value: "new", label: "새 기업 등록" },
            ]}
          />
        </Field>
        {form.companyId === "new" && (
          <>
            <Field>
              <FieldLabel htmlFor="hp-name" required>
                기업명
              </FieldLabel>
              <Input
                id="hp-name"
                required
                disabled={pending}
                value={form.newName}
                onChange={(e) => patch({ newName: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hp-description">한 줄 설명</FieldLabel>
              <Input
                id="hp-description"
                disabled={pending}
                value={form.newDescription}
                onChange={(e) => patch({ newDescription: e.target.value })}
              />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="hp-title" required>
            프로젝트명
          </FieldLabel>
          <Input
            id="hp-title"
            required
            maxLength={300}
            disabled={pending}
            value={p.title}
            onChange={(e) => patchProject({ title: e.target.value })}
          />
        </Field>
        <div className="hw-field-grid">
          <Field>
            <FieldLabel htmlFor="hp-year" required>
              진행 연도
            </FieldLabel>
            <Input
              id="hp-year"
              type="number"
              min={2000}
              max={2100}
              required
              disabled={pending || sourceLocked}
              value={p.year ?? ""}
              onChange={(e) =>
                patchProject({
                  year: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="hp-quarter" required>
              진행 분기
            </FieldLabel>
            <Select
              disabled={pending || sourceLocked}
              value={p.quarter ? String(p.quarter) : ""}
              onValueChange={(value) =>
                patchProject({ quarter: Number(value) })
              }
            >
              <SelectTrigger id="hp-quarter">
                <SelectValue placeholder="분기 선택" />
              </SelectTrigger>
              <SelectContent className="dw-select-content">
                {[1, 2, 3, 4].map((q) => (
                  <SelectItem key={q} value={String(q)}>
                    {q}분기
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {sourceLocked && <p className="hw-muted">수주 기록의 진행 분기</p>}
        {!project && company?.wonSources && company.wonSources.length > 0 && (
          <Field>
            <FieldLabel htmlFor="hp-source">연결할 수주 기록</FieldLabel>
            <Select
              disabled={pending}
              value={p.sourceOutreachId ?? "none"}
              onValueChange={(value) => {
                const source = company.wonSources!.find(
                  (s) => s.outreachId === value,
                );
                const quarter = source?.quarter?.match(/^(\d{4})-Q([1-4])$/);
                patchProject({
                  sourceOutreachId: source?.outreachId,
                  expectedSourceOutreachVersion: source?.version,
                  ...(quarter
                    ? { year: Number(quarter[1]), quarter: Number(quarter[2]) }
                    : {}),
                });
              }}
            >
              <SelectTrigger id="hp-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dw-select-content">
                <SelectItem value="none">수동 등록</SelectItem>
                {company.wonSources
                  .filter((s) => s.quarter)
                  .map((s) => (
                    <SelectItem key={s.outreachId} value={s.outreachId}>
                      {s.quarter} · {s.outreachId.slice(-6)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="hp-status" required>
            진행 상태
          </FieldLabel>
          <Select
            disabled={pending}
            value={p.status ?? ""}
            onValueChange={(value) =>
              patchProject({ status: value as ProjectStatus })
            }
          >
            <SelectTrigger id="hp-status">
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent className="dw-select-content">
              {Object.entries(projectLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="hp-summary">프로젝트 요약</FieldLabel>
          <Textarea
            id="hp-summary"
            rows={4}
            disabled={pending}
            value={p.summary}
            onChange={(e) => patchProject({ summary: e.target.value })}
          />
        </Field>
        <div className="hw-field-grid">
          <Field>
            <FieldLabel htmlFor="hp-owner">담당자</FieldLabel>
            {members ? (
              <WorkspaceCombobox
                id="hp-owner"
                disabled={pending}
                value={p.ownerId ?? "none"}
                onChange={(value) =>
                  patchProject({
                    ownerId: value === "none" ? null : value,
                    ownerName: members.find((m) => m.id === value)?.name ?? "",
                  })
                }
                options={[
                  { value: "none", label: "미지정" },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                  ...(p.ownerId && !members.some((m) => m.id === p.ownerId)
                    ? [
                        {
                          value: p.ownerId,
                          label: p.ownerName || "기존 담당자",
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <Input
                id="hp-owner"
                disabled={pending}
                value={p.ownerName}
                onChange={(e) => patchProject({ ownerName: e.target.value })}
              />
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="hp-contact">관계자</FieldLabel>
            <Select
              disabled={pending || companyLoading || !contacts.length}
              value={(members ? p.contactId : p.contactName) || "none"}
              onValueChange={(value) =>
                patchProject(
                  members
                    ? {
                        contactId: value === "none" ? null : value,
                        contactName:
                          contacts.find((c) => c.contactId === value)?.name ??
                          "",
                      }
                    : { contactName: value === "none" ? "" : value },
                )
              }
            >
              <SelectTrigger id="hp-contact">
                <SelectValue placeholder="관계자 선택" />
              </SelectTrigger>
              <SelectContent className="dw-select-content">
                <SelectItem value="none">미지정</SelectItem>
                {contacts.map((c, i) => (
                  <SelectItem
                    key={`${c.name}-${i}`}
                    value={members ? c.contactId! : c.name}
                  >
                    {c.name}
                  </SelectItem>
                ))}
                {(members ? p.contactId : p.contactName) &&
                  !contacts.some((c) =>
                    members
                      ? c.contactId === p.contactId
                      : c.name === p.contactName,
                  ) && (
                    <SelectItem
                      value={(members ? p.contactId : p.contactName)!}
                    >
                      {p.contactName}
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="hp-url">결과 자료 링크</FieldLabel>
          <Input
            id="hp-url"
            type="url"
            disabled={pending}
            value={p.resultUrl}
            onChange={(e) => patchProject({ resultUrl: e.target.value })}
          />
        </Field>
      </div>
      <footer className="hw-composer-footer">
        {missing.length > 0 && (
          <div className="hw-block-reason" role="status">
            <span>{missing.map((field) => field.label).join(" · ")} 입력</span>
            <Button
              variant="link"
              size="sm"
              type="button"
              onClick={() => document.getElementById(missing[0].id)?.focus()}
            >
              입력 확인
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            delete memory[key];
            onCancel();
          }}
        >
          취소
        </Button>
        <Button
          type="submit"
          disabled={!valid || pending || companyLoading || Boolean(lookupError)}
        >
          프로젝트 저장
        </Button>
      </footer>
    </form>
  );
}
