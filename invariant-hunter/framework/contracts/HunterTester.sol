// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Properties.sol";
import "./Asserts.sol";

/// @title HunterTester - Entry point for Echidna and Medusa fuzzers
/// @notice This contract serves as the main entry point for invariant testing
/// @dev Inherit from this in your CryticTester contract
abstract contract HunterTester is Properties, CryticAsserts {
    /// @notice Flag to enable/disable verbose logging
    bool public verboseMode;

    /// @notice Counter for total function calls
    uint256 public totalCalls;

    /// @notice Counter for failed assertions
    uint256 public failedAssertions;

    /// @notice Mapping of function selectors to call counts
    mapping(bytes4 => uint256) public functionCallCounts;

    /// @notice Event emitted on each handler call
    event HandlerExecuted(bytes4 indexed selector, address caller, uint256 callNumber);

    /// @notice Constructor that runs setup
    constructor() payable {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }

    /// @notice Modifier to track function calls
    modifier trackCall() {
        totalCalls++;
        functionCallCounts[msg.sig]++;
        emit HandlerExecuted(msg.sig, msg.sender, totalCalls);
        _;
    }

    /// @notice Enable verbose logging mode
    function enableVerboseMode() public {
        verboseMode = true;
    }

    /// @notice Disable verbose logging mode
    function disableVerboseMode() public {
        verboseMode = false;
    }

    /// @notice Get call count for a specific function
    /// @param selector Function selector
    /// @return Number of times the function was called
    function getCallCount(bytes4 selector) public view returns (uint256) {
        return functionCallCounts[selector];
    }

    /// @notice Get total number of calls made
    /// @return Total call count
    function getTotalCalls() public view returns (uint256) {
        return totalCalls;
    }

    /// @notice Helper to receive ETH
    receive() external payable {}

    /// @notice Fallback function
    fallback() external payable {}
}

/// @title HunterToFoundry - Debug broken properties in Foundry
/// @notice Convert fuzzer-discovered issues into reproducible Foundry tests
/// @dev Use the log scraper tool to generate test cases for this contract
abstract contract HunterToFoundry is Properties, FoundryAsserts {
    /// @notice Reference to the vm cheatcode interface
    /// @dev This gets set by Foundry's test runner
    address internal constant VM_ADDRESS = 0x7109709ECfa91a80626fF3989D68f67F5b1DD12D;

    /// @notice Flag indicating if we're in debug mode
    bool public debugMode;

    /// @notice Store call sequences for replay
    struct CallSequence {
        address target;
        bytes data;
        uint256 value;
        address caller;
    }

    /// @notice Array of call sequences to replay
    CallSequence[] internal _callSequence;

    /// @notice Event for debugging
    event DebugLog(string message, uint256 value);
    event DebugLogAddress(string message, address value);
    event DebugLogBytes(string message, bytes value);

    /// @notice Set up the test environment
    /// @dev Called by Foundry before each test
    function setUp() public virtual {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }

    /// @notice Add a call to the sequence for replay
    /// @param target Target contract
    /// @param data Calldata
    /// @param value ETH value
    /// @param caller Caller address
    function _addCall(address target, bytes memory data, uint256 value, address caller) internal {
        _callSequence.push(CallSequence({
            target: target,
            data: data,
            value: value,
            caller: caller
        }));
    }

    /// @notice Replay all stored calls
    function _replayCalls() internal {
        for (uint256 i = 0; i < _callSequence.length; i++) {
            CallSequence memory call = _callSequence[i];
            // In actual Foundry test, use vm.prank(call.caller)
            (bool success,) = call.target.call{value: call.value}(call.data);
            if (debugMode) {
                emit DebugLog("Call success", success ? 1 : 0);
            }
        }
    }

    /// @notice Clear stored call sequence
    function _clearCalls() internal {
        delete _callSequence;
    }

    /// @notice Enable debug mode for verbose output
    function _enableDebug() internal {
        debugMode = true;
    }

    /// @notice Log a debug message
    /// @param message Message to log
    function _debug(string memory message) internal {
        if (debugMode) {
            emit DebugLog(message, 0);
        }
    }

    /// @notice Log a debug message with value
    /// @param message Message to log
    /// @param value Value to log
    function _debug(string memory message, uint256 value) internal {
        if (debugMode) {
            emit DebugLog(message, value);
        }
    }

    /// @notice Log a debug message with address
    /// @param message Message to log
    /// @param value Address to log
    function _debug(string memory message, address value) internal {
        if (debugMode) {
            emit DebugLogAddress(message, value);
        }
    }

    /// @notice Template test function - override with actual reproducer
    function test_hunter() public virtual {
        // TODO: Add failing property tests here for debugging
        // Example:
        // vm.prank(ACTOR_USER1);
        // target.deposit(100);
        // vm.prank(ACTOR_USER2);
        // target.withdraw(50);
        // invariant_check();
    }
}
