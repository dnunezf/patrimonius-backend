// src/services/certificateChain.service.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import forge from "node-forge";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}

function normalizeHex(hex = "") {
    return (hex || "").replace(/\s+/g, "").toLowerCase();
}

function certFromBuffer(raw) {
    const text = raw.toString("utf8");

    if (/-----BEGIN CERTIFICATE-----/.test(text)) {
        return forge.pki.certificateFromPem(text);
    }

    const asn1Obj = forge.asn1.fromDer(raw.toString("binary"));
    return forge.pki.certificateFromAsn1(asn1Obj);
}

function normalizeDn(attrs = []) {
    return ensureArray(attrs)
        .map((a) => ({
            key: (a.shortName || a.name || a.type || "").toLowerCase().trim(),
            value: String(a.value || "").trim().toLowerCase(),
        }))
        .sort((x, y) => x.key.localeCompare(y.key) || x.value.localeCompare(y.value))
        .map((x) => `${x.key}=${x.value}`)
        .join(",");
}

function namesEqual(a, b) {
    try {
        return normalizeDn(a?.attributes || []) === normalizeDn(b?.attributes || []);
    } catch {
        return false;
    }
}

function getExtension(cert, name) {
    return ensureArray(cert?.extensions).find((ext) => ext?.name === name) || null;
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

function sameCert(a, b) {
    if (!a || !b) return false;

    const aSerial = normalizeHex(a.serialNumber || "");
    const bSerial = normalizeHex(b.serialNumber || "");

    return aSerial === bSerial && namesEqual(a.subject, b.subject);
}

function debugCert(cert) {
    return {
        subject: certLabel(cert),
        issuer: (cert?.issuer?.attributes || [])
            .map((a) => `${a.shortName || a.name || a.type}=${a.value}`)
            .join(", "),
        serial: cert?.serialNumber || "",
        ski: getSubjectKeyIdentifierHex(cert),
        aki: getAuthorityKeyIdentifierHex(cert),
        selfSigned: isSelfSigned(cert),
        notBefore: cert?.validity?.notBefore || null,
        notAfter: cert?.validity?.notAfter || null,
    };
}

function dedupeCerts(certs = []) {
    const out = [];

    for (const cert of certs) {
        if (!cert) continue;
        if (!out.some((c) => sameCert(c, cert))) {
            out.push(cert);
        }
    }

    return out;
}

function verifyIssuedBy(childCert, issuerCert) {
    try {
        if (childCert.verify(issuerCert)) return true;
    } catch {
        // seguir
    }

    try {
        if (childCert.isIssuer(issuerCert)) return true;
    } catch {
        // seguir
    }

    return false;
}

function isDateWithinCertValidity(cert, atDate) {
    const when = atDate || new Date();
    const notBefore = cert?.validity?.notBefore || null;
    const notAfter = cert?.validity?.notAfter || null;

    if (notBefore && when < notBefore) return false;
    if (notAfter && when > notAfter) return false;

    return true;
}

function certLabel(cert) {
    return (cert?.subject?.attributes || [])
        .map((a) => `${a.shortName || a.name || a.type}=${a.value}`)
        .join(", ");
}

function findIssuerCandidates(targetCert, pool = []) {
    const aki = getAuthorityKeyIdentifierHex(targetCert);
    const candidates = [];

    if (aki) {
        for (const cert of pool) {
            if (sameCert(cert, targetCert)) continue;
            if (getSubjectKeyIdentifierHex(cert) === aki) {
                candidates.push(cert);
            }
        }
    }

    for (const cert of pool) {
        if (sameCert(cert, targetCert)) continue;
        if (namesEqual(targetCert?.issuer, cert?.subject)) {
            if (!candidates.some((c) => sameCert(c, cert))) {
                candidates.push(cert);
            }
        }
    }

    return candidates;
}

function findIssuerCert(targetCert, pool = []) {
    const candidates = findIssuerCandidates(targetCert, pool);


    for (const cert of candidates) {
        if (verifyIssuedBy(targetCert, cert)) {
            return cert;
        }
    }

    return null;
}

function isSelfSigned(cert) {
    try {
        if (!namesEqual(cert?.subject, cert?.issuer)) return false;
        return cert.verify(cert);
    } catch {
        return namesEqual(cert?.subject, cert?.issuer);
    }
}

function buildChainFromSigner(signerCert, messageCerts = [], trustCerts = []) {
    const pool = dedupeCerts([...ensureArray(messageCerts), ...ensureArray(trustCerts)]);
    const chain = [];

    let current = signerCert;
    let guard = 0;

    while (current && guard < 12) {
        chain.push(current);

        if (isSelfSigned(current)) {
            break;
        }

        const issuer = findIssuerCert(current, pool);
        if (!issuer) {
            break;
        }

        if (chain.some((c) => sameCert(c, issuer))) {
            break;
        }

        current = issuer;
        guard += 1;
    }

    return chain;
}

function buildCaStore(trustCerts = []) {
    const pemList = ensureArray(trustCerts).map((c) => forge.pki.certificateToPem(c));
    return forge.pki.createCaStore(pemList);
}

function isTrustedAnchor(cert, trustCerts = []) {
    return ensureArray(trustCerts).some((t) => sameCert(t, cert));
}

function findTrustedIssuerOutsideChain(lastCert, trustCerts = [], chain = []) {
    const candidates = findIssuerCandidates(lastCert, trustCerts);

    for (const cert of candidates) {
        if (chain.some((c) => sameCert(c, cert))) continue;
        if (verifyIssuedBy(lastCert, cert)) {
            return cert;
        }
    }

    return null;
}

export const certificateChainService = {
    async loadTrustedCerts() {
        const certDir = path.join(__dirname, "../../certs");
        if (!fs.existsSync(certDir)) return [];

        const entries = fs.readdirSync(certDir, { withFileTypes: true });
        const certs = [];

        for (const ent of entries) {
            if (!ent.isFile()) continue;

            const name = ent.name.toLowerCase();
            if (!name.endsWith(".cer") && !name.endsWith(".pem")) continue;

            try {
                const raw = fs.readFileSync(path.join(certDir, ent.name));
                certs.push(certFromBuffer(raw));
            } catch {
                // ignorar certificado inválido
            }
        }

        return dedupeCerts(certs);
    },

    validateChainAtDate(trustCerts, messageCerts, signerCert, verificationDate) {
        const when = verificationDate || new Date();

        if (!ensureArray(trustCerts).length) {
            return { ok: false, error: "No hay certificados de confianza configurados" };
        }

        if (!signerCert) {
            return { ok: false, error: "No se recibió el certificado del firmante" };
        }

        try {
            const allTrust = dedupeCerts(trustCerts);

            let chain = buildChainFromSigner(signerCert, messageCerts, allTrust);

            if (!chain.length) {
                return {
                    ok: false,
                    error: "No se pudo construir la cadena del firmante",
                };
            }

            for (let i = 0; i < chain.length; i++) {
                const cert = chain[i];

                if (!isDateWithinCertValidity(cert, when)) {
                    return {
                        ok: false,
                        error: `Certificado fuera de vigencia en la fecha de validación: ${certLabel(cert)}`,
                    };
                }

                if (i < chain.length - 1) {
                    const issuer = chain[i + 1];
                    if (!verifyIssuedBy(cert, issuer)) {
                        return {
                            ok: false,
                            error: "La firma del certificado no corresponde con su emisor",
                        };
                    }
                }
            }

            let top = chain[chain.length - 1];

            // Si el último no está en trust, intentar anexar un emisor confiable externo.
            if (!isTrustedAnchor(top, allTrust)) {
                const trustedIssuer = findTrustedIssuerOutsideChain(top, allTrust, chain);

                if (trustedIssuer) {
                    chain = [...chain, trustedIssuer];
                    top = trustedIssuer;
                }
            }

            if (!isTrustedAnchor(top, allTrust)) {
                return {
                    ok: false,
                    error: "La cadena no termina en una CA confiable conocida",
                    chainLength: chain.length,
                    topSubject: certLabel(top),
                };
            }

            const caStore = buildCaStore(allTrust);

            try {
                forge.pki.verifyCertificateChain(caStore, chain, {
                    validityCheckDate: when,
                });

                return {
                    ok: true,
                    error: null,
                    chainLength: chain.length,
                    trustAnchorSubject: certLabel(top),
                };
            } catch (err) {
                return {
                    ok: false,
                    error: err?.message || "La cadena no pudo verificarse con node-forge",
                    chainLength: chain.length,
                    topSubject: certLabel(top),
                };
            }
        } catch (err) {
            return {
                ok: false,
                error: err?.message || String(err),
            };
        }
    },
};