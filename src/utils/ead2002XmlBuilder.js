function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function indent(level) {
  return "  ".repeat(level);
}

function line(level, content) {
  return `${indent(level)}${content}`;
}

function openTag(level, tag, attrs = {}) {
  const attrText = Object.entries(attrs)
    .filter(
      ([, value]) =>
        value !== undefined && value !== null && String(value) !== "",
    )
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");

  return line(level, `<${tag}${attrText}>`);
}

function closeTag(level, tag) {
  return line(level, `</${tag}>`);
}

function node(level, tag, value, attrs = {}) {
  const attrText = Object.entries(attrs)
    .filter(
      ([, attrValue]) =>
        attrValue !== undefined &&
        attrValue !== null &&
        String(attrValue) !== "",
    )
    .map(([key, attrValue]) => ` ${key}="${escapeXml(attrValue)}"`)
    .join("");

  return line(level, `<${tag}${attrText}>${escapeXml(value)}</${tag}>`);
}

function bytesToHuman(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let idx = 0;

  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

function normalizeDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildAbstract(context) {
  const parts = [
    context.documentType ? `Tipo documental: ${context.documentType}.` : "",
    context.serieName ? `Serie: ${context.serieName}.` : "",
    context.subserieName ? `Subserie: ${context.subserieName}.` : "",
    context.expedienteName ? `Expediente: ${context.expedienteName}.` : "",
    context.accessLevel ? `Nivel de acceso: ${context.accessLevel}.` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

function buildCitation(context) {
  const date = normalizeDateOnly(context.createdAt) || "s.f.";
  return [
    context.title || "Documento sin título",
    context.officialCode || "",
    context.expedienteName || "",
    "Museo Nacional de Costa Rica",
    date,
  ]
    .filter(Boolean)
    .join(". ");
}

function pushComponentDid(
  lines,
  level,
  { unitId, unitTitle, unitDate, noteLabel },
) {
  lines.push(openTag(level, "did"));
  if (noteLabel) {
    lines.push(node(level + 1, "head", noteLabel));
  }
  if (unitId) {
    lines.push(node(level + 1, "unitid", unitId));
  }
  if (unitTitle) {
    lines.push(node(level + 1, "unittitle", unitTitle));
  }
  if (unitDate) {
    lines.push(node(level + 1, "unitdate", unitDate, { normal: unitDate }));
  }
  lines.push(closeTag(level, "did"));
}

export function buildEad2002Tree(context) {
  const serieNode = {
    tag: "c01",
    label: "Serie",
    value: context.serieName || "Sin serie",
    children: [],
  };

  const expedienteNode = {
    tag: context.subserieName ? "c03" : "c02",
    label: "Expediente",
    value: context.expedienteName || "Sin expediente",
    children: [
      {
        tag: context.subserieName ? "c04" : "c03",
        label: "Documento",
        value: context.title || "Sin título",
        children: [],
      },
    ],
  };

  if (context.subserieName) {
    serieNode.children.push({
      tag: "c02",
      label: "Subserie",
      value: context.subserieName,
      children: [expedienteNode],
    });
  } else {
    serieNode.children.push(expedienteNode);
  }

  return [
    {
      tag: "ead",
      label: "EAD (Encoded Archival Description)",
      value: "",
      children: [
        {
          tag: "eadheader",
          label: "Encabezado EAD",
          value: context.eadId || "",
          children: [],
        },
        {
          tag: "archdesc",
          label: "Descripción archivística",
          value: context.title || "",
          children: [
            {
              tag: "did",
              label: "Información descriptiva identificativa",
              value: context.officialCode || "",
              children: [
                {
                  tag: "unittitle",
                  label: "Título",
                  value: context.title || "",
                  children: [],
                },
                {
                  tag: "unitid",
                  label: "ID",
                  value: context.officialCode || "",
                  children: [],
                },
                {
                  tag: "unitdate",
                  label: "Fecha",
                  value: normalizeDateOnly(context.createdAt) || "",
                  children: [],
                },
                {
                  tag: "origination",
                  label: "Autor",
                  value: context.author || "",
                  children: [],
                },
              ],
            },
            {
              tag: "dsc",
              label: "Jerarquía documental",
              value: "",
              children: [serieNode],
            },
          ],
        },
      ],
    },
  ];
}

export function buildEad2002Xml(context) {
  const createdDate = normalizeDateOnly(context.createdAt);
  const retentionStartDate = normalizeDateOnly(context.retentionStartDate);
  const retentionEndDate = normalizeDateOnly(context.retentionEndDate);
  const generatedDate = normalizeDateOnly(context.generatedAt);
  const technicalSummary = [
    context.format ? `Formato: ${context.format}` : "",
    context.sizeBytes != null
      ? `Tamaño: ${bytesToHuman(context.sizeBytes)}`
      : "",
    context.softwareVersion ? `Software: ${context.softwareVersion}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<!DOCTYPE ead PUBLIC "+//ISBN 1-931666-00-8//DTD ead.dtd (Encoded Archival Description (EAD) Version 2002)//EN" "//lcweb2.loc.gov/xmlcommon/dtds/ead2002/ead.dtd">`,
  );

  lines.push(
    `<ead countryencoding="iso3166-1" dateencoding="iso8601" langencoding="iso639-2b" repositoryencoding="iso15511">`,
  );

  lines.push(
    openTag(1, "eadheader", {
      countryencoding: "iso3166-1",
      dateencoding: "iso8601",
      langencoding: "iso639-2b",
      repositoryencoding: "iso15511",
    }),
  );
  lines.push(
    node(2, "eadid", context.eadId, {
      countrycode: "CR",
      mainagencycode: "CR-MNCR",
    }),
  );
  lines.push(openTag(2, "filedesc"));
  lines.push(openTag(3, "titlestmt"));
  lines.push(node(4, "titleproper", `Guía EAD 2002 de ${context.title}`));
  lines.push(node(4, "author", "Exportado por Sistema Patrimonius"));
  lines.push(closeTag(3, "titlestmt"));
  lines.push(openTag(3, "publicationstmt"));
  lines.push(node(4, "p", "Museo Nacional de Costa Rica"));
  lines.push(closeTag(3, "publicationstmt"));
  lines.push(closeTag(2, "filedesc"));

  lines.push(openTag(2, "profiledesc"));
  lines.push(openTag(3, "creation"));
  lines.push(
    line(
      4,
      `Exportado desde Sistema Patrimonius <date normal="${escapeXml(
        generatedDate,
      )}">${escapeXml(generatedDate)}</date>`,
    ),
  );
  lines.push(closeTag(3, "creation"));
  lines.push(openTag(3, "langusage"));
  lines.push(
    line(4, `Documento en <language langcode="spa">Español</language>`),
  );
  lines.push(closeTag(3, "langusage"));
  lines.push(closeTag(2, "profiledesc"));
  lines.push(closeTag(1, "eadheader"));

  lines.push(
    openTag(1, "archdesc", { level: "collection", type: "inventory" }),
  );
  lines.push(openTag(2, "did"));
  lines.push(
    line(
      3,
      `<repository><corpname>${escapeXml(
        context.repositoryName || "Museo Nacional de Costa Rica",
      )}</corpname></repository>`,
    ),
  );
  lines.push(
    line(
      3,
      `<origination label="Creator">${escapeXml(context.author || "")}</origination>`,
    ),
  );
  lines.push(node(3, "unittitle", context.title || ""));
  lines.push(
    node(3, "unitid", context.officialCode || "", {
      countrycode: "CR",
      repositorycode: "CR-MNCR",
      identifier: context.officialCode || "",
      type: "official_code",
    }),
  );
  lines.push(
    node(3, "unitdate", createdDate || "", {
      normal: createdDate || "",
      type: "inclusive",
    }),
  );
  lines.push(openTag(3, "physdesc"));
  lines.push(
    node(
      4,
      "extent",
      `1 archivo digital${technicalSummary ? ` (${technicalSummary})` : ""}`,
    ),
  );
  lines.push(closeTag(3, "physdesc"));
  lines.push(openTag(3, "langmaterial"));
  lines.push(line(4, `<language langcode="spa">Español</language>`));
  lines.push(closeTag(3, "langmaterial"));
  lines.push(node(3, "abstract", buildAbstract(context)));
  lines.push(closeTag(2, "did"));

  lines.push(openTag(2, "scopecontent"));
  lines.push(
    node(
      3,
      "p",
      `Documento archivado exportado conforme al estándar EAD 2002 desde Patrimonius. Clasificación archivística: ${context.classificationLabel || "No disponible"}.`,
    ),
  );
  lines.push(closeTag(2, "scopecontent"));

  lines.push(openTag(2, "descgrp"));
  lines.push(openTag(3, "accessrestrict"));
  lines.push(node(4, "head", "Acceso"));
  lines.push(
    node(4, "p", `Nivel de acceso: ${context.accessLevel || "No definido"}.`),
  );
  lines.push(closeTag(3, "accessrestrict"));

  lines.push(openTag(3, "prefercite"));
  lines.push(node(4, "head", "Cita preferida"));
  lines.push(node(4, "p", buildCitation(context)));
  lines.push(closeTag(3, "prefercite"));

  lines.push(openTag(3, "processinfo"));
  lines.push(node(4, "head", "Nota de procesamiento"));
  lines.push(
    node(
      4,
      "p",
      `Exportación XML EAD 2002 generada el ${generatedDate} por ${context.exportedByName || "Sistema Patrimonius"}.`,
    ),
  );
  lines.push(closeTag(3, "processinfo"));

  lines.push(openTag(3, "odd"));
  lines.push(node(4, "head", "Metadatos técnicos"));
  if (context.format) {
    lines.push(node(4, "p", `Formato: ${context.format}.`));
  }
  if (context.sizeBytes != null) {
    lines.push(node(4, "p", `Tamaño: ${bytesToHuman(context.sizeBytes)}.`));
  }
  if (context.softwareVersion) {
    lines.push(node(4, "p", `Software: ${context.softwareVersion}.`));
  }
  lines.push(closeTag(3, "odd"));

  lines.push(openTag(3, "odd"));
  lines.push(node(4, "head", "Metadatos de gestión"));
  lines.push(
    node(4, "p", `Estado documental: ${context.state || "No definido"}.`),
  );
  if (retentionStartDate) {
    lines.push(node(4, "p", `Inicio de retención: ${retentionStartDate}.`));
  }
  if (retentionEndDate) {
    lines.push(node(4, "p", `Fin de retención: ${retentionEndDate}.`));
  }
  if (context.retentionYears != null) {
    lines.push(
      node(4, "p", `Plazo de retención: ${context.retentionYears} año(s).`),
    );
  }
  if (context.unitName) {
    lines.push(node(4, "p", `Unidad responsable: ${context.unitName}.`));
  }
  lines.push(closeTag(3, "odd"));
  lines.push(closeTag(2, "descgrp"));

  lines.push(openTag(2, "dsc", { type: "combined" }));

  lines.push(openTag(3, "c01", { level: "series" }));
  pushComponentDid(lines, 4, {
    unitId: context.serieCode,
    unitTitle: context.serieName,
    unitDate: createdDate,
    noteLabel: "Serie",
  });

  if (context.subserieName) {
    lines.push(openTag(4, "c02", { level: "subseries" }));
    pushComponentDid(lines, 5, {
      unitId: context.subserieCode,
      unitTitle: context.subserieName,
      unitDate: createdDate,
      noteLabel: "Subserie",
    });

    lines.push(openTag(5, "c03", { level: "file" }));
    pushComponentDid(lines, 6, {
      unitId: context.expedienteCode,
      unitTitle: context.expedienteName,
      unitDate: createdDate,
      noteLabel: "Expediente",
    });

    lines.push(openTag(6, "c04", { level: "item" }));
    pushComponentDid(lines, 7, {
      unitId: context.officialCode,
      unitTitle: context.title,
      unitDate: createdDate,
      noteLabel: "Documento",
    });
    lines.push(closeTag(6, "c04"));
    lines.push(closeTag(5, "c03"));
    lines.push(closeTag(4, "c02"));
  } else {
    lines.push(openTag(4, "c02", { level: "file" }));
    pushComponentDid(lines, 5, {
      unitId: context.expedienteCode,
      unitTitle: context.expedienteName,
      unitDate: createdDate,
      noteLabel: "Expediente",
    });

    lines.push(openTag(5, "c03", { level: "item" }));
    pushComponentDid(lines, 6, {
      unitId: context.officialCode,
      unitTitle: context.title,
      unitDate: createdDate,
      noteLabel: "Documento",
    });
    lines.push(closeTag(5, "c03"));
    lines.push(closeTag(4, "c02"));
  }

  lines.push(closeTag(3, "c01"));
  lines.push(closeTag(2, "dsc"));
  lines.push(closeTag(1, "archdesc"));
  lines.push(`</ead>`);

  return lines.join("\n");
}
