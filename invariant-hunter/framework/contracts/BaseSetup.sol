// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ActorManager.sol";

/// @title BaseSetup - Base contract for test setup
/// @notice Provides common setup functionality for invariant testing suites
/// @dev Inherit from this contract and override setup() to initialize your test environment
abstract contract BaseSetup is ActorManager {
    /// @notice Flag indicating if setup has been completed
    bool internal _setupComplete;

    /// @notice Array of target contracts for the fuzzer
    address[] internal _targetContracts;

    /// @notice Mapping of contract addresses to their names (for logging)
    mapping(address => string) internal _contractNames;

    /// @notice Event emitted when setup is complete
    event SetupComplete();

    /// @notice Event emitted when a target contract is added
    event TargetContractAdded(address indexed target, string name);

    /// @notice Modifier to ensure setup is complete before running tests
    modifier setupComplete() {
        require(_setupComplete, "Setup not complete");
        _;
    }

    /// @notice Override this function to set up your test environment
    /// @dev Called once before fuzzing begins
    function setup() internal virtual {
        // Override in child contracts
    }

    /// @notice Internal function to mark setup as complete
    function _completeSetup() internal {
        _setupComplete = true;
        emit SetupComplete();
    }

    /// @notice Add a target contract for the fuzzer to interact with
    /// @param target Address of the target contract
    /// @param name Human-readable name for logging
    function _addTargetContract(address target, string memory name) internal {
        _targetContracts.push(target);
        _contractNames[target] = name;
        emit TargetContractAdded(target, name);
    }

    /// @notice Get all target contracts
    /// @return Array of target contract addresses
    function getTargetContracts() public view returns (address[] memory) {
        return _targetContracts;
    }

    /// @notice Get the name of a target contract
    /// @param target Address of the target contract
    /// @return Name of the contract
    function getContractName(address target) public view returns (string memory) {
        return _contractNames[target];
    }

    /// @notice Check if setup is complete
    /// @return True if setup has been completed
    function isSetupComplete() public view returns (bool) {
        return _setupComplete;
    }
}

/// @title BaseTargetFunctions - Base contract for target function handlers
/// @notice Provides utilities for writing handler functions
abstract contract BaseTargetFunctions is BaseSetup {
    /// @notice Event emitted before a handler is called
    event HandlerCalled(string name, bytes data);

    /// @notice Event emitted after a handler completes
    event HandlerCompleted(string name, bool success);

    /// @notice Wrapper to log handler calls (useful for debugging)
    /// @param name Name of the handler
    modifier logHandler(string memory name) {
        emit HandlerCalled(name, msg.data);
        _;
        emit HandlerCompleted(name, true);
    }

    /// @notice Helper to safely call a function and catch reverts
    /// @param target Contract to call
    /// @param data Calldata for the function
    /// @return success Whether the call succeeded
    /// @return returnData The return data from the call
    function _safeCall(address target, bytes memory data) internal returns (bool success, bytes memory returnData) {
        (success, returnData) = target.call(data);
    }

    /// @notice Helper to safely call a function with value
    /// @param target Contract to call
    /// @param value ETH value to send
    /// @param data Calldata for the function
    /// @return success Whether the call succeeded
    /// @return returnData The return data from the call
    function _safeCallWithValue(address target, uint256 value, bytes memory data) internal returns (bool success, bytes memory returnData) {
        (success, returnData) = target.call{value: value}(data);
    }
}
