import { EventSchemas, Inngest } from "inngest";

type Events = {
  "dhbot/run.sourcing.requested": {
    data: { runId: string };
  };
  "dhbot/company.decision.batch": {
    data: { runId: string; decidedBy: string };
  };
  "dhbot/contacts.research.requested": {
    data: { runId: string };
  };
  "dhbot/contact.decision.batch": {
    data: { runId: string; decidedBy: string };
  };
};

export const inngest = new Inngest({
  id: "dhbot",
  schemas: new EventSchemas().fromRecord<Events>(),
});
