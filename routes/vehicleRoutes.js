import express from "express";
import * as vehicleController from "../controllers/vehicleController.js";

const router = express.Router();

router.route("/")
  .get(vehicleController.getVehicles)
  .post(vehicleController.createVehicle);

router.route("/:id")
  .get(vehicleController.getVehicle)
  .put(vehicleController.updateVehicle)
  .delete(vehicleController.deleteVehicle);

router.post("/:id/maintenance", vehicleController.scheduleMaint);
router.post("/:id/maintenance/complete", vehicleController.completeMaint);

export default router;
