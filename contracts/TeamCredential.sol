//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title TeamCredential
/// @notice Soul-bound-style NFT credential issued when a student is accepted into a team.
/// @dev The only entity allowed to mint is the TeamRegistry contract.
contract TeamCredential is ERC721, Ownable {
    /// @notice Address of the TeamRegistry contract allowed to mint.
    address public registry;

    /// @notice Next token id to be minted (token ids start at 1).
    uint256 private _nextTokenId = 1;

    /// @notice Maps a token id to the team it certifies membership of.
    mapping(uint256 => uint256) public teamOf;

    /// @notice Emitted when the registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when a credential is minted.
    event CredentialMinted(address indexed to, uint256 indexed tokenId, uint256 indexed teamId);

    error RegistryAlreadySet();
    error NotRegistry();

    constructor() ERC721("TeamUp Credential", "TEAMUP") Ownable(msg.sender) {}

    /// @notice Sets the registry allowed to mint. Can only be set once.
    /// @param registry_ Address of the TeamRegistry contract.
    function setRegistry(address registry_) external onlyOwner {
        if (registry != address(0)) revert RegistryAlreadySet();
        if (registry_ == address(0)) revert RegistryAlreadySet();

        registry = registry_;
        emit RegistrySet(registry_);
    }

    /// @notice Mints a credential proving membership of a team.
    /// @dev Only callable by the registry.
    /// @param to Address receiving the credential.
    /// @param teamId Id of the team the credential certifies.
    function mint(address to, uint256 teamId) external {
        if (msg.sender != registry) revert NotRegistry();

        uint256 tokenId = _nextTokenId++;

        teamOf[tokenId] = teamId;

        _safeMint(to, tokenId);

        emit CredentialMinted(to, tokenId, teamId);
    }

    /// @notice Returns the next token id that will be minted.
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
