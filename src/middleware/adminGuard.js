// Minimal admin check. Replace with real auth when HU de seguridad esté lista.
export function adminGuard(req, res, next) {
  // Expect req.user injected por middleware de auth futuro
  const user = req.user || { role: "Administrador" };
  if (user.role !== "Administrador")
    return res.status(403).json({ error: "forbidden" });
  req.actor = { id: user.id ?? 0, email: user.email ?? "admin@museocr.go.cr" };
  next();
}
