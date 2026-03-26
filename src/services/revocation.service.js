import http from "http";
import https from "https";
import forge from "node-forge";

function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}

function normalizeHex(hex = "") {
    return (hex || "").replace(/\s+/g, "").toLowerCase();
}

function bufferToBinary(buf) {
    return Buffer.isBuffer(buf) ? buf.toString("binary") : "";
}

function derFromAsn1(node) {
    return Buffer.from(forge.asn1.toDer(node).getBytes(), "binary");
}

function certToAsn1(cert) {
    return forge.pki.certificateToAsn1(cert);
}

function getExtension(cert, name) {
    return ensureArray(cert?.extensions).find((ext) => ext?.name === name) || null;
}

function cleanExtractedUrl(raw = "") {
    if (!raw || typeof raw !== "string") return "";

    let s = raw.trim();

    s = s.replace(/[\u0000-\u001F\u007F]/g, "");
    s = s.replace(/["'<>]+$/g, "");
    s = s.replace(/^[="'<>\s]+/g, "");

    const httpIdx = s.search(/https?:\/\//i);
    if (httpIdx > 0) s = s.slice(httpIdx);

    const stopMatch = s.match(/[^\x20-\x7E]/);
    if (stopMatch && stopMatch.index >= 0) {
        s = s.slice(0, stopMatch.index);
    }

    s = s.replace(/["'<>\]}),;:]+$/g, "");

    try {
        const u = new URL(s);
        if (!/^https?:$/i.test(u.protocol)) return "";
        return u.toString();
    } catch {
        return "";
    }
}

function extractHttpUrlsFromText(value) {
    if (value == null) return [];

    let text = "";

    if (typeof value === "string") {
        text = value;
    } else if (Buffer.isBuffer(value)) {
        text = value.toString("binary");
    } else {
        text = String(value);
    }

    const matches = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    const urls = [];

    for (const m of matches) {
        const clean = cleanExtractedUrl(m);
        if (clean && !urls.includes(clean)) {
            urls.push(clean);
        }
    }

    return urls;
}

function uniqueUrls(urls = []) {
    const out = [];
    for (const url of urls) {
        const clean = cleanExtractedUrl(url);
        if (clean && !out.includes(clean)) {
            out.push(clean);
        }
    }
    return out;
}

function firstBytesHex(buffer, count = 32) {
    if (!Buffer.isBuffer(buffer)) return "";
    return buffer.subarray(0, count).toString("hex");
}

function firstBytesText(buffer, count = 200) {
    if (!Buffer.isBuffer(buffer)) return "";
    return buffer
        .subarray(0, count)
        .toString("utf8")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim();
}

function looksLikeHtml(buffer) {
    const txt = firstBytesText(buffer, 300).toLowerCase();
    return txt.includes("<html") || txt.includes("<!doctype html") || txt.includes("<body");
}

function getAuthorityKeyIdentifierHex(cert) {
    const ext = getExtension(cert, "authorityKeyIdentifier");
    if (!ext) return "";

    if (ext.keyIdentifier) {
        if (typeof ext.keyIdentifier === "string") {
            return normalizeHex(Buffer.from(ext.keyIdentifier, "binary").toString("hex"));
        }
        if (Buffer.isBuffer(ext.keyIdentifier)) {
            return normalizeHex(ext.keyIdentifier.toString("hex"));
        }
    }

    return "";
}

function getSubjectKeyIdentifierHex(cert) {
    const ext = getExtension(cert, "subjectKeyIdentifier");
    if (!ext) return "";

    if (ext.subjectKeyIdentifier) {
        if (typeof ext.subjectKeyIdentifier === "string") {
            return normalizeHex(Buffer.from(ext.subjectKeyIdentifier, "binary").toString("hex"));
        }
        if (Buffer.isBuffer(ext.subjectKeyIdentifier)) {
            return normalizeHex(ext.subjectKeyIdentifier.toString("hex"));
        }
    }

    return "";
}

function sameName(a, b) {
    try {
        return JSON.stringify(a?.attributes || []) === JSON.stringify(b?.attributes || []);
    } catch {
        return false;
    }
}

function findIssuerCert(targetCert, extraCerts = [], trustCerts = []) {
    const pool = [...ensureArray(extraCerts), ...ensureArray(trustCerts)];

    const aki = getAuthorityKeyIdentifierHex(targetCert);

    if (aki) {
        const bySki = pool.find((cert) => getSubjectKeyIdentifierHex(cert) === aki);
        if (bySki) return bySki;
    }

    const byName = pool.find((cert) => sameName(targetCert?.issuer, cert?.subject));
    if (byName) return byName;

    return null;
}

function extractOcspUrls(cert) {
    const ext = getExtension(cert, "authorityInfoAccess");
    if (!ext) return [];

    const urls = [];

    if (Array.isArray(ext.accessDescriptions)) {
        for (const ad of ext.accessDescriptions) {
            const method = ad?.accessMethod || ad?.method || "";
            const location = ad?.accessLocation || ad?.location || "";

            if (
                (method === "1.3.6.1.5.5.7.48.1" ||
                    String(method).toLowerCase().includes("ocsp")) &&
                typeof location === "string"
            ) {
                const clean = cleanExtractedUrl(location);
                if (clean && !urls.includes(clean)) {
                    urls.push(clean);
                }
            }
        }
    }

    const fallbackUrls = extractHttpUrlsFromText(ext.value);
    for (const url of fallbackUrls) {
        if (!urls.includes(url) && /ocsp/i.test(url)) {
            urls.push(url);
        }
    }

    return uniqueUrls(urls);
}

function extractCrlUrls(cert) {
    const ext = getExtension(cert, "cRLDistributionPoints");
    if (!ext) return [];

    const urls = [];

    if (Array.isArray(ext.altNames)) {
        for (const alt of ext.altNames) {
            if (typeof alt?.value === "string") {
                const clean = cleanExtractedUrl(alt.value);
                if (clean && !urls.includes(clean)) {
                    urls.push(clean);
                }
            }
        }
    }

    const fallbackUrls = extractHttpUrlsFromText(ext.value);

    for (const url of fallbackUrls) {
        if (!urls.includes(url) && /\.crl(\?|$)/i.test(url)) {
            urls.push(url);
        }
    }

    if (!urls.length) {
        for (const url of fallbackUrls) {
            if (!urls.includes(url)) {
                urls.push(url);
            }
        }
    }

    return uniqueUrls(urls);
}

function mapDigestOidToForgeMd(oid) {
    switch (oid) {
        case "1.3.14.3.2.26":
            return forge.md.sha1.create();
        case "2.16.840.1.101.3.4.2.1":
            return forge.md.sha256.create();
        case "2.16.840.1.101.3.4.2.2":
            return forge.md.sha384.create();
        case "2.16.840.1.101.3.4.2.3":
            return forge.md.sha512.create();
        default:
            return forge.md.sha1.create();
    }
}

function buildCertId(issuerCert, subjectCert, digestOid = "1.3.14.3.2.26") {
    const certAsn1 = certToAsn1(issuerCert);
    const tbsCert = certAsn1?.value?.[0];

    if (!tbsCert) {
        throw new Error("No se pudo obtener TBSCertificate del emisor");
    }

    const tbsChildren = ensureArray(tbsCert.value);

    let subjectNode = null;
    for (let i = 0; i < tbsChildren.length; i++) {
        const node = tbsChildren[i];
        if (node?.type === forge.asn1.Type.SEQUENCE && i >= 4) {
            const maybeSpki = tbsChildren[i + 1];
            if (
                maybeSpki?.type === forge.asn1.Type.SEQUENCE &&
                Array.isArray(maybeSpki.value) &&
                maybeSpki.value.length >= 2
            ) {
                subjectNode = node;
                break;
            }
        }
    }

    if (!subjectNode) {
        throw new Error("No se pudo obtener el subject del emisor para OCSP");
    }

    const issuerNameDer = forge.asn1.toDer(subjectNode).getBytes();
    const md1 = mapDigestOidToForgeMd(digestOid);
    md1.update(issuerNameDer);
    const issuerNameHash = md1.digest().getBytes();

    let issuerKeyBytes = "";
    const skiHex = getSubjectKeyIdentifierHex(issuerCert);

    if (skiHex) {
        issuerKeyBytes = Buffer.from(skiHex, "hex").toString("binary");
    } else {
        const spki = forge.pki.publicKeyToAsn1(issuerCert.publicKey);
        const spkiChildren = Array.isArray(spki?.value) ? spki.value : [];
        const bitStringNode = spkiChildren[1];
        if (bitStringNode?.value) {
            issuerKeyBytes = bitStringNode.value.slice(1);
        }
    }

    if (!issuerKeyBytes) {
        throw new Error("No se pudo obtener issuerKey para OCSP");
    }

    const md2 = mapDigestOidToForgeMd(digestOid);
    md2.update(issuerKeyBytes);
    const issuerKeyHash = md2.digest().getBytes();

    const serialHex = normalizeHex(subjectCert.serialNumber || "");
    if (!serialHex) {
        throw new Error("Serial del certificado sujeto ausente");
    }

    const serialBytes = Buffer.from(serialHex, "hex").toString("binary");

    return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(
                forge.asn1.Class.UNIVERSAL,
                forge.asn1.Type.OID,
                false,
                forge.asn1.oidToDer(digestOid).getBytes()
            ),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, "")
        ]),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, issuerNameHash),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, issuerKeyHash),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, serialBytes),
    ]);
}

function buildOcspRequestDer(issuerCert, subjectCert) {
    const certId = buildCertId(issuerCert, subjectCert);

    const request = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        certId
    ]);

    const requestList = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        request
    ]);

    const tbsRequest = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        requestList
    ]);

    const ocspRequest = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        tbsRequest
    ]);

    return derFromAsn1(ocspRequest);
}

function httpRequestBuffer(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "https:" ? https : http;

        const req = lib.request(
            {
                protocol: u.protocol,
                hostname: u.hostname,
                port: u.port || (u.protocol === "https:" ? 443 : 80),
                path: `${u.pathname}${u.search}`,
                method: options.method || "GET",
                headers: options.headers || {},
                timeout: options.timeout || 10000,
            },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    });
                });
            }
        );

        req.on("timeout", () => {
            req.destroy(new Error("timeout"));
        });

        req.on("error", reject);

        if (body) req.write(body);
        req.end();
    });
}

function parseOcspResponse(buffer) {
    try {
        const asn1 = forge.asn1.fromDer(bufferToBinary(buffer), false);
        const top = asn1.value || [];

        if (!Array.isArray(top) || top.length < 1) {
            return { ok: false, error: "OCSPResponse ASN.1 inválida" };
        }

        const responseStatusNode = top[0];
        const responseStatusHex = Buffer.from(responseStatusNode.value, "binary").toString("hex");
        const responseStatusInt = parseInt(responseStatusHex || "0", 16);

        if (responseStatusInt !== 0) {
            return {
                ok: false,
                error: `OCSP responder devolvió estado no exitoso (${responseStatusInt})`,
            };
        }

        const responseBytesWrapper = top[1];
        const responseBytes = Array.isArray(responseBytesWrapper?.value) ? responseBytesWrapper.value[0] : null;
        const rbChildren = Array.isArray(responseBytes?.value) ? responseBytes.value : [];

        if (rbChildren.length < 2) {
            return { ok: false, error: "OCSP responseBytes ausente" };
        }

        const responseTypeOid = forge.asn1.derToOid(rbChildren[0].value);
        if (responseTypeOid !== "1.3.6.1.5.5.7.48.1.1") {
            return { ok: false, error: `OCSP responseType no soportado: ${responseTypeOid}` };
        }

        const basicOcspOctets = rbChildren[1];
        const basicOcspDer = Buffer.from(basicOcspOctets.value, "binary");
        const basicAsn1 = forge.asn1.fromDer(bufferToBinary(basicOcspDer), false);

        const basicChildren = basicAsn1.value || [];
        if (basicChildren.length < 1) {
            return { ok: false, error: "BasicOCSPResponse inválida" };
        }

        const tbsResponseData = basicChildren[0];
        const rdChildren = tbsResponseData.value || [];

        let responsesNode = null;
        for (const child of rdChildren) {
            if (Array.isArray(child?.value) && child.value.length > 0) {
                const first = child.value[0];
                if (Array.isArray(first?.value) && first.value.length >= 2) {
                    responsesNode = child;
                }
            }
        }

        if (!responsesNode) {
            return { ok: false, error: "SingleResponse no encontrada" };
        }

        const singleResponse = responsesNode.value?.[0];
        const srChildren = singleResponse?.value || [];
        if (srChildren.length < 3) {
            return { ok: false, error: "SingleResponse incompleta" };
        }

        const certStatusNode = srChildren[1];
        const tagClass = certStatusNode.tagClass;
        const type = certStatusNode.type;

        let status = "unknown";
        let revokedAt = null;

        if (tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && type === 0) {
            status = "good";
        } else if (tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && type === 1) {
            status = "revoked";
            const revokedChildren = certStatusNode.value || [];
            const revTimeNode = revokedChildren[0];
            if (revTimeNode?.value) {
                revokedAt = revTimeNode.value;
            }
        } else if (tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && type === 2) {
            status = "unknown";
        }

        return {
            ok: true,
            status,
            revokedAt,
            responseTypeOid,
        };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || "No se pudo parsear respuesta OCSP",
        };
    }
}

function tryParsePemCrl(buffer) {
    try {
        const text = buffer.toString("utf8");
        if (/-----BEGIN X509 CRL-----/.test(text)) {
            return {
                ok: true,
                crls: [forge.pki.crlFromPem(text)],
                format: "pem-crl",
            };
        }
    } catch {
        // ignore
    }
    return { ok: false };
}

function tryParseDerCrlWithForge(buffer) {
    try {
        const firstDer = sliceFirstDerObject(buffer);
        const asn1 = forge.asn1.fromDer(bufferToBinary(firstDer), false);
        const crl = forge.pki.crlFromAsn1(asn1);

        return {
            ok: true,
            crls: [crl],
            format: "der-crl-forge",
        };
    } catch {
        return { ok: false };
    }
}

function parseTimeNode(node) {
    try {
        if (!node?.value || typeof node.value !== "string") return null;

        const raw = node.value;

        let m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
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

        m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
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
    } catch {
        // ignore
    }

    return null;
}

function tryParseDerCrlManual(buffer) {
    try {
        const firstDer = sliceFirstDerObject(buffer);
        const asn1 = forge.asn1.fromDer(bufferToBinary(firstDer), false);

        if (!isSequenceNode(asn1)) {
            return { ok: false, error: "ASN.1 raíz no es SEQUENCE" };
        }

        const tbsCertList = findLikelyTbsCertList(asn1);
        if (!tbsCertList) {
            return { ok: false, error: "No se encontró TBSCertList" };
        }

        const topLevelTimes = findTopLevelTimesInTbs(tbsCertList);

        const thisUpdateNode = topLevelTimes[0] || null;
        const nextUpdateNode = topLevelTimes[1] || null;

        const revokedEntries = collectRevokedEntriesIterative(tbsCertList);

        return {
            ok: true,
            crls: [{
                thisUpdate: parseTimeNode(thisUpdateNode),
                nextUpdate: parseTimeNode(nextUpdateNode),
                revokedCertificates: revokedEntries,
            }],
            format: "der-crl-manual",
        };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || "Fallo en parser manual DER",
        };
    }
}

function tryParsePkcs7WithCrls(buffer) {
    try {
        const asn1 = forge.asn1.fromDer(bufferToBinary(buffer), false);
        const p7 = forge.pkcs7.messageFromAsn1(asn1);

        const crls = ensureArray(p7?.crls);
        if (crls.length) {
            return {
                ok: true,
                crls,
                format: "pkcs7-crl",
            };
        }
    } catch {
        // ignore
    }

    return { ok: false };
}

function parseCrlContainer(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        return {
            ok: false,
            error: "Respuesta vacía",
            format: "empty",
        };
    }

    if (looksLikeHtml(buffer)) {
        return {
            ok: false,
            error: "El servidor devolvió HTML en lugar de una CRL",
            format: "html",
        };
    }

    const pem = tryParsePemCrl(buffer);
    if (pem.ok) return pem;

    const derForge = tryParseDerCrlWithForge(buffer);
    if (derForge.ok) return derForge;

    const derManual = tryParseDerCrlManual(buffer);
    if (derManual.ok) return derManual;

    const pkcs7 = tryParsePkcs7WithCrls(buffer);
    if (pkcs7.ok) return pkcs7;

    return {
        ok: false,
        error:
            derManual?.error ||
            "No se pudo parsear la respuesta como CRL PEM, DER ni PKCS#7",
        format: "unknown",
    };
}

function isSerialRevokedInCrl(crl, cert) {
    try {
        const revoked = ensureArray(crl?.revokedCertificates);
        const target = normalizeHex(cert?.serialNumber || "");

        const found = revoked.find((entry) => {
            const serialHex = normalizeHex(entry?.serialNumber || "");
            return serialHex === target;
        });

        if (!found) {
            return { revoked: false, revokedAt: null };
        }

        return {
            revoked: true,
            revokedAt: found?.revocationDate || null,
        };
    } catch {
        return { revoked: false, revokedAt: null };
    }
}

async function checkOcsp(subjectCert, issuerCert, ocspUrl) {
    try {
        const reqBody = buildOcspRequestDer(issuerCert, subjectCert);

        const res = await httpRequestBuffer(
            ocspUrl,
            {
                method: "POST",
                timeout: 12000,
                headers: {
                    "Content-Type": "application/ocsp-request",
                    "Accept": "application/ocsp-response",
                    "Content-Length": String(reqBody.length),
                },
            },
            reqBody
        );

        if (!res.ok) {
            return {
                ok: false,
                source: "ocsp",
                url: ocspUrl,
                error: `HTTP ${res.statusCode}`,
                meta: {
                    contentType: res.headers?.["content-type"] || "",
                    bodyFirstBytesHex: firstBytesHex(res.body),
                    bodyFirstBytesText: firstBytesText(res.body),
                },
            };
        }

        const parsed = parseOcspResponse(res.body);
        if (!parsed.ok) {
            return {
                ok: false,
                source: "ocsp",
                url: ocspUrl,
                error: parsed.error,
                meta: {
                    contentType: res.headers?.["content-type"] || "",
                    bodyFirstBytesHex: firstBytesHex(res.body),
                    bodyFirstBytesText: firstBytesText(res.body),
                },
            };
        }

        return {
            ok: true,
            source: "ocsp",
            url: ocspUrl,
            status: parsed.status,
            revokedAt: parsed.revokedAt || null,
            raw: parsed,
            meta: {
                contentType: res.headers?.["content-type"] || "",
            },
        };
    } catch (err) {
        return {
            ok: false,
            source: "ocsp",
            url: ocspUrl,
            error: err?.message || "Error consultando OCSP",
        };
    }
}

async function checkCrl(subjectCert, crlUrl) {
    try {
        const res = await httpRequestBuffer(
            crlUrl,
            {
                method: "GET",
                timeout: 15000,
                headers: {
                    "Accept": "application/pkix-crl, application/x-pkcs7-crl, application/octet-stream, */*",
                },
            }
        );

        if (!res.ok) {
            return {
                ok: false,
                source: "crl",
                url: crlUrl,
                error: `HTTP ${res.statusCode}`,
                meta: {
                    contentType: res.headers?.["content-type"] || "",
                    bodyFirstBytesHex: firstBytesHex(res.body),
                    bodyFirstBytesText: firstBytesText(res.body),
                },
            };
        }

        const parsed = parseCrlContainer(res.body);

        if (!parsed.ok) {
            return {
                ok: false,
                source: "crl",
                url: crlUrl,
                error: parsed.error,
                meta: {
                    contentType: res.headers?.["content-type"] || "",
                    parseFormat: parsed.format || "",
                    bodyLength: res.body.length,
                    bodyFirstBytesHex: firstBytesHex(res.body),
                    bodyFirstBytesText: firstBytesText(res.body),
                },
            };
        }

        const crls = ensureArray(parsed.crls);
        if (!crls.length) {
            return {
                ok: false,
                source: "crl",
                url: crlUrl,
                error: "La respuesta fue parseada, pero no contenía CRLs utilizables",
                meta: {
                    contentType: res.headers?.["content-type"] || "",
                    parseFormat: parsed.format || "",
                },
            };
        }

        for (const crl of crls) {
            const rev = isSerialRevokedInCrl(crl, subjectCert);

            if (rev.revoked) {
                return {
                    ok: true,
                    source: "crl",
                    url: crlUrl,
                    status: "revoked",
                    revokedAt: rev.revokedAt,
                    raw: {
                        thisUpdate: crl.thisUpdate || null,
                        nextUpdate: crl.nextUpdate || null,
                        revokedCount: ensureArray(crl.revokedCertificates).length,
                    },
                    meta: {
                        contentType: res.headers?.["content-type"] || "",
                        parseFormat: parsed.format || "",
                    },
                };
            }
        }

        const firstCrl = crls[0];

        return {
            ok: true,
            source: "crl",
            url: crlUrl,
            status: "good",
            revokedAt: null,
            raw: {
                thisUpdate: firstCrl?.thisUpdate || null,
                nextUpdate: firstCrl?.nextUpdate || null,
                revokedCount: ensureArray(firstCrl?.revokedCertificates).length,
            },
            meta: {
                contentType: res.headers?.["content-type"] || "",
                parseFormat: parsed.format || "",
                crlCount: crls.length,
            },
        };
    } catch (err) {
        return {
            ok: false,
            source: "crl",
            url: crlUrl,
            error: err?.message || "Error consultando CRL",
        };
    }
}

function isUniversal(node, type) {
    return !!node &&
        node.tagClass === forge.asn1.Class.UNIVERSAL &&
        node.type === type;
}

function isTimeNode(node) {
    return isUniversal(node, forge.asn1.Type.UTCTIME) ||
        isUniversal(node, forge.asn1.Type.GENERALIZEDTIME);
}

function isIntegerNode(node) {
    return isUniversal(node, forge.asn1.Type.INTEGER);
}

function isSequenceNode(node) {
    return isUniversal(node, forge.asn1.Type.SEQUENCE) && Array.isArray(node.value);
}

function walkAsn1(node, visit) {
    if (!node) return;
    visit(node);
    if (Array.isArray(node.value)) {
        for (const child of node.value) {
            walkAsn1(child, visit);
        }
    }
}

function findLikelyTbsCertList(root) {
    if (!isSequenceNode(root)) return null;
    const children = root.value || [];
    if (!children.length) return null;

    const first = children[0];
    if (isSequenceNode(first)) return first;

    return null;
}

function findTopLevelTimesInTbs(tbsCertList) {
    if (!isSequenceNode(tbsCertList)) return [];

    const result = [];
    for (const child of tbsCertList.value || []) {
        if (isTimeNode(child)) {
            result.push(child);
        }
    }
    return result;
}

function looksLikeRevokedEntry(node) {
    if (!isSequenceNode(node)) return false;

    const parts = node.value || [];
    if (parts.length < 2) return false;

    return isIntegerNode(parts[0]) && isTimeNode(parts[1]);
}

function collectRevokedEntriesIterative(root) {
    const out = [];
    const stack = [root];

    while (stack.length) {
        const node = stack.pop();
        if (!node) continue;

        if (looksLikeRevokedEntry(node)) {
            const parts = node.value || [];
            const serialNode = parts[0];
            const revDateNode = parts[1];

            const serialHex = serialNode?.value
                ? Buffer.from(serialNode.value, "binary").toString("hex")
                : "";

            out.push({
                serialNumber: normalizeHex(serialHex),
                revocationDate: parseTimeNode(revDateNode),
            });

            continue;
        }

        if (Array.isArray(node.value)) {
            for (let i = node.value.length - 1; i >= 0; i--) {
                stack.push(node.value[i]);
            }
        }
    }

    return out;
}

function getDerObjectTotalLength(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
        throw new Error("Buffer DER inválido");
    }

    const firstTag = buffer[0];
    if (firstTag !== 0x30) {
        throw new Error(`Tag DER inesperado: 0x${firstTag.toString(16)}`);
    }

    const lenByte = buffer[1];

    // short form
    if ((lenByte & 0x80) === 0) {
        return 2 + lenByte;
    }

    // long form
    const numLenBytes = lenByte & 0x7f;
    if (numLenBytes === 0 || numLenBytes > 6) {
        throw new Error("Longitud DER no soportada");
    }

    if (buffer.length < 2 + numLenBytes) {
        throw new Error("Buffer DER incompleto en cabecera");
    }

    let contentLength = 0;
    for (let i = 0; i < numLenBytes; i++) {
        contentLength = (contentLength << 8) | buffer[2 + i];
    }

    return 2 + numLenBytes + contentLength;
}

function sliceFirstDerObject(buffer) {
    const totalLength = getDerObjectTotalLength(buffer);

    if (totalLength > buffer.length) {
        throw new Error("El DER indica una longitud mayor al buffer disponible");
    }
    return buffer.subarray(0, totalLength);
}

export const revocationService = {
    extractSources(cert) {
        const ocspUrls = extractOcspUrls(cert);
        const crlUrls = extractCrlUrls(cert);

        return {
            ocspUrls,
            crlUrls,
        };
    },

    async checkBestEffort(subjectCert, extraCerts = [], trustCerts = []) {
        try {
            if (!subjectCert) {
                return {
                    status: "unknown",
                    source: null,
                    revokedAt: null,
                    detail: "Certificado ausente",
                    ocspUrls: [],
                    crlUrls: [],
                };
            }

            const issuerCert = findIssuerCert(subjectCert, extraCerts, trustCerts);
            const { ocspUrls, crlUrls } = this.extractSources(subjectCert);

            const errors = [];

            if (issuerCert && ocspUrls.length) {
                for (const url of ocspUrls) {
                    const ocspRes = await checkOcsp(subjectCert, issuerCert, url);

                    if (ocspRes.ok) {
                        return {
                            status: ocspRes.status,
                            source: "ocsp",
                            url,
                            revokedAt: ocspRes.revokedAt || null,
                            detail: ocspRes,
                            ocspUrls,
                            crlUrls,
                        };
                    }

                    errors.push({
                        source: "ocsp",
                        url,
                        error: ocspRes.error,
                        meta: ocspRes.meta || null,
                    });
                }
            } else if (!issuerCert && ocspUrls.length) {
                errors.push({
                    source: "ocsp",
                    error: "No se encontró certificado emisor para construir la consulta OCSP",
                });
            }

            if (crlUrls.length) {
                for (const url of crlUrls) {
                    const crlRes = await checkCrl(subjectCert, url);

                    if (crlRes.ok) {
                        return {
                            status: crlRes.status,
                            source: "crl",
                            url,
                            revokedAt: crlRes.revokedAt || null,
                            detail: crlRes,
                            ocspUrls,
                            crlUrls,
                        };
                    }

                    errors.push({
                        source: "crl",
                        url,
                        error: crlRes.error,
                        meta: crlRes.meta || null,
                    });
                }
            }

            return {
                status: "unknown",
                source: null,
                revokedAt: null,
                detail: errors.length ? errors : "No fue posible determinar el estado de revocación",
                ocspUrls,
                crlUrls,
            };
        } catch (err) {
            return {
                status: "unknown",
                source: null,
                revokedAt: null,
                detail: err?.message || "Error general en validación de revocación",
            };
        }
    },
};