

const RECURSOS_INSERTABLES = new Set([
  "CONSULTA_VISTA_PREVIA",

  "CONSULTA_DESCARGA",

  "CONSULTA_BUSQUEDA",

]);



/**

 * Valores mostrados en filtros de recurso (pantalla bitácora): solo consulta de documentos.

 */

export const USER_ACTIVITY_RECURSOS_FILTRO = Object.freeze([

  "CONSULTA_VISTA_PREVIA",

  "CONSULTA_DESCARGA",

  "CONSULTA_BUSQUEDA",

]);



const EXCLUDED_ACCIONES = new Set([

  "TECH_METADATA_CAPTURED",

  "NOTIFICACION_CREATE",

  "DESCRIPTIVE_METADATA_SET",

]);



export function shouldRecordUserActivityBitacora({ accion, recurso, actividad }) {

  const act = actividad != null ? String(actividad).toUpperCase().trim() : "";

  if (act === "OTRA") return false;

  const a = accion != null ? String(accion) : "";

  if (a && EXCLUDED_ACCIONES.has(a)) return false;

  const r = recurso != null ? String(recurso) : "";

  if (!r || !RECURSOS_INSERTABLES.has(r)) return false;

  return true;

}



export function isExcludedUserActivityAccion(accion) {

  return accion != null && EXCLUDED_ACCIONES.has(String(accion));

}



/** Listados / detalle: solo eventos de consulta en pantalla (no solicitudes en el listado). */

export function sqlUserActivityBitacoraJoinFilter(aliasB = "b", aliasA = "a") {

  return `(${aliasA}.recurso IN ('CONSULTA_VISTA_PREVIA','CONSULTA_DESCARGA','CONSULTA_BUSQUEDA') AND ${aliasA}.actividad <> 'OTRA' AND ${aliasB}.accion NOT IN ('TECH_METADATA_CAPTURED','NOTIFICACION_CREATE','DESCRIPTIVE_METADATA_SET','SOLICITUD_ACCESO_CREADA'))`;

}


