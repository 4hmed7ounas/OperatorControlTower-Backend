import Groq from "groq-sdk";
import dotenv from "dotenv";
import Vehicle from "../models/vehicle.js";
import Booking from "../models/booking.js";
import Alert from "../models/alert.js";
import { scheduleMaintenance } from "../services/vehicleService.js";
import { markBookingAsLate, reassignVehicle, getRiskyBookings } from "../services/bookingService.js";

dotenv.config();

// Initialize Groq client if key is available and not the placeholder
const apiKey = process.env.GROQ_API_KEY;
const isApiKeyConfigured = apiKey && apiKey !== "gsk_your_api_key_here" && apiKey.trim() !== "";
let groq = null;

if (isApiKeyConfigured) {
  try {
    groq = new Groq({ apiKey });
  } catch (error) {
    console.error("Error initializing Groq client:", error.message);
  }
} else {
  console.warn("GROQ_API_KEY is not configured. Running Copilot in database-driven Mock/Fallback mode.");
}

/**
 * Gets a clean, formatted text summary of all vehicles, bookings, and alerts.
 */
async function getSystemContext() {
  const vehicles = await Vehicle.find({});
  const bookings = await Booking.find({}).populate("vehicleId");
  const alerts = await Alert.find({ status: "open" });

  const vehicleSummary = vehicles.map(v => ({
    id: v._id.toString(),
    name: v.name,
    type: v.type,
    status: v.status,
    totalUsageHours: v.totalUsageHours,
    maintenanceDueHours: v.maintenanceDueHours,
    location: v.location,
  }));

  const bookingSummary = bookings.map(b => ({
    id: b._id.toString(),
    customerName: b.customerName,
    vehicleId: b.vehicleId ? b.vehicleId._id.toString() : null,
    vehicleName: b.vehicleId ? b.vehicleId.name : "None",
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    riskScore: b.riskScore,
  }));

  const alertSummary = alerts.map(a => ({
    id: a._id.toString(),
    type: a.type,
    message: a.message,
    severity: a.severity,
    relatedId: a.relatedId,
  }));

  return {
    timestamp: new Date().toISOString(),
    vehicles: vehicleSummary,
    bookings: bookingSummary,
    alerts: alertSummary,
  };
}

export const SYSTEM_PROMPT = `
You are the "Ops Copilot" for a production-grade fleet management control tower.
You have access to the current system state, which includes vehicles, bookings, and open alerts.

Your job:
- Analyze the operational data to detect problems, late bookings, overdue vehicles, or maintenance issues.
- Recommend operational tools to resolve the issues.
- Answer user queries in a direct, professional, SaaS command-center style.

You MUST respond in ONE of two formats:

1. Normal response (Use this for general questions, summaries, explanations, or if no action is needed):
Respond in clear, professional markdown bullet points.

2. Action response (Use this ONLY when the operator asks you to perform a task, or when an urgent action is detected, and you can map it to one of the available tools):
You must output a single JSON object. No markdown block, no extra text.
{
  "action": "tool_name",
  "args": { ... }
}

Available tools:
- markBookingAsLate(bookingId: string)
- scheduleMaintenance(vehicleId: string)
- reassignVehicle(bookingId: string, vehicleId: string)
- getRiskyBookings()
- getFleetStatus()

Example Action triggers:
- If a booking is late/unclaimed and the user asks to flag it or solve it, trigger "markBookingAsLate" with bookingId.
- If a vehicle needs maintenance and the user asks to schedule it, trigger "scheduleMaintenance" with vehicleId.
- If a vehicle is broken/in maintenance and we need to reassign a customer's booking to another available vehicle of the same or compatible type, trigger "reassignVehicle" with bookingId and vehicleId.
- If the user asks for risky bookings, trigger "getRiskyBookings".
- If the user asks for fleet status/metrics, trigger "getFleetStatus".

Rules:
- If you respond with JSON, make sure the arguments contain actual MongoDB ObjectId strings from the provided context (e.g. matching "id" fields), not placeholders.
- If you are suggesting an action, do it with the JSON structure. The operator will verify it before running.
`;

/**
 * Handles Copilot queries using Groq (LLaMA 3) or falls back to a smart mock.
 */
export async function askCopilot(userMessage) {
  const context = await getSystemContext();

  if (groq) {
    try {
      const systemContent = `${SYSTEM_PROMPT}\n\nCURRENT SYSTEM STATE:\n${JSON.stringify(context, null, 2)}`;

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1, // low temp for structured accuracy
      });

      const rawText = response.choices[0].message.content.trim();
      return processCopilotResponse(rawText);
    } catch (error) {
      console.error("Groq API error, falling back to database mock:", error.message);
      return runMockCopilot(userMessage, context);
    }
  } else {
    // Database-driven Mock fallback
    return runMockCopilot(userMessage, context);
  }
}

/**
 * Normalizes the AI response and checks if it contains a structured JSON tool call.
 */
function processCopilotResponse(rawText) {
  // Clean markdown block wrappers if LLM returned JSON in standard code blocks
  let cleanText = rawText;
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.substring(7);
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.substring(3);
  }
  if (cleanText.endsWith("```")) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  cleanText = cleanText.trim();

  try {
    const parsed = JSON.parse(cleanText);
    if (parsed.action) {
      return {
        type: "action",
        action: parsed.action,
        args: parsed.args || {},
        text: `Proposed action: **${parsed.action}** with parameters: ${JSON.stringify(parsed.args)}`,
      };
    }
  } catch (e) {
    // Not JSON, treat as natural language response
  }

  return {
    type: "text",
    text: rawText,
  };
}

/**
 * Executes a tool action triggered by the Copilot.
 */
export async function executeCopilotAction(actionName, args, triggeredBy = "ai") {
  try {
    let result = null;
    let message = "";

    switch (actionName) {
      case "markBookingAsLate":
        if (!args.bookingId) throw new Error("Missing bookingId");
        result = await markBookingAsLate(args.bookingId, triggeredBy);
        message = `Successfully marked booking for ${result.customerName} as late.`;
        break;

      case "scheduleMaintenance":
        if (!args.vehicleId) throw new Error("Missing vehicleId");
        result = await scheduleMaintenance(args.vehicleId, triggeredBy);
        message = `Successfully scheduled maintenance for vehicle "${result.name}".`;
        break;

      case "reassignVehicle":
        if (!args.bookingId || !args.vehicleId) throw new Error("Missing bookingId or vehicleId");
        result = await reassignVehicle(args.bookingId, args.vehicleId, triggeredBy);
        message = `Successfully reassigned booking for ${result.customerName} to vehicle "${result.vehicleId.name}".`;
        break;

      case "getRiskyBookings":
        result = await getRiskyBookings();
        message = `Found ${result.length} high-risk bookings.`;
        break;

      case "getFleetStatus":
        const vehicles = await Vehicle.find({});
        const activeCount = vehicles.filter(v => v.status === "in_use").length;
        const maintCount = vehicles.filter(v => v.status === "maintenance").length;
        const availCount = vehicles.filter(v => v.status === "available").length;
        result = { activeCount, maintCount, availCount, total: vehicles.length };
        message = `Fleet Status: ${activeCount} active, ${maintCount} in maintenance, ${availCount} available (Total: ${vehicles.length}).`;
        break;

      default:
        throw new Error(`Unknown action: ${actionName}`);
    }

    return {
      status: "success",
      message,
      action: actionName,
      data: result,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message,
      action: actionName,
    };
  }
}

/**
 * Fallback AI response handler that uses the database status to answer common queries.
 */
function runMockCopilot(message, context) {
  const query = message.toLowerCase();

  // 1. Context-Aware Action Explanation
  if (query.includes("explain why you suggested") || query.includes("why did you suggest")) {
    let actionName = "this action";
    if (query.includes("schedulemaintenance")) actionName = "Scheduling Maintenance";
    if (query.includes("markbookingaslate")) actionName = "Marking Booking as Late";
    if (query.includes("reassignvehicle")) actionName = "Reassigning Vehicle";

    return {
      type: "text",
      text: `### 🔍 Recommendation Analysis: ${actionName}\n\nI suggested this action based on real-time metrics in the Ops Control Tower:\n\n* **Risk Mitigation**: The target resource has crossed operational thresholds (e.g., usage limit exceeded or pickup window elapsed).\n* **System Integrity**: Triggering this tool updates the database states, resolves the open alerts, and keeps the fleet logs accurate.\n* **Operational Impact**: By executing this, you prevent cascading delays in customer bookings and protect vehicle lifetime value.\n\n*Click **Run Action** in the card above to execute this tool directly.*`,
    };
  }

  // 2. Context-Aware Alert Explanation
  if (query.includes("explain this alert") || query.includes("explain the alert")) {
    // Extract the alert text if possible
    const match = message.match(/"([^"]+)"/) || message.match(/'([^']+)'/);
    const alertText = match ? match[1] : "the alert message";

    let resolution = "Perform a manual check on the fleet status and proceed with standard dispatcher workflows.";
    if (alertText.toLowerCase().includes("maintenance")) {
      resolution = "Schedule maintenance immediately to avoid engine wear. Once in maintenance, the alert will auto-resolve.";
    } else if (alertText.toLowerCase().includes("overdue") || alertText.toLowerCase().includes("late")) {
      resolution = "Contact the customer or mark the booking status as 'late' to notify management and flag the account.";
    } else if (alertText.toLowerCase().includes("idle")) {
      resolution = "No immediate danger, but consider lowering pricing or relocating the vehicle to a higher-demand hub.";
    }

    return {
      type: "text",
      text: `### 🚨 Operational Advisory\n\n**Alert Details**:\n> "${alertText}"\n\n**Analysis**:\n* **Trigger**: The rules engine detected an operational anomaly matching this alert type.\n* **Severity**: This warning warrants immediate operator oversight to maintain target utilization rates.\n\n**Recommended Corrective Action**:\n* ${resolution}`,
    };
  }

  // 3. Tool Trigger: What needs attention / issues
  if (query.includes("attention") || query.includes("attention right now") || query.includes("issues") || query.includes("problems")) {
    // Check if we have high-severity alerts
    const criticalAlert = context.alerts.find(a => a.severity === "high");
    if (criticalAlert) {
      if (criticalAlert.type === "maintenance_due") {
        return {
          type: "action",
          action: "scheduleMaintenance",
          args: { vehicleId: criticalAlert.relatedId },
          text: `⚠️ **Attention Required**: Vehicle needs maintenance.\n\n* Alert: "${criticalAlert.message}"\n* Suggestion: Click **Run Action** to schedule maintenance.`,
        };
      } else if (criticalAlert.type === "late_booking") {
        return {
          type: "action",
          action: "markBookingAsLate",
          args: { bookingId: criticalAlert.relatedId },
          text: `⚠️ **Attention Required**: Overdue return detected.\n\n* Alert: "${criticalAlert.message}"\n* Suggestion: Click **Run Action** to mark this booking as Late.`,
        };
      }
    }

    // Try medium alerts
    const mediumAlert = context.alerts.find(a => a.severity === "medium");
    if (mediumAlert && mediumAlert.type === "late_booking") {
      return {
        type: "action",
        action: "markBookingAsLate",
        args: { bookingId: mediumAlert.relatedId },
        text: `⚠️ **Late Pickup Warning**:\n\n* Alert: "${mediumAlert.message}"\n* Suggestion: Click **Run Action** to flag booking as late.`,
      };
    }

    // Suggest looking at risky bookings
    return {
      type: "action",
      action: "getRiskyBookings",
      args: {},
      text: `No immediate critical alerts are active, but there might be high-risk bookings. Suggest checking them.`,
    };
  }

  // 4. Tool Trigger: Underperforming / risky vehicles / bookings
  if (query.includes("underperforming") || query.includes("risky") || query.includes("risk")) {
    const riskyBooking = context.bookings.find(b => b.riskScore >= 50 && b.status !== "completed");
    if (riskyBooking) {
      // Find an available vehicle of the same type to suggest reassignment
      const assignedVehicle = context.vehicles.find(v => v.id === riskyBooking.vehicleId);
      if (assignedVehicle) {
        const substitute = context.vehicles.find(v => v.status === "available" && v.type === assignedVehicle.type && v.id !== assignedVehicle.id);
        if (substitute) {
          return {
            type: "action",
            action: "reassignVehicle",
            args: { bookingId: riskyBooking.id, vehicleId: substitute.id },
            text: `⚠️ **High Risk Booking**: Booking for **${riskyBooking.customerName}** is flagged with **${riskyBooking.riskScore}%** risk (vehicle "${assignedVehicle.name}" is close to maintenance hours).\n\n* Suggestion: Reassign booking to available vehicle **"${substitute.name}"**.`,
          };
        }
      }
      return {
        type: "action",
        action: "getRiskyBookings",
        args: {},
        text: `We have active bookings flagged with high risk scores. Let's pull the full list.`,
      };
    }
    return {
      type: "text",
      text: `### Operational Health Summary\n\n* All active bookings have low risk scores (<50).\n* Fleet utilization is healthy.\n* No underperforming vehicles detected based on current bookings.`,
    };
  }

  // 5. Tool Trigger: Summarize operations
  if (query.includes("summarize") || query.includes("summary") || query.includes("operations")) {
    const totalVehicles = context.vehicles.length;
    const inUse = context.vehicles.filter(v => v.status === "in_use").length;
    const maintenance = context.vehicles.filter(v => v.status === "maintenance").length;
    const available = context.vehicles.filter(v => v.status === "available").length;

    const activeBookings = context.bookings.filter(b => b.status === "ongoing" || b.status === "late").length;
    const upcomingBookings = context.bookings.filter(b => b.status === "confirmed").length;
    const openAlerts = context.alerts.length;

    return {
      type: "text",
      text: `### Operations Control Tower Summary\n\nHere is an overview of the operations today:\n\n* **Fleet Status**:\n  * Total vehicles: **${totalVehicles}**\n  * Active (In-Use): **${inUse}**\n  * In Maintenance: **${maintenance}**\n  * Available: **${available}**\n* **Bookings**:\n  * Ongoing/Active Bookings: **${activeBookings}**\n  * Upcoming Bookings: **${upcomingBookings}**\n* **Alerts**:\n  * Currently open: **${openAlerts}** active alerts require your review.\n\n*Suggestion*: Ask me "What needs attention right now?" to resolve specific alerts.`,
    };
  }

  // General questions
  return {
    type: "text",
    text: `### Hello! I am your Fleet Ops Copilot. 🚀\n\nHere are some operations-focused queries you can ask me:\n\n* 🚨 **"What needs attention right now?"** (Scans the control tower for alerts and suggests tool actions)\n* 📊 **"Summarize today's operations"** (Provides a quick breakdown of your fleet & bookings status)\n* ⚠️ **"Which vehicles are underperforming?"** (Lists vehicles close to maintenance or bookings at risk)\n\n*Note: Running in database-driven fallback mode. All tool recommendations will interact directly with the active backend services.*`,
  };
}
