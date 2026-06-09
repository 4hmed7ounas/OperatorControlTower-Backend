import express from "express";
import * as copilotController from "../controllers/copilotController.js";

const router = express.Router();

router.post("/chat", copilotController.chat);
router.post("/execute", copilotController.execute);

export default router;
