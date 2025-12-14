//src/routes/units.routes.js
import express from "express";
import { unitRepo } from "../repositories/unitRepo.js";

const router = express.Router();

/** GET /admin/units  -> list organizational units */
router.get("/units", async (_req, res) => {
  try {
    const list = await unitRepo.findAll();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
