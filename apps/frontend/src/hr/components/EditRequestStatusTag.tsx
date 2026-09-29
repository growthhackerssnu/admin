import { Tag } from "antd";
import type { EditRequestStatus } from "../lib/api";

const LABEL: Record<EditRequestStatus, string> = {
  pending: "대기중",
  approved: "승인됨",
  rejected: "반려됨",
};

const COLOR: Record<EditRequestStatus, string> = {
  pending: "gold",
  approved: "green",
  rejected: "red",
};

export function EditRequestStatusTag({ status }: { status: EditRequestStatus }) {
  return <Tag color={COLOR[status]}>{LABEL[status]}</Tag>;
}
