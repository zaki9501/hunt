# Invariant Hunter

A comprehensive smart contract invariant testing platform inspired by [Recon](https://getrecon.xyz). Build, test, and debug invariant properties for your Solidity smart contracts using industry-leading fuzzers.

## Features

- **Hunter Framework** - Modular Solidity testing framework (like Chimera)
- **Multi-Fuzzer Support** - Echidna, Medusa, Foundry, Halmos, Kontrol
- **Log Scrapers** - Convert fuzzer output to Foundry reproducers
- **CLI Tool** - Initialize, scaffold, run, and scrape from command line
- **Web Dashboard** - Real-time job monitoring and management
- **Cloud Execution** - Run long fuzzing campaigns in the cloud
- **VS Code Extension** - Generate handlers and run fuzzers from your IDE

## Quick Start

### 1. Install the CLI

```bash
npm install -g @invariant-hunter/cli
```

### 2. Initialize Your Project

```bash
cd your-solidity-project
invariant-hunter init
```

### 3. Generate Handlers

```bash
invariant-hunter scaffold --contract MyContract
```

### 4. Run Fuzzer

```bash
invariant-hunter run --fuzzer echidna
```

## Project Structure

```
invariant-hunter/
├── framework/          # Solidity testing framework
│   └── contracts/      # Base contracts (Asserts, Properties, etc.)
├── cli/                # Command-line interface
├── web/
│   ├── backend/        # Express.js API server
│   └── frontend/       # Next.js dashboard
├── cloud/              # Docker-based cloud worker
├── extension/          # VS Code extension
└── tools/              # Python scrapers and utilities
```

## Framework Contracts

### BaseSetup

Base contract for test deployment and initialization:

```solidity
import {BaseSetup} from "invariant-hunter/BaseSetup.sol";

contract Setup is BaseSetup {
    MyContract target;

    function setup() internal override {
        target = new MyContract();
        target.initialize(msg.sender);
    }
}
```

### Properties

Define invariant properties:

```solidity
import {Properties} from "invariant-hunter/Properties.sol";

contract MyProperties is Properties {
    function property_totalSupply() public view returns (bool) {
        return token.totalSupply() <= MAX_SUPPLY;
    }
}
```

### Asserts

Assertion helpers compatible with all fuzzers:

```solidity
import {Asserts} from "invariant-hunter/Asserts.sol";

contract Tests is Asserts {
    function test_balance() public {
        gt(balance, 0, "Balance should be positive");
        lte(balance, maxBalance, "Balance exceeds max");
    }
}
```

### ActorManager

Multi-actor testing:

```solidity
import {ActorManager} from "invariant-hunter/ActorManager.sol";

contract Tests is ActorManager {
    function handler_deposit(uint256 amount) public useActor {
        vault.deposit{value: amount}();
    }
}
```

### BeforeAfter

State tracking with hooks:

```solidity
import {BeforeAfter} from "invariant-hunter/BeforeAfter.sol";

contract Tests is BeforeAfter {
    function handler_transfer(address to, uint256 amount) public {
        __before();
        token.transfer(to, amount);
        __after();
        
        // Assert state changes
        eq(
            _after.senderBalance,
            _before.senderBalance - amount,
            "Incorrect sender balance"
        );
    }
}
```

## CLI Commands

### Initialize Project

```bash
invariant-hunter init [--template basic|defi|nft] [--fuzzer echidna|medusa|foundry]
```

### Generate Handlers

```bash
invariant-hunter scaffold --contract <ContractName> [--abi <path>]
```

### Run Fuzzer

```bash
invariant-hunter run --fuzzer <fuzzer> [--duration <seconds>] [--config <path>]
```

### Scrape Logs

```bash
invariant-hunter scrape --type <echidna|medusa> --input <log-file> --output <output-dir>
```

### Cloud Execution

```bash
invariant-hunter cloud login
invariant-hunter cloud run --fuzzer echidna --duration 3600
invariant-hunter cloud status <job-id>
invariant-hunter cloud logs <job-id>
```

## Web Dashboard

Start the backend:

```bash
cd invariant-hunter/web/backend
npm install
npm run dev
```

Start the frontend:

```bash
cd web/frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### Features

- Create and manage fuzzing jobs
- Real-time log streaming
- Automatic reproducer generation
- Handler generation from ABI
- Bytecode comparison tool

## Cloud Worker

Deploy the cloud worker with Docker:

```bash
cd cloud
docker build -t invariant-hunter-worker .
docker run -d \
  -e REDIS_HOST=your-redis-host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  invariant-hunter-worker
```

## VS Code Extension

Install from the marketplace or build locally:

```bash
cd extension
npm install
npm run compile
npm run package
```

### Commands

- **Invariant Hunter: Initialize Project** - Set up testing framework
- **Invariant Hunter: Generate Handlers** - Generate handlers from contract
- **Invariant Hunter: Run Fuzzer** - Execute selected fuzzer
- **Invariant Hunter: Scrape Logs** - Convert logs to reproducers
- **Invariant Hunter: Run on Cloud** - Submit cloud job

## Configuration

### Echidna (echidna.yaml)

```yaml
testMode: assertion
testLimit: 50000
seqLen: 100
coverage: true
corpusDir: corpus
```

### Medusa (medusa.json)

```json
{
  "fuzzing": {
    "workers": 4,
    "timeout": 300,
    "testLimit": 50000,
    "corpusDirectory": "corpus"
  }
}
```

### Foundry (foundry.toml)

```toml
[fuzz]
runs = 10000
max_test_rejects = 65536

[invariant]
runs = 256
depth = 500
```

## Supported Fuzzers

| Fuzzer | Install | Documentation |
|--------|---------|---------------|
| Echidna | `pip install echidna` | [crytic/echidna](https://github.com/crytic/echidna) |
| Medusa | `pip install medusa` | [crytic/medusa](https://github.com/crytic/medusa) |
| Foundry | `curl -L https://foundry.paradigm.xyz \| bash` | [foundry-rs/foundry](https://github.com/foundry-rs/foundry) |
| Halmos | `pip install halmos` | [a16z/halmos](https://github.com/a16z/halmos) |
| Kontrol | See docs | [runtimeverification/kontrol](https://github.com/runtimeverification/kontrol) |

## Examples

### DeFi Vault Testing

```solidity
contract VaultProperties is Properties, BeforeAfter {
    Vault vault;

    function property_solvency() public view returns (bool) {
        return address(vault).balance >= vault.totalDeposits();
    }

    function property_sharePrice() public view returns (bool) {
        if (vault.totalSupply() == 0) return true;
        return vault.sharePrice() >= 1e18;
    }

    function handler_deposit(uint256 amount) public useActor {
        __before();
        vault.deposit{value: amount}();
        __after();
        
        eq(
            _after.totalDeposits,
            _before.totalDeposits + amount,
            "Deposit not recorded"
        );
    }
}
```

### ERC20 Testing

```solidity
contract ERC20Properties is Properties {
    ERC20 token;

    function property_totalSupply() public view returns (bool) {
        return token.totalSupply() <= MAX_SUPPLY;
    }

    function property_balanceSum() public view returns (bool) {
        uint256 sum;
        for (uint i = 0; i < actors.length; i++) {
            sum += token.balanceOf(actors[i]);
        }
        return sum == token.totalSupply();
    }
}
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgements

Built with inspiration from:
- [Recon](https://getrecon.xyz) - The original invariant testing platform
- [Chimera](https://github.com/crytic/chimera) - Solidity testing framework
- [Echidna](https://github.com/crytic/echidna) - Ethereum smart contract fuzzer
- [Medusa](https://github.com/crytic/medusa) - Cross-platform smart contract fuzzer
- [Foundry](https://github.com/foundry-rs/foundry) - Ethereum development toolkit
