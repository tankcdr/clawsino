// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ClawsinoPayout — House bankroll + winner payouts via USDC
/// @notice The house (owner) deposits USDC. An authorized game server triggers payouts.
contract ClawsinoPayout is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public gameServer;

    event GamePlayed(address indexed player, uint256 betAmount, bool won);
    event WinnerPaid(address indexed winner, uint256 amount);
    event HouseDeposit(address indexed depositor, uint256 amount);
    event HouseWithdraw(address indexed to, uint256 amount);
    event GameServerUpdated(address indexed oldServer, address indexed newServer);

    error OnlyGameServer();
    error InsufficientBankroll();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyGameServer() {
        if (msg.sender != gameServer) revert OnlyGameServer();
        _;
    }

    constructor(address _usdc, address _gameServer) Ownable(msg.sender) {
        if (_usdc == address(0) || _gameServer == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        gameServer = _gameServer;
    }

    /// @notice House deposits USDC into the bankroll
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseDeposit(msg.sender, amount);
    }

    /// @notice House withdraws USDC from the bankroll (owner only)
    function withdraw(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientBankroll();
        usdc.safeTransfer(msg.sender, amount);
        emit HouseWithdraw(msg.sender, amount);
    }

    /// @notice Pay a winner — called by the authorized game server
    function payWinner(address winner, uint256 amount) external onlyGameServer {
        if (winner == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientBankroll();
        usdc.safeTransfer(winner, amount);
        emit WinnerPaid(winner, amount);
    }

    /// @notice Record a game result (for event logging) + optional payout
    function recordGame(address player, uint256 betAmount, bool won, uint256 payoutAmount) external onlyGameServer {
        emit GamePlayed(player, betAmount, won);
        if (won && payoutAmount > 0) {
            if (usdc.balanceOf(address(this)) < payoutAmount) revert InsufficientBankroll();
            usdc.safeTransfer(player, payoutAmount);
            emit WinnerPaid(player, payoutAmount);
        }
    }

    /// @notice Update the game server address (owner only)
    function setGameServer(address _gameServer) external onlyOwner {
        if (_gameServer == address(0)) revert ZeroAddress();
        emit GameServerUpdated(gameServer, _gameServer);
        gameServer = _gameServer;
    }

    /// @notice View the current bankroll balance
    function bankroll() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
