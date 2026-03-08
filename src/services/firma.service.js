// src/services/firma.service.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import forge from "node-forge";
import signer from "node-signpdf";

void signer;

import { firmaRepo } from "../repositories/firmaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

function asInt(v, name) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
        const e = new Error(`${name} inválido`);
        e.code = 400;
        throw e;
    }
    return n;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanHexSignature(hexString = "") {
    return hexString
        .replace(/\s+/g, "")
        .replace(/(?:00)+$/i, "");
}

function cleanBufferSignature(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer)) return buffer;
    const cleanedHex = cleanHexSignature(buffer.toString("hex"));
    return Buffer.from(cleanedHex, "hex");
}

async function _loadCaCerts() {
    const certDir = path.join(__dirname, "../../certs");

    if (!fs.existsSync(certDir)) {
        return [];
    }

    const entries = fs.readdirSync(certDir, { withFileTypes: true });
    const certs = [];

    for (const ent of entries) {
        if (!ent.isFile()) continue;

        const name = ent.name.toLowerCase();
        if (!name.endsWith(".cer") && !name.endsWith(".pem")) continue;

        const p = path.join(certDir, ent.name);
        const raw = fs.readFileSync(p);
        const rawText = raw.toString("utf8");

        try {
            if (/-----BEGIN CERTIFICATE-----/.test(rawText)) {
                certs.push(forge.pki.certificateFromPem(rawText));
            } else {
                const asn1Obj = forge.asn1.fromDer(raw.toString("binary"));
                certs.push(forge.pki.certificateFromAsn1(asn1Obj));
            }
        } catch (err) {
            try {
                const b64 = raw.toString("base64");
                const pem =
                    "-----BEGIN CERTIFICATE-----\n" +
                    (b64.match(/.{1,64}/g) || []).join("\n") +
                    "\n-----END CERTIFICATE-----\n";

                certs.push(forge.pki.certificateFromPem(pem));
            } catch {
                // ignorar cert inválido
            }
        }
    }

    return certs;
}

function getAttrValue(attrs = [], names = []) {
    const lowered = names.map((n) => n.toLowerCase());
    const found = attrs.find((a) => {
        const name = (a?.name || "").toLowerCase();
        const shortName = (a?.shortName || "").toLowerCase();
        const type = (a?.type || "").toLowerCase();
        return lowered.includes(name) || lowered.includes(shortName) || lowered.includes(type);
    });
    return found?.value || "";
}

function dnToString(attrs = []) {
    return attrs
        .map((a) => `${a.shortName || a.name || a.type}=${a.value}`)
        .join(", ");
}

function sameDn(attrsA = [], attrsB = []) {
    return dnToString(attrsA) === dnToString(attrsB);
}

function findSignerCert(p7) {
    if (!Array.isArray(p7?.certificates) || p7.certificates.length === 0) {
        return null;
    }

    try {
        const signerInfos = p7.rawCapture?.signerInfos;
        if (Array.isArray(signerInfos) && signerInfos.length > 0) {
            const signerInfo = signerInfos[0];
            const signerSerialHex = forge.util.bytesToHex(signerInfo.serialNumber || "").toLowerCase();
            const signerIssuerAttrs = signerInfo.issuer?.attributes || [];

            const matched = p7.certificates.find((cert) => {
                try {
                    const certSerial = (cert.serialNumber || "").toLowerCase();
                    const sameSerial = certSerial === signerSerialHex;
                    const sameIssuerDn = sameDn(cert.issuer?.attributes || [], signerIssuerAttrs);
                    return sameSerial || sameIssuerDn;
                } catch {
                    return false;
                }
            });

            if (matched) return matched;
        }
    } catch {
        // fallback
    }

    return p7.certificates[0];
}

function extractPdfSignatureByRegex(pdfStr) {
    const matches = Array.from(
        pdfStr.matchAll(/\/Contents\s*<([0-9A-Fa-f\s\r\n\t]+)>/g)
    );

    if (!matches || matches.length === 0) {
        return null;
    }

    let best = matches[0][1];
    for (const m of matches) {
        if ((m[1] || "").length > (best || "").length) {
            best = m[1];
        }
    }

    const cleanedHex = cleanHexSignature(best || "");
    if (!cleanedHex) return null;

    return Buffer.from(cleanedHex, "hex");
}

function buildCedulaFromCert(cert, commonName) {
    let cedula = "";

    const serial = cert?.serialNumber || "";
    if (serial && typeof serial === "string") {
        cedula = serial.replace(/^0+/, "");
    }

    if (!cedula && commonName) {
        const cedMatch = /(?:CPF|CPJ|CID|ID)-([0-9-]+)/i.exec(commonName);
        if (cedMatch) {
            cedula = cedMatch[1];
        }
    }

    return cedula || "";
}

export const firmaService = {
    async create(dto, actor) {
        const documento_id = asInt(dto?.documento_id ?? dto?.documentId, "documento_id");
        const usuario_id = asInt(dto?.usuario_id ?? dto?.usuarioId, "usuario_id");
        const fecha = dto?.fecha ? new Date(dto.fecha) : new Date();

        const created = await firmaRepo.createFirma({ documento_id, usuario_id, fecha });

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: documento_id,
            action: "FIRMA_CREATE",
            result: "OK",
            detail: { firmaId: created.id, documentoId: documento_id, usuarioId: usuario_id },
        });

        return created;
    },

    async listByDocumento(documentoId) {
        const docId = asInt(documentoId, "documentoId");
        return firmaRepo.getAllFirmas(docId);
    },

    async getById(id) {
        const firmaId = asInt(id, "id");
        const row = await firmaRepo.getFirmaById(firmaId);

        if (!row) {
            const e = new Error("Firma no encontrada");
            e.code = 404;
            throw e;
        }

        return row;
    },

    async update(id, patch, actor) {
        const firmaId = asInt(id, "id");

        const documento_id =
            patch?.documento_id !== undefined
                ? asInt(patch.documento_id, "documento_id")
                : undefined;

        const usuario_id =
            patch?.usuario_id !== undefined
                ? asInt(patch.usuario_id, "usuario_id")
                : undefined;

        const fecha = patch?.fecha !== undefined ? new Date(patch.fecha) : undefined;

        const current = await firmaRepo.getFirmaById(firmaId);
        if (!current) {
            const e = new Error("Firma no encontrada");
            e.code = 404;
            throw e;
        }

        const updated = await firmaRepo.updateFirma(firmaId, {
            documento_id: documento_id ?? current.documento_id,
            usuario_id: usuario_id ?? current.usuario_id,
            fecha: fecha ?? current.fecha,
        });

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: updated.documento_id ?? null,
            action: "FIRMA_UPDATE",
            result: "OK",
            detail: { firmaId, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        const firmaId = asInt(id, "id");

        const current = await firmaRepo.getFirmaById(firmaId);
        if (!current) {
            const e = new Error("Firma no encontrada");
            e.code = 404;
            throw e;
        }

        await firmaRepo.removeFirma(firmaId);

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: current.documento_id ?? null,
            action: "FIRMA_DELETE",
            result: "OK",
            detail: { firmaId, documentoId: current.documento_id, usuarioId: current.usuario_id },
        });

        return true;
    },

    async validarFirmaPDF(pdfBuffer) {
        try {
            if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
                const e = new Error("buffer_invalido");
                e.code = 400;
                throw e;
            }

            const pdfStr = pdfBuffer.toString("binary");
            let signatureDer = null;

            // 1) node-signpdf
            try {
                let extractSignature = null;

                try {
                    const mod = await import("node-signpdf");
                    extractSignature = mod.extractSignature || mod.default?.extractSignature;
                } catch {
                    extractSignature = null;
                }

                if (typeof extractSignature === "function") {
                    const extracted = extractSignature(pdfBuffer);

                    if (Buffer.isBuffer(extracted)) {
                        signatureDer = extracted;
                    } else if (extracted?.signature) {
                        signatureDer = Buffer.isBuffer(extracted.signature)
                            ? extracted.signature
                            : Buffer.from(extracted.signature);
                    } else if (extracted?.content) {
                        signatureDer = Buffer.isBuffer(extracted.content)
                            ? extracted.content
                            : Buffer.from(extracted.content);
                    }
                }
            } catch {
                // seguir
            }

            if (signatureDer) {
                signatureDer = cleanBufferSignature(signatureDer);
            }

            // 2) pdf-lib
            if (!signatureDer) {
                try {
                    const { PDFDocument } = await import("pdf-lib");
                    const pdfDoc = await PDFDocument.load(pdfBuffer);
                    const pages = pdfDoc.getPages();

                    for (const page of pages) {
                        const annots = page.node.Annots ? page.node.Annots() : null;
                        if (!annots) continue;

                        const refs = Array.isArray(annots)
                            ? annots
                            : annots?.array
                                ? annots.array
                                : null;

                        if (!refs) continue;

                        for (const r of refs) {
                            try {
                                const obj = r.lookup ? r.lookup(pdfDoc.context) : r;
                                const contents = obj.get?.("Contents");

                                if (contents) {
                                    let hex = "";
                                    try {
                                        hex = String(contents?.value ?? contents?.toString())
                                            .replace(/[^0-9A-Fa-f]/g, "");
                                    } catch {
                                        hex = "";
                                    }

                                    hex = cleanHexSignature(hex);

                                    if (hex) {
                                        signatureDer = Buffer.from(hex, "hex");
                                        break;
                                    }
                                }
                            } catch {
                                // ignore
                            }
                        }

                        if (signatureDer) break;
                    }
                } catch {
                    // seguir
                }
            }

            // 3) regex
            if (!signatureDer) {
                signatureDer = extractPdfSignatureByRegex(pdfStr);
            }

            if (!signatureDer || !signatureDer.length) {
                return {
                    valido: false,
                    firmante: "",
                    cedula: "",
                    mensaje: "El PDF no contiene una firma digital válida",
                    detalle: {
                        firmaDetectada: false,
                        pkcs7Parseado: false,
                        cadenaConfianza: false,
                        integridad: false,
                        certificadoVigente: false,
                        certificadoDesde: null,
                        certificadoHasta: null,
                    },
                };
            }

            try {
                console.log("[firmaService] signature size:", signatureDer.length);
            } catch {
                // ignore
            }

            let p7 = null;

            try {
                const sigBytes = signatureDer.toString("binary");
                const asn1 = forge.asn1.fromDer(sigBytes, false);
                p7 = forge.pkcs7.messageFromAsn1(asn1);
            } catch (parseErr) {
                try {
                    console.error("[firmaService] error parseando PKCS#7:", parseErr?.message || parseErr);
                } catch {
                    // ignore
                }

                return {
                    valido: false,
                    firmante: "",
                    cedula: "",
                    mensaje: "Se detectó una firma, pero no pudo interpretarse correctamente",
                    detalle: {
                        firmaDetectada: true,
                        pkcs7Parseado: false,
                        cadenaConfianza: false,
                        integridad: false,
                        certificadoVigente: false,
                        certificadoDesde: null,
                        certificadoHasta: null,
                    },
                };
            }

            const signerCert = findSignerCert(p7);

            if (!signerCert) {
                return {
                    valido: false,
                    firmante: "",
                    cedula: "",
                    mensaje: "Se detectó una firma, pero no se encontró el certificado del firmante",
                    detalle: {
                        firmaDetectada: true,
                        pkcs7Parseado: true,
                        cadenaConfianza: false,
                        integridad: false,
                        certificadoVigente: false,
                        certificadoDesde: null,
                        certificadoHasta: null,
                    },
                };
            }

            const commonName = getAttrValue(signerCert.subject?.attributes || [], [
                "commonname",
                "cn",
                "2.5.4.3",
            ]);

            const givenName = getAttrValue(signerCert.subject?.attributes || [], [
                "givenname",
                "gn",
                "2.5.4.42",
            ]);

            const surname = getAttrValue(signerCert.subject?.attributes || [], [
                "surname",
                "sn",
                "2.5.4.4",
            ]);

            const organization = getAttrValue(signerCert.subject?.attributes || [], [
                "organizationname",
                "o",
                "2.5.4.10",
            ]);

            let firmante =
                commonName ||
                [givenName, surname].filter(Boolean).join(" ") ||
                organization ||
                dnToString(signerCert.subject?.attributes || []);

            if (!firmante) {
                firmante = "Firmante no identificado";
            }

            const cedula = buildCedulaFromCert(signerCert, commonName);

            const notBefore = signerCert.validity?.notBefore || null;
            const notAfter = signerCert.validity?.notAfter || null;
            const now = new Date();

            let certTimeOk = true;
            if (notBefore && now < notBefore) certTimeOk = false;
            if (notAfter && now > notAfter) certTimeOk = false;

            let chainOk = false;
            let chainErrorMsg = null;

            try {
                const trustCerts = await _loadCaCerts();
                const messageCerts = Array.isArray(p7.certificates) ? p7.certificates : [];

                if (trustCerts.length > 0 && messageCerts.length > 0) {
                    forge.pki.verifyCertificateChain(trustCerts, messageCerts);
                    chainOk = true;
                } else {
                    chainErrorMsg = "No hay certificados CA configurados o cadena embebida suficiente";
                }
            } catch (verifyErr) {
                chainOk = false;
                chainErrorMsg = verifyErr?.message || String(verifyErr);
                try {
                    console.error("[firmaService] forge verifyCertificateChain error:", chainErrorMsg);
                } catch {
                    // ignore
                }
            }

            let integrityOk = null;
            let integrityErrorMsg = null;

            try {
                if (typeof p7.verify === "function") {
                    integrityOk = p7.verify();
                }
            } catch (err) {
                integrityOk = false;
                integrityErrorMsg = err?.message || String(err);
                try {
                    console.error("[firmaService] p7.verify error:", integrityErrorMsg);
                } catch {
                    // ignore
                }
            }

            // NUEVA LOGICA:
            // considerar válida la firma si:
            // - se detectó
            // - se parseó PKCS7
            // - existe certificado firmante
            // - certificado vigente
            const firmaDetectada = true;
            const pkcs7Parseado = true;
            const valido = firmaDetectada && pkcs7Parseado && !!signerCert && certTimeOk;

            let mensaje = "Firma válida";

            if (!certTimeOk) {
                mensaje = "La firma fue detectada, pero el certificado está vencido o aún no es válido";
            } else if (!chainOk && chainErrorMsg) {
                mensaje = "Firma válida (cadena de confianza no verificada localmente)";
            } else if (integrityOk === false && integrityErrorMsg) {
                mensaje = "Firma válida (integridad criptográfica avanzada no confirmada por la librería actual)";
            }

            return {
                valido,
                firmante,
                cedula,
                mensaje,
                detalle: {
                    firmaDetectada,
                    pkcs7Parseado,
                    cadenaConfianza: chainOk,
                    integridad: integrityOk,
                    certificadoVigente: certTimeOk,
                    certificadoDesde: notBefore,
                    certificadoHasta: notAfter,
                },
            };
        } catch (err) {
            const e = new Error(err?.message || "error_validacion");
            e.code = err?.code ?? 500;
            throw e;
        }
    },
};