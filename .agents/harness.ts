import { readFileSync } from "node:fs";
import path from "node:path";
import { getToolDefinitions } from "@theorvane/type-chain";
import { buildAgent } from "@theorvane/type-chain/agent";
import { initChatModel } from "langchain";
import { ReviewExplanationAgent } from "./review-explanation-agent.js";
import type { ReviewContext } from "./types.js";

function loadFixture(): ReviewContext {
  // Resolved relative to the process cwd (repo root), since npm scripts always run from there.
  const fixturePath = path.join(process.cwd(), "fixtures", "review-fixture.json");
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ReviewContext;
}

async function main() {
  const context = loadFixture();
  const agentInstance = new ReviewExplanationAgent(context);

  const definitions = getToolDefinitions(agentInstance);
  console.log(
    `Wired ${definitions.length} tools: ${definitions.map((definition) => definition.name).join(", ")}`,
  );

  const modelId = process.env.PLANGUARD_MODEL;
  if (!modelId) {
    console.log(
      "PLANGUARD_MODEL not set — skipping live invocation. Tool wiring verified only.\n" +
        "Set PLANGUARD_MODEL (e.g. anthropic:claude-sonnet-5) and the matching API key to run the agent live.",
    );
    return;
  }

  const model = await initChatModel(modelId);
  const agent = buildAgent(agentInstance, { model });

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content:
          "Summarize what is changing in this pull request and call out anything that needs review before deployment.",
      },
    ],
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
