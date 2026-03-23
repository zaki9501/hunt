// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Asserts - Assertion library for invariant testing
/// @notice Provides assertion functions compatible with Echidna, Medusa, and Foundry
/// @dev Base contract that CryticAsserts and FoundryAsserts inherit from
abstract contract Asserts {
    /// @notice Event emitted when an assertion fails
    event AssertionFailed(string reason);

    /// @notice Assert that a > b
    /// @param a First value
    /// @param b Second value
    /// @param reason Error message if assertion fails
    function gt(uint256 a, uint256 b, string memory reason) internal virtual;

    /// @notice Assert that a >= b
    /// @param a First value
    /// @param b Second value
    /// @param reason Error message if assertion fails
    function gte(uint256 a, uint256 b, string memory reason) internal virtual;

    /// @notice Assert that a < b
    /// @param a First value
    /// @param b Second value
    /// @param reason Error message if assertion fails
    function lt(uint256 a, uint256 b, string memory reason) internal virtual;

    /// @notice Assert that a <= b
    /// @param a First value
    /// @param b Second value
    /// @param reason Error message if assertion fails
    function lte(uint256 a, uint256 b, string memory reason) internal virtual;

    /// @notice Assert that a == b
    /// @param a First value
    /// @param b Second value
    /// @param reason Error message if assertion fails
    function eq(uint256 a, uint256 b, string memory reason) internal virtual;

    /// @notice Assert that a != b
    /// @param a First value
    /// @param b Second value
    /// @param reason Error message if assertion fails
    function neq(uint256 a, uint256 b, string memory reason) internal virtual;

    /// @notice Assert that condition is true
    /// @param b Boolean condition
    /// @param reason Error message if assertion fails
    function t(bool b, string memory reason) internal virtual;

    /// @notice Assert that condition is false
    /// @param b Boolean condition
    /// @param reason Error message if assertion fails
    function f(bool b, string memory reason) internal virtual;

    /// @notice Clamp value between low and high (uint256)
    /// @param value Value to clamp
    /// @param low Lower bound (inclusive)
    /// @param high Upper bound (inclusive)
    /// @return Clamped value
    function between(uint256 value, uint256 low, uint256 high) internal virtual returns (uint256);

    /// @notice Clamp value between low and high (int256)
    /// @param value Value to clamp
    /// @param low Lower bound (inclusive)
    /// @param high Upper bound (inclusive)
    /// @return Clamped value
    function between(int256 value, int256 low, int256 high) internal virtual returns (int256);

    /// @notice Skip test if precondition is not met
    /// @param p Precondition that must be true
    function precondition(bool p) internal virtual;
}

/// @title CryticAsserts - Assertions for Echidna and Medusa
/// @notice Implements assertions using Crytic-style failure detection
contract CryticAsserts is Asserts {
    /// @notice Internal flag to track if any assertion has failed
    bool private _assertionFailed;

    /// @notice Check if any assertion has failed (called by fuzzer)
    function echidna_assertion_failed() public view returns (bool) {
        return !_assertionFailed;
    }

    function gt(uint256 a, uint256 b, string memory reason) internal override {
        if (!(a > b)) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function gte(uint256 a, uint256 b, string memory reason) internal override {
        if (!(a >= b)) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function lt(uint256 a, uint256 b, string memory reason) internal override {
        if (!(a < b)) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function lte(uint256 a, uint256 b, string memory reason) internal override {
        if (!(a <= b)) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function eq(uint256 a, uint256 b, string memory reason) internal override {
        if (!(a == b)) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function neq(uint256 a, uint256 b, string memory reason) internal override {
        if (!(a != b)) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function t(bool b, string memory reason) internal override {
        if (!b) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function f(bool b, string memory reason) internal override {
        if (b) {
            emit AssertionFailed(reason);
            _assertionFailed = true;
            assert(false);
        }
    }

    function between(uint256 value, uint256 low, uint256 high) internal pure override returns (uint256) {
        if (low > high) {
            uint256 temp = low;
            low = high;
            high = temp;
        }
        return low + (value % (high - low + 1));
    }

    function between(int256 value, int256 low, int256 high) internal pure override returns (int256) {
        if (low > high) {
            int256 temp = low;
            low = high;
            high = temp;
        }
        uint256 range = uint256(high - low + 1);
        uint256 bounded = uint256(value >= 0 ? value : -value) % range;
        return low + int256(bounded);
    }

    function precondition(bool p) internal pure override {
        require(p);
    }
}

/// @title FoundryAsserts - Assertions for Foundry testing
/// @notice Implements assertions using Foundry's vm.assume and require
contract FoundryAsserts is Asserts {
    function gt(uint256 a, uint256 b, string memory reason) internal pure override {
        require(a > b, reason);
    }

    function gte(uint256 a, uint256 b, string memory reason) internal pure override {
        require(a >= b, reason);
    }

    function lt(uint256 a, uint256 b, string memory reason) internal pure override {
        require(a < b, reason);
    }

    function lte(uint256 a, uint256 b, string memory reason) internal pure override {
        require(a <= b, reason);
    }

    function eq(uint256 a, uint256 b, string memory reason) internal pure override {
        require(a == b, reason);
    }

    function neq(uint256 a, uint256 b, string memory reason) internal pure override {
        require(a != b, reason);
    }

    function t(bool b, string memory reason) internal pure override {
        require(b, reason);
    }

    function f(bool b, string memory reason) internal pure override {
        require(!b, reason);
    }

    function between(uint256 value, uint256 low, uint256 high) internal pure override returns (uint256) {
        if (low > high) {
            uint256 temp = low;
            low = high;
            high = temp;
        }
        return low + (value % (high - low + 1));
    }

    function between(int256 value, int256 low, int256 high) internal pure override returns (int256) {
        if (low > high) {
            int256 temp = low;
            low = high;
            high = temp;
        }
        uint256 range = uint256(high - low + 1);
        uint256 bounded = uint256(value >= 0 ? value : -value) % range;
        return low + int256(bounded);
    }

    function precondition(bool p) internal pure override {
        require(p, "Precondition failed");
    }
}
