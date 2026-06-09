import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: {
    type: String,
    enum: ["operator", "admin"],
    default: "operator",
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", UserSchema);
