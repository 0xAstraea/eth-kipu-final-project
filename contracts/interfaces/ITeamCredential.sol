//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ITeamCredential
/// @notice Minimal interface of the credential NFT consumed by TeamRegistry.
interface ITeamCredential {
    /// @notice Mints a credential for a team.
    /// @param to Address receiving the credential.
    /// @param teamId Team the credential certifies.
    function mint(address to, uint256 teamId) external;
}
