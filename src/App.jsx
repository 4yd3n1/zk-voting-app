import { useState, useEffect } from "react";
import { Buffer } from "buffer";
import process from "process";
import { ethers } from "ethers";
import "./App.css";

// Inject polyfills
window.Buffer = Buffer;
window.process = process;

// Contract ABI definition
const abi = [
  {
    inputs: [
      { internalType: "string", name: "_title", type: "string" },
      { internalType: "string", name: "_description", type: "string" }
    ],
    name: "createProposal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
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

const CONTRACT_ADDRESS = "0xF3396E94f9a2a0b3A7F931EEBD5883878Dd2Fa26";

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
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewProposal, setShowNewProposal] = useState(false);
  const [newProposal, setNewProposal] = useState({ title: "", description: "" });
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [submitError, setSubmitError] = useState(null);

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

  // Add disconnect function
  const disconnectWallet = () => {
    setCurrentAccount(null);
    setShowDropdown(false);
    setVoteCounts(null);
  };

  // Add change account function
  const changeAccount = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
      setShowDropdown(false);
    } catch (error) {
      console.error("Failed to change account:", error);
    }
  };

  // Add this new function to handle proposal submission
  const handleProposalSubmit = async () => {
    // Reset error state
    setSubmitError(null);

    // Validate inputs
    if (!newProposal.title.trim()) {
      setSubmitError("Please enter a proposal title");
      return;
    }
    if (!newProposal.description.trim()) {
      setSubmitError("Please enter a proposal description");
      return;
    }
    if (!currentAccount) {
      setSubmitError("Please connect your wallet first");
      return;
    }

    setIsSubmittingProposal(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const votingContract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

      console.log("Creating proposal:", newProposal);
      const tx = await votingContract.createProposal(
        newProposal.title,
        newProposal.description
      );

      console.log("Waiting for transaction confirmation...");
      await tx.wait();
      console.log("Proposal created successfully!");

      // Clear form and close modal
      setNewProposal({ title: "", description: "" });
      setShowNewProposal(false);

      // Show success message
      alert("✅ Proposal created successfully!");

    } catch (error) {
      console.error("Error creating proposal:", error);
      setSubmitError(error.message || "Failed to create proposal. Please try again.");
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#121212",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* New Proposal Button */}
      <div style={{
        position: "absolute",
        top: "1rem",
        left: "1rem",
        zIndex: 1000,
      }}>
        <button
          onClick={() => setShowNewProposal(true)}
          style={{
            backgroundColor: "#00c853",
            color: "white",
            border: "none",
            padding: "10px 16px",
            borderRadius: "5px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "1rem",
          }}
        >
          <span role="img" aria-label="new">➕</span>
          NEW PROPOSAL
        </button>
      </div>

      {/* New Proposal Page */}
      {showNewProposal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#121212",
          zIndex: 2000,
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflowY: "auto", // Allow scrolling if content is too long
        }}>
          <div style={{
            width: "100%",
            maxWidth: "800px",
            margin: "0 auto",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "2rem",
            }}>
              <h1 style={{ color: "white", margin: 0 }}>Create New Proposal</h1>
              <button
                onClick={() => !isSubmittingProposal && setShowNewProposal(false)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "white",
                  fontSize: "1.5rem",
                  cursor: isSubmittingProposal ? "not-allowed" : "pointer",
                  opacity: isSubmittingProposal ? 0.5 : 1,
                }}
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div style={{
                backgroundColor: "rgba(255, 0, 0, 0.1)",
                border: "1px solid #ff4444",
                color: "#ff4444",
                padding: "1rem",
                borderRadius: "5px",
                marginBottom: "1.5rem",
              }}>
                ❌ {submitError}
              </div>
            )}

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}>
              <div>
                <label
                  style={{
                    color: "white",
                    display: "block",
                    marginBottom: "0.5rem",
                    fontSize: "1.1rem",
                  }}
                >
                  Proposal Title *
                </label>
                <input
                  type="text"
                  value={newProposal.title}
                  onChange={(e) => {
                    setNewProposal({ ...newProposal, title: e.target.value });
                    setSubmitError(null); // Clear error when user types
                  }}
                  placeholder="Enter your proposal title"
                  disabled={isSubmittingProposal}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "#1e1e1e",
                    border: "1px solid #333",
                    borderRadius: "5px",
                    color: "white",
                    fontSize: "1rem",
                    opacity: isSubmittingProposal ? 0.7 : 1,
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    color: "white",
                    display: "block",
                    marginBottom: "0.5rem",
                    fontSize: "1.1rem",
                  }}
                >
                  Proposal Description *
                </label>
                <textarea
                  value={newProposal.description}
                  onChange={(e) => {
                    setNewProposal({ ...newProposal, description: e.target.value });
                    setSubmitError(null); // Clear error when user types
                  }}
                  placeholder="Describe your proposal in detail..."
                  disabled={isSubmittingProposal}
                  style={{
                    width: "100%",
                    height: "200px",
                    padding: "12px",
                    backgroundColor: "#1e1e1e",
                    border: "1px solid #333",
                    borderRadius: "5px",
                    color: "white",
                    fontSize: "1rem",
                    resize: "vertical",
                    opacity: isSubmittingProposal ? 0.7 : 1,
                  }}
                />
              </div>

              <button
                onClick={handleProposalSubmit}
                disabled={isSubmittingProposal}
                style={{
                  backgroundColor: "#00c853",
                  color: "white",
                  border: "none",
                  padding: "12px",
                  borderRadius: "5px",
                  cursor: isSubmittingProposal ? "not-allowed" : "pointer",
                  fontSize: "1rem",
                  marginTop: "1rem",
                  opacity: isSubmittingProposal ? 0.7 : 1,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {isSubmittingProposal ? (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}>
                    <span>Creating Proposal...</span>
                    <div style={{
                      width: "20px",
                      height: "20px",
                      border: "2px solid white",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }} />
                  </div>
                ) : (
                  "Submit Proposal"
                )}
              </button>

              <p style={{
                color: "#666",
                fontSize: "0.9rem",
                textAlign: "center",
                marginTop: "1rem",
              }}>
                * Required fields
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MetaMask Button in Top Right */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 1000,
        }}
      >
        <div style={{ position: "relative" }}>
          <button
            onClick={() => currentAccount ? setShowDropdown(!showDropdown) : connectWallet()}
            style={{
              backgroundColor: "#f6851b",
              color: "white",
              border: "none",
              padding: "10px 16px",
              borderRadius: "5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "1rem",
              opacity: isConnecting ? 0.7 : 1
            }}
          >
            <span role="img" aria-label="metamask">🦊</span>
            {isConnecting ? "Connecting..." : currentAccount ? 
              `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}` : 
              "Connect MetaMask"}
          </button>

          {/* Dropdown Menu */}
          {showDropdown && currentAccount && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "0.5rem",
                backgroundColor: "#1e1e1e",
                border: "1px solid #333",
                borderRadius: "5px",
                width: "200px",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                zIndex: 1000,
              }}
            >
              <button
                onClick={changeAccount}
                style={{
                  width: "100%",
                  padding: "10px",
                  textAlign: "left",
                  backgroundColor: "transparent",
                  border: "none",
                  borderBottom: "1px solid #333",
                  color: "white",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span role="img" aria-label="change">🔄</span>
                Change Account
              </button>
              <button
                onClick={disconnectWallet}
                style={{
                  width: "100%",
                  padding: "10px",
                  textAlign: "left",
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#ff4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span role="img" aria-label="disconnect">⏏️</span>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          width: "100%",
          maxWidth: 500,
          margin: "0 auto",
          padding: "2rem",
          paddingTop: "4rem",
          textAlign: "center",
          color: "white",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🗳️ Vote on Proposal</h1>

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

      {/* Click handler to close dropdown when clicking outside */}
      {showDropdown && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}

export default App;
