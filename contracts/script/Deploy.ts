import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", await deployer.getAddress());

  const platformFeeAddr = process.env.PLATFORM_FEE_ADDR || await deployer.getAddress();
  const gmSignerAddr = process.env.GM_SIGNER_ADDR || await deployer.getAddress();

  // 1. Deploy CLAWToken
  const CLAWFactory = await ethers.getContractFactory("CLAWToken");
  const clawToken = await CLAWFactory.deploy(await deployer.getAddress());
  await clawToken.waitForDeployment();
  const clawAddr = await clawToken.getAddress();
  console.log("CLAWToken deployed:", clawAddr);

  // 2. Deploy MonopolySettlement
  const SettlementFactory = await ethers.getContractFactory("MonopolySettlement");
  const settlement = await SettlementFactory.deploy(platformFeeAddr, gmSignerAddr, clawAddr);
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log("MonopolySettlement deployed:", settlementAddr);

  // 3. Authorize Settlement as CLAW minter
  const tx = await clawToken.setMinter(settlementAddr, true);
  await tx.wait();
  console.log("Settlement authorized as CLAW minter");

  console.log("\n=== Deployment Summary ===");
  console.log("CLAWToken:", clawAddr);
  console.log("MonopolySettlement:", settlementAddr);
  console.log("Platform Fee Addr:", platformFeeAddr);
  console.log("GM Signer:", gmSignerAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
