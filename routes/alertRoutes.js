import express from "express";
import * as alertController from "../controllers/alertController.js";

const router = express.Router();

router.get("/", alertController.getAlerts);
router.get("/:id", alertController.getAlert);
router.post("/:id/resolve", alertController.resolveAlert);

export default router;
