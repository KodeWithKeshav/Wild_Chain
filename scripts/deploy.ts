import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** Deploys WildlifeChainOfCustody and records {chainId, address, deployedAt} for the frontend. */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying with ${deployer.address} on ${network.name} (chainId ${chainId})`);

  const factory = await ethers.getContractFactory("WildlifeChainOfCustody");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`WildlifeChainOfCustody deployed at ${address}`);

  const dir = path.join(__dirname, "..", "frontend", "src", "contracts");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "deployment.json");
  const all: Record<string, unknown> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  all[String(chainId)] = { chainId, address, deployedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
