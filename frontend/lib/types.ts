export type PersonaRole = "professor" | "student";

/** A local persona: the "actor" whose identities and applications you are looking at. */
export type Persona = {
  id: string;
  name: string;
  role: PersonaRole;
  /** Optional wallet address this persona acts from. Empty means "any wallet". */
  wallet?: string;
};

export type IdentityView = {
  id: string;
  label: string;
  privateKey: string;
  commitment: string;
  /** Persona that owns this identity. */
  personaId: string;
};

export type StoredClaim = {
  teamId: string;
  nullifier: string;
  claimAddress: string;
  salt: string;
  presentation: string;
  identityLabel: string;
  /** Persona that submitted this application. */
  personaId: string;
};

export type TeamView = {
  id: string;
  admin: string;
  name: string;
  description: string;
  maxMembers: string;
  revealAtBlock: string;
  isRevealed: boolean;
  rosterRoot: string;
  members: string[];
};
