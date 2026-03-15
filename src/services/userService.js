//src/service/userService.js
import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2;
const ARCHIVISTA_ID = 3;

function normalizeEditorPerms(input) {
    const raw = input?.editorPermissions ?? input?.permisosEditor ?? [];
    const allowed = new Set(["EDIT", "SIGN"]);
    return Array.from(new Set((Array.isArray(raw) ? raw : []).filter((p) => allowed.has(p))));
}

function capsFromEditorPerms(perms) {
    const set = new Set(Array.isArray(perms) ? perms : []);
    return { canEdit: set.has("EDIT"), canSign: set.has("SIGN") };
}

function eligibleForUpload(roleIds = []) {
    return roleIds.includes(EDITOR_ID) || roleIds.includes(ARCHIVISTA_ID);
}

async function safeAudit(payload) {
    try { await logAdminAction(payload); } catch { /* ignore */ }
}

export const userService = {
    async create(data, actor) {
        const roleIds = data.rolIds ?? [data.rolId];
        const hasEditor = roleIds.includes(EDITOR_ID);

        const perms = hasEditor ? normalizeEditorPerms(data) : [];
        const caps = hasEditor ? capsFromEditorPerms(perms) : { canEdit: true, canSign: true };

        const created = await userRepo.create({
            nombre: data.nombre,
            apellido1: data.apellido1,
            apellido2: data.apellido2 ?? "",
            email: data.email,
            rolId: data.rolId,
            unidadId: data.unidadId,
            canEdit: caps.canEdit,
            canSign: caps.canSign,
        });

        await userRepo.setRoles(created.id, roleIds);

        try { await permRepo.setForUser(created.id, perms); }
        catch (err) { console.error("[ERROR] setForUser failed:", err?.message || err); }

        // ✅ UPLOAD (cargar documentos)
        const wantsUpload = data?.canUpload === true;
        const eligible = eligibleForUpload(roleIds);
        await userRepo.setUpload(created.id, eligible && wantsUpload);

        await safeAudit({
            actorId: actor?.id ?? null,
            action: "USER_CREATE",
            result: "OK",
            detail: { userId: created.id, rolIds: roleIds, perms, caps, canUpload: eligible && wantsUpload },
        });

        const hydrated = await userRepo.findById(created.id);
        const applied = await permRepo.getForUser(created.id).catch(() => []);
        return { ...hydrated, editorPermissions: applied, permisosEditor: applied };
    },

    async list() {
        const users = await userRepo.findAll();
        const hydrated = await Promise.all(
            (users || []).map(async (u) => {
                const perms = await permRepo.getForUser(u.id).catch(() => []);
                return { ...u, editorPermissions: perms, permisosEditor: perms };
            })
        );
        return hydrated;
    },

    async search(searchTerm) {
        const users = searchTerm ? await userRepo.search(searchTerm) : await userRepo.findAll();
        const hydrated = await Promise.all(
            (users || []).map(async (u) => {
                const perms = await permRepo.getForUser(u.id).catch(() => []);
                return { ...u, editorPermissions: perms, permisosEditor: perms };
            })
        );
        return hydrated;
    },

    async update(id, patch, actor) {
        const map = {};
        if (patch.nombre !== undefined) map.nombre = patch.nombre;
        if (patch.apellido1 !== undefined) map.apellido1 = patch.apellido1;
        if (patch.apellido2 !== undefined) map.apellido2 = patch.apellido2;
        if (patch.email !== undefined) map.email = patch.email;
        if (patch.unidadId !== undefined) map.unidad_id = patch.unidadId;

        const incomingIds = Array.isArray(patch.rolIds) ? patch.rolIds.map(Number) : undefined;

        if (incomingIds?.length) map.rol_id = incomingIds[0];
        else if (patch.rolId !== undefined) map.rol_id = patch.rolId;

        const updated = await userRepo.update(id, map);
        if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

        if (incomingIds?.length) {
            await userRepo.setRoles(id, incomingIds);
        }

        const shouldTouchEditorPerms =
            incomingIds?.length ||
            patch.rolId !== undefined ||
            patch.editorPermissions !== undefined ||
            patch.permisosEditor !== undefined;

        if (shouldTouchEditorPerms) {
            const current = await userRepo.findById(id);

            const currentRoles = incomingIds?.length
                ? incomingIds
                : Array.isArray(current?.rolIds) && current.rolIds.length
                    ? current.rolIds.map(Number)
                    : [Number(current?.rolId ?? updated?.rolId)];

            const hasEditor = currentRoles.includes(EDITOR_ID);
            const perms = hasEditor ? normalizeEditorPerms(patch) : [];
            const caps = hasEditor ? capsFromEditorPerms(perms) : { canEdit: true, canSign: true };

            try { await permRepo.setForUser(id, perms); }
            catch (err) { console.error("[ERROR] updating editor perms:", err?.message || err); }

            await userRepo.update(id, {
                can_edit: caps.canEdit ? 1 : 0,
                can_sign: caps.canSign ? 1 : 0,
            });
        }

        // ✅ UPLOAD (cargar documentos)
        {
            const current = await userRepo.findById(id);

            const currentRoles = incomingIds?.length
                ? incomingIds
                : Array.isArray(current?.rolIds) && current.rolIds.length
                    ? current.rolIds.map(Number)
                    : [Number(current?.rolId ?? updated?.rolId)];

            const eligible = eligibleForUpload(currentRoles);

            if (patch.canUpload !== undefined) {
                await userRepo.setUpload(id, eligible && patch.canUpload === true);
            } else if (!eligible) {
                await userRepo.setUpload(id, false);
            }
        }

        await safeAudit({
            actorId: actor?.id ?? null,
            action: "USER_UPDATE",
            result: "OK",
            detail: { userId: id, patch },
        });

        const hydrated = await userRepo.findById(id);
        const applied = await permRepo.getForUser(id).catch(() => []);
        return { ...hydrated, editorPermissions: applied, permisosEditor: applied };
    },

    async remove(id, actor) {
        await userRepo.remove(id);
        await safeAudit({
            actorId: actor?.id ?? null,
            action: "USER_DELETE",
            result: "OK",
            detail: { userId: id },
        });
    },
};