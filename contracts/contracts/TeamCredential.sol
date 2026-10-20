//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ITeamCredential} from "./interfaces/ITeamCredential.sol";

/// @title TeamCredential
/// @notice Soul-bound-style NFT credential issued when a student is accepted into a team.
/// @dev The only entity allowed to mint is the TeamRegistry contract, whose address is
/// fixed at construction.
contract TeamCredential is ERC721, ITeamCredential {
    /// @notice Address of the TeamRegistry contract allowed to mint.
    address public immutable registry;

    /// @notice Next token id to be minted (token ids start at 1).
    uint256 private _nextTokenId = 1;

    /// @notice Maps a token id to the team it certifies membership of.
    mapping(uint256 => uint256) public teamOf;

    /// @notice Emitted when a credential is minted.
    event CredentialMinted(address indexed to, uint256 indexed tokenId, uint256 indexed teamId);

    /// @notice Thrown when a caller other than the registry attempts to mint.
    error NotRegistry();
    /// @notice Thrown when the registry address is zero.
    error InvalidRegistry();

    /// @param registry_ Address of the TeamRegistry contract allowed to mint.
    constructor(address registry_) ERC721("TeamUp Credential", "TEAMUP") {
        if (registry_ == address(0)) revert InvalidRegistry();

        registry = registry_;
    }

    /// @notice Mints a credential proving membership of a team.
    /// @dev Only callable by the registry.
    /// @param to Address receiving the credential.
    /// @param teamId Id of the team the credential certifies.
    function mint(address to, uint256 teamId) external {
        if (msg.sender != registry) revert NotRegistry();

        uint256 tokenId = _nextTokenId;

        // Safe: token ids start at 1 and cannot realistically reach type(uint256).max.
        unchecked {
            _nextTokenId = tokenId + 1;
        }

        teamOf[tokenId] = teamId;

        _safeMint(to, tokenId);

        emit CredentialMinted(to, tokenId, teamId);
    }

    /// @notice Returns the next token id that will be minted.
    /// @return tokenId Id that the next mint will assign.
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    /// @notice Fully on-chain token metadata.
    /// @param tokenId Id of the token.
    /// @return Base64-encoded data URI with the credential metadata.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        uint256 teamId = teamOf[tokenId];

        string memory json = string.concat(
            '{"name": "TeamUp Credential #',
            Strings.toString(tokenId),
            '", "description": "Proof of acceptance into team #',
            Strings.toString(teamId),
            '", "attributes": [{"trait_type": "Team", "value": "',
            Strings.toString(teamId),
            '"}]}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
