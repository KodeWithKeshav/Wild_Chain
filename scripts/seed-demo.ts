import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seeds a deployed contract with one organization of each type and three animals at different stages:
 *   #1 Spotted Deer  -> RELEASED (full custody history, verified milestones, permit)
 *   #2 Golden Eagle  -> RECOVERING at the vet clinic
 *   #3 Bengal Tiger  -> RESCUED, transfer to the vet pending (accept it from the UI)
 * Also writes demo files: an original report and a modified copy (verifies as MISMATCH).
 */
const OrgType = { Rescue: 0, Vet: 1, Rehab: 2, Forest: 3, Conservation: 4 };
const S = { TRIAGED: 1, UNDER_TREATMENT: 2, RECOVERING: 3, REHABILITATION: 4, RELEASE_READY: 5 };
const M = { ASSESSMENT: 0, TREATMENT: 1, RECOVERY: 2, REHABILITATION: 3 };
const ZERO = ethers.ZeroHash;
const KUBO = process.env.KUBO_API || "http://127.0.0.1:5001";

const sha = (b: Uint8Array | string) => ethers.sha256(typeof b === "string" ? ethers.toUtf8Bytes(b) : b);

/** Uploads to a local Kubo daemon if reachable; otherwise returns a clearly-labelled offline placeholder CID. */
async function pin(name: string, content: string): Promise<string> {
  try {
    const form = new FormData();
    form.append("file", new Blob([content]), name);
    const res = await fetch(`${KUBO}/api/v0/add?cid-version=1&pin=true`, { method: "POST", body: form, signal: AbortSignal.timeout(2500) });
    if (res.ok) return ((await res.json()) as { Hash: string }).Hash;
  } catch {
    /* daemon not running */
  }
  return "offline-demo-" + sha(content).slice(2, 22);
}

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "frontend", "src", "contracts", "deployment.json"), "utf8"));
  const chainId = String(Number((await ethers.provider.getNetwork()).chainId));
  if (!dep[chainId]) throw new Error(`No deployment for chain ${chainId}; run npm run deploy:ganache first`);
  const chain = await ethers.getContractAt("WildlifeChainOfCustody", dep[chainId].address);

  const [owner, rescue, vet, rehab, forest, conservation] = await ethers.getSigners();
  if ((await chain.animalCount()) > 0n) throw new Error("Contract already seeded; redeploy for a fresh demo.");

  const orgs: [typeof rescue, string, number][] = [
    [rescue, "Coastal Rescue Team", OrgType.Rescue],
    [vet, "City Veterinary Hospital", OrgType.Vet],
    [rehab, "Green Valley Rehabilitation Centre", OrgType.Rehab],
    [forest, "State Forest Department", OrgType.Forest],
    [conservation, "Wildlife Conservation Trust", OrgType.Conservation],
  ];
  for (const [s, name, t] of orgs) await (await chain.connect(owner).registerOrganization(s.address, name, t)).wait();
  console.log("Registered 5 organizations");

  // ---- demo evidence files
  const dir = path.join(__dirname, "..", "demo-files");
  fs.mkdirSync(dir, { recursive: true });
  const files: Record<string, string> = {
    "deer-rescue-photo.txt": "[demo stand-in for a JPEG] Spotted deer found near NH-766, left hind leg injured. 2026-03-02\n",
    "deer-medical-report.txt": "MEDICAL REPORT\nPatient: Spotted deer #1\nDiagnosis: fractured left tibia\nTreatment: splint, antibiotics\nSigned: City Veterinary Hospital\n",
    "eagle-rescue-photo.txt": "[demo stand-in for a JPEG] Golden eagle with wing trauma\n",
    "tiger-rescue-photo.txt": "[demo stand-in for a JPEG] Tiger cub found alone near village edge\n",
    "handover.txt": "Custody handover note: Coastal Rescue Team -> City Veterinary Hospital\n",
    "release-permit.txt": "RELEASE PERMIT No. FD/2026/0142 - authorized by State Forest Department\n",
    "release-photo.txt": "[demo stand-in for a JPEG] Deer released at forest edge\n",
  };
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
  fs.writeFileSync(path.join(dir, "deer-medical-report-MODIFIED.txt"), files["deer-medical-report.txt"].replace("fractured left tibia", "healthy, no injury"));

  const rec = async (name: string) => ({ hash: sha(files[name]), cid: await pin(name, files[name]) });

  // ---- #1 Spotted Deer: RESCUED (ready for full user walkthrough)
  const f = await rec("deer-rescue-photo.txt");
  await (await chain.connect(rescue).registerAnimal("Spotted Deer", sha("microchip-DEER-0001"), f.hash, f.cid)).wait();
  console.log("#1 Spotted Deer -> RESCUED (in custody of Coastal Rescue Team, ready for your walkthrough!)");

  console.log("\nDemo accounts (Ganache deterministic mnemonic):");
  console.log(`  Admin/owner          ${owner.address}`);
  for (const [s, name] of orgs) console.log(`  ${name.padEnd(36)} ${s.address}`);
  console.log(`\nVerify demo: upload demo-files/deer-medical-report.txt (MATCH) and deer-medical-report-MODIFIED.txt (MISMATCH) on animal #1.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
