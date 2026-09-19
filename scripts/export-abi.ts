import * as fs from "fs";
import * as path from "path";

/** Writes the compiled ABI next to deployment.json for the frontend. */
async function main() {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "artifacts", "contracts", "WildlifeChainOfCustody.sol", "WildlifeChainOfCustody.json"), "utf8"),
  );
  const out = path.join(__dirname, "..", "frontend", "src", "contracts", "WildlifeChainOfCustody.abi.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${artifact.abi.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
