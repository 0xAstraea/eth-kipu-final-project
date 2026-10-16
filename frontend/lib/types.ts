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

export type IdentityView = {
  id: string;
  label: string;
  privateKey: string;
  commitment: string;
};

export type StoredClaim = {
  teamId: string;
  nullifier: string;
  claimAddress: string;
  salt: string;
  presentation: string;
  identityLabel: string;
};
