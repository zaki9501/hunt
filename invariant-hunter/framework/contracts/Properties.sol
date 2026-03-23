// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./BeforeAfter.sol";
import "./Asserts.sol";

/// @title Properties - Base contract for defining invariant properties
/// @notice Define your invariants/properties by inheriting from this contract
/// @dev Properties can be boolean (must always return true) or assertion-based
abstract contract Properties is BeforeAfter, Asserts {
    /// @notice Property status tracking
    struct PropertyStatus {
        bool checked;
        bool passed;
        string name;
        uint256 lastCheckedBlock;
    }

    /// @notice Mapping of property names to their status
    mapping(string => PropertyStatus) internal _propertyStatus;

    /// @notice List of all property names
    string[] internal _propertyNames;

    /// @notice Event emitted when a property is checked
    event PropertyChecked(string indexed name, bool passed);

    /// @notice Event emitted when a property fails
    event PropertyFailed(string indexed name, string reason);

    /// @notice Register a new property
    /// @param name Name of the property
    function _registerProperty(string memory name) internal {
        if (!_propertyStatus[name].checked) {
            _propertyNames.push(name);
        }
        _propertyStatus[name].name = name;
    }

    /// @notice Mark a property as checked
    /// @param name Name of the property
    /// @param passed Whether the property passed
    function _recordPropertyCheck(string memory name, bool passed) internal {
        _propertyStatus[name].checked = true;
        _propertyStatus[name].passed = passed;
        _propertyStatus[name].lastCheckedBlock = block.number;
        emit PropertyChecked(name, passed);
    }

    /// @notice Get all registered property names
    /// @return Array of property names
    function getPropertyNames() public view returns (string[] memory) {
        return _propertyNames;
    }

    /// @notice Get the status of a property
    /// @param name Name of the property
    /// @return status The property status
    function getPropertyStatus(string memory name) public view returns (PropertyStatus memory status) {
        return _propertyStatus[name];
    }

    // ============ Common Property Patterns ============

    /// @notice Property: Total supply should never exceed max supply
    /// @param totalSupply Current total supply
    /// @param maxSupply Maximum allowed supply
    function _property_totalSupplyNotExceedsMax(uint256 totalSupply, uint256 maxSupply) internal {
        t(totalSupply <= maxSupply, "Total supply exceeds max");
    }

    /// @notice Property: Contract should never have negative balance (ETH)
    /// @param target Contract to check
    function _property_nonNegativeBalance(address target) internal {
        t(target.balance >= 0, "Negative balance detected");
    }

    /// @notice Property: Sum of all user balances equals total supply
    /// @param sumOfBalances Sum of all individual balances
    /// @param totalSupply Total supply
    function _property_balancesSumToTotal(uint256 sumOfBalances, uint256 totalSupply) internal {
        eq(sumOfBalances, totalSupply, "Balances don't sum to total");
    }

    /// @notice Property: Value should be within acceptable bounds
    /// @param value Value to check
    /// @param min Minimum acceptable value
    /// @param max Maximum acceptable value
    /// @param name Name for error message
    function _property_withinBounds(uint256 value, uint256 min, uint256 max, string memory name) internal {
        t(value >= min && value <= max, string.concat(name, " out of bounds"));
    }

    /// @notice Property: Monotonically increasing value
    /// @param beforeVal Value before operation
    /// @param afterVal Value after operation
    /// @param name Name for error message
    function _property_monotonicallyIncreasing(uint256 beforeVal, uint256 afterVal, string memory name) internal {
        t(afterVal >= beforeVal, string.concat(name, " decreased unexpectedly"));
    }

    /// @notice Property: Value should never be zero
    /// @param value Value to check
    /// @param name Name for error message
    function _property_neverZero(uint256 value, string memory name) internal {
        t(value != 0, string.concat(name, " is zero"));
    }

    /// @notice Property: Address should not be zero
    /// @param addr Address to check
    /// @param name Name for error message
    function _property_nonZeroAddress(address addr, string memory name) internal {
        t(addr != address(0), string.concat(name, " is zero address"));
    }

    /// @notice Property: Conservation of value (no value created or destroyed)
    /// @param inputSum Sum of inputs
    /// @param outputSum Sum of outputs
    /// @param fees Fees taken (if any)
    function _property_conservationOfValue(uint256 inputSum, uint256 outputSum, uint256 fees) internal {
        eq(inputSum, outputSum + fees, "Value not conserved");
    }
}

/// @title DeFiProperties - Common properties for DeFi protocols
/// @notice Provides pre-built invariants for lending, AMM, and vault protocols
abstract contract DeFiProperties is Properties {
    // ============ Lending Protocol Properties ============

    /// @notice Property: Collateral ratio should stay above minimum
    /// @param collateral Total collateral value
    /// @param debt Total debt value
    /// @param minRatio Minimum required ratio (in basis points, e.g., 15000 = 150%)
    function _property_collateralRatioAboveMin(uint256 collateral, uint256 debt, uint256 minRatio) internal {
        if (debt > 0) {
            uint256 ratio = (collateral * 10000) / debt;
            t(ratio >= minRatio, "Collateral ratio below minimum");
        }
    }

    /// @notice Property: Interest rate should be within bounds
    /// @param rate Current interest rate
    /// @param maxRate Maximum allowed rate
    function _property_interestRateInBounds(uint256 rate, uint256 maxRate) internal {
        t(rate <= maxRate, "Interest rate exceeds maximum");
    }

    // ============ AMM Properties ============

    /// @notice Property: Constant product invariant (x * y = k)
    /// @param reserveX Reserve of token X
    /// @param reserveY Reserve of token Y
    /// @param kBefore K value before swap
    /// @param tolerance Acceptable tolerance for rounding (in basis points)
    function _property_constantProduct(
        uint256 reserveX,
        uint256 reserveY,
        uint256 kBefore,
        uint256 tolerance
    ) internal {
        uint256 kAfter = reserveX * reserveY;
        uint256 diff = kAfter > kBefore ? kAfter - kBefore : kBefore - kAfter;
        uint256 maxDiff = (kBefore * tolerance) / 10000;
        t(diff <= maxDiff, "Constant product violated");
    }

    /// @notice Property: LP tokens should never exceed reserves backing
    /// @param lpSupply Total LP token supply
    /// @param totalLiquidity Total liquidity in pool
    function _property_lpBackedByReserves(uint256 lpSupply, uint256 totalLiquidity) internal {
        t(lpSupply == 0 || totalLiquidity > 0, "LP tokens not backed by reserves");
    }

    // ============ Vault Properties ============

    /// @notice Property: Shares to assets conversion is consistent
    /// @param shares Share amount
    /// @param expectedAssets Expected asset amount
    /// @param actualAssets Actual asset amount
    /// @param tolerance Acceptable difference
    function _property_shareConversionConsistent(
        uint256 shares,
        uint256 expectedAssets,
        uint256 actualAssets,
        uint256 tolerance
    ) internal {
        uint256 diff = actualAssets > expectedAssets 
            ? actualAssets - expectedAssets 
            : expectedAssets - actualAssets;
        t(diff <= tolerance, "Share conversion inconsistent");
    }

    /// @notice Property: Total assets should equal sum of all positions
    /// @param reportedTotal Reported total assets
    /// @param calculatedTotal Sum of all positions
    function _property_totalAssetsAccurate(uint256 reportedTotal, uint256 calculatedTotal) internal {
        eq(reportedTotal, calculatedTotal, "Total assets mismatch");
    }
}
