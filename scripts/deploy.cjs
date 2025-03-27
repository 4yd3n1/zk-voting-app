const hre = require("hardhat");
require("dotenv").config();

async function main() {
  // Deploy Verifier contract
  console.log("Deploying Verifier contract...");
  const Verifier = await hre.ethers.getContractFactory("Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Verifier deployed to:", verifierAddress);

  // Deploy VotingContract
  console.log("Deploying VotingContract...");
  const VotingContract = await hre.ethers.getContractFactory("VotingContract");
  const votingContract = await VotingContract.deploy(verifierAddress);
  await votingContract.waitForDeployment();
  const votingContractAddress = await votingContract.getAddress();
  console.log("VotingContract deployed to:", votingContractAddress);

  // Log deployment information
  console.log("\nDeployment Summary:");
  console.log("------------------");
  console.log("Verifier Contract:", verifierAddress);
  console.log("Voting Contract:", votingContractAddress);
  console.log("\nNext steps:");
  console.log("1. Update the contractAddress in src/App.jsx with:", votingContractAddress);
  console.log("2. Make sure you have enough Sepolia ETH for transactions");
  console.log("3. Test the voting functionality");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 