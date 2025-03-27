import { useState, useEffect } from "react";
import { Buffer } from "buffer";
import process from "process";
import { ethers } from "ethers";

// Inject polyfills
window.Buffer = Buffer;
window.process = process;

// Contract ABI definition
const abi = [
  {
    inputs: [
      { internalType: "uint256[2]", name: "_pA", type: "uint256[2]" },
      { internalType: "uint256[2][2]", name: "_pB", type: "uint256[2][2]" },
      { internalType: "uint256[2]", name: "_pC", type: "uint256[2]" },
      { internalType: "uint256[]", name: "_pubSignals", type: "uint256[]" }
    ],
    name: "recordVote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getVoteCounts",
    outputs: [
      { internalType: "uint256", name: "forCount", type: "uint256" },
      { internalType: "uint256", name: "againstCount", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "voter", type: "address" }],
    name: "hasVoted",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  }
];

function App() {
  const [vote, setVote] = useState(null);
  const [secret, setSecret] = useState("");
  const [commitment, setCommitment] = useState("");
  const [proof, setProof] = useState(null);
  const [verified, setVerified] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voteCounts, setVoteCounts] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Call updateCurrentAccount when component mounts and when account changes
  useEffect(() => {
    // Initial account check
    const checkAccount = async () => {
      if (window.ethereum) {
        try {
          // Force MetaMask to give us the current account
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          console.log("Direct signer check - Current account:", address);
          setCurrentAccount(address);

          // Double check with eth_accounts
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          console.log("eth_accounts check - Current accounts:", accounts);
          
          if (accounts.length > 0 && accounts[0].toLowerCase() !== address.toLowerCase()) {
            console.log("Account mismatch detected, updating to:", accounts[0]);
            setCurrentAccount(accounts[0]);
          }
        } catch (err) {
          console.error("Error checking accounts:", err);
          setCurrentAccount(null);
        }
      }
    };

    // Check immediately
    checkAccount();

    // Check every 1 second for account changes
    const interval = setInterval(checkAccount, 1000);

    // Account change listener
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        console.log("MetaMask accountsChanged event:", accounts);
        if (accounts.length > 0) {
          // Verify with direct signer check
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          console.log("Account change verification - signer address:", address);
          
          setCurrentAccount(accounts[0]);
          setVoteCounts(null); // Reset vote counts when account changes
        } else {
          setCurrentAccount(null);
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);

      // Cleanup
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        clearInterval(interval);
      };
    }

    return () => clearInterval(interval);
  }, []);

  // Modify connectWallet to be more thorough
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask to use this app!");
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    setIsConnecting(true);
    try {
      // Request accounts
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      console.log("eth_requestAccounts result:", accounts);

      // Verify with signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      console.log("Direct signer verification:", address);

      if (accounts.length > 0) {
        // Use the most recently verified account
        const finalAccount = address;
        console.log("Setting current account to:", finalAccount);
        setCurrentAccount(finalAccount);
        
        // Fetch initial vote counts after connection
        getVoteCounts();
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert("Failed to connect wallet. Please try again.");
      setCurrentAccount(null);
    }
    setIsConnecting(false);
  };

  const generateProof = async () => {
    if (vote === null || secret === "") {
      alert("Please select a vote and enter a secret.");
      return;
    }

    setLoading(true);
    setVerified(null);
    
    try {
      // Get current account directly instead of using updateCurrentAccount
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error("No account connected. Please connect your MetaMask wallet.");
      }
      const currentAccount = accounts[0];
      console.log("Current account for voting:", currentAccount);

      // Initialize contract interaction
      const contractAddress = "0x91f4b6A5E8bCE8666C492a33aBA1f0B34c6446a0";
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const votingContract = new ethers.Contract(contractAddress, abi, signer);
      
      // Check if account has already voted
      const address = await signer.getAddress();
      const hasVoted = await votingContract.hasVoted(address);
      
      if (hasVoted) {
        throw new Error(`This account (${address}) has already voted. Please switch to a different account in MetaMask.`);
      }

      const { groth16 } = await import("snarkjs");
      const circomlibjs = await import("circomlibjs");
      console.log("Successfully imported snarkjs and circomlibjs");
      
      const poseidon = await circomlibjs.buildPoseidon();
      console.log("Successfully built Poseidon");
      
      const F = poseidon.F;
      const hash = F.toString(poseidon([vote, BigInt(secret)]));
      console.log("Generated hash:", hash);
      setCommitment(hash);

      const input = {
        vote: vote ? 1 : 0,
        secret: secret,
        hash: hash
      };

      console.log("Generating proof with input:", input);
      
      // Load WASM and zkey files
      console.log("Loading WASM from:", "/vote.wasm");
      console.log("Loading zkey from:", "/example.zkey");
      
      // Generate proof
      const proofData = await groth16.fullProve(
        input,
        "/vote.wasm",
        "/example.zkey"
      );

      if (!proofData || !proofData.proof || !proofData.publicSignals) {
        console.error("Invalid proof data structure:", proofData);
        throw new Error("Failed to generate proof - invalid proof data returned");
      }

      console.log("Full proof data:", JSON.stringify(proofData, null, 2));
      
      // Verify the proof
      console.log("Fetching verification key...");
      const vKey = await fetch("/verification_key.json").then((res) => res.json());
      console.log("Verification key loaded:", vKey);
      
      const isValid = await groth16.verify(vKey, proofData.publicSignals, proofData.proof);
      setVerified(isValid);
      console.log("✅ Proof verified:", isValid);

      if (!isValid) {
        throw new Error("Proof verification failed");
      }

      // Format proof data for contract
      console.log("Raw proof data before formatting:", {
        pi_a: proofData.proof.pi_a,
        pi_b: proofData.proof.pi_b,
        pi_c: proofData.proof.pi_c
      });

      const pA = proofData.proof.pi_a.slice(0, 2).map(x => x.toString());
      const pB = proofData.proof.pi_b.slice(0, 2).map(row => 
        row.slice(0, 2).map(x => x.toString()).reverse()
      );
      const pC = proofData.proof.pi_c.slice(0, 2).map(x => x.toString());
      
      // Use the vote value as public signal if proofData.publicSignals is empty
      const formattedPublicSignals = proofData.publicSignals.length > 0 
        ? proofData.publicSignals.map(x => x.toString())
        : [input.vote.toString()];

      console.log("Formatted contract parameters:", {
        pA,
        pB,
        pC,
        publicSignals: formattedPublicSignals
      });

      // Record vote
      console.log("Sending transaction to record vote...");
      const tx = await votingContract.recordVote(
        pA,
        pB,
        pC,
        formattedPublicSignals
      );
      
      console.log("Transaction sent, waiting for confirmation...");
      await tx.wait();
      console.log("✅ Vote recorded successfully!");
      alert("✅ Vote recorded successfully!");
      
      // Refresh vote counts
      getVoteCounts();

    } catch (err) {
      console.error("❌ Proof generation/verification failed:", {
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: err.cause
      });
      
      // Check if the error is about already voted
      if (err.message.includes("Already voted")) {
        alert("This account has already voted. Please switch to a different account in MetaMask.");
      } else {
        alert(`Error: ${err.message || "Check console for details"}`);
      }
    }

    setLoading(false);
  };

  const getVoteCounts = async () => {
    try {
      const contractAddress = "0x91f4b6A5E8bCE8666C492a33aBA1f0B34c6446a0";
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const votingContract = new ethers.Contract(contractAddress, abi, signer);

      const [forCount, againstCount] = await votingContract.getVoteCounts();
      setVoteCounts({
        for: forCount.toString(),
        against: againstCount.toString()
      });
      console.log("Current vote counts:", {
        for: forCount.toString(),
        against: againstCount.toString()
      });
    } catch (error) {
      console.error("Failed to get vote counts:", error);
      alert("Failed to fetch vote counts. Check console for details.");
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#121212",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 500,
          textAlign: "center",
          padding: "2rem",
          color: "white",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🗳️ Vote on Proposal</h1>
        
        {!window.ethereum ? (
          <div style={{ marginBottom: "1rem" }}>
            <button
              onClick={() => window.open("https://metamask.io/download/", "_blank")}
              style={{
                backgroundColor: "#f6851b",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                gap: "8px",
                fontSize: "1rem"
              }}
            >
              🦊 Install MetaMask
            </button>
          </div>
        ) : !currentAccount ? (
          <div style={{ marginBottom: "1rem" }}>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              style={{
                backgroundColor: "#f6851b",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                gap: "8px",
                fontSize: "1rem",
                opacity: isConnecting ? 0.7 : 1
              }}
            >
              🦊 {isConnecting ? "Connecting..." : "Connect MetaMask"}
            </button>
          </div>
        ) : (
          <div style={{ 
            fontSize: "0.8rem", 
            color: "#888", 
            marginBottom: "1rem",
            wordBreak: "break-all"
          }}>
            Connected Account: {currentAccount}
          </div>
        )}

        {currentAccount && (
          <>
            <p style={{ fontWeight: "bold", fontSize: "1.1rem", color: "#a5f3fc" }}>
              "Greening and pedestrianizing 500 streets in Paris"
            </p>

            <div style={{ margin: "1.5rem 0" }}>
              <button
                onClick={() => setVote(1)}
                style={{
                  marginRight: 10,
                  backgroundColor: vote === 1 ? "#00c853" : "#222",
                  color: "white",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 5,
                  cursor: "pointer",
                }}
              >
                ✅ FOR
              </button>
              <button
                onClick={() => setVote(0)}
                style={{
                  backgroundColor: vote === 0 ? "#d50000" : "#222",
                  color: "white",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 5,
                  cursor: "pointer",
                }}
              >
                ❌ AGAINST
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#ccc", marginBottom: "0.5rem" }}>
              This secret makes your vote anonymous. It will be used to create a
              hidden commitment that proves your vote without revealing it.
            </p>

            <input
              type="number"
              placeholder="Enter a secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              style={{
                padding: "10px",
                width: "100%",
                marginBottom: "1rem",
                backgroundColor: "#1e1e1e",
                color: "white",
                border: "1px solid #444",
                borderRadius: "5px",
              }}
            />

            <button
              onClick={generateProof}
              disabled={loading}
              style={{
                backgroundColor: "#333",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: 5,
                cursor: "pointer",
                width: "100%",
                marginBottom: "1rem"
              }}
            >
              {loading ? "Generating zk Proof..." : "Generate zk Proof"}
            </button>

            <button
              onClick={getVoteCounts}
              style={{
                backgroundColor: "#1e1e1e",
                color: "#a5f3fc",
                border: "1px solid #444",
                padding: "10px 16px",
                borderRadius: 5,
                cursor: "pointer",
                width: "100%",
              }}
            >
              View Current Vote Counts
            </button>

            {voteCounts && (
              <div style={{ marginTop: "1rem", fontSize: "1.1rem" }}>
                <div style={{ color: "#00c853" }}>FOR: {voteCounts.for}</div>
                <div style={{ color: "#d50000" }}>AGAINST: {voteCounts.against}</div>
              </div>
            )}

            {commitment && (
              <div
                style={{
                  marginTop: "1rem",
                  fontSize: "0.9rem",
                  wordBreak: "break-all",
                }}
              >
                <strong>Commitment Hash:</strong>
                <div>{commitment}</div>
              </div>
            )}

            {proof && (
              <div style={{ marginTop: "1rem", fontSize: "0.9rem", color: "green" }}>
                ✅ zk-SNARK Proof Generated!
              </div>
            )}

            {verified !== null && (
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.9rem",
                  color: verified ? "#00e676" : "#ff1744",
                }}
              >
                {verified ? "✅ Proof verified!" : "❌ Invalid proof!"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
