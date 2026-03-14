// src/services/firma.service.js

import crypto from "crypto";
import forge from "node-forge";
import signer from "node-signpdf";

void signer;

import { firmaRepo } from "../repositories/firmaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

import { certificateChainService } from "./certificateChain.service.js";
import { timestampService } from "./timestamp.service.js";
import { revocationService } from "./revocation.service.js";

function asInt(v, name) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
        const e = new Error(`${name} inválido`);
        e.code = 400;
        throw e;
    }
    return n;
}

function cleanHexSignature(hexString = "") {
    return hexString.replace(/\s+/g, "").replace(/(?:00)+$/i, "");
}

function normalizeHex(hex = "") {
    return (hex || "").replace(/\s+/g, "").toLowerCase();
}

function buildSignedContent(pdfBuffer, byteRange) {
    if (!byteRange || byteRange.length !== 4) return null;

    const [start1, len1, start2, len2] = byteRange;
    const part1 = pdfBuffer.subarray(start1, start1 + len1);
    const part2 = pdfBuffer.subarray(start2, start2 + len2);

    return Buffer.concat([part1, part2]);
}

function getPdfObjects(pdfStr) {
    const objectRegex = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
    const objects = new Map();
    let match;

    while ((match = objectRegex.exec(pdfStr)) !== null) {
        const objNum = Number(match[1]);
        const genNum = Number(match[2]);
        const body = match[3];
        objects.set(`${objNum} ${genNum}`, body);
    }

    return objects;
}

function parseByteRangeFromObject(objStr) {
    const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(objStr);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function parseContentsFromObject(objStr) {
    const m = /\/Contents\s*<([0-9A-Fa-f\s\r\n\t]+)>/.exec(objStr);
    if (!m) return null;

    const hex = cleanHexSignature(m[1] || "");
    if (!hex) return null;

    return Buffer.from(hex, "hex");
}

function parseName(objStr, key) {
    const re = new RegExp(`/${key}\\s*/([A-Za-z0-9_.-]+)`, "i");
    const m = re.exec(objStr);
    return m ? m[1] : "";
}

function extractAllPdfSignatures(pdfStr) {
    const objects = getPdfObjects(pdfStr);
    const firmas = [];
    const seenRefs = new Set();

    // 1) Campos /FT /Sig -> /V ref
    for (const [, body] of objects.entries()) {
        if (!/\/FT\s*\/Sig\b/i.test(body)) continue;

        const vRef = /\/V\s+(\d+)\s+(\d+)\s+R\b/i.exec(body);
        if (!vRef) continue;

        const refKey = `${Number(vRef[1])} ${Number(vRef[2])}`;
        if (seenRefs.has(refKey)) continue;

        const sigObj = objects.get(refKey);
        if (!sigObj) continue;

        const typeName = parseName(sigObj, "Type");
        const subFilter = parseName(sigObj, "SubFilter");

        const isDocTimeStamp =
            /^DocTimeStamp$/i.test(typeName) ||
            /^ETSI\.RFC3161$/i.test(subFilter);

        if (isDocTimeStamp) continue;
        if (typeName && !/^Sig$/i.test(typeName)) continue;

        const byteRange = parseByteRangeFromObject(sigObj);
        const signatureDer = parseContentsFromObject(sigObj);

        if (!byteRange || !signatureDer) continue;

        seenRefs.add(refKey);

        firmas.push({
            byteRange,
            signatureDer,
            rawFieldObject: body,
            rawSignatureObject: sigObj,
            objectRef: refKey,
            subFilter,
            typeName,
        });
    }

    // 2) Objetos directos /Type /Sig
    for (const [refKey, body] of objects.entries()) {
        if (seenRefs.has(refKey)) continue;

        const typeName = parseName(body, "Type");
        const subFilter = parseName(body, "SubFilter");

        const hasByteRange = /\/ByteRange\s*\[/i.test(body);
        const hasContents = /\/Contents\s*</i.test(body);

        const isDocTimeStamp =
            /^DocTimeStamp$/i.test(typeName) ||
            /^ETSI\.RFC3161$/i.test(subFilter);

        const isDirectSig = /^Sig$/i.test(typeName);

        if (isDocTimeStamp) continue;
        if (!isDirectSig) continue;
        if (!hasByteRange || !hasContents) continue;

        const byteRange = parseByteRangeFromObject(body);
        const signatureDer = parseContentsFromObject(body);

        if (!byteRange || !signatureDer) continue;

        seenRefs.add(refKey);

        firmas.push({
            byteRange,
            signatureDer,
            rawFieldObject: null,
            rawSignatureObject: body,
            objectRef: refKey,
            subFilter,
            typeName,
        });
    }

    firmas.sort((a, b) => a.byteRange[1] - b.byteRange[1]);

    return firmas;
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

function getAttrByOid(attrs = [], oid) {
    return attrs.find((a) => a?.type === oid)?.value || "";
}

function dnToString(attrs = []) {
    return attrs.map((a) => `${a.shortName || a.name || a.type}=${a.value}`).join(", ");
}

function mapDigestOidToNodeName(oid) {
    const map = {
        "1.3.14.3.2.26": "sha1",
        "2.16.840.1.101.3.4.2.1": "sha256",
        "2.16.840.1.101.3.4.2.2": "sha384",
        "2.16.840.1.101.3.4.2.3": "sha512",
        "1.2.840.113549.2.5": "md5",
    };
    return map[oid] || "sha256";
}

function mapSignatureOidToNodePadding(oid) {
    if (oid === "1.2.840.113549.1.1.10") {
        return crypto.constants.RSA_PKCS1_PSS_PADDING;
    }
    return crypto.constants.RSA_PKCS1_PADDING;
}

function getSignerInfo(p7) {
    const signerInfos = p7?.rawCapture?.signerInfos;
    if (Array.isArray(signerInfos) && signerInfos.length > 0) return signerInfos[0];
    return null;
}

function getAsn1Children(node) {
    return Array.isArray(node?.value) ? node.value : [];
}

function oidFromNode(node) {
    try {
        if (node?.type === forge.asn1.Type.OID) {
            return forge.asn1.derToOid(node.value);
        }
    } catch {
        // ignore
    }
    return null;
}

function findAttributeNodeByOid(signerInfo, oid) {
    try {
        const parts = getAsn1Children(signerInfo);

        for (const part of parts) {
            const children = getAsn1Children(part);
            if (!children.length) continue;

            for (const attr of children) {
                const attrParts = getAsn1Children(attr);
                if (attrParts.length < 2) continue;

                const typeNode = attrParts[0];
                const valuesNode = attrParts[1];
                const attrOid = oidFromNode(typeNode);

                if (attrOid === oid) {
                    return valuesNode;
                }
            }
        }
    } catch {
        // ignore
    }

    return null;
}

function extractMessageDigestFromSignerInfo(signerInfo) {
    const valuesNode = findAttributeNodeByOid(signerInfo, "1.2.840.113549.1.9.4");
    const values = getAsn1Children(valuesNode);
    const digestNode = values[0];

    if (!digestNode) return null;

    try {
        if (digestNode.value) {
            return Buffer.from(digestNode.value, "binary");
        }
    } catch {
        // ignore
    }

    return null;
}

function parseAsn1TimeString(raw) {
    if (!raw || typeof raw !== "string") return null;

    const utc = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/;
    const gen = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/;

    let m = utc.exec(raw);
    if (m) {
        let year = Number(m[1]);
        year += year >= 50 ? 1900 : 2000;
        return new Date(Date.UTC(
            year,
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6])
        ));
    }

    m = gen.exec(raw);
    if (m) {
        return new Date(Date.UTC(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6])
        ));
    }

    return null;
}

/** OID id-aa-signatureTimeStampToken (RFC 3161 timestamp embebido en CMS) */
const OID_SIGNATURE_TIMESTAMP_TOKEN = "1.2.840.113549.1.9.16.2.14";

function extractSigningTimeFromSignerInfo(signerInfo) {
    const valuesNode = findAttributeNodeByOid(signerInfo, "1.2.840.113549.1.9.5");
    const values = getAsn1Children(valuesNode);
    const timeNode = values[0];

    if (!timeNode?.value) return null;

    try {
        return parseAsn1TimeString(timeNode.value);
    } catch {
        return null;
    }
}

/**
 * Extrae el valor del atributo signatureTimeStampToken (OID 1.2.840.113549.1.9.16.2.14)
 * del SignerInfo. Retorna el buffer DER del TimeStampToken o null.
 */
function extractSignatureTimeStampTokenBuffer(signerInfo) {
    const valuesNode = findAttributeNodeByOid(signerInfo, OID_SIGNATURE_TIMESTAMP_TOKEN);
    if (!valuesNode) return null;

    const values = getAsn1Children(valuesNode);
    const firstValue = values[0];
    if (!firstValue) return null;

    try {
        if (firstValue.type === forge.asn1.Type.OCTETSTRING && typeof firstValue.value === "string") {
            return Buffer.from(firstValue.value, "binary");
        }
        const der = forge.asn1.toDer(firstValue).getBytes();
        return Buffer.from(der, "binary");
    } catch {
        return null;
    }
}

function getSignedAttributesDer(signerInfo) {
    try {
        const parts = getAsn1Children(signerInfo);

        for (const part of parts) {
            const children = getAsn1Children(part);
            if (!children.length) continue;

            const looksLikeAttrSet = children.some((attr) => {
                const attrParts = getAsn1Children(attr);
                if (attrParts.length < 2) return false;
                return !!oidFromNode(attrParts[0]);
            });

            if (looksLikeAttrSet) {
                const der = forge.asn1.toDer(part).getBytes();
                const bytes = Buffer.from(der, "binary");

                if (bytes.length > 0 && bytes[0] === 0xa0) {
                    const fixed = Buffer.from(bytes);
                    fixed[0] = 0x31;
                    return fixed;
                }

                return bytes;
            }
        }
    } catch {
        // ignore
    }

    return null;
}

function extractDigestAlgorithmOid(signerInfo) {
    try {
        if (signerInfo?.digestAlgorithm?.algorithm) {
            return signerInfo.digestAlgorithm.algorithm;
        }

        const parts = getAsn1Children(signerInfo);
        const digestAlgSeq = parts[2];
        const algChildren = getAsn1Children(digestAlgSeq);
        const oid = oidFromNode(algChildren[0]);
        return oid || "2.16.840.1.101.3.4.2.1";
    } catch {
        return "2.16.840.1.101.3.4.2.1";
    }
}

function extractSignatureAlgorithmOid(signerInfo) {
    try {
        if (signerInfo?.signatureAlgorithm?.algorithm) {
            return signerInfo.signatureAlgorithm.algorithm;
        }

        const parts = getAsn1Children(signerInfo);
        const sigAlgSeq = parts[4];
        const algChildren = getAsn1Children(sigAlgSeq);
        const oid = oidFromNode(algChildren[0]);
        return oid || "1.2.840.113549.1.1.11";
    } catch {
        return "1.2.840.113549.1.1.11";
    }
}

function extractSignatureValue(signerInfo) {
    try {
        if (signerInfo?.encryptedDigest) {
            return Buffer.from(signerInfo.encryptedDigest, "binary");
        }

        const parts = getAsn1Children(signerInfo);
        const sigNode = parts[5];
        if (sigNode?.value) {
            return Buffer.from(sigNode.value, "binary");
        }
    } catch {
        // ignore
    }

    return null;
}

function certToPem(cert) {
    return forge.pki.certificateToPem(cert);
}

function getSerialHexFromSignerInfo(signerInfo) {
    try {
        const parts = getAsn1Children(signerInfo);
        const sid = parts[1];
        const sidChildren = getAsn1Children(sid);
        const serialNode = sidChildren[1];
        if (!serialNode?.value) return "";
        return normalizeHex(Buffer.from(serialNode.value, "binary").toString("hex"));
    } catch {
        return "";
    }
}

function chooseBestSignerCert(p7) {
    const certs = Array.isArray(p7?.certificates) ? p7.certificates : [];
    if (!certs.length) return null;

    const signerInfo = getSignerInfo(p7);
    if (!signerInfo) return certs[0];

    const expectedSerial = getSerialHexFromSignerInfo(signerInfo);

    const exactBySerial = certs.find(
        (cert) => normalizeHex(cert.serialNumber || "") === expectedSerial
    );
    if (exactBySerial) return exactBySerial;

    const subjectRich = certs.filter((cert) => {
        const attrs = cert.subject?.attributes || [];
        const cn = getAttrValue(attrs, ["commonname", "cn"]);
        const gn = getAttrValue(attrs, ["givenname", "gn"]);
        const sn = getAttrValue(attrs, ["surname"]);
        const serialPerson = getAttrByOid(attrs, "2.5.4.5");
        const hasHumanLikeName = !!(gn || sn || (cn && cn.trim().includes(" ")));
        const hasId = !!serialPerson;
        return hasHumanLikeName || hasId;
    });

    if (subjectRich.length === 1) return subjectRich[0];

    const notTsa = certs.filter((cert) => {
        const txt = dnToString(cert.subject?.attributes || []).toLowerCase();
        return !txt.includes("tsa") && !txt.includes("timestamp") && !txt.includes("time stamp");
    });

    if (notTsa.length === 1) return notTsa[0];

    return subjectRich[0] || notTsa[0] || certs[0];
}

function buildFirmanteFromCert(cert) {
    const attrs = cert.subject?.attributes || [];

    const commonName = getAttrValue(attrs, ["commonname", "cn"]);
    const givenName = getAttrValue(attrs, ["givenname", "gn", "2.5.4.42"]);
    const surname = getAttrValue(attrs, ["surname", "sn", "2.5.4.4"]);
    const organization = getAttrValue(attrs, ["organizationname", "o", "2.5.4.10"]);

    const fullName = [givenName, surname].filter(Boolean).join(" ").trim();

    if (fullName) return fullName;
    if (commonName && commonName.includes(" ")) return commonName;
    if (organization && !commonName) return organization;
    if (commonName) return commonName;

    return dnToString(attrs) || "Firmante no identificado";
}

function buildCedulaFromCert(cert, fallbackText = "") {
    const attrs = cert.subject?.attributes || [];

    let cedula =
        getAttrByOid(attrs, "2.5.4.5") ||
        getAttrValue(attrs, ["serialnumber"]) ||
        "";

    const matchDirect = cedula.match(/\b\d{1,2}-\d{4}-\d{4}\b/);
    if (matchDirect) return matchDirect[0];

    if (fallbackText) {
        const m = fallbackText.match(/\b\d{1,2}-\d{4}-\d{4}\b/);
        if (m) return m[0];
    }

    const cn = getAttrValue(attrs, ["commonname", "cn"]);
    const m2 = cn.match(/\b\d{1,2}-\d{4}-\d{4}\b/);
    if (m2) return m2[0];

    return cedula || "";
}

function verifySignatureOverSignedAttrs({
                                            signerCert,
                                            signedAttrsDer,
                                            signatureValue,
                                            digestAlgorithmName,
                                            signatureAlgorithmOid,
                                        }) {
    try {
        if (!signerCert || !signedAttrsDer || !signatureValue) return false;

        const keyPem = certToPem(signerCert);
        const padding = mapSignatureOidToNodePadding(signatureAlgorithmOid);

        try {
            const verifier = crypto.createVerify(digestAlgorithmName);
            verifier.update(signedAttrsDer);
            verifier.end();

            const ok = verifier.verify({ key: keyPem, padding }, signatureValue);
            if (ok) return true;
        } catch {
            // seguir
        }

        try {
            const verifier2 = crypto.createVerify(`RSA-${digestAlgorithmName.toUpperCase()}`);
            verifier2.update(signedAttrsDer);
            verifier2.end();

            const ok2 = verifier2.verify({ key: keyPem, padding }, signatureValue);
            if (ok2) return true;
        } catch {
            // seguir
        }

        return false;
    } catch {
        return false;
    }
}

async function validarFirmaExtraida(pdfBuffer, firmaExtraida, trustCerts) {
    const { byteRange, signatureDer, objectRef } = firmaExtraida;

    const signedContent = buildSignedContent(pdfBuffer, byteRange);
    if (!signedContent) {
        return {
            valido: false,
            firmante: "",
            cedula: "",
            mensaje: "No se pudo reconstruir el contenido firmado del PDF",
            detalle: {
                firmaDetectada: true,
                byteRangeValido: false,
                pkcs7Parseado: false,
                fechaFirma: null,
                algoritmoHash: "",
                messageDigestEsperado: "",
                messageDigestCalculado: "",
                messageDigestCoincide: false,
                firmaCriptograficaOk: false,
                cadenaConfianza: false,
                cadenaConfianzaError: "No se pudo reconstruir el contenido firmado",
                certificadoVigente: false,
                certificadoDesde: null,
                certificadoHasta: null,
                revocacion: "unknown",
                revocacionDetalle: null,
                byteRange,
                objectRef,
            },
        };
    }

    let p7 = null;
    try {
        const asn1 = forge.asn1.fromDer(signatureDer.toString("binary"), false);
        p7 = forge.pkcs7.messageFromAsn1(asn1);
    } catch {
        return {
            valido: false,
            firmante: "",
            cedula: "",
            mensaje: "Se detectó una firma, pero no pudo interpretarse como PKCS#7",
            detalle: {
                firmaDetectada: true,
                byteRangeValido: true,
                pkcs7Parseado: false,
                fechaFirma: null,
                algoritmoHash: "",
                messageDigestEsperado: "",
                messageDigestCalculado: "",
                messageDigestCoincide: false,
                firmaCriptograficaOk: false,
                cadenaConfianza: false,
                cadenaConfianzaError: "PKCS#7 no parseable",
                certificadoVigente: false,
                certificadoDesde: null,
                certificadoHasta: null,
                revocacion: "unknown",
                revocacionDetalle: null,
                byteRange,
                objectRef,
            },
        };
    }

    const signerInfo = getSignerInfo(p7);
    if (!signerInfo) {
        return {
            valido: false,
            firmante: "",
            cedula: "",
            mensaje: "No se encontró SignerInfo dentro de la firma",
            detalle: {
                firmaDetectada: true,
                byteRangeValido: true,
                pkcs7Parseado: true,
                fechaFirma: null,
                algoritmoHash: "",
                messageDigestEsperado: "",
                messageDigestCalculado: "",
                messageDigestCoincide: false,
                firmaCriptograficaOk: false,
                cadenaConfianza: false,
                cadenaConfianzaError: "SignerInfo ausente",
                certificadoVigente: false,
                certificadoDesde: null,
                certificadoHasta: null,
                revocacion: "unknown",
                revocacionDetalle: null,
                byteRange,
                objectRef,
            },
        };
    }

    const signerCert = chooseBestSignerCert(p7);
    if (!signerCert) {
        return {
            valido: false,
            firmante: "",
            cedula: "",
            mensaje: "No se encontró el certificado del firmante",
            detalle: {
                firmaDetectada: true,
                byteRangeValido: true,
                pkcs7Parseado: true,
                fechaFirma: null,
                algoritmoHash: "",
                messageDigestEsperado: "",
                messageDigestCalculado: "",
                messageDigestCoincide: false,
                firmaCriptograficaOk: false,
                cadenaConfianza: false,
                cadenaConfianzaError: "Certificado del firmante ausente",
                certificadoVigente: false,
                certificadoDesde: null,
                certificadoHasta: null,
                revocacion: "unknown",
                revocacionDetalle: null,
                byteRange,
                objectRef,
            },
        };
    }

    const digestOid = extractDigestAlgorithmOid(signerInfo);
    const digestAlgorithmName = mapDigestOidToNodeName(digestOid);

    const expectedMessageDigest = extractMessageDigestFromSignerInfo(signerInfo);
    const computedDigest = crypto.createHash(digestAlgorithmName).update(signedContent).digest();

    const messageDigestCoincide =
        !!expectedMessageDigest &&
        normalizeHex(expectedMessageDigest.toString("hex")) ===
        normalizeHex(computedDigest.toString("hex"));

    const signedAttrsDer = getSignedAttributesDer(signerInfo);
    const signatureValue = extractSignatureValue(signerInfo);
    const signatureAlgorithmOid = extractSignatureAlgorithmOid(signerInfo);

    const firmaCriptograficaOk = verifySignatureOverSignedAttrs({
        signerCert,
        signedAttrsDer,
        signatureValue,
        digestAlgorithmName,
        signatureAlgorithmOid,
    });

    const signingTime = extractSigningTimeFromSignerInfo(signerInfo) || null;
    const cmsTimestampTokenBuffer = extractSignatureTimeStampTokenBuffer(signerInfo);
    const fechaFirma = timestampService.resolveOfficialDateForSignature(
        pdfBuffer,
        byteRange,
        signingTime,
        cmsTimestampTokenBuffer
    );


    const verificationDate = fechaFirma || null;

    const messageCerts = Array.isArray(p7.certificates) ? p7.certificates : [];

    const chainRes = certificateChainService.validateChainAtDate(
        trustCerts,
        messageCerts,
        signerCert,
        verificationDate
    );

    const revocationRes = await revocationService.checkBestEffort(
        signerCert,
        messageCerts,
        trustCerts
    );

    const certificadoDesde = signerCert.validity?.notBefore || null;
    const certificadoHasta = signerCert.validity?.notAfter || null;

    const vigenciaEvaluable = !!verificationDate;

    let certificadoVigente = true;

    if (verificationDate) {
        if (certificadoDesde && verificationDate < certificadoDesde) certificadoVigente = false;
        if (certificadoHasta && verificationDate > certificadoHasta) certificadoVigente = false;
    }

    const firmante = buildFirmanteFromCert(signerCert);
    const cedula = buildCedulaFromCert(signerCert, firmante);

    let valido = false;
    let mensaje = "Firma válida";
    let alerta = null;

    const tieneFechaOficial = !!fechaFirma;
    const cadenaConfianzaOk = !!chainRes.ok;
    const revocacionStatus = String(revocationRes.status || "").toLowerCase();

    if (!expectedMessageDigest) {
        mensaje = "No se pudo extraer el messageDigest del firmante";
        valido = false;
    } else if (!messageDigestCoincide) {
        mensaje = "El contenido del PDF no coincide con el hash firmado";
        valido = false;
    } else if (!firmaCriptograficaOk) {
        mensaje = "La firma criptográfica no pudo verificarse con el certificado del firmante";
        valido = false;
    } else if (revocacionStatus === "revoked") {
        mensaje = "El certificado del firmante aparece revocado";
        valido = false;
    } else if (!tieneFechaOficial) {
        mensaje = "No se pudo determinar la fecha oficial de la firma";
        valido = false;
    } else if (!certificadoVigente) {
        mensaje = "El certificado del firmante no era válido en la fecha de la firma";
        valido = false;
    } else if (!cadenaConfianzaOk) {
        mensaje = "No se pudo validar la cadena de confianza de la firma";
        valido = false;
    } else if (
        certificadoHasta &&
        certificadoHasta < new Date() &&
        !(chainRes.chainAllFromMessage === true)
    ) {
        mensaje = "No se puede validar en línea el estado de revocación del certificado firmante debido a que ya venció.";
        valido = false;
    } else if (revocacionStatus === "good") {
        mensaje = "Firma válida";
        valido = true;
    } else {
        // unknown u otro: firma válida con alerta (recomendar verificar en BCCR)
        mensaje = "Firma válida";
        valido = true;
        alerta = "No se pudo confirmar el estado de revocación del certificado. Se recomienda verificar en el portal oficial del BCCR.";
    }

    const result = {
        valido,
        firmante,
        cedula,
        mensaje,
        detalle: {
            firmaDetectada: true,
            byteRangeValido: true,
            pkcs7Parseado: true,
            fechaFirma,
            algoritmoHash: digestAlgorithmName,
            messageDigestEsperado: expectedMessageDigest ? expectedMessageDigest.toString("hex") : "",
            messageDigestCalculado: computedDigest.toString("hex"),
            messageDigestCoincide,
            firmaCriptograficaOk,
            cadenaConfianza: chainRes.ok,
            cadenaConfianzaError: chainRes.error,
            cadenaConfianzaTopSubject: chainRes.topSubject || null,
            cadenaConfianzaChainLength: chainRes.chainLength || null,
            certificadoVigente,
            vigenciaEvaluable,
            certificadoDesde,
            certificadoHasta,
            revocacion: revocationRes.status,
            revocacionDetalle: revocationRes,
            byteRange,
            objectRef,
        },
    };
    if (alerta) result.alerta = alerta;
    return result;
}

function resolveBusinessVerificationStatus(resultados = []) {
    if (!Array.isArray(resultados) || resultados.length === 0) {
        return "INVALIDA";
    }

    let hasRevoked = false;
    let hasExpired = false;
    let hasInvalid = false;

    for (const r of resultados) {
        const rev = String(r?.detalle?.revocacion || "").toLowerCase();

        if (rev === "revoked") {
            hasRevoked = true;
        }

        if (r?.detalle?.certificadoVigente === false) {
            hasExpired = true;
        }

        if (!r?.valido) {
            hasInvalid = true;
        }
    }

    if (hasRevoked) return "REVOCADA";
    if (hasExpired) return "CADUCADA";
    if (hasInvalid) return "INVALIDA";
    return "VALIDA";
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
            const firmasExtraidas = extractAllPdfSignatures(pdfStr);

            if (!firmasExtraidas.length) {
                const e = new Error("sin firma");
                e.code = 422;
                throw e;
            }

            const trustCerts = await certificateChainService.loadTrustedCerts();
            const resultados = [];

            for (const firmaExtraida of firmasExtraidas) {
                const resultado = await validarFirmaExtraida(pdfBuffer, firmaExtraida, trustCerts);
                resultados.push(resultado);
            }

            const todasValidas = resultados.every((r) => r.valido === true);
            const estadoVerificacion = resolveBusinessVerificationStatus(resultados);

            let mensaje = `Se encontraron ${resultados.length} firma(s); no todas son válidas`;

            if (estadoVerificacion === "VALIDA") {
                mensaje = `Todas las firmas del PDF son válidas (${resultados.length})`;
            } else if (estadoVerificacion === "REVOCADA") {
                mensaje = "Se detectó al menos una firma revocada. El documento no debe aceptarse.";
            } else if (estadoVerificacion === "CADUCADA") {
                mensaje = "Se detectó al menos una firma caducada o fuera de vigencia. El documento no debe aceptarse.";
            } else if (estadoVerificacion === "INVALIDA") {
                mensaje = "Se detectó al menos una firma inválida o sin evidencia suficiente de validez. Se recomienda verificar el documento en la página oficial del BCCR y adjuntar nuevamente el archivo corregido.";
            }

            return {
                valido: estadoVerificacion === "VALIDA",
                estadoVerificacion,
                mensaje,
                firmas: resultados,
            };
        } catch (err) {
            const e = new Error(err?.message || "error_validacion");
            e.code = err?.code ?? 500;
            throw e;
        }
    },
};