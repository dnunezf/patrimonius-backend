// src/middleware/adminGuard.js
export function adminGuard(req, res, next) {
  const user = req.user || {
    role: "Administrador",
    rolId: 1,
    roles: ["ADMINISTRADOR"],
  };
  const isAdmin =
    user.rolId === 1 ||
    String(user.role || "")
      .toUpperCase()
      .startsWith("ADMIN") ||
    (Array.isArray(user.roles) &&
      user.roles.some((r) => String(r).toUpperCase().startsWith("ADMIN")));
  if (!isAdmin) return res.status(403).json({ error: "forbidden" });

  req.actor = {
    id: user.id ?? null,
    email: user.email ?? "admin@museocr.go.cr",
  };
  next();
}
