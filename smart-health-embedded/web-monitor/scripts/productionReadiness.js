const { buildProductionReadiness, formatProductionReadiness } = require("../src/productionReadiness");

const json = process.argv.includes("--json");
const strict = process.argv.includes("--strict");

const readiness = buildProductionReadiness(process.env);

if (json) {
  process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
} else {
  process.stdout.write(formatProductionReadiness(readiness));
}

if (strict && !readiness.ok) {
  process.exitCode = 1;
}
