// src/utils/expedienteEadMetadata.js
/**
 * HU-035: generación EAD. Si existe módulo `eadHu035.service.js` con
 * `generarEadXmlString(expedienteId)`, se delega; si no, se emite un XML mínimo
 * para no bloquear el paquete de transferencia.
 */
export async function resolverXmlEadExpediente(expedienteId, contexto = {}) {
    try {
        const mod = await import("../services/eadHu035.service.js");
        if (mod && typeof mod.generarEadXmlString === "function") {
            return await mod.generarEadXmlString(expedienteId, contexto);
        }
    } catch {
        // HU-035 no desplegado
    }
    const id = Number(expedienteId);
    const cod = String(contexto.expedienteCodigo ?? id);
    return `<?xml version="1.0" encoding="UTF-8"?>
<ead xmlns="urn:isbn:1-931666-22-9">
  <eadheader>
    <eadid>patrimonius-expediente-${id}</eadid>
    <filedesc>
      <titlestmt>
        <titleproper>Metadatos descriptivos (placeholder HU-035) — ${escapeXml(
            cod
        )}</titleproper>
      </titlestmt>
    </filedesc>
  </eadheader>
  <archdesc level="file">
    <did>
      <unittitle>Expediente ${escapeXml(cod)}</unittitle>
      <note><p>Integración EAD completa: HU-035.</p></note>
    </did>
  </archdesc>
</ead>
`;
}

function escapeXml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}
