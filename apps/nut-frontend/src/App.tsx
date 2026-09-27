import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BankOutlined,
  DownOutlined,
  EditOutlined,
  FolderOpenOutlined,
  HolderOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ProjectOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { useEffect, useState, type ReactNode } from "react";
import {
  createBudgetNode,
  createLedgerEntry,
  createParameter,
  deleteParameter,
  fetchOverview,
  reorderBudgetNodes,
  updateBudgetNode,
  updateLedgerEntry,
  updateParameter,
} from "./api";
import type {
  AccountingDetail,
  BucketKind,
  BucketLevel,
  BudgetNode,
  BudgetParameter,
  FinanceOverview,
  LedgerEntry,
  TaxClass,
} from "./types";

type View = "budget" | "ledger" | "accounting";
type BucketFormValues = {
  name: string;
  parentId: string | null;
  level: BucketLevel;
  kind: BucketKind;
  budget: number;
  formulaExpression?: string;
  note?: string;
};
type NewParameterValues = {
  id: string;
  label: string;
  value: number;
  unit: string;
  description: string;
};
type LedgerFormValues = {
  date: string;
  type: "income" | "expense";
  bucket: string;
  detail: string;
  amount: number;
  claimant?: string;
  note?: string;
  taxClass: TaxClass;
};

const taxClassLabels: Record<TaxClass, string> = {
  non_taxable_gain: "비과세 수익",
  taxable_gain: "과세 수익",
  tax_deductible_expense: "손금산입 비용",
  non_tax_deductible_expense: "손금불산입 비용",
  tax: "세금",
};
const levelLabels: Record<BucketLevel, string> = {
  major: "대분류",
  middle: "중분류",
  minor: "소분류",
};
const kindLabels: Record<BucketKind, string> = {
  income: "수입",
  expense: "지출",
  tax: "세금",
};

function money(value: number) {
  return "₩" + value.toLocaleString("ko-KR");
}
function shortDate(value: string) {
  return value.replaceAll("-", ".");
}
function signedMoney(value: number) {
  return (
    <span className={value < 0 ? "finance-over" : ""}>{money(value)}</span>
  );
}

function shiftMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="finance-page-title">
      <div>
        <span className="finance-eyebrow">{eyebrow}</span>
        <Typography.Title level={1}>{title}</Typography.Title>
        {description && (
          <Typography.Paragraph>{description}</Typography.Paragraph>
        )}
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <Card
      className={
        "finance-stat-card" + (accent ? " finance-stat-card--accent" : "")
      }
    >
      <div className="finance-stat-card__label">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </Card>
  );
}

function flattenBudgetTree(nodes: BudgetNode[]) {
  const byParent = new Map<string | null, BudgetNode[]>();
  nodes.forEach((node) =>
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]),
  );
  byParent.forEach((children) => children.sort((a, b) => a.order - b.order));
  const rows: Array<{ node: BudgetNode; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    (byParent.get(parentId) ?? []).forEach((node) => {
      rows.push({ node, depth });
      visit(node.id, depth + 1);
    });
  };
  visit(null, 0);
  return rows;
}

function ParameterSettings({
  parameters,
  onChange,
  onAdd,
  onDelete,
}: {
  parameters: BudgetParameter[];
  onChange: (id: string, value: number) => void;
  onAdd: (values: NewParameterValues) => void;
  onDelete: (id: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<NewParameterValues>();
  const content = (
    <div className="parameter-settings-content">
      <p>
        변수 ID를 산출식에 그대로 입력합니다. 예:{" "}
        <code>80000 * summer-participants</code>
      </p>
      <div className="parameter-grid parameter-grid--compact">
        {parameters.map((parameter) => (
          <div
            className="parameter-field parameter-field--compact"
            key={parameter.id}
          >
            <div
              className="parameter-field__identity"
              title={parameter.description}
            >
              <label htmlFor={"parameter-" + parameter.id}>
                {parameter.label}
              </label>
              <code>{parameter.id}</code>
            </div>
            <InputNumber
              size="small"
              id={"parameter-" + parameter.id}
              min={0}
              addonAfter={parameter.unit}
              value={parameter.value}
              onChange={(value) => onChange(parameter.id, Number(value ?? 0))}
            />
            <Popconfirm
              title="환경설정 변수를 삭제할까요?"
              description="산출식에서 사용 중인 변수는 삭제할 수 없습니다."
              okText="삭제"
              cancelText="취소"
              onConfirm={() => onDelete(parameter.id)}
            >
              <Button
                type="text"
                danger
                size="small"
                aria-label={parameter.label + " 삭제"}
              >
                삭제
              </Button>
            </Popconfirm>
          </div>
        ))}
      </div>
      <Button
        className="parameter-settings-add"
        size="small"
        onClick={() => setModalOpen(true)}
      >
        환경설정 변수 추가
      </Button>
    </div>
  );
  return (
    <>
      <Popover
        trigger="click"
        placement="bottomRight"
        overlayClassName="finance-settings-popover"
        title="환경설정 변수"
        content={content}
      >
        <Button
          className="finance-settings-button"
          size="small"
          icon={<SettingOutlined />}
          aria-label="계산 파라미터 설정"
        >
          설정
        </Button>
      </Popover>
      <Modal
        title="환경설정 변수 추가"
        open={modalOpen}
        okText="추가"
        cancelText="취소"
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            onAdd(values);
            setModalOpen(false);
            form.resetFields();
          }}
        >
          <Form.Item
            label="변수 ID"
            name="id"
            rules={[
              {
                required: true,
                pattern: /^[a-z][a-z0-9-]{1,63}$/,
                message: "영문 소문자·숫자·하이픈을 사용하세요.",
              },
            ]}
          >
            <Input placeholder="예: summer-participants" />
          </Form.Item>
          <Form.Item
            label="표시 이름"
            name="label"
            rules={[{ required: true }]}
          >
            <Input placeholder="예: 방학 프로젝트 참여 인원" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item label="값" name="value" rules={[{ required: true }]}>
              <InputNumber min={0} className="finance-full-width" />
            </Form.Item>
            <Form.Item label="단위" name="unit" rules={[{ required: true }]}>
              <Input placeholder="명, 팀, 원" />
            </Form.Item>
          </Space.Compact>
          <Form.Item
            label="설명"
            name="description"
            rules={[{ required: true }]}
          >
            <Input.TextArea
              rows={2}
              placeholder="이 변수가 어떤 예산을 계산하는지 입력하세요."
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function BucketTree({
  nodes,
  onReorder,
  onAddChild,
  onEdit,
}: {
  nodes: BudgetNode[];
  onReorder: (draggedId: string, targetId: string) => void;
  onAddChild: (node: BudgetNode) => void;
  onEdit: (node: BudgetNode) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  return (
    <div className="bucket-tree">
      <div className="bucket-tree-grid bucket-tree-grid--header">
        <span>Bucket</span>
        <span>진행안</span>
        <span>결산안</span>
        <span>잔액</span>
        <span />
      </div>
      {flattenBudgetTree(nodes).map(({ node, depth }) => (
        <div
          className={
            "bucket-tree-grid bucket-tree-row bucket-tree-row--" +
            node.level +
            (draggedId === node.id ? " bucket-tree-row--dragging" : "") +
            (dragOverId === node.id ? " bucket-tree-row--drag-over" : "")
          }
          key={node.id}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOverId(node.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const sourceId =
              event.dataTransfer.getData("text/plain") || draggedId;
            if (sourceId && sourceId !== node.id) onReorder(sourceId, node.id);
            setDraggedId(null);
            setDragOverId(null);
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDragOverId(null);
          }}
        >
          <div
            className="bucket-tree-row__name"
            style={{ paddingLeft: depth * 24 + "px" }}
          >
            <span
              className="bucket-tree-row__drag"
              draggable
              role="button"
              tabIndex={0}
              aria-label={node.name + " 순서 이동"}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", node.id);
                setDraggedId(node.id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
            >
              <HolderOutlined />
            </span>
            <span
              className={"bucket-level-chip bucket-level-chip--" + node.level}
            >
              {levelLabels[node.level]}
            </span>
            <div>
              <strong>{node.name}</strong>
              <small>
                {node.formulaExpression
                  ? "산출식: " + node.formulaExpression
                  : (node.formula ?? node.note ?? "하위 항목 합계")}
              </small>
            </div>
          </div>
          <div className="bucket-tree-row__amount">{money(node.budget)}</div>
          <div className="bucket-tree-row__amount">{money(node.actual)}</div>
          <div
            className={
              "bucket-tree-row__amount" +
              (node.remaining < 0 ? " finance-over" : "")
            }
          >
            {money(node.remaining)}
          </div>
          <div className="bucket-tree-row__actions">
            <Tag>{kindLabels[node.kind]}</Tag>
            <Space size={2}>
              {node.level !== "minor" && (
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddChild(node);
                  }}
                  aria-label="하위 bucket 추가"
                />
              )}
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(node);
                }}
                aria-label="bucket 수정"
              />
            </Space>
          </div>
        </div>
      ))}
    </div>
  );
}

function BudgetSheetPreview({ data }: { data: FinanceOverview }) {
  const rows = flattenBudgetTree(data.budgetTree).filter(
    ({ node }) => node.kind === "expense",
  );
  const byId = new Map(data.budgetTree.map((node) => [node.id, node]));
  const pathNames = (node: BudgetNode) => {
    const path: BudgetNode[] = [];
    let current: BudgetNode | undefined = node;
    while (current) {
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  };
  const majors = data.budgetTree
    .filter((node) => node.level === "major" && node.kind === "expense")
    .sort((a, b) => a.order - b.order);
  const max = Math.max(
    ...majors.map((node) => Math.max(node.budget, node.actual)),
    1,
  );
  return (
    <>
      <Card className="finance-panel finance-table-panel budget-sheet-preview">
        <div className="finance-panel__header">
          <div>
            <span className="finance-eyebrow">진행안 ↔ 결산안</span>
            <h2>예산·실제 지출 비교</h2>
          </div>
          <Tag color="green">DB / Excel import</Tag>
        </div>
        <div className="budget-sheet-scroll">
          <table className="budget-sheet">
            <thead>
              <tr>
                <th>No.</th>
                <th>대분류</th>
                <th>중분류</th>
                <th>소분류</th>
                <th className="budget-sheet__amount">진행안 (예산)</th>
                <th className="budget-sheet__amount">결산안 (실제)</th>
                <th className="budget-sheet__amount">잔액</th>
                <th className="budget-sheet__amount">차이</th>
                <th>산출식 / 비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node }, index) => {
                const path = pathNames(node);
                return (
                  <tr
                    className={
                      "budget-sheet__row budget-sheet__row--" + node.level
                    }
                    key={node.id}
                  >
                    <td>{index + 1}</td>
                    <td>{path.find((item) => item.level === "major")?.name}</td>
                    <td>
                      {path.find((item) => item.level === "middle")?.name}
                    </td>
                    <td>{path.find((item) => item.level === "minor")?.name}</td>
                    <td className="budget-sheet__amount">
                      {money(node.budget)}
                    </td>
                    <td className="budget-sheet__amount">
                      {money(node.actual)}
                    </td>
                    <td
                      className={
                        "budget-sheet__amount" +
                        (node.remaining < 0 ? " finance-over" : "")
                      }
                    >
                      {money(node.remaining)}
                    </td>
                    <td
                      className={
                        "budget-sheet__amount" +
                        (node.variance > 0 ? " finance-over" : "")
                      }
                    >
                      {money(node.variance)}
                    </td>
                    <td>
                      {node.formulaExpression
                        ? "산출식: " + node.formulaExpression
                        : (node.formula ?? node.note)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>지출 합계</td>
                <td className="budget-sheet__amount">
                  <strong>{money(data.plan.expense)}</strong>
                </td>
                <td className="budget-sheet__amount">
                  <strong>{money(data.actual.expense)}</strong>
                </td>
                <td className="budget-sheet__amount">
                  <strong>{signedMoney(data.remaining.expense)}</strong>
                </td>
                <td className="budget-sheet__amount">
                  <strong>{signedMoney(data.variance.expense)}</strong>
                </td>
                <td>잔액 = 진행안 − 결산안 / 차이 = 결산안 − 진행안</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Card className="finance-panel finance-table-panel">
        <div className="finance-panel__header">
          <div>
            <span className="finance-eyebrow">수입</span>
            <h2>진행안 수입 vs 결산안 수입</h2>
          </div>
          <Tag>{data.incomeLines.length}개 항목</Tag>
        </div>
        <div className="budget-sheet-scroll">
          <table className="budget-sheet">
            <thead>
              <tr>
                <th>No.</th>
                <th>수입 항목</th>
                <th className="budget-sheet__amount">진행안</th>
                <th className="budget-sheet__amount">결산안</th>
                <th className="budget-sheet__amount">잔액</th>
                <th className="budget-sheet__amount">차이</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {data.incomeLines.map((line) => (
                <tr key={line.id}>
                  <td>{line.sortOrder}</td>
                  <td>
                    <strong>{line.name}</strong>
                  </td>
                  <td className="budget-sheet__amount">{money(line.budget)}</td>
                  <td className="budget-sheet__amount">{money(line.actual)}</td>
                  <td className="budget-sheet__amount">
                    {signedMoney(line.remaining)}
                  </td>
                  <td className="budget-sheet__amount">
                    {signedMoney(line.variance)}
                  </td>
                  <td>{line.note}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>수입 합계</td>
                <td className="budget-sheet__amount">
                  <strong>{money(data.plan.income)}</strong>
                </td>
                <td className="budget-sheet__amount">
                  <strong>{money(data.actual.income)}</strong>
                </td>
                <td className="budget-sheet__amount">
                  <strong>{signedMoney(data.remaining.income)}</strong>
                </td>
                <td className="budget-sheet__amount">
                  <strong>{signedMoney(data.variance.income)}</strong>
                </td>
                <td>Excel 수입 표 기준</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Card className="finance-panel finance-table-panel budget-bars-panel">
        <div className="finance-panel__header">
          <div>
            <span className="finance-eyebrow">대분류별 지출</span>
            <h2>진행안·결산안 사용량</h2>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot legend-dot--budget" />
              진행안
            </span>
            <span>
              <i className="legend-dot legend-dot--actual" />
              결산안
            </span>
          </div>
        </div>
        <div className="budget-bars">
          {majors.map((node) => (
            <div className="budget-bar-row" key={node.id}>
              <div className="budget-bar-row__label">
                <strong>{node.name}</strong>
                <span>
                  {money(node.actual)} / {money(node.budget)} · 잔액{" "}
                  {money(node.remaining)}
                </span>
              </div>
              <div className="budget-bar-row__track">
                <span
                  className="budget-bar budget-bar--budget"
                  style={{ width: (node.budget / max) * 100 + "%" }}
                />
                <span
                  className={
                    "budget-bar budget-bar--actual" +
                    (node.actual > node.budget ? " budget-bar--over" : "")
                  }
                  style={{ width: (node.actual / max) * 100 + "%" }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function BudgetView({
  data,
  onParameterChange,
  onParameterAdd,
  onParameterDelete,
  onAddBucket,
  onReorder,
  onEditBucket,
}: {
  data: FinanceOverview;
  onParameterChange: (id: string, value: number) => void;
  onParameterAdd: (values: NewParameterValues) => void;
  onParameterDelete: (id: string) => void;
  onAddBucket: (level?: BucketLevel, parentId?: string | null) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onEditBucket: (node: BudgetNode) => void;
}) {
  const [showStructure, setShowStructure] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="1 / 진행안 ↔ 결산안"
        title="예산·결산"
        description="진행안(예산)과 결산안(실제 지출)을 분리해서 보고, Excel의 잔액과 차이를 그대로 확인합니다."
        action={
          <Space>
            <ParameterSettings
              parameters={data.parameters}
              onChange={onParameterChange}
              onAdd={onParameterAdd}
              onDelete={onParameterDelete}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => onAddBucket("major", null)}
            >
              대분류 생성
            </Button>
          </Space>
        }
      />
      <div className="finance-stat-grid">
        <StatCard
          label="진행안 순수지출"
          value={money(data.plan.net)}
          detail={
            "수입 " +
            money(data.plan.income) +
            " − 지출 " +
            money(data.plan.expense)
          }
        />
        <StatCard
          label="결산안 순수지출"
          value={money(data.actual.net)}
          detail={
            "수입 " +
            money(data.actual.income) +
            " − 지출 " +
            money(data.actual.expense)
          }
        />
        <StatCard
          label="지출 잔액"
          value={money(data.remaining.expense)}
          detail="진행안 지출 − 결산안 지출"
          accent
        />
        <StatCard
          label="현재 현금"
          value={money(data.currentCash)}
          detail={"기준일 " + shortDate(data.period.asOf)}
          accent
        />
      </div>
      <div className="budget-view-switcher">
        <div>
          <span className="finance-eyebrow">예산안 화면</span>
          <strong>{showStructure ? "Bucket 구조" : "예산안 시트"}</strong>
        </div>
        <Button
          icon={showStructure ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setShowStructure((value) => !value)}
        >
          {showStructure ? "예산안 시트 접기" : "Bucket 구조 펼치기"}
        </Button>
      </div>
      {showStructure ? (
        <Card className="finance-panel bucket-builder-panel">
          <div className="finance-panel__header">
            <div>
              <span className="finance-eyebrow">지출 구조</span>
              <h2>Bucket 구조</h2>
            </div>
            <Space>
              <Tag>
                {
                  data.budgetTree.filter(
                    (node) => node.level === "minor" && node.kind === "expense",
                  ).length
                }
                개 소분류
              </Tag>
              <Button
                onClick={() => onAddBucket("middle", null)}
                icon={<PlusOutlined />}
              >
                중분류
              </Button>
              <Button
                onClick={() => onAddBucket("minor", null)}
                icon={<PlusOutlined />}
              >
                소분류
              </Button>
            </Space>
          </div>
          <BucketTree
            nodes={data.budgetTree.filter((node) => node.kind === "expense")}
            onReorder={onReorder}
            onAddChild={(node) =>
              onAddBucket(node.level === "major" ? "middle" : "minor", node.id)
            }
            onEdit={onEditBucket}
          />
        </Card>
      ) : (
        <BudgetSheetPreview data={data} />
      )}
    </>
  );
}

function AccountingSpendTable({
  title,
  rows,
  budget,
  spent,
}: {
  title: string;
  rows: AccountingDetail[];
  budget: number;
  spent: number;
}) {
  const columns: ColumnsType<AccountingDetail> = [
    { title: "일시", dataIndex: "date", key: "date", width: 108 },
    { title: "내역", dataIndex: "detail", key: "detail", width: 320 },
    {
      title: "지출",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      width: 130,
      render: money,
    },
    {
      title: "잔액",
      dataIndex: "balance",
      key: "balance",
      align: "right",
      width: 130,
      render: money,
    },
    { title: "청구인", dataIndex: "claimant", key: "claimant", width: 105 },
  ];
  return (
    <div className="accounting-spend-table">
      <div className="accounting-spend-table__header">
        <strong>{title}</strong>
        <div>
          <span>
            진행안 <b>{money(budget)}</b>
          </span>
          <span>
            결산안 <b>{money(spent)}</b>
          </span>
          <span>
            잔액 <b>{signedMoney(budget - spent)}</b>
          </span>
        </div>
      </div>
      <Table<AccountingDetail>
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 790, y: 330 }}
        locale={{ emptyText: "내역 없음" }}
      />
    </div>
  );
}

function AccountingView({ data }: { data: FinanceOverview }) {
  const [scope, setScope] = useState<"project" | "team">("project");
  const summaries = data.accountingSummaries.filter(
    (row) => row.scope === scope,
  );
  const rows = data.accountingDetails.filter((row) => row.scope === scope);
  const totalBudget = summaries.reduce(
    (sum, row) => sum + row.supportBudget + row.technicalBudget,
    0,
  );
  const totalActual = summaries.reduce(
    (sum, row) => sum + row.supportSpent + row.technicalSpent,
    0,
  );
  return (
    <>
      <PageTitle
        eyebrow="3 / 프로젝트·운영팀 회계"
        title="프로젝트별 / 운영팀별 spend"
        description="Excel의 프로젝트 회계와 운영팀 회계를 분리해 보고, 각 지원비의 진행안·결산안·잔액을 확인합니다."
      />
      <div className="accounting-switcher">
        <Button
          className={scope === "project" ? "accounting-switcher__active" : ""}
          icon={<ProjectOutlined />}
          onClick={() => setScope("project")}
        >
          프로젝트별 회계
        </Button>
        <Button
          className={scope === "team" ? "accounting-switcher__active" : ""}
          icon={<TeamOutlined />}
          onClick={() => setScope("team")}
        >
          운영팀별 회계
        </Button>
      </div>
      <div className="finance-stat-grid finance-stat-grid--three">
        <StatCard
          label="진행안 합계"
          value={money(totalBudget)}
          detail={
            scope === "project"
              ? "프로젝트 지원비 + 기술지원비"
              : "운영팀 지원비"
          }
        />
        <StatCard
          label="결산안 합계"
          value={money(totalActual)}
          detail="DB 회계 내역 기준"
        />
        <StatCard
          label="잔액"
          value={money(totalBudget - totalActual)}
          detail="진행안 − 결산안"
          accent
        />
      </div>
      <Card className="finance-panel finance-table-panel">
        <div className="finance-panel__header">
          <div>
            <span className="finance-eyebrow">
              {scope === "project"
                ? "PROJECT ACCOUNTING"
                : "OPERATIONS ACCOUNTING"}
            </span>
            <h2>
              {scope === "project" ? "프로젝트별 지원비" : "운영팀별 지원비"}
            </h2>
          </div>
          <Tag>
            {summaries.length}개 {scope === "project" ? "프로젝트" : "팀"}
          </Tag>
        </div>
        <div
          className={"accounting-entity-grid accounting-entity-grid--" + scope}
        >
          {summaries.map((summary) => {
            const entityRows = rows.filter((row) => row.owner === summary.name);
            const supportRows = entityRows.filter(
              (row) => row.category === "support",
            );
            const technicalRows = entityRows.filter(
              (row) => row.category === "technical",
            );
            return (
              <Card className="accounting-entity-card" key={summary.id}>
                <div className="accounting-entity-card__header">
                  <div>
                    <span className="finance-eyebrow">
                      {scope === "project" ? "PROJECT" : "TEAM"}
                    </span>
                    <h3>{summary.name}</h3>
                  </div>
                  <Tag>{summary.entryCount}건</Tag>
                </div>
                <div className="accounting-entity-card__total">
                  <span>
                    진행안{" "}
                    <b>
                      {money(summary.supportBudget + summary.technicalBudget)}
                    </b>
                  </span>
                  <span>
                    결산안{" "}
                    <b>
                      {money(summary.supportSpent + summary.technicalSpent)}
                    </b>
                  </span>
                  <span>
                    잔액{" "}
                    <b>
                      {signedMoney(
                        summary.supportBudget +
                          summary.technicalBudget -
                          summary.supportSpent -
                          summary.technicalSpent,
                      )}
                    </b>
                  </span>
                </div>
                <div className="accounting-entity-card__sections">
                  <AccountingSpendTable
                    title="팀지원비"
                    rows={supportRows}
                    budget={summary.supportBudget}
                    spent={summary.supportSpent}
                  />
                  {(scope === "project" ||
                    summary.technicalBudget > 0 ||
                    summary.technicalSpent > 0 ||
                    technicalRows.length > 0) && (
                    <AccountingSpendTable
                      title="기술지원비"
                      rows={technicalRows}
                      budget={summary.technicalBudget}
                      spent={summary.technicalSpent}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function LedgerView({
  data,
  onAdd,
  onUpdate,
}: {
  data: FinanceOverview;
  onAdd: () => void;
  onUpdate: (
    entry: LedgerEntry,
    patch: { claimant?: string | null; note?: string | null },
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState("all");
  const [periodMode, setPeriodMode] = useState<
    "recent-month" | "recent-quarter" | "all" | "custom"
  >("recent-month");
  const [customStart, setCustomStart] = useState(() =>
    shiftMonths(data.period.asOf, -1),
  );
  const [customEnd, setCustomEnd] = useState(data.period.asOf);
  const [edits, setEdits] = useState<
    Record<string, { note?: string; claimant?: string }>
  >({});
  const buckets = Array.from(new Set(data.ledger.map((entry) => entry.bucket)));
  const startDate =
    periodMode === "recent-month"
      ? shiftMonths(data.period.asOf, -1)
      : periodMode === "recent-quarter"
        ? shiftMonths(data.period.asOf, -3)
        : periodMode === "custom"
          ? customStart
          : "";
  const endDate = periodMode === "custom" ? customEnd : data.period.asOf;
  const rows = data.ledger.filter((entry) => {
    const haystack = (
      entry.bucket +
      " " +
      entry.detail +
      " " +
      (entry.claimant ?? "") +
      " " +
      (entry.note ?? "")
    ).toLowerCase();
    return (
      (!query || haystack.includes(query.toLowerCase())) &&
      (bucket === "all" || entry.bucket === bucket) &&
      (!startDate || entry.date >= startDate) &&
      (!endDate || entry.date <= endDate)
    );
  });
  const columns: ColumnsType<LedgerEntry> = [
    {
      title: "월",
      dataIndex: "month",
      key: "month",
      width: 52,
      render: (value: number) => value + "월",
    },
    {
      title: "일시",
      dataIndex: "date",
      key: "date",
      width: 105,
      render: (value: string) => value.replaceAll("-", "."),
    },
    {
      title: "항목",
      dataIndex: "bucket",
      key: "bucket",
      width: 190,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "상세 내역", dataIndex: "detail", key: "detail", width: 250 },
    {
      title: "수입 (원)",
      dataIndex: "income",
      key: "income",
      align: "right",
      width: 125,
      render: (value: number) =>
        value ? <span className="finance-income">{money(value)}</span> : "-",
    },
    {
      title: "지출 (원)",
      dataIndex: "expense",
      key: "expense",
      align: "right",
      width: 125,
      render: (value: number) =>
        value ? <span className="finance-expense">{money(value)}</span> : "-",
    },
    {
      title: "잔액 (원)",
      dataIndex: "balance",
      key: "balance",
      align: "right",
      width: 135,
      render: money,
    },
    {
      title: "비고",
      dataIndex: "note",
      key: "note",
      width: 210,
      render: (value: string | undefined, row) => (
        <Input
          size="small"
          value={edits[row.id]?.note ?? value ?? ""}
          placeholder="비고 입력"
          onChange={(event) =>
            setEdits((current) => ({
              ...current,
              [row.id]: { ...current[row.id], note: event.target.value },
            }))
          }
          onBlur={() =>
            onUpdate(row, {
              note: edits[row.id]?.note ?? value ?? null,
              claimant: edits[row.id]?.claimant ?? row.claimant ?? null,
            })
          }
        />
      ),
    },
    {
      title: "청구인",
      dataIndex: "claimant",
      key: "claimant",
      width: 120,
      render: (value: string | undefined, row) => (
        <Input
          size="small"
          value={edits[row.id]?.claimant ?? value ?? ""}
          placeholder="청구인"
          onChange={(event) =>
            setEdits((current) => ({
              ...current,
              [row.id]: { ...current[row.id], claimant: event.target.value },
            }))
          }
          onBlur={() =>
            onUpdate(row, {
              note: edits[row.id]?.note ?? row.note ?? null,
              claimant: edits[row.id]?.claimant ?? value ?? null,
            })
          }
        />
      ),
    },
  ];
  const totalIncome = rows.reduce((sum, entry) => sum + entry.income, 0);
  const totalExpense = rows.reduce((sum, entry) => sum + entry.expense, 0);
  const endingBalance = rows.length
    ? rows[rows.length - 1].balance
    : data.currentCash;
  return (
    <>
      <PageTitle
        eyebrow="2 / 회계 시트"
        title="회계 시트"
        description="Excel 회계 시트의 모든 행을 bucket·기간으로 필터링하고, 조회한 지출 합계를 바로 확인합니다."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            회계 항목 추가
          </Button>
        }
      />
      <div className="finance-stat-grid finance-stat-grid--three">
        <StatCard
          label="조회 수입"
          value={money(totalIncome)}
          detail="현재 bucket·기간 기준"
        />
        <StatCard
          label="조회 지출"
          value={money(totalExpense)}
          detail="현재 bucket·기간 기준"
        />
        <StatCard
          label="잔액"
          value={money(endingBalance)}
          detail="조회 범위 마지막 행 기준"
          accent
        />
      </div>
      <div className="finance-toolbar">
        <Input
          allowClear
          placeholder="항목, bucket, 청구인, 비고 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          showSearch
          optionFilterProp="label"
          value={bucket}
          onChange={setBucket}
          options={[
            { value: "all", label: "전체 bucket" },
            ...buckets.map((value) => ({ value, label: value })),
          ]}
        />
        <Select
          value={periodMode}
          onChange={setPeriodMode}
          options={[
            { value: "recent-month", label: "최근 한 달" },
            { value: "recent-quarter", label: "최근 3개월" },
            { value: "all", label: "전체 기간" },
            { value: "custom", label: "기간 직접 선택" },
          ]}
        />
        {periodMode === "custom" && (
          <>
            <Input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              aria-label="조회 시작일"
            />
            <Input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              aria-label="조회 종료일"
            />
          </>
        )}
      </div>
      <Card className="finance-panel finance-table-panel">
        <div className="finance-table-summary">
          <span>
            표시 중 <b>{rows.length}건</b>
          </span>
          <span>
            조회 기간{" "}
            <b>
              {startDate ? startDate.replaceAll("-", ".") : "전체"} –{" "}
              {endDate.replaceAll("-", ".")}
            </b>
          </span>
        </div>
        <Table<LedgerEntry>
          rowKey="id"
          size="middle"
          pagination={false}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1300, y: 560 }}
        />
      </Card>
    </>
  );
}

function AppNav({
  view,
  onView,
}: {
  view: View;
  onView: (view: View) => void;
}) {
  const items: Array<{
    id: View;
    label: string;
    icon: ReactNode;
    number: string;
  }> = [
    {
      id: "budget",
      label: "예산·결산",
      icon: <FolderOpenOutlined />,
      number: "01",
    },
    { id: "ledger", label: "회계 시트", icon: <BankOutlined />, number: "02" },
    {
      id: "accounting",
      label: "프로젝트·운영팀",
      icon: <ProjectOutlined />,
      number: "03",
    },
  ];
  return (
    <nav className="finance-nav" aria-label="NUT 메뉴">
      {items.map((item) => (
        <button
          className={
            "finance-nav__item" +
            (view === item.id ? " finance-nav__item--active" : "")
          }
          key={item.id}
          type="button"
          onClick={() => onView(item.id)}
        >
          <span className="finance-nav__number">{item.number}</span>
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("budget");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bucketModalOpen, setBucketModalOpen] = useState(false);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<BudgetNode | null>(null);
  const [bucketLevel, setBucketLevel] = useState<BucketLevel>("major");
  const [bucketParentId, setBucketParentId] = useState<string | null>(null);
  const [form] = Form.useForm<BucketFormValues>();
  const [ledgerForm] = Form.useForm<LedgerFormValues>();
  const { message } = AntApp.useApp();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOverview());
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error
          ? err.message
          : "NUT 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function applyMutation(
    action: () => Promise<FinanceOverview>,
    successMessage?: string,
  ) {
    try {
      setError(null);
      setData(await action());
      if (successMessage) message.success(successMessage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "변경사항을 저장하지 못했습니다.",
      );
    }
  }
  function openBucketModal(
    level: BucketLevel = "major",
    parentId: string | null = null,
    node?: BudgetNode,
  ) {
    setEditingNode(node ?? null);
    setBucketLevel(node?.level ?? level);
    setBucketParentId(node?.parentId ?? parentId);
    setBucketModalOpen(true);
    form.setFieldsValue(
      node
        ? {
            name: node.name,
            parentId: node.parentId,
            level: node.level,
            kind: node.kind,
            budget: node.budget,
            formulaExpression: node.formulaExpression,
            note: node.note,
          }
        : {
            name: undefined,
            parentId,
            level,
            kind: "expense",
            budget: 0,
            formulaExpression: undefined,
            note: undefined,
          },
    );
  }
  function saveBucket(values: BucketFormValues) {
    const taxClass: TaxClass =
      values.kind === "income"
        ? "taxable_gain"
        : values.kind === "tax"
          ? "tax"
          : "tax_deductible_expense";
    const action = editingNode
      ? updateBudgetNode({
          id: editingNode.id,
          name: values.name,
          budget: values.budget ?? 0,
          formulaExpression: values.formulaExpression ?? null,
          note: values.note ?? null,
        })
      : createBudgetNode({
          name: values.name,
          parentId: values.parentId ?? null,
          level: values.level,
          kind: values.kind,
          taxClass,
          budget: values.budget ?? 0,
          formulaExpression: values.formulaExpression ?? null,
          note: values.note ?? null,
        });
    void applyMutation(() => action, values.name + " bucket을 저장했습니다.");
    setBucketModalOpen(false);
    setEditingNode(null);
    form.resetFields();
  }
  function reorderBucket(draggedId: string, targetId: string) {
    if (!data || draggedId === targetId) return;
    const dragged = data.budgetTree.find((node) => node.id === draggedId);
    const target = data.budgetTree.find((node) => node.id === targetId);
    if (
      !dragged ||
      !target ||
      dragged.parentId !== target.parentId ||
      dragged.level !== target.level
    )
      return;
    const siblings = data.budgetTree
      .filter(
        (node) =>
          node.parentId === dragged.parentId && node.level === dragged.level,
      )
      .sort((a, b) => a.order - b.order);
    const from = siblings.findIndex((node) => node.id === draggedId);
    const to = siblings.findIndex((node) => node.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...siblings];
    const moved = reordered.splice(from, 1)[0];
    if (!moved) return;
    reordered.splice(to, 0, moved);
    void applyMutation(
      () => reorderBudgetNodes(reordered.map((node) => node.id)),
      "bucket 순서를 저장했습니다.",
    );
  }
  function saveLedger(values: LedgerFormValues) {
    void applyMutation(
      () => createLedgerEntry(values),
      "회계 항목을 저장했습니다.",
    );
    setLedgerModalOpen(false);
    ledgerForm.resetFields();
  }

  const parentOptions =
    data?.budgetTree.filter(
      (node) =>
        node.level === (bucketLevel === "minor" ? "middle" : "major") &&
        node.kind === "expense",
    ) ?? [];
  const bucketOptions = data
    ? Array.from(
        new Set([
          ...data.budgetTree
            .filter((node) => node.level === "minor")
            .map((node) => node.name),
          ...data.incomeLines.map((line) => line.name),
        ]),
      ).map((value) => ({ value, label: value }))
    : [];

  return (
    <div
      className={
        "finance-app" +
        (sidebarCollapsed ? " finance-app--sidebar-collapsed" : "") +
        (mobileNavOpen ? " finance-app--mobile-nav-open" : "")
      }
    >
      <aside className="finance-sidebar">
        <div className="finance-brand">
          <span>N</span>
          <strong>NUT</strong>
          <small>INTERNAL OPERATIONS</small>
        </div>
        <div className="finance-sidebar__label">WORKSPACE</div>
        <AppNav
          view={view}
          onView={(nextView) => {
            setView(nextView);
            setMobileNavOpen(false);
          }}
        />
        <div className="finance-sidebar__bottom">
          <div className="finance-sidebar__label">ACCESS</div>
          <div className="finance-access">
            <Avatar size={34}>주</Avatar>
            <div>
              <strong>주형</strong>
              <span>admin / acting only</span>
            </div>
          </div>
          <div className="finance-sidebar__term">
            <span>Secretary term</span>
            <b>
              {data
                ? shortDate(data.period.start) +
                  " – " +
                  shortDate(data.period.end)
                : "—"}
            </b>
          </div>
          <Button
            className="finance-sidebar__collapse"
            type="text"
            icon={
              sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
            }
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {sidebarCollapsed ? "" : "사이드바 접기"}
          </Button>
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          className="finance-mobile-overlay"
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="메뉴 닫기"
        />
      )}
      <main className="finance-main">
        <header className="finance-header">
          <div className="finance-header__heading">
            <Button
              className="finance-mobile-nav-toggle"
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileNavOpen(true)}
              aria-label="메뉴 열기"
            />
            <div>
              <span className="finance-header__context">
                admin.ghsnu.com / nut
              </span>
              <h2>NUT Finance</h2>
            </div>
          </div>
          <div className="finance-header__controls">
            <Select
              size="small"
              value={data?.period.id}
              options={
                data
                  ? [{ value: data.period.id, label: data.period.label }]
                  : []
              }
            />
            <Select
              size="small"
              value={data?.fiscalYear.label}
              options={
                data
                  ? [
                      {
                        value: data.fiscalYear.label,
                        label: data.fiscalYear.label,
                      },
                    ]
                  : []
              }
            />
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => void load()}
              aria-label="새로고침"
            />
            <Button className="finance-header__avatar" shape="circle">
              주
            </Button>
          </div>
        </header>
        {error && (
          <Alert
            className="finance-alert finance-alert--top"
            type="error"
            showIcon
            message={error}
            action={
              <Button size="small" onClick={() => void load()}>
                다시 시도
              </Button>
            }
          />
        )}
        {loading && (
          <div className="finance-loading">
            <Card>
              <Typography.Text>재무 구조를 불러오는 중입니다.</Typography.Text>
            </Card>
          </div>
        )}
        {!loading && data && (
          <>
            {view === "budget" && (
              <BudgetView
                data={data}
                onParameterChange={(id, value) =>
                  void applyMutation(
                    () => updateParameter(id, value),
                    "환경설정 변수를 저장했습니다.",
                  )
                }
                onParameterAdd={(values) =>
                  void applyMutation(
                    () => createParameter(values),
                    "환경설정 변수를 추가했습니다.",
                  )
                }
                onParameterDelete={(id) =>
                  void applyMutation(
                    () => deleteParameter(id),
                    "환경설정 변수를 삭제했습니다.",
                  )
                }
                onAddBucket={openBucketModal}
                onReorder={reorderBucket}
                onEditBucket={(node) =>
                  openBucketModal(node.level, node.parentId, node)
                }
              />
            )}
            {view === "ledger" && (
              <LedgerView
                data={data}
                onAdd={() => {
                  ledgerForm.setFieldsValue({
                    date: data.period.asOf,
                    type: "expense",
                    bucket: bucketOptions[0]?.value,
                    detail: undefined,
                    amount: 0,
                    taxClass: "tax_deductible_expense",
                  });
                  setLedgerModalOpen(true);
                }}
                onUpdate={(entry, patch) =>
                  void applyMutation(() =>
                    updateLedgerEntry({ id: entry.id, ...patch }),
                  )
                }
              />
            )}
            {view === "accounting" && <AccountingView data={data} />}
          </>
        )}
        {!loading && !data && (
          <div className="finance-empty">
            <Empty description="NUT 데이터를 불러오지 못했습니다." />
          </div>
        )}
      </main>
      <Modal
        title={editingNode ? "Bucket 수정" : "Bucket 생성"}
        open={bucketModalOpen}
        okText={editingNode ? "저장" : "생성"}
        cancelText="취소"
        onCancel={() => {
          setBucketModalOpen(false);
          setEditingNode(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={saveBucket}>
          <Form.Item
            label="Bucket 이름"
            name="name"
            rules={[{ required: true, message: "이름을 입력하세요." }]}
          >
            <Input placeholder="예: 리더십 워크숍" />
          </Form.Item>
          {!editingNode && (
            <Form.Item label="단계" name="level">
              <Select
                value={bucketLevel}
                onChange={(value: BucketLevel) => {
                  setBucketLevel(value);
                  setBucketParentId(null);
                  form.setFieldValue("parentId", null);
                }}
                options={Object.entries(levelLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
          )}
          {!editingNode && (
            <Form.Item
              label="상위 bucket"
              name="parentId"
              rules={[
                {
                  required: bucketLevel !== "major",
                  message: "상위 bucket을 선택하세요.",
                },
              ]}
            >
              <Select
                allowClear
                disabled={bucketLevel === "major"}
                value={bucketParentId ?? undefined}
                onChange={setBucketParentId}
                options={parentOptions.map((node) => ({
                  value: node.id,
                  label: levelLabels[node.level] + " · " + node.name,
                }))}
                placeholder={
                  bucketLevel === "major"
                    ? "대분류는 상위 없음"
                    : "상위 bucket 선택"
                }
              />
            </Form.Item>
          )}
          <Form.Item label="항목 유형" name="kind">
            <Select
              options={Object.entries(kindLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item label="진행안 예산" name="budget">
            <InputNumber className="finance-full-width" min={0} step={10000} />
          </Form.Item>
          <Form.Item
            label="산출식 (환경설정 변수 ID 사용)"
            name="formulaExpression"
          >
            <Input.TextArea
              rows={2}
              placeholder="예: 80000 * summer-participants"
            />
          </Form.Item>
          <Select
            className="formula-variable-picker"
            allowClear
            showSearch
            placeholder="변수 삽입"
            options={data?.parameters.map((parameter) => ({
              value: parameter.id,
              label:
                parameter.id +
                " · " +
                parameter.label +
                " = " +
                parameter.value +
                parameter.unit,
            }))}
            onSelect={(value) => {
              const current = form.getFieldValue("formulaExpression") ?? "";
              form.setFieldValue(
                "formulaExpression",
                current + (current ? " " : "") + value,
              );
            }}
          />
          <Typography.Text className="formula-help">
            변수 ID를 산술식에 넣으면 환경설정 값이 자동으로 매칭됩니다. 지원
            함수: round, floor, ceil, abs, min, max
          </Typography.Text>
          <Form.Item label="산출식 설명 / 비고" name="note">
            <Input.TextArea
              rows={2}
              placeholder="예: 인당 80,000원 × 방학 프로젝트 참여 인원"
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="회계 항목 추가"
        open={ledgerModalOpen}
        okText="저장"
        cancelText="취소"
        onCancel={() => {
          setLedgerModalOpen(false);
          ledgerForm.resetFields();
        }}
        onOk={() => ledgerForm.submit()}
      >
        <Form form={ledgerForm} layout="vertical" onFinish={saveLedger}>
          <Space.Compact block>
            <Form.Item label="일시" name="date" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item label="유형" name="type" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "expense", label: "지출" },
                  { value: "income", label: "수입" },
                ]}
              />
            </Form.Item>
          </Space.Compact>
          <Form.Item label="Bucket" name="bucket" rules={[{ required: true }]}>
            <Select showSearch options={bucketOptions} />
          </Form.Item>
          <Form.Item
            label="상세 내역"
            name="detail"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="금액" name="amount" rules={[{ required: true }]}>
            <InputNumber className="finance-full-width" min={0} step={1000} />
          </Form.Item>
          <Form.Item
            label="세무 분류"
            name="taxClass"
            rules={[{ required: true }]}
          >
            <Select
              options={Object.entries(taxClassLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item label="청구인" name="claimant">
            <Input />
          </Form.Item>
          <Form.Item label="비고" name="note">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
