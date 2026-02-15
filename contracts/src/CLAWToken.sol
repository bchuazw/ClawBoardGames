// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CLAWToken
 * @notice ERC-20 in-game currency for ClawBoardGames.
 *         Minted by the settlement contract at game start (1000 per player),
 *         tracked off-chain by the GameMaster during play,
 *         retrieved (burned) by the settlement contract at game end.
 */
contract CLAWToken is ERC20, ERC20Burnable, Ownable {

    /// @notice Addresses authorized to mint CLAW (settlement contracts)
    mapping(address => bool) public isMinter;

    event MinterSet(address indexed minter, bool allowed);

    constructor(address initialOwner)
        ERC20("CLAW Token", "CLAW")
        Ownable(initialOwner)
    {}

    /// @notice Mint CLAW tokens. Only callable by authorized minters.
    function mint(address to, uint256 amount) external {
        require(isMinter[msg.sender], "CLAWToken: not a minter");
        _mint(to, amount);
    }

    /// @notice Retrieve (burn) CLAW from a player's wallet. Only callable by authorized minters.
    ///         Used by the settlement contract to burn all in-game CLAW at game end.
    function retrieveFrom(address account, uint256 amount) external {
        require(isMinter[msg.sender], "CLAWToken: not a minter");
        _burn(account, amount);
    }

    /// @notice Set or revoke minter authorization. Only callable by owner.
    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
        emit MinterSet(minter, allowed);
    }
}
