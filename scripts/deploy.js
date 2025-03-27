const hre = require("hardhat");

async function main() {
  // Deploy the Verifier contract first
  const Verifier = await hre.ethers.getContractFactory("Verifier");
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log("Verifier deployed to:", verifier.address);

  // Deploy the VotingContract with the Verifier address
  const VotingContract = await hre.ethers.getContractFactory("VotingContract");
  const votingContract = await VotingContract.deploy(verifier.address);
  await votingContract.deployed();
  console.log("VotingContract deployed to:", votingContract.address);

  // Create some initial test proposals
  const proposals = [
    {
      title: "Greening and pedestrianizing 500 streets in Paris",
      description: "Proposal to transform 500 streets in Paris into green pedestrian zones, reducing car traffic and increasing urban biodiversity."
    },
    {
      title: "Community Solar Power Initiative",
      description: "Implementation of community-owned solar panels on public buildings to reduce energy costs and promote renewable energy."
    }
  ];

  for (const proposal of proposals) {
    const tx = await votingContract.createProposal(proposal.title, proposal.description);
    await tx.wait();
    console.log(`Created proposal: ${proposal.title}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 