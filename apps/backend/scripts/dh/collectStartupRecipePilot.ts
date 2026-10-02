import { collectStartupRecipe } from "../../src/dh/inngest/collectStartupRecipe";

// A bounded manual collection run for validating the new source against a live DB.
// This never queues AI research; the separate research schedule remains gated.
if (process.env.HUMAN_REVIEW_PIPELINE_ENABLED !== "true") {
  throw new Error("HUMAN_REVIEW_PIPELINE_ENABLED=true is required for a pilot run.");
}

void collectStartupRecipe({ maxArchivePages: 1, maxArticles: 1 }).then(
  (result) => console.log(JSON.stringify(result)),
  (error) => { console.error(error); process.exitCode = 1; },
);
