import { Router } from "express";
import { signerUsersListGuard } from "../middleware/signerUsersGuard.js";
import { userService } from "../services/userService.js";

export function buildSignerUsersRoutes() {
    const r = Router();
    r.use(signerUsersListGuard);
    r.get("/signers", async (req, res) => {
        try {
            const search =
                typeof req.query.search === "string" ? req.query.search : "";
            const list = search
                ? await userService.search(search)
                : await userService.list();
            
            // Filter users to only include those with editor role (role ID = 2)
            const editorUsers = list.filter(user => user.rolIds.includes(2));
            
            res.json(editorUsers);
        } catch (e) {
            const status = e === 404 || e?.code === 404 ? 404 : 500;
            res.status(status).json({ error: e?.code || "internal_error" });
        }
    });
    return r;
}
