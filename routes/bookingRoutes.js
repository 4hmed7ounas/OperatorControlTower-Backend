import express from "express";
import * as bookingController from "../controllers/bookingController.js";

const router = express.Router();

router.route("/")
  .get(bookingController.getBookings)
  .post(bookingController.createBooking);

router.route("/:id")
  .get(bookingController.getBooking)
  .put(bookingController.updateBooking)
  .delete(bookingController.deleteBooking);

router.post("/:id/late", bookingController.markAsLate);
router.post("/:id/reassign", bookingController.reassign);

export default router;
