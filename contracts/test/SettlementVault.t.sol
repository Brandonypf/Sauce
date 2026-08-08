// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SettlementVault} from "../src/SettlementVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Creador cuya wallet es un contrato que revierte al recibir.
/// @dev En el RoyaltyManager anterior esto dejaba su obra imposible de comprar.
contract RevertingCreator {
    function withdrawFrom(SettlementVault vault) external {
        vault.withdraw();
    }

    fallback() external payable {
        revert("no");
    }
}

contract SettlementVaultTest is Test {
    MockUSDC internal usdc;
    SettlementVault internal vault;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0x7EA5);
    address internal settler = address(0x5E77);

    address internal creatorA = address(0xA);
    address internal creatorB = address(0xB);

    uint16 internal constant FEE_BPS = 500; // 5%

    function setUp() public {
        usdc = new MockUSDC();
        vault = new SettlementVault(address(usdc), treasury, admin, FEE_BPS);

        bytes32 settlerRole = vault.SETTLER_ROLE();
        vm.prank(admin);
        vault.grantRole(settlerRole, settler);

        usdc.mint(settler, 1_000_000e6);

        vm.prank(settler);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _settle(bytes32 batchId, address[] memory payees, uint256[] memory amounts) internal {
        vm.prank(settler);
        vault.settleBatch(batchId, payees, amounts);
    }

    function _pair(address a, address b, uint256 x, uint256 y)
        internal
        pure
        returns (address[] memory payees, uint256[] memory amounts)
    {
        payees = new address[](2);
        amounts = new uint256[](2);
        payees[0] = a;
        payees[1] = b;
        amounts[0] = x;
        amounts[1] = y;
    }

    function testSettleAccruesNetOfFee() public {
        (address[] memory payees, uint256[] memory amounts) = _pair(creatorA, creatorB, 100e6, 40e6);
        _settle(bytes32("lote-1"), payees, amounts);

        assertEq(vault.accrued(creatorA), 95e6);
        assertEq(vault.accrued(creatorB), 38e6);
        assertEq(vault.accrued(treasury), 7e6);
        assertEq(vault.totalAccrued(), 140e6);
        assertEq(usdc.balanceOf(address(vault)), 140e6);
    }

    function testWithdraw() public {
        (address[] memory payees, uint256[] memory amounts) = _pair(creatorA, creatorB, 100e6, 40e6);
        _settle(bytes32("lote-1"), payees, amounts);

        vm.prank(creatorA);
        vault.withdraw();

        assertEq(usdc.balanceOf(creatorA), 95e6);
        assertEq(vault.accrued(creatorA), 0);
        assertEq(vault.totalAccrued(), 45e6);
    }

    function testBatchIdIsIdempotent() public {
        (address[] memory payees, uint256[] memory amounts) = _pair(creatorA, creatorB, 100e6, 40e6);
        _settle(bytes32("lote-1"), payees, amounts);

        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.BatchAlreadySettled.selector, bytes32("lote-1")));
        vault.settleBatch(bytes32("lote-1"), payees, amounts);
    }

    /// @dev La correccion central: un beneficiario que no puede recibir solo se
    ///      bloquea a si mismo, no a los demas ni a la venta.
    function testRevertingPayeeDoesNotBlockOthers() public {
        RevertingCreator broken = new RevertingCreator();

        (address[] memory payees, uint256[] memory amounts) = _pair(address(broken), creatorB, 100e6, 40e6);
        _settle(bytes32("lote-1"), payees, amounts);

        vm.prank(creatorB);
        vault.withdraw();
        assertEq(usdc.balanceOf(creatorB), 38e6);

        // El saldo del creador roto sigue reservado y retirable cuando arregle su wallet.
        assertEq(vault.accrued(address(broken)), 95e6);
    }

    function testRoundingNeverExceedsWhatCameIn() public {
        address[] memory payees = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        payees[0] = creatorA;
        payees[1] = creatorB;
        payees[2] = address(0xC);
        amounts[0] = 1;
        amounts[1] = 3;
        amounts[2] = 7;

        _settle(bytes32("lote-polvo"), payees, amounts);

        uint256 credited =
            vault.accrued(creatorA) + vault.accrued(creatorB) + vault.accrued(address(0xC)) + vault.accrued(treasury);

        assertEq(credited, 11);
        assertEq(usdc.balanceOf(address(vault)), 11);
    }

    function testFeeCannotExceedCap() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.FeeTooHigh.selector, uint16(3001), uint16(3000)));
        vault.setPlatformFee(3001);
    }

    function testSweepCannotTouchCreatorFunds() public {
        (address[] memory payees, uint256[] memory amounts) = _pair(creatorA, creatorB, 100e6, 40e6);
        _settle(bytes32("lote-1"), payees, amounts);

        vm.prank(admin);
        vm.expectRevert(SettlementVault.NoExcess.selector);
        vault.sweepExcess(admin);

        // Solo tokens enviados por error salen con sweep.
        usdc.mint(address(vault), 5e6);

        vm.prank(admin);
        uint256 excess = vault.sweepExcess(admin);

        assertEq(excess, 5e6);
        assertEq(usdc.balanceOf(address(vault)), 140e6);
    }

    function testNonSettlerCannotSettle() public {
        (address[] memory payees, uint256[] memory amounts) = _pair(creatorA, creatorB, 100e6, 40e6);

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        vault.settleBatch(bytes32("lote-x"), payees, amounts);
    }

    function testWithdrawWithNothingReverts() public {
        vm.prank(creatorA);
        vm.expectRevert(SettlementVault.NothingToWithdraw.selector);
        vault.withdraw();
    }
}
