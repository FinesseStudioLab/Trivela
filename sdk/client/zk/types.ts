/** Inputs required to generate a claim proof. */
export interface ClaimProofInputs {
  /** Merkle root of the allowlist the user is proving membership in. */
  merkleRoot: string;
  /** Campaign identifier (used as a domain separator in the circuit). */
  campaignId: string;
  /** The user's secret identity commitment (kept client-side only). */
  identitySecret: Uint8Array;
  /** Merkle siblings for the membership proof path. */
  merklePath: string[];
  /** Index of the user's leaf in the Merkle tree. */
  leafIndex: number;
}

/** Output of the prover: a fully-packaged ZK proof ready for on-chain submission. */
export interface ClaimProof {
  /** Raw proof bytes (Groth16 or PLONK, 256 bytes for BN254 Groth16). */
  proofBytes: Uint8Array;
  /** Nullifier derived from identitySecret + campaignId; prevents double-claim. */
  nullifier: Uint8Array;
  /** Public signals in the order the contract verifier expects them. */
  publicSignals: string[];
}

export interface ProofGenerationProgress {
  /** 0-100 percentage. */
  pct: number;
}
