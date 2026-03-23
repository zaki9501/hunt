# Hunter Framework

A modular Solidity testing framework for invariant and property-based testing. Compatible with Echidna, Medusa, Foundry, Halmos, and Kontrol.

## Installation

### Using Foundry

```bash
forge install your-org/invariant-hunter
```

Add to `remappings.txt`:

```
invariant-hunter/=lib/invariant-hunter/framework/contracts/
```

### Using npm

```bash
npm install @invariant-hunter/framework
```

## Contracts

### Hunter.sol

Main entry point that re-exports all framework contracts:

```solidity
import {Hunter} from "invariant-hunter/Hunter.sol";

contract MyTest is Hunter {
    // Inherits: Asserts, Properties, ActorManager, BeforeAfter, BaseSetup
}
```

### Asserts.sol

Assertion library with cross-fuzzer compatibility:

| Function | Description |
|----------|-------------|
| `gt(a, b, msg)` | Assert `a > b` |
| `gte(a, b, msg)` | Assert `a >= b` |
| `lt(a, b, msg)` | Assert `a < b` |
| `lte(a, b, msg)` | Assert `a <= b` |
| `eq(a, b, msg)` | Assert `a == b` |
| `neq(a, b, msg)` | Assert `a != b` |
| `t(cond, msg)` | Assert `cond` is true |
| `f(cond, msg)` | Assert `cond` is false |
| `between(x, min, max, msg)` | Assert `min <= x <= max` |
| `precondition(cond)` | Skip test if `cond` is false |

### Properties.sol

Base contract for defining invariants:

```solidity
contract MyProperties is Properties {
    // Properties return bool - true means passing
    function property_example() public view returns (bool) {
        return someCondition;
    }

    // Invariants are also supported
    function invariant_example() public view returns (bool) {
        return anotherCondition;
    }
}
```

Includes common property patterns:
- `CommonProperties` - Basic property templates
- `DeFiProperties` - Lending, AMM, vault invariants

### ActorManager.sol

Multi-actor testing support:

```solidity
contract MyTest is ActorManager {
    function handler_action(uint256 amount) public useActor {
        // msg.sender is automatically switched to current actor
        target.action(amount);
    }

    function handler_adminAction() public asActor(ADMIN) {
        // Execute as admin
        target.adminOnly();
    }
}
```

Default actors:
- `ADMIN` - 0x10000
- `USER1` - 0x20000
- `USER2` - 0x30000
- `USER3` - 0x40000
- `ATTACKER` - 0x50000

### BeforeAfter.sol

State tracking with before/after hooks:

```solidity
contract MyTest is BeforeAfter {
    struct Vars {
        uint256 balance;
        uint256 totalSupply;
    }

    function handler_transfer(address to, uint256 amount) public {
        __before();  // Captures state
        token.transfer(to, amount);
        __after();   // Captures state again

        // Compare states
        eq(
            _after.balance,
            _before.balance - amount,
            "Balance mismatch"
        );
    }
}
```

Includes `BeforeAfterWithAccounting` for DeFi protocols.

### BaseSetup.sol

Test deployment and configuration:

```solidity
contract MySetup is BaseSetup {
    MyContract target;

    function setup() internal override {
        target = new MyContract();
        target.initialize(address(this));
        
        // Add as target for fuzzing
        _addTarget(address(target));
    }
}
```

### HunterTester.sol

Entry points for different fuzzers:

```solidity
// For Echidna/Medusa
contract Tester is MyProperties, TargetFunctions, HunterTester {
    constructor() {
        setup();
    }
}

// For Foundry debugging
contract TesterFoundry is MyProperties, TargetFunctions, HunterToFoundry {
    function setUp() public {
        setup();
    }
}
```

## Usage Patterns

### Basic Setup

```solidity
// 1. Setup.sol - Deploy contracts
abstract contract Setup is BaseSetup {
    Token token;
    
    function setup() internal override {
        token = new Token();
        token.mint(address(this), 1000000e18);
    }
}

// 2. Properties.sol - Define invariants
abstract contract TokenProperties is Setup, Properties {
    function property_totalSupply() public view returns (bool) {
        return token.totalSupply() <= MAX_SUPPLY;
    }
}

// 3. TargetFunctions.sol - Handler functions
abstract contract TargetFunctions is Setup {
    function handler_transfer(address to, uint256 amount) public {
        amount = bound(amount, 0, token.balanceOf(address(this)));
        token.transfer(to, amount);
    }
}

// 4. Tester.sol - Entry point
contract Tester is TokenProperties, TargetFunctions, HunterTester {
    constructor() { setup(); }
}
```

### DeFi Protocol Testing

```solidity
abstract contract VaultProperties is Setup, DeFiProperties {
    function property_vaultSolvency() public view returns (bool) {
        return vault_solvency(address(vault));
    }

    function property_sharePrice() public view returns (bool) {
        return vault_sharePriceNonDecreasing(
            address(vault),
            _before.sharePrice,
            _after.sharePrice
        );
    }
}
```

### Multi-Actor Testing

```solidity
abstract contract MultiActorTest is Setup, ActorManager {
    function handler_userDeposit(uint256 amount) public useActor {
        vault.deposit{value: amount}();
    }

    function handler_adminPause() public asActor(ADMIN) {
        vault.pause();
    }

    function handler_attackerExploit() public asActor(ATTACKER) {
        // Test attack scenarios
    }
}
```

## Best Practices

1. **Separate concerns** - Split setup, properties, and handlers into different files
2. **Use bound()** - Always bound numeric inputs to valid ranges
3. **Track state** - Use BeforeAfter for complex state transitions
4. **Test actors** - Use ActorManager for multi-user scenarios
5. **Start simple** - Begin with basic properties, add complexity gradually

## Compatibility

| Fuzzer | Support | Notes |
|--------|---------|-------|
| Echidna | Full | Use `HunterTester` |
| Medusa | Full | Use `HunterTester` |
| Foundry | Full | Use `HunterToFoundry` for debugging |
| Halmos | Partial | Symbolic execution support |
| Kontrol | Partial | K framework support |

## License

MIT
