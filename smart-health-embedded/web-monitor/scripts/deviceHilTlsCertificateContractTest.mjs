import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(scriptsDir, "startDeviceHil.mjs"), "utf8");

assert.match(source, /const tlsTrustCertificatePath = process\.env\.SHCARE_HIL_TLS_CA/);
assert.match(source, /const usesDefaultTlsPaths = !process\.env\.SHCARE_HIL_TLS_KEY &&/);
assert.match(source, /path\.join\(runtimeDir, "server-ca\.crt"\)/);
assert.match(source, /certificateMatchesCurrentHilLan\(\)/);
assert.match(source, /const tlsServerHostname = "shcare-hil\.local"/);
assert.match(source, /certificate\.subjectAltName\.includes\(`IP Address:\$\{lanIp\}`\)/);
assert.match(source, /certificate\.subject\.includes\(`CN=\$\{tlsServerHostname\}`\)/);
assert.match(source, /certificate\.subject\.includes\("OU=ShcareHILv3"\)/);
assert.match(source, /trustAnchor\.subject\.includes\("CN=ShcareHIL Root CA"\)/);
assert.match(source, /validUntil > Date\.now\(\) \+ 5 \* 60 \* 1000/);
assert.match(source, /for \(const filePath of \[\s*tlsKeyPath,[\s\S]*?tlsCaPath,[\s\S]*?\]\) \{/);
assert.match(source, /fs\.rmSync\(filePath, \{ force: true \}\)/);
assert.match(source, /if \(tlsMaterialExists && !usesDefaultTlsPaths\)/);
assert.match(source, /"-days", "14"/);
assert.match(source, /"-subj", `\/CN=\$\{tlsServerHostname\}\/OU=ShcareHILv3`/);
assert.match(source, /basicConstraints=critical,CA:TRUE,pathlen:0/);
assert.match(source, /basicConstraints=critical,CA:FALSE/);
assert.match(source, /"-CAcreateserial"/);
assert.match(source, /keyUsage=critical,keyCertSign,cRLSign/);
assert.match(source, /keyUsage=critical,digitalSignature,keyEncipherment/);
assert.match(source, /const certificateChain = usesDefaultTlsPaths/);
assert.match(source, /Buffer\.concat\(\[leafCertificate, Buffer\.from\("\\n"\), fs\.readFileSync\(tlsCaPath\)\]\)/);
assert.match(source, /cert: certificateChain/);

console.log("device HIL TLS certificate rotation contract: PASS");
