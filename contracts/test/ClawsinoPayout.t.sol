// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {ClawsinoPayout} from "../src/ClawsinoPayout.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract ClawsinoPayoutTest is Test {
    ClawsinoPayout public payout;
    MockUSDC public usdc;

    address owner = address(this);
    address gameServer = makeAddr("gameServer");
    address house = makeAddr("house");
    address player = makeAddr("player");

    event GamePlayed(address indexed player, uint256 betAmount, bool won);
    event WinnerPaid(address indexed winner, uint256 amount);
    event HouseDeposit(address indexed depositor, uint256 amount);
    event HouseWithdraw(address indexed to, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        payout = new ClawsinoPayout(address(usdc), gameServer);

        // Fund house with 10,000 USDC
        usdc.mint(house, 10_000e6);
    }

    function _depositBankroll(uint256 amount) internal {
        vm.startPrank(house);
        usdc.approve(address(payout), amount);
        payout.deposit(amount);
        vm.stopPrank();
    }

    // --- Deposit ---

    function test_deposit() public {
        _depositBankroll(1_000e6);
        assertEq(payout.bankroll(), 1_000e6);
    }

    function test_deposit_emitsEvent() public {
        vm.startPrank(house);
        usdc.approve(address(payout), 500e6);
        vm.expectEmit(true, false, false, true);
        emit HouseDeposit(house, 500e6);
        payout.deposit(500e6);
        vm.stopPrank();
    }

    function test_deposit_revertZero() public {
        vm.expectRevert(ClawsinoPayout.ZeroAmount.selector);
        payout.deposit(0);
    }

    // --- Withdraw ---

    function test_withdraw() public {
        _depositBankroll(1_000e6);
        payout.withdraw(500e6);
        assertEq(payout.bankroll(), 500e6);
        assertEq(usdc.balanceOf(owner), 500e6);
    }

    function test_withdraw_revertNotOwner() public {
        _depositBankroll(1_000e6);
        vm.prank(player);
        vm.expectRevert();
        payout.withdraw(100e6);
    }

    function test_withdraw_revertInsufficientBankroll() public {
        vm.expectRevert(ClawsinoPayout.InsufficientBankroll.selector);
        payout.withdraw(1e6);
    }

    function test_withdraw_revertZero() public {
        vm.expectRevert(ClawsinoPayout.ZeroAmount.selector);
        payout.withdraw(0);
    }

    // --- payWinner ---

    function test_payWinner() public {
        _depositBankroll(1_000e6);
        vm.prank(gameServer);
        payout.payWinner(player, 50e6);
        assertEq(usdc.balanceOf(player), 50e6);
        assertEq(payout.bankroll(), 950e6);
    }

    function test_payWinner_revertNotGameServer() public {
        _depositBankroll(1_000e6);
        vm.prank(player);
        vm.expectRevert(ClawsinoPayout.OnlyGameServer.selector);
        payout.payWinner(player, 50e6);
    }

    function test_payWinner_revertInsufficientBankroll() public {
        vm.prank(gameServer);
        vm.expectRevert(ClawsinoPayout.InsufficientBankroll.selector);
        payout.payWinner(player, 50e6);
    }

    function test_payWinner_revertZeroAddress() public {
        _depositBankroll(1_000e6);
        vm.prank(gameServer);
        vm.expectRevert(ClawsinoPayout.ZeroAddress.selector);
        payout.payWinner(address(0), 50e6);
    }

    function test_payWinner_revertZeroAmount() public {
        _depositBankroll(1_000e6);
        vm.prank(gameServer);
        vm.expectRevert(ClawsinoPayout.ZeroAmount.selector);
        payout.payWinner(player, 0);
    }

    // --- recordGame ---

    function test_recordGame_win() public {
        _depositBankroll(1_000e6);
        vm.prank(gameServer);
        vm.expectEmit(true, false, false, true);
        emit GamePlayed(player, 10e6, true);
        payout.recordGame(player, 10e6, true, 19.6e6);
        assertEq(usdc.balanceOf(player), 19.6e6);
    }

    function test_recordGame_loss() public {
        _depositBankroll(1_000e6);
        vm.prank(gameServer);
        payout.recordGame(player, 10e6, false, 0);
        assertEq(usdc.balanceOf(player), 0);
        assertEq(payout.bankroll(), 1_000e6);
    }

    // --- setGameServer ---

    function test_setGameServer() public {
        address newServer = makeAddr("newServer");
        payout.setGameServer(newServer);
        assertEq(payout.gameServer(), newServer);
    }

    function test_setGameServer_revertNotOwner() public {
        vm.prank(player);
        vm.expectRevert();
        payout.setGameServer(makeAddr("newServer"));
    }

    function test_setGameServer_revertZero() public {
        vm.expectRevert(ClawsinoPayout.ZeroAddress.selector);
        payout.setGameServer(address(0));
    }

    // --- Constructor ---

    function test_constructor_revertZeroUsdc() public {
        vm.expectRevert(ClawsinoPayout.ZeroAddress.selector);
        new ClawsinoPayout(address(0), gameServer);
    }

    function test_constructor_revertZeroServer() public {
        vm.expectRevert(ClawsinoPayout.ZeroAddress.selector);
        new ClawsinoPayout(address(usdc), address(0));
    }
}
