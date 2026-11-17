import { createContext, useContext, useEffect, useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  templateChoice,
  templateKindLabels,
  type MessageTemplate,
  type MessageTemplateKind,
  type MessageTemplateStore,
} from "./messageTemplates";

/** 초안 화면이 함께 쓰는 양식 목록. 못 불러왔으면 null이고, 그때는 선택도 차단도 하지 않는다. */
export const MessageTemplatesContext = createContext<MessageTemplate[] | null>(
  null,
);

export function useMessageTemplateList(store: MessageTemplateStore | undefined) {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  useEffect(() => {
    if (!store) return;
    let active = true;
    // 양식 목록은 보조 정보다. 실패해도 초안 화면은 그대로 쓰고 서버 검증에 맡긴다.
    void store
      .load()
      .then((data) => {
        if (active) setTemplates(data.templates);
      })
      .catch(() => {
        if (active) setTemplates(null);
      });
    return () => {
      active = false;
    };
  }, [store]);
  return templates;
}

/** 해당 경우의 양식 선택 상태. 사용자가 고르기 전에는 초안의 양식, 그다음 서버 추천 순으로 따른다. */
export function useTemplateChoice(
  kind: MessageTemplateKind,
  draftTemplateId: string | null | undefined,
  suggestedTemplateId: string | null | undefined,
) {
  const templates = useContext(MessageTemplatesContext);
  const [picked, setPicked] = useState<string | null>(null);
  const choice = templateChoice(templates, kind, [
    picked,
    draftTemplateId,
    suggestedTemplateId,
  ]);
  return {
    ...choice,
    kindLabel: templateKindLabels[kind],
    selectedId: choice.defaultId,
    select: setPicked,
    blockedMessage: choice.blocked
      ? `설정에서 ${templateKindLabels[kind]} 양식을 먼저 채우세요.`
      : "",
  };
}

/** 양식이 2개 이상일 때만 보이는 선택 칸. */
export function TemplateSelect({
  id,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string;
  options: MessageTemplate[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (options.length < 2) return null;
  return (
    <Field className="uw-template-select">
      <FieldLabel htmlFor={id}>메일 양식</FieldLabel>
      <Select
        value={value ?? ""}
        disabled={disabled}
        onValueChange={onChange}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="양식 선택" />
        </SelectTrigger>
        <SelectContent position="popper" className="dw-select-content">
          {options.map((template) => (
            <SelectItem
              key={template.id}
              value={template.id}
              disabled={template.version === 0}
            >
              {template.name}
              {template.version === 0 ? " · 비어 있음" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
