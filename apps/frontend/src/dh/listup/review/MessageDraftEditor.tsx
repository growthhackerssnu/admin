import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Shared editor surface. Business permissions belong to the caller, not a Candidate. */
export function MessageDraftEditor({
  subject,
  body,
  onSubject,
  onBody,
  readOnly = false,
  pending = false,
  sent = false,
}: {
  subject: string;
  body: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  readOnly?: boolean;
  pending?: boolean;
  sent?: boolean;
}) {
  return (
    <div className="uw-message-fields">
      <Field>
        <FieldLabel htmlFor="uw-message-subject" required={!sent}>
          {sent ? "당시 제목" : "제목"}
        </FieldLabel>
        <Input
          id="uw-message-subject"
          aria-required={!sent}
          disabled={pending}
          readOnly={readOnly}
          value={subject}
          onChange={(e) => onSubject(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="uw-message-body" required={!sent}>
          {sent ? "당시 본문" : "본문"}
        </FieldLabel>
        <Textarea
          id="uw-message-body"
          aria-required={!sent}
          disabled={pending}
          readOnly={readOnly}
          rows={18}
          value={body}
          onChange={(e) => onBody(e.target.value)}
        />
      </Field>
    </div>
  );
}
