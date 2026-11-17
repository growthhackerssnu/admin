import type { AcquisitionQuarterApi } from "./acquisitionQuarter";
import type {
  AssignmentInput,
  AssignmentMember,
  AssignmentPreview,
  OperationsSummary,
} from "./liveRepository";
import type { MessageTemplateStore } from "./messageTemplates";

/** 설정 페이지가 쓰는 호출만 모은 것. 실서버 저장소와 샘플 저장소가 같이 맞춘다. */
export interface SettingsRepository {
  readonly acquisitionQuarters: AcquisitionQuarterApi;
  readonly messageTemplates: MessageTemplateStore;
  loadOperations(): Promise<{
    summary: OperationsSummary;
    members: AssignmentMember[];
  }>;
  setIntake(
    paused: boolean,
    expectedVersion: number,
    key: string,
  ): Promise<unknown>;
  previewAssignment(input: AssignmentInput): Promise<AssignmentPreview>;
  confirmAssignment(
    preview: AssignmentPreview,
    memberIds: string[],
    key: string,
  ): Promise<unknown>;
}
