// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./BaseSetup.sol";

/// @title BeforeAfter - Track state before and after function calls
/// @notice Provides ghost variable tracking for invariant testing
/// @dev Extend this contract and add your own state variables to the Vars struct
abstract contract BeforeAfter is BaseSetup {
    /// @notice Structure to hold state variables for comparison
    /// @dev Override this struct in your implementation to add custom fields
    struct Vars {
        // Common tracking variables
        uint256 timestamp;
        uint256 blockNumber;
        uint256 totalSupply;
        uint256 contractBalance;
        
        // Add custom fields in child contracts
        // Example:
        // uint256 userBalance;
        // uint256 poolReserves;
        // bool isPaused;
    }

    /// @notice State snapshot taken before function execution
    Vars internal _before;

    /// @notice State snapshot taken after function execution
    Vars internal _after;

    /// @notice Event emitted when state is captured
    event StateCaptured(bool isBefore, uint256 timestamp);

    /// @notice Capture state before a function call
    /// @dev Override this to capture your custom state variables
    function __before() internal virtual {
        _before.timestamp = block.timestamp;
        _before.blockNumber = block.number;
        emit StateCaptured(true, block.timestamp);
    }

    /// @notice Capture state after a function call
    /// @dev Override this to capture your custom state variables
    function __after() internal virtual {
        _after.timestamp = block.timestamp;
        _after.blockNumber = block.number;
        emit StateCaptured(false, block.timestamp);
    }

    /// @notice Helper to check if a value increased
    /// @param beforeVal Value before
    /// @param afterVal Value after
    /// @return True if afterVal > beforeVal
    function _increased(uint256 beforeVal, uint256 afterVal) internal pure returns (bool) {
        return afterVal > beforeVal;
    }

    /// @notice Helper to check if a value decreased
    /// @param beforeVal Value before
    /// @param afterVal Value after
    /// @return True if afterVal < beforeVal
    function _decreased(uint256 beforeVal, uint256 afterVal) internal pure returns (bool) {
        return afterVal < beforeVal;
    }

    /// @notice Helper to check if a value stayed the same
    /// @param beforeVal Value before
    /// @param afterVal Value after
    /// @return True if afterVal == beforeVal
    function _unchanged(uint256 beforeVal, uint256 afterVal) internal pure returns (bool) {
        return afterVal == beforeVal;
    }

    /// @notice Helper to get the difference between two values
    /// @param beforeVal Value before
    /// @param afterVal Value after
    /// @return Absolute difference
    function _diff(uint256 beforeVal, uint256 afterVal) internal pure returns (uint256) {
        return afterVal > beforeVal ? afterVal - beforeVal : beforeVal - afterVal;
    }

    /// @notice Helper to get the signed difference between two values
    /// @param beforeVal Value before
    /// @param afterVal Value after
    /// @return Signed difference (positive if increased, negative if decreased)
    function _signedDiff(uint256 beforeVal, uint256 afterVal) internal pure returns (int256) {
        return int256(afterVal) - int256(beforeVal);
    }
}

/// @title BeforeAfterWithAccounting - Extended tracking for DeFi protocols
/// @notice Provides additional ghost variables for common DeFi patterns
abstract contract BeforeAfterWithAccounting is BeforeAfter {
    /// @notice Extended state tracking for DeFi
    struct AccountingVars {
        // Token balances
        mapping(address => uint256) tokenBalances;
        
        // User positions
        mapping(address => mapping(address => uint256)) userTokenBalances;
        
        // Protocol metrics
        uint256 totalValueLocked;
        uint256 totalDebt;
        uint256 totalCollateral;
        uint256 utilizationRate;
        
        // Fee tracking
        uint256 accumulatedFees;
        uint256 pendingRewards;
    }

    /// @notice Accounting state before function call
    AccountingVars internal _accountingBefore;

    /// @notice Accounting state after function call
    AccountingVars internal _accountingAfter;

    /// @notice Track a token balance change
    /// @param token Token address
    /// @param holder Holder address
    /// @param isBefore True for before snapshot, false for after
    /// @param balance Current balance
    function _trackBalance(address token, address holder, bool isBefore, uint256 balance) internal {
        if (isBefore) {
            _accountingBefore.userTokenBalances[holder][token] = balance;
        } else {
            _accountingAfter.userTokenBalances[holder][token] = balance;
        }
    }

    /// @notice Get balance change for a user
    /// @param token Token address
    /// @param holder Holder address
    /// @return change Signed balance change
    function _getBalanceChange(address token, address holder) internal view returns (int256 change) {
        uint256 before = _accountingBefore.userTokenBalances[holder][token];
        uint256 afterVal = _accountingAfter.userTokenBalances[holder][token];
        change = int256(afterVal) - int256(before);
    }
}
