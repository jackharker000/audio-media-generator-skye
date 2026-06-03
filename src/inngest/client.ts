import { EventSchemas, Inngest } from "inngest";

type Events = {
  "song/generate.requested": { data: { jobId: string } };
  "music/completed": {
    data: { jobId: string; musicJobId?: string; audioUrl?: string; error?: string };
  };
};

export const inngest = new Inngest({
  id: "mnemosong",
  schemas: new EventSchemas().fromRecord<Events>(),
});
