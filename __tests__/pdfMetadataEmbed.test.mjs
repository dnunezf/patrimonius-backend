import { describe, test, expect } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import {
    resolvePdfMetadataFields,
    embedStandardMetadataInPdfBuffer,
    buildPdfSubjectLine,
    buildPdfCustomProperties,
} from "../src/utils/pdfMetadataEmbed.js";

describe("pdfMetadataEmbed", () => {
    test("prioriza EDIT_MANUAL_TITLE y rellena customProperties + subject resumen (DOCX)", () => {
        const map = {
            EDIT_MANUAL_TITLE: "Pruebas DE Metadotos",
            EDIT_MANUAL_DOCUMENT_TYPE: "Oficio",
            EDIT_MANUAL_ACCESS_LEVEL: "PUBLIC",
            EDIT_MANUAL_KEYWORDS_JSON: JSON.stringify(["Hola", "EstaunaPrueba"]),
            DESC_PRELIM_CLASS: "Oficio, hola",
            EDIT_AUTO_IDENTIFIER: "TMP-20260407-220906-2032",
            EDIT_AUTO_CREATION_RESPONSIBLE: "Kendra Artavia Caballero",
            EDIT_AUTO_SOFTWARE_VERSION: "Patrimonius v1.0",
            EDIT_AUTO_CREATED_AT: "2026-04-08T04:09:00.000Z",
            FINAL_DOCUMENT_FLOW: "PRODUCED_SENT",
            FINAL_PROCEDURE_TYPE: "Conocimiento",
            FINAL_OUT_RECIPIENT_NAME_ROLE: "kENDRA",
            FINAL_OUT_RECIPIENT_INSTITUTION: "UNA",
        };

        const fields = resolvePdfMetadataFields({
            doc: {
                id: 1,
                titulo: "Otro título en tabla",
                numero_serie: "OFI_MNCR-DAF-AC-4-2026",
                usuario_id: 1,
            },
            metadatoMap: map,
            authorDisplayName: null,
            producerUnitName: "Planificación",
        });

        expect(fields.title).toBe("Pruebas DE Metadotos");
        expect(fields.author).toBe("Kendra Artavia Caballero");
        expect(fields.subject).toContain("Codigo: OFI_MNCR-DAF-AC-4-2026");
        expect(fields.subject).toContain("Identificador: TMP-20260407-220906-2032");
        expect(fields.subject).toContain("Tipo_documental: Oficio");
        expect(fields.subject).toContain("Nivel_de_acceso: Público");
        expect(fields.subject).toContain("Unidad_productora: Planificación");
        expect(fields.subject).toContain("Preliminar: Oficio, hola");
        expect(fields.subject).toContain("Flujo_documental: Documento producido / enviado");
        expect(fields.subject).toContain("Tramite: Conocimiento");
        expect(fields.subject).toContain("Destinatario: kENDRA — UNA");
        expect(fields.customProperties).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "Codigo", value: "OFI_MNCR-DAF-AC-4-2026" }),
                expect.objectContaining({ name: "Nivel_de_acceso", value: "Público" }),
            ]),
        );
        expect(fields.creator).toBe("Patrimonius v1.0");
    });

    test("buildPdfCustomProperties expone Codigo, Tipo_documental y Preliminar", () => {
        const rows = buildPdfCustomProperties({
            doc: { numero_serie: "OFI_MNCR-DAF-AC-4-2026" },
            map: {
                EDIT_MANUAL_DOCUMENT_TYPE: "Oficio",
                DESC_PRELIM_CLASS: "Oficio, hola",
            },
            producerUnitName: null,
        });
        const byName = Object.fromEntries(rows.map((r) => [r.name, r.value]));
        expect(byName.Codigo).toBe("OFI_MNCR-DAF-AC-4-2026");
        expect(byName.Tipo_documental).toBe("Oficio");
        expect(byName.Preliminar).toBe("Oficio, hola");
    });

    test("buildPdfSubjectLine (compat) une las propiedades personalizadas", () => {
        const line = buildPdfSubjectLine({
            doc: { numero_serie: "OFI_MNCR-DAF-AC-4-2026" },
            map: {
                EDIT_MANUAL_DOCUMENT_TYPE: "Oficio",
                DESC_PRELIM_CLASS: "Oficio, hola",
            },
            producerUnitName: null,
        });
        expect(line).toContain("Codigo: OFI_MNCR-DAF-AC-4-2026");
        expect(line).toContain("Tipo_documental: Oficio");
    });

    test("embedStandardMetadataInPdfBuffer escribe propiedades en un PDF válido", async () => {
        const base = await PDFDocument.create();
        base.addPage();
        const raw = Buffer.from(await base.save());

        const fields = resolvePdfMetadataFields({
            doc: {
                id: 1,
                titulo: "Mi título",
                numero_serie: "NS-1",
                usuario_id: 1,
            },
            metadatoMap: {
                DESC_AUTHOR: "Autor BD",
                EDIT_MANUAL_KEYWORDS_JSON: JSON.stringify(["kw1", "kw2"]),
                EDIT_MANUAL_DOCUMENT_TYPE: "Acta",
            },
            authorDisplayName: null,
            producerUnitName: null,
        });

        const out = await embedStandardMetadataInPdfBuffer(raw, fields);
        const reloaded = await PDFDocument.load(out);

        expect(reloaded.getTitle()).toBe("Mi título");
        expect(reloaded.getAuthor()).toBe("Autor BD");
        expect(reloaded.getSubject() || "").toBe("");
        const utf8 = out.toString("utf8");
        expect(utf8).toContain("http://ns.adobe.com/pdfx/1.3/");
        expect(utf8).toContain("pdfx:Codigo");
        expect(utf8).toContain("NS-1");
        expect(utf8).toContain("Acta");
        const kw = reloaded.getKeywords();
        expect(kw).toBeTruthy();
        expect(String(kw)).toMatch(/kw1/);
    });
});
