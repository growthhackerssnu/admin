import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  App as AntApp,
  Alert,
  Avatar,
  Button,
  Descriptions,
  Form,
  Input,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import { SidePane } from "@dhbot/ui-shell";
import {
  ApiClientError,
  getFieldOptions,
  getMe,
  getMyEditRequests,
  getPerson,
  submitEditRequest,
  type EditRequest,
  type EditRequestFormValues,
  type FieldOptions,
  type Me,
  type PersonDetail,
} from "../lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";
import "./ProfileDetail.css";

// 프로필 상세(/hr/people/:notionPageId) — 조회 모드가 기본, 본인 프로필이면
// "수정하기"로 같은 화면 안에서 편집 모드로 전환한다(ARCHITECTURE.md §12.3,
// §12.3.1). 새 라우트도, Drawer/Modal 오버레이도 아니다.
export function ProfileDetail() {
  const { notionPageId } = useParams<{ notionPageId: string }>();
  const session = useSession();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const [me, setMe] = useState<Me>();
  const [person, setPerson] = useState<PersonDetail>();
  const [error, setError] = useState<string>();

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [fieldOptions, setFieldOptions] = useState<FieldOptions>();
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<EditRequestFormValues>();

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      navigate("/login", { replace: true });
      return;
    }
    if (!notionPageId) return;
    (async () => {
      try {
        const [meResult, personResult] = await Promise.all([
          getMe(session.access_token),
          getPerson(notionPageId, session.access_token),
        ]);
        setMe(meResult);
        setPerson(personResult);
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : "프로필을 불러오지 못했습니다.");
      }
    })();
  }, [session, notionPageId]);

  const isOwnProfile = Boolean(me && person && me.notionPageId === person.notionPageId);

  async function enterEditMode() {
    if (!session || !person) return;
    try {
      const [requests, options] = await Promise.all([
        getMyEditRequests(session.access_token),
        getFieldOptions(session.access_token),
      ]);
      const pending = requests.find((r) => r.status === "pending") ?? null;
      setFieldOptions(options);
      form.setFieldsValue(buildInitialFormValues(person, pending));
      setMode("edit");
    } catch (e) {
      message.error(e instanceof ApiClientError ? e.message : "수정 폼을 여는 데 실패했습니다.");
    }
  }

  async function handleSubmit(values: EditRequestFormValues) {
    if (!session) return;
    setSubmitting(true);
    try {
      await submitEditRequest(values, session.access_token);
      message.success("수정 요청을 제출했습니다. 관리자 승인 후 반영됩니다.");
      setMode("view");
    } catch (e) {
      message.error(e instanceof ApiClientError ? e.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session === undefined || session === null || (!person && !error)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  if (error || !person || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "프로필을 불러오지 못했습니다."}
            action={<Button onClick={() => void signOut()}>로그아웃</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SidePane role={me.role} current="hr" />
      <main>
        <div className="row section-gap">
          <Link to="/hr">← 디렉토리로</Link>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>

        <div className="profile-header section-gap">
          <Avatar shape="square" size={120} src={person.profileImageUrl ?? undefined}>
            {person.name.slice(0, 1)}
          </Avatar>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              {person.name}
            </Typography.Title>
            <Typography.Text type="secondary">
              {person.cohort}기{person.currentCareerOneLine ? ` · ${person.currentCareerOneLine}` : ""}
            </Typography.Text>
          </div>
        </div>

        {mode === "view" ? (
          <ProfileView person={person} isOwnProfile={isOwnProfile} onEdit={enterEditMode} />
        ) : (
          <ProfileEditForm
            form={form}
            fieldOptions={fieldOptions}
            submitting={submitting}
            onSubmit={handleSubmit}
            onCancel={() => setMode("view")}
          />
        )}
      </main>
    </div>
  );
}

function ProfileView({
  person,
  isOwnProfile,
  onEdit,
}: {
  person: PersonDetail;
  isOwnProfile: boolean;
  onEdit: () => void;
}) {
  return (
    <>
      <Descriptions column={1} bordered size="small" className="section-gap">
        <Descriptions.Item label="학과">{person.department.join(", ") || "-"}</Descriptions.Item>
        <Descriptions.Item label="직무 계열">{person.jobField ?? "-"}</Descriptions.Item>
        {/* 직책은 읽기 전용 참고 정보(§12.3, 2026-09-28 결정) — 권한 판단엔 안 쓰지만
            화면에 보여주는 건 별개다. 값 없는 일반 회원은 항목 자체를 숨긴다. */}
        {person.position && <Descriptions.Item label="직책">{person.position}</Descriptions.Item>}
        <Descriptions.Item label="LinkedIn">
          {person.linkedin ? (
            <a href={person.linkedin} target="_blank" rel="noreferrer">
              {person.linkedin}
            </a>
          ) : (
            "-"
          )}
        </Descriptions.Item>
        <Descriptions.Item label="이메일">
          {person.email ? (
            <Space>
              {person.email}
              <a
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(person.email)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="small">메일 보내기</Button>
              </a>
            </Space>
          ) : (
            "-"
          )}
        </Descriptions.Item>
      </Descriptions>

      <ProfileSection title="Careers" text={person.careersText} />
      <ProfileSection title="Activities" text={person.activitiesText} />
      <ProfileSection title="Projects" text={person.projectsText} />

      {isOwnProfile && (
        <Button type="primary" onClick={onEdit}>
          수정하기
        </Button>
      )}
    </>
  );
}

function ProfileSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="profile-section section-gap">
      <Typography.Title level={5}>{title}</Typography.Title>
      <pre className="profile-section-text">{text || "-"}</pre>
    </section>
  );
}

function ProfileEditForm({
  form,
  fieldOptions,
  submitting,
  onSubmit,
  onCancel,
}: {
  form: ReturnType<typeof Form.useForm<EditRequestFormValues>>[0];
  fieldOptions: FieldOptions | undefined;
  submitting: boolean;
  onSubmit: (values: EditRequestFormValues) => void;
  onCancel: () => void;
}) {
  if (!fieldOptions) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Form form={form} layout="vertical" onFinish={onSubmit} className="section-gap">
      <Form.Item name="email" label="이메일">
        <Input />
      </Form.Item>
      <Form.Item name="linkedin" label="LinkedIn">
        <Input />
      </Form.Item>
      <Form.Item name="currentCareerOneLine" label="현재 커리어">
        <Input />
      </Form.Item>
      <Form.Item name="cohort" label="기수" rules={[{ required: true, message: "기수를 선택하세요." }]}>
        <Select options={fieldOptions.cohort.map((c) => ({ value: c, label: `${c}기` }))} />
      </Form.Item>
      <Form.Item name="jobField" label="직무 계열">
        <Select allowClear options={fieldOptions.jobField.map((v) => ({ value: v, label: v }))} />
      </Form.Item>
      <Form.Item name="department" label="학과">
        <Select mode="multiple" options={fieldOptions.department.map((v) => ({ value: v, label: v }))} />
      </Form.Item>
      <Form.Item name="team" label="소속팀">
        <Select mode="multiple" options={fieldOptions.team.map((v) => ({ value: v, label: v }))} />
      </Form.Item>
      <Form.Item name="careersText" label="Careers">
        <Input.TextArea rows={4} placeholder="- 회사 | 직무 | 기간" />
      </Form.Item>
      <Form.Item name="activitiesText" label="Activities">
        <Input.TextArea rows={4} />
      </Form.Item>
      <Form.Item name="projectsText" label="Projects">
        <Input.TextArea rows={4} />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          제출
        </Button>
        <Button onClick={onCancel} disabled={submitting}>
          취소
        </Button>
      </Space>
    </Form>
  );
}

// 원본 값 위에 "본인의 대기 중인 diff"가 있으면 그 after 값으로 덮어써서
// 프리필한다(직전 초안을 이어서 고치는 형태, §12.3). diff의 key는 서버가
// 쓰는 것과 반드시 같아야 한다(apps/backend/src/hr/lib/editRequests.ts 참고).
function buildInitialFormValues(person: PersonDetail, pending: EditRequest | null): EditRequestFormValues {
  const base: EditRequestFormValues = {
    email: person.email,
    linkedin: person.linkedin,
    currentCareerOneLine: person.currentCareerOneLine,
    cohort: person.cohort,
    jobField: person.jobField,
    department: person.department,
    team: person.team,
    careersText: person.careersText,
    activitiesText: person.activitiesText,
    projectsText: person.projectsText,
  };
  if (!pending) return base;

  const sf = pending.diff.structuredFields;
  const fts = pending.diff.freeTextSections;
  return {
    email: sf["이메일"] ? (sf["이메일"].after as string | null) : base.email,
    linkedin: sf["LinkedIn"] ? (sf["LinkedIn"].after as string | null) : base.linkedin,
    currentCareerOneLine: sf["현재 커리어"]
      ? (sf["현재 커리어"].after as string | null)
      : base.currentCareerOneLine,
    cohort: sf["기수"] ? (sf["기수"].after as number) : base.cohort,
    jobField: sf["직무 계열"] ? (sf["직무 계열"].after as string | null) : base.jobField,
    department: sf["학과"] ? (sf["학과"].after as string[]) : base.department,
    team: sf["소속팀"] ? (sf["소속팀"].after as string[]) : base.team,
    careersText: fts["careers"] ? (fts["careers"].after as string) : base.careersText,
    activitiesText: fts["activities"] ? (fts["activities"].after as string) : base.activitiesText,
    projectsText: fts["projects"] ? (fts["projects"].after as string) : base.projectsText,
  };
}
