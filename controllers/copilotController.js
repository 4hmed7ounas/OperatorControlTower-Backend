import { askCopilot, executeCopilotAction } from "../ai/copilotService.js";
import { evaluateRules } from "../engine/rulesEngine.js";

export async function chat(req, res) {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const reply = await askCopilot(message);
    res.json(reply);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function execute(req, res) {
  try {
    const { action, args } = req.body;
    if (!action) {
      return res.status(400).json({ error: "Action name is required" });
    }

    const result = await executeCopilotAction(action, args, "user");
    
    // Evaluate operational rules immediately after tool execution
    // to refresh the active state of alerts in the database
    await evaluateRules();

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
