import crypto from "crypto";
import forge from "node-forge";

function cleanHexSignature(hexString = "") {
    return hexString.replace(/\s+/g, "").replace(/(?:00)+$/i, "");
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
    const idx = objStr.search(/\/Contents\s*</i);
    if (idx < 0) return null;

    const start = objStr.indexOf("<", idx);
    if (start < 0) return null;

    const end = objStr.indexOf(">", start + 1);
    if (end < 0) return null;

    const rawHex = objStr.slice(start + 1, end);
    const hex = cleanHexSignature(rawHex || "").replace(/[^0-9A-Fa-f]/g, "");

    if (!hex || hex.length % 2 !== 0) return null;

    return Buffer.from(hex, "hex");
}

function parseName(objStr, key) {
    const re = new RegExp(`/${key}\\s*/([A-Za-z0-9_.-]+)`, "i");
    const m = re.exec(objStr);
    return m ? m[1] : "";
}

function buildSignedContent(pdfBuffer, byteRange) {
    if (!byteRange || byteRange.length !== 4) return null;

    const [start1, len1, start2, len2] = byteRange;
    const part1 = pdfBuffer.subarray(start1, start1 + len1);
    const part2 = pdfBuffer.subarray(start2, start2 + len2);

    return Buffer.concat([part1, part2]);
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

function parsePkcs7(buffer) {
    // intento 1: parsear directamente como CMS / PKCS#7
    try {
        const asn1 = forge.asn1.fromDer(buffer.toString("binary"), false);
        const p7 = forge.pkcs7.messageFromAsn1(asn1);
        if (p7) return p7;
    } catch {
        // seguir al fallback
    }

    // intento 2: parsear como RFC3161 TimeStampResp
    try {
        const asn1 = forge.asn1.fromDer(buffer.toString("binary"), false);
        const rootChildren = getAsn1Children(asn1);

        // TimeStampResp suele ser:
        // SEQUENCE {
        //   PKIStatusInfo,
        //   TimeStampToken OPTIONAL
        // }
        if (rootChildren.length >= 2) {
            const maybeToken = rootChildren[1];
            const p7 = forge.pkcs7.messageFromAsn1(maybeToken);
            if (p7) return p7;
        }
    } catch {
        // seguir
    }

    return null;
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

function extractDigestAlgorithmOid(signerInfo) {
    try {
        if (signerInfo?.digestAlgorithm?.algorithm) {
            return signerInfo.digestAlgorithm.algorithm;
        }

        const parts = getAsn1Children(signerInfo);
        const digestAlgSeq = parts[2];
        const algChildren = getAsn1Children(digestAlgSeq);
        return oidFromNode(algChildren[0]) || "2.16.840.1.101.3.4.2.1";
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
        return oidFromNode(algChildren[0]) || "1.2.840.113549.1.1.11";
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

function certToPem(cert) {
    return forge.pki.certificateToPem(cert);
}

function describeAsn1Head(buffer) {
    try {
        const asn1 = forge.asn1.fromDer(buffer.toString("binary"), false);
        return {
            ok: true,
            tagClass: asn1.tagClass,
            type: asn1.type,
            constructed: asn1.constructed,
            children: Array.isArray(asn1.value) ? asn1.value.length : 0,
        };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || "ASN.1 parse error",
        };
    }
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

function chooseBestTimestampSignerCert(p7) {
    const certs = Array.isArray(p7?.certificates) ? p7.certificates : [];
    if (!certs.length) return null;
    if (certs.length === 1) return certs[0];

    const tsaLike = certs.find((cert) => {
        const attrs = cert.subject?.attributes || [];
        const txt = attrs
            .map((a) => `${a.shortName || a.name || a.type}=${a.value}`)
            .join(", ")
            .toLowerCase();

        return txt.includes("tsa") || txt.includes("timestamp") || txt.includes("time stamp");
    });

    return tsaLike || certs[0];
}

function extractEncapsulatedContentAsn1(p7) {
    try {
        if (p7?.rawCapture?.content) {
            return p7.rawCapture.content;
        }

        if (p7?.contentInfo) {
            const children = getAsn1Children(p7.contentInfo);
            if (children.length >= 2) {
                const wrapper = children[1];
                const wChildren = getAsn1Children(wrapper);
                if (wChildren.length) {
                    return wChildren[0];
                }
            }
        }

        if (p7?.asn1) {
            const contentInfoChildren = getAsn1Children(p7.asn1);
            const signedDataWrapper = contentInfoChildren[1];
            const signedDataWrapperChildren = getAsn1Children(signedDataWrapper);
            const signedData = signedDataWrapperChildren[0];
            const signedDataChildren = getAsn1Children(signedData);

            const encapContentInfo = signedDataChildren[2];
            const encapChildren = getAsn1Children(encapContentInfo);

            for (const child of encapChildren) {
                const childChildren = getAsn1Children(child);
                if (childChildren.length) {
                    return childChildren[0];
                }
            }
        }
    } catch {
        // ignore
    }

    return null;
}

function unwrapOctetStringDeep(node) {
    try {
        if (!node) return null;

        if (node.type === forge.asn1.Type.OCTETSTRING && typeof node.value === "string") {
            return Buffer.from(node.value, "binary");
        }

        const children = getAsn1Children(node);

        for (const child of children) {
            const result = unwrapOctetStringDeep(child);
            if (result) return result;
        }
    } catch {
        // ignore
    }

    return null;
}

function parseMessageImprint(miNode) {
    const miChildren = getAsn1Children(miNode);
    if (miChildren.length < 2) return null;

    const algSeq = miChildren[0];
    const algChildren = getAsn1Children(algSeq);
    const algOid = oidFromNode(algChildren[0]);
    const hashedMessageNode = miChildren[1];

    if (!algOid || !hashedMessageNode?.value) return null;

    return {
        algorithmOid: algOid,
        algorithmName: mapDigestOidToNodeName(algOid),
        hashedMessage: Buffer.from(hashedMessageNode.value, "binary"),
    };
}

function parseTstInfoFromContentBuffer(contentBuffer) {
    try {
        const asn1 = forge.asn1.fromDer(contentBuffer.toString("binary"), false);
        const children = getAsn1Children(asn1);

        if (children.length < 5) {
            return {
                ok: false,
                error: "TSTInfo incompleto",
            };
        }

        const policyNode = children[1];
        const messageImprintNode = children[2];
        const serialNode = children[3];
        const genTimeNode = children[4];

        const policyOid = oidFromNode(policyNode);
        const messageImprint = parseMessageImprint(messageImprintNode);
        const genTime = parseAsn1TimeString(genTimeNode?.value || "");
        const serialHex = serialNode?.value
            ? Buffer.from(serialNode.value, "binary").toString("hex")
            : "";

        return {
            ok: true,
            policyOid,
            messageImprint,
            genTime,
            serialHex,
            rawAsn1: asn1,
        };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || "No se pudo parsear TSTInfo",
        };
    }
}

function extractTimestampTokenInfo(tokenBuffer) {
    const cmsInfo = extractTimestampCmsInfo(tokenBuffer);

    if (!cmsInfo.ok) {
        return {
            ok: false,
            step: cmsInfo.step || "extractTimestampCmsInfo",
            error: cmsInfo.error || "No se pudo parsear el CMS del timestamp",
        };
    }

    const tstInfo = parseTstInfoFromContentBuffer(cmsInfo.tstInfoBuffer);
    if (!tstInfo.ok) {
        return {
            ok: false,
            step: "parseTstInfoFromContentBuffer",
            error: tstInfo.error || "No se pudo parsear TSTInfo",
        };
    }

    return {
        ok: true,
        cmsInfo,
        tstInfoBuffer: cmsInfo.tstInfoBuffer,
        tstInfo,
    };
}

function validateDocTimestampToken(tokenBuffer, stampedContent) {
    const tokenInfo = extractTimestampTokenInfo(tokenBuffer);

    if (!tokenInfo.ok) {
        return {
            ok: false,
            fecha: null,
            messageImprintCoincide: false,
            firmaTokenOk: false,
            error: tokenInfo.error,
            step: tokenInfo.step || "unknown",
            detalle: null,
        };
    }

    const { cmsInfo, tstInfo } = tokenInfo;
    const mi = tstInfo.messageImprint;

    if (!mi || !mi.algorithmName) {
        return {
            ok: false,
            fecha: tstInfo.genTime || null,
            messageImprintCoincide: false,
            firmaTokenOk: false,
            error: "El TimeStampToken no contiene messageImprint válido",
            step: "messageImprint",
            detalle: {
                genTime: tstInfo.genTime || null,
                policyOid: tstInfo.policyOid || "",
                serialHex: tstInfo.serialHex || "",
                contentTypeOid: cmsInfo.contentTypeOid || "",
                eContentTypeOid: cmsInfo.eContentTypeOid || "",
            },
        };
    }

    const calculatedImprint = crypto
        .createHash(mi.algorithmName)
        .update(stampedContent)
        .digest();

    const messageImprintCoincide =
        calculatedImprint.toString("hex").toLowerCase() ===
        mi.hashedMessage.toString("hex").toLowerCase();

    return {
        ok: messageImprintCoincide,
        fecha: tstInfo.genTime || null,
        messageImprintCoincide,
        firmaTokenOk: false,
        error: !messageImprintCoincide
            ? "El messageImprint del timestamp no coincide con el contenido sellado"
            : null,
        step: "manualCmsParsed",
        detalle: {
            genTime: tstInfo.genTime || null,
            policyOid: tstInfo.policyOid || "",
            serialHex: tstInfo.serialHex || "",
            algoritmoMessageImprint: mi.algorithmName,
            messageImprintEsperado: mi.hashedMessage.toString("hex"),
            messageImprintCalculado: calculatedImprint.toString("hex"),
            contentTypeOid: cmsInfo.contentTypeOid || "",
            eContentTypeOid: cmsInfo.eContentTypeOid || "",
            tsaSignatureVerified: false,
            tsaSignatureNote: "Fecha extraída y messageImprint validado; firma CMS del TSA no verificada con node-forge",
        },
    };
}

function parseAsn1Buffer(buffer) {
    return forge.asn1.fromDer(buffer.toString("binary"), false);
}

function extractTimestampCmsInfo(tokenBuffer) {
    try {
        const contentInfo = parseAsn1Buffer(tokenBuffer);
        const ciChildren = getAsn1Children(contentInfo);

        if (ciChildren.length < 2) {
            return {
                ok: false,
                step: "contentInfo",
                error: "ContentInfo incompleto",
            };
        }

        const contentTypeOid = oidFromNode(ciChildren[0]);
        if (contentTypeOid !== "1.2.840.113549.1.7.2") {
            return {
                ok: false,
                step: "contentType",
                error: `OID CMS inesperado: ${contentTypeOid || "desconocido"}`,
            };
        }

        const signedDataWrapper = ciChildren[1];
        const wrapperChildren = getAsn1Children(signedDataWrapper);
        const signedData = wrapperChildren[0];

        if (!signedData) {
            return {
                ok: false,
                step: "signedDataWrapper",
                error: "No se encontró SignedData dentro del ContentInfo",
            };
        }

        const sdChildren = getAsn1Children(signedData);
        if (sdChildren.length < 3) {
            return {
                ok: false,
                step: "signedData",
                error: "SignedData incompleto",
            };
        }

        const encapContentInfo = sdChildren[2];
        const eciChildren = getAsn1Children(encapContentInfo);

        if (eciChildren.length < 2) {
            return {
                ok: false,
                step: "encapContentInfo",
                error: "EncapsulatedContentInfo incompleto",
            };
        }

        const eContentTypeOid = oidFromNode(eciChildren[0]);
        const eContentWrapper = eciChildren[1];
        const tstInfoBuffer = unwrapOctetStringDeep(eContentWrapper);

        if (!tstInfoBuffer) {
            return {
                ok: false,
                step: "eContent",
                error: "No se pudo extraer TSTInfo desde eContent",
            };
        }

        return {
            ok: true,
            contentTypeOid,
            eContentTypeOid,
            tstInfoBuffer,
            signedData,
        };
    } catch (err) {
        return {
            ok: false,
            step: "cmsManualParse",
            error: err?.message || "No se pudo parsear CMS manualmente",
        };
    }
}

export const timestampService = {
    extractDocTimestamps(pdfBuffer) {
        const pdfStr = pdfBuffer.toString("binary");
        const objects = getPdfObjects(pdfStr);
        const results = [];

        for (const [refKey, body] of objects.entries()) {
            const typeName = parseName(body, "Type");
            const subFilter = parseName(body, "SubFilter");

            const hasTimestampHints =
                /\/Type\s*\/DocTimeStamp\b/i.test(body) ||
                /\/SubFilter\s*\/ETSI\.RFC3161\b/i.test(body) ||
                /^DocTimeStamp$/i.test(typeName) ||
                /^ETSI\.RFC3161$/i.test(subFilter);

            if (!hasTimestampHints) continue;

            const byteRange = parseByteRangeFromObject(body);
            const contents = parseContentsFromObject(body);

            if (!byteRange || !contents) {
                results.push({
                    objectRef: refKey,
                    byteRange: byteRange || null,
                    fecha: null,
                    valido: false,
                    messageImprintCoincide: false,
                    firmaTokenOk: false,
                    error: "Objeto timestamp detectado pero incompleto",
                    detalle: {
                        typeName,
                        subFilter,
                        hasByteRange: !!byteRange,
                        hasContents: !!contents,
                    },
                });
                continue;
            }

            const stampedContent = buildSignedContent(pdfBuffer, byteRange);
            if (!stampedContent) {
                results.push({
                    objectRef: refKey,
                    byteRange,
                    fecha: null,
                    valido: false,
                    messageImprintCoincide: false,
                    firmaTokenOk: false,
                    error: "No se pudo reconstruir el contenido sellado",
                    detalle: {
                        typeName,
                        subFilter,
                    },
                });
                continue;
            }


            const validation = validateDocTimestampToken(contents, stampedContent);

            results.push({
                objectRef: refKey,
                byteRange,
                fecha: validation.fecha,
                valido: validation.ok,
                messageImprintCoincide: validation.messageImprintCoincide,
                firmaTokenOk: validation.firmaTokenOk,
                error: validation.error,
                step: validation.step || null,
                detalle: {
                    typeName,
                    subFilter,
                    ...(validation.detalle || {}),
                },
            });
        }

        results.sort((a, b) => (a.byteRange?.[1] || 0) - (b.byteRange?.[1] || 0));
        return results;
    },

    resolveOfficialDateForSignature(pdfBuffer, signatureByteRange, fallbackSigningTime = null) {
        const timestamps = this.extractDocTimestamps(pdfBuffer);
        const sigPos = signatureByteRange?.[1] || 0;

        const candidate = timestamps.find(
            (t) =>
                (t.byteRange?.[1] || 0) > sigPos &&
                t.fecha &&
                t.valido === true
        );

        if (candidate?.fecha) {
            return candidate.fecha;
        }

        return fallbackSigningTime || null;
    },
};