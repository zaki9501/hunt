// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title ActorManager - Manages multiple actors for invariant testing
/// @notice Allows tests to simulate multiple users interacting with contracts
/// @dev Provides actor switching and tracking functionality
abstract contract ActorManager {
    /// @notice Array of actor addresses
    address[] internal _actors;

    /// @notice Index of the currently active actor
    uint256 internal _currentActorIndex;

    /// @notice Mapping of actor addresses to their names
    mapping(address => string) internal _actorNames;

    /// @notice Mapping to check if an address is a registered actor
    mapping(address => bool) internal _isActor;

    /// @notice Event emitted when an actor is added
    event ActorAdded(address indexed actor, string name);

    /// @notice Event emitted when the active actor changes
    event ActorSwitched(address indexed from, address indexed to);

    /// @notice Default actors that can be used in tests
    address internal constant ACTOR_ADMIN = address(0x1000);
    address internal constant ACTOR_USER1 = address(0x2000);
    address internal constant ACTOR_USER2 = address(0x3000);
    address internal constant ACTOR_USER3 = address(0x4000);
    address internal constant ACTOR_ATTACKER = address(0x5000);

    /// @notice Initialize default actors
    function _initializeDefaultActors() internal {
        _addActor(ACTOR_ADMIN, "Admin");
        _addActor(ACTOR_USER1, "User1");
        _addActor(ACTOR_USER2, "User2");
        _addActor(ACTOR_USER3, "User3");
        _addActor(ACTOR_ATTACKER, "Attacker");
    }

    /// @notice Add a new actor
    /// @param actor Address of the actor
    /// @param name Human-readable name for the actor
    function _addActor(address actor, string memory name) internal {
        require(!_isActor[actor], "Actor already exists");
        _actors.push(actor);
        _actorNames[actor] = name;
        _isActor[actor] = true;
        emit ActorAdded(actor, name);
    }

    /// @notice Switch to a different actor based on a fuzzed index
    /// @param actorIndexSeed Fuzzed value used to select an actor
    function switchActor(uint256 actorIndexSeed) public {
        require(_actors.length > 0, "No actors registered");
        uint256 newIndex = actorIndexSeed % _actors.length;
        address from = _actors.length > 0 ? _actors[_currentActorIndex] : address(0);
        address to = _actors[newIndex];
        _currentActorIndex = newIndex;
        emit ActorSwitched(from, to);
    }

    /// @notice Get the current actor address
    /// @return Address of the current actor
    function currentActor() public view returns (address) {
        require(_actors.length > 0, "No actors registered");
        return _actors[_currentActorIndex];
    }

    /// @notice Get all registered actors
    /// @return Array of actor addresses
    function getActors() public view returns (address[] memory) {
        return _actors;
    }

    /// @notice Get the name of an actor
    /// @param actor Address of the actor
    /// @return Name of the actor
    function getActorName(address actor) public view returns (string memory) {
        return _actorNames[actor];
    }

    /// @notice Get the number of registered actors
    /// @return Number of actors
    function getActorCount() public view returns (uint256) {
        return _actors.length;
    }

    /// @notice Check if an address is a registered actor
    /// @param actor Address to check
    /// @return True if the address is a registered actor
    function isRegisteredActor(address actor) public view returns (bool) {
        return _isActor[actor];
    }

    /// @notice Modifier to execute function as current actor
    modifier asCurrentActor() {
        // In actual implementation, this would use vm.prank in Foundry
        // or similar mechanism for other fuzzers
        _;
    }

    /// @notice Modifier to execute function as a specific actor
    /// @param actor Address of the actor to impersonate
    modifier asActor(address actor) {
        require(_isActor[actor], "Not a registered actor");
        _;
    }
}
