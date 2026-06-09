import "./utils/mongooseMock.js";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

// Import routes
import bookingRoutes from "./routes/bookingRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import copilotRoutes from "./routes/copilotRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";

// Import rules engine
import { evaluateRules } from "./engine/rulesEngine.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fleet-ops";

// Middlewares
app.use(cors());
app.use(express.json());

// Routes Mount
app.use("/api/bookings", bookingRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/copilot", copilotRoutes);
app.use("/api/system", systemRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Database Connection & Server Startup
mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 })
  .then(async () => {
    console.log("Connected to MongoDB successfully at:", MONGODB_URI);
    
    // Run the rules engine once immediately on startup
    try {
      const runSummary = await evaluateRules();
      console.log("Initial rules engine evaluation completed:", runSummary);
    } catch (err) {
      console.error("Failed to run initial rules engine check:", err.message);
    }

    // Set up rules engine periodic scan (every 60 seconds)
    setInterval(async () => {
      try {
        await evaluateRules();
      } catch (err) {
        console.error("Rules engine periodic run error:", err.message);
      }
    }, 60000);

    app.listen(PORT, () => {
      console.log(`Express server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
