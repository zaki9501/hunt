// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Hunter Framework - Invariant Testing Made Easy
// Similar to Chimera, but with additional features and utilities

// Core imports
import "./Asserts.sol";
import "./ActorManager.sol";
import "./BaseSetup.sol";
import "./BeforeAfter.sol";
import "./Properties.sol";
import "./HunterTester.sol";

/// @title Hunter - Main framework entry point
/// @notice Import this file to get access to all Hunter framework components
/// @dev Version 1.0.0

/*
 * ██╗  ██╗██╗   ██╗███╗   ██╗████████╗███████╗██████╗ 
 * ██║  ██║██║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
 * ███████║██║   ██║██╔██╗ ██║   ██║   █████╗  ██████╔╝
 * ██╔══██║██║   ██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
 * ██║  ██║╚██████╔╝██║ ╚████║   ██║   ███████╗██║  ██║
 * ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
 *
 * Invariant Testing Framework
 * 
 * Usage:
 * 1. Create a Setup contract that inherits from BaseSetup
 * 2. Create a TargetFunctions contract that inherits from BaseTargetFunctions
 * 3. Create a Properties contract that inherits from Properties
 * 4. Create a HunterTester contract for Echidna/Medusa
 * 5. Create a HunterToFoundry contract for debugging
 * 
 * Run with:
 *   echidna . --contract YourTester --config echidna.yaml
 *   medusa fuzz
 *   forge test
 */

/// @title IHunterCallbacks - Callback interface for custom hooks
interface IHunterCallbacks {
    /// @notice Called before each handler execution
    function onBeforeHandler(bytes4 selector, bytes calldata data) external;

    /// @notice Called after each handler execution
    function onAfterHandler(bytes4 selector, bytes calldata data, bool success) external;

    /// @notice Called when a property fails
    function onPropertyFailed(string calldata propertyName, string calldata reason) external;
}

/// @title HunterUtils - Utility functions for invariant testing
library HunterUtils {
    /// @notice Calculate percentage with precision
    /// @param value The value
    /// @param total The total
    /// @param precision Decimal precision (e.g., 100 for 2 decimals)
    /// @return Percentage value
    function percentage(uint256 value, uint256 total, uint256 precision) internal pure returns (uint256) {
        if (total == 0) return 0;
        return (value * precision * 100) / total;
    }

    /// @notice Check if two values are approximately equal
    /// @param a First value
    /// @param b Second value
    /// @param tolerance Acceptable difference
    /// @return True if values are within tolerance
    function approxEqual(uint256 a, uint256 b, uint256 tolerance) internal pure returns (bool) {
        uint256 diff = a > b ? a - b : b - a;
        return diff <= tolerance;
    }

    /// @notice Get the minimum of two values
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @notice Get the maximum of two values
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    /// @notice Safely subtract (returns 0 if would underflow)
    function safeSub(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }

    /// @notice Calculate basis points
    /// @param value Value to calculate from
    /// @param bps Basis points (100 bps = 1%)
    /// @return Result
    function bps(uint256 value, uint256 bps_) internal pure returns (uint256) {
        return (value * bps_) / 10000;
    }

    /// @notice Check if value is within range
    function inRange(uint256 value, uint256 minVal, uint256 maxVal) internal pure returns (bool) {
        return value >= minVal && value <= maxVal;
    }

    /// @notice Generate a deterministic address from a seed
    function addressFromSeed(uint256 seed) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(seed)))));
    }

    /// @notice Bound a value to a range (for fuzzing)
    function bound(uint256 value, uint256 minVal, uint256 maxVal) internal pure returns (uint256) {
        if (minVal > maxVal) {
            (minVal, maxVal) = (maxVal, minVal);
        }
        if (maxVal == minVal) return minVal;
        return minVal + (value % (maxVal - minVal + 1));
    }
}
