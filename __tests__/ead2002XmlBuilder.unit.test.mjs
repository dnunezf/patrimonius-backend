// __tests__/ead2002XmlBuilder.unit.test.mjs
// Purpose: unit-test EAD 2002 XML generation and preview tree structure.
// NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/ead2002XmlBuilder.unit.test.mjs --config jest.config.mjs --runInBand

import {
  buildEad2002Tree,
  buildEad2002Xml,
} from "../src/utils/ead2002XmlBuilder.js";

describe("EAD 2002 XML Builder", () => {
  const baseContext = {
    eadId: "EAD-OFI-MNCR-001-2026",
    officialCode: "OFI-MNCR-001-2026",
    title: "Acta de prueba & conservación <especial>",
    author: "Unidad de Archivo",
    createdAt: "2026-05-01T10:30:00.000Z",

    repositoryName: "Museo Nacional de Costa Rica",
    classificationLabel: "Serie / Subserie / Expediente",
    accessLevel: "PUBLIC",
    state: "ARCHIVADO",

    serieCode: "SER-001",
    serieName: "Serie Documental",
    subserieCode: "SUB-001",
    subserieName: "Subserie Documental",
    expedienteCode: "EXP-001",
    expedienteName: "Expediente de Prueba",

    format: "application/pdf",
    sizeBytes: 2048,
    softwareVersion: "Patrimonius 1.0",

    retentionStartDate: "2026-05-01",
    retentionEndDate: "2031-05-01",
    retentionYears: 5,
    unitName: "Archivo Central",

    generatedAt: "2026-05-05T12:00:00.000Z",
    exportedByName: "Usuario Archivista",
  };

  test("buildEad2002Xml generates valid EAD 2002 main structure", () => {
    const xml = buildEad2002Xml(baseContext);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<ead ");
    expect(xml).toContain("<eadheader");
    expect(xml).toContain("<archdesc");
    expect(xml).toContain("<dsc");
    expect(xml).toContain("<unitid");
    expect(xml).toContain("OFI-MNCR-001-2026");
  });

  test("buildEad2002Xml escapes XML special characters", () => {
    const xml = buildEad2002Xml(baseContext);

    expect(xml).toContain("Acta de prueba &amp; conservación &lt;especial&gt;");
    expect(xml).not.toContain("Acta de prueba & conservación <especial>");
  });

  test("buildEad2002Tree creates hierarchy with serie, subserie, expediente and document", () => {
    const tree = buildEad2002Tree(baseContext);

    expect(Array.isArray(tree)).toBe(true);
    expect(tree[0].tag).toBe("ead");

    const archdesc = tree[0].children.find((node) => node.tag === "archdesc");
    expect(archdesc).toBeDefined();

    const dsc = archdesc.children.find((node) => node.tag === "dsc");
    expect(dsc).toBeDefined();

    const serie = dsc.children[0];
    expect(serie.tag).toBe("c01");
    expect(serie.value).toBe("Serie Documental");

    const subserie = serie.children[0];
    expect(subserie.tag).toBe("c02");
    expect(subserie.value).toBe("Subserie Documental");

    const expediente = subserie.children[0];
    expect(expediente.tag).toBe("c03");
    expect(expediente.value).toBe("Expediente de Prueba");

    const documento = expediente.children[0];
    expect(documento.tag).toBe("c04");
    expect(documento.value).toBe(baseContext.title);
  });
});
