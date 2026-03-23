/**
 * Init Command - Initialize a new invariant testing project
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';

interface InitOptions {
  name?: string;
  template?: string;
  install?: boolean;
}

const TEMPLATES = {
  basic: {
    description: 'Basic template with minimal setup',
    contracts: ['Counter'],
  },
  defi: {
    description: 'DeFi template with lending/AMM patterns',
    contracts: ['Vault', 'Token', 'Pool'],
  },
  nft: {
    description: 'NFT template with ERC721 patterns',
    contracts: ['NFT', 'Marketplace'],
  },
};

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.bold('\n📦 Initializing Invariant Hunter Project\n'));

  // Get project name
  let projectName = options.name;
  if (!projectName) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: 'my-invariant-tests',
        validate: (input: string) => {
          if (/^[a-zA-Z0-9-_]+$/.test(input)) return true;
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        },
      },
    ]);
    projectName = answers.name;
  }

  // Get template
  let template = options.template;
  if (!template) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Select template:',
        choices: Object.entries(TEMPLATES).map(([key, value]) => ({
          name: `${key} - ${value.description}`,
          value: key,
        })),
      },
    ]);
    template = answers.template;
  }

  const projectPath = path.join(process.cwd(), projectName!);

  // Check if directory exists
  if (await fs.pathExists(projectPath)) {
    console.log(chalk.red(`\n❌ Directory ${projectName} already exists`));
    process.exit(1);
  }

  const spinner = ora('Creating project structure...').start();

  try {
    // Create directory structure
    await fs.ensureDir(projectPath);
    await fs.ensureDir(path.join(projectPath, 'src'));
    await fs.ensureDir(path.join(projectPath, 'test/hunter'));
    await fs.ensureDir(path.join(projectPath, 'lib'));
    await fs.ensureDir(path.join(projectPath, 'script'));

    spinner.text = 'Generating configuration files...';

    // Copy template files
    const templateDir = path.join(__dirname, '../../templates');

    // foundry.toml
    await fs.copy(
      path.join(templateDir, 'foundry.toml'),
      path.join(projectPath, 'foundry.toml')
    );

    // echidna.yaml
    await fs.copy(
      path.join(templateDir, 'echidna.yaml'),
      path.join(projectPath, 'echidna.yaml')
    );

    // medusa.json
    await fs.copy(
      path.join(templateDir, 'medusa.json'),
      path.join(projectPath, 'medusa.json')
    );

    spinner.text = 'Generating Solidity contracts...';

    // Generate test contracts
    await generateSetupContract(projectPath, template!);
    await generateBeforeAfterContract(projectPath);
    await generatePropertiesContract(projectPath);
    await generateTargetFunctionsContract(projectPath);
    await generateTesterContracts(projectPath);

    // Generate example contract
    await generateExampleContract(projectPath, template!);

    // Generate .gitignore
    await fs.writeFile(
      path.join(projectPath, '.gitignore'),
      `# Compiler files
cache/
out/

# Ignores development broadcast logs
broadcast/

# Docs
docs/

# Dotenv file
.env

# Corpus
corpus/

# Coverage
lcov.info
coverage/
`
    );

    // Generate README
    await generateReadme(projectPath, projectName!);

    spinner.succeed('Project structure created');

    // Install dependencies
    if (options.install !== false) {
      spinner.start('Installing dependencies...');

      await runCommand('forge', ['install', 'foundry-rs/forge-std', '--no-commit'], projectPath);
      // In a real implementation, this would install the hunter framework
      // await runCommand('forge', ['install', 'invariant-hunter/hunter', '--no-commit'], projectPath);

      spinner.succeed('Dependencies installed');
    }

    // Success message
    console.log(chalk.green('\n✅ Project created successfully!\n'));
    console.log(chalk.bold('Next steps:'));
    console.log(chalk.gray(`  cd ${projectName}`));
    console.log(chalk.gray('  # Edit test/hunter/Setup.sol to deploy your contracts'));
    console.log(chalk.gray('  # Add handlers in test/hunter/TargetFunctions.sol'));
    console.log(chalk.gray('  # Define invariants in test/hunter/Properties.sol'));
    console.log(chalk.gray('  hunter run --tool echidna'));
    console.log();

  } catch (error) {
    spinner.fail('Failed to create project');
    console.error(chalk.red(error));
    process.exit(1);
  }
}

async function generateSetupContract(projectPath: string, template: string): Promise<void> {
  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BaseSetup} from "invariant-hunter/BaseSetup.sol";
import {Counter} from "src/Counter.sol";

/// @title Setup - Deploy and initialize target contracts
abstract contract Setup is BaseSetup {
    Counter public counter;

    function setup() internal virtual override {
        // Deploy contracts
        counter = new Counter();
        
        // Initialize
        counter.setNumber(1);
        
        // Track target
        _addTargetContract(address(counter), "Counter");
    }
}
`;
  await fs.writeFile(path.join(projectPath, 'test/hunter/Setup.sol'), content);
}

async function generateBeforeAfterContract(projectPath: string): Promise<void> {
  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Setup} from "./Setup.sol";

/// @title BeforeAfter - Track state changes
abstract contract BeforeAfter is Setup {
    struct Vars {
        uint256 timestamp;
        uint256 blockNumber;
        uint256 counterNumber;
    }

    Vars internal _before;
    Vars internal _after;

    function __before() internal virtual {
        _before.timestamp = block.timestamp;
        _before.blockNumber = block.number;
        _before.counterNumber = counter.number();
    }

    function __after() internal virtual {
        _after.timestamp = block.timestamp;
        _after.blockNumber = block.number;
        _after.counterNumber = counter.number();
    }
}
`;
  await fs.writeFile(path.join(projectPath, 'test/hunter/BeforeAfter.sol'), content);
}

async function generatePropertiesContract(projectPath: string): Promise<void> {
  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BeforeAfter} from "./BeforeAfter.sol";
import {Asserts} from "invariant-hunter/Asserts.sol";

/// @title Properties - Define invariants
abstract contract Properties is BeforeAfter, Asserts {
    
    /// @notice Counter number should never be zero after initialization
    function invariant_numberNeverZero() public {
        t(counter.number() != 0, "Number is zero");
    }
    
    /// @notice Number should only increase via increment
    function invariant_incrementOnlyIncreases() public {
        // Checked via assertion in handler
    }
}
`;
  await fs.writeFile(path.join(projectPath, 'test/hunter/Properties.sol'), content);
}

async function generateTargetFunctionsContract(projectPath: string): Promise<void> {
  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BaseTargetFunctions} from "invariant-hunter/BaseSetup.sol";
import {Properties} from "./Properties.sol";

/// @title TargetFunctions - Handler functions for fuzzing
abstract contract TargetFunctions is BaseTargetFunctions, Properties {
    
    /// @notice Handler for increment
    function handler_increment() public {
        __before();
        
        counter.increment();
        
        __after();
        
        // Verify increment worked
        t(_after.counterNumber == _before.counterNumber + 1, "Increment failed");
    }
    
    /// @notice Handler for setNumber
    function handler_setNumber(uint256 newNumber) public {
        // Clamp to prevent zero (which breaks our invariant)
        newNumber = between(newNumber, 1, type(uint256).max);
        
        __before();
        
        counter.setNumber(newNumber);
        
        __after();
        
        t(_after.counterNumber == newNumber, "setNumber failed");
    }
}
`;
  await fs.writeFile(path.join(projectPath, 'test/hunter/TargetFunctions.sol'), content);
}

async function generateTesterContracts(projectPath: string): Promise<void> {
  // HunterTester for Echidna/Medusa
  const testerContent = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TargetFunctions} from "./TargetFunctions.sol";
import {CryticAsserts} from "invariant-hunter/Asserts.sol";

/// @title HunterTester - Entry point for Echidna/Medusa
/// @notice Run: echidna . --contract HunterTester --config echidna.yaml
contract HunterTester is TargetFunctions, CryticAsserts {
    constructor() payable {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }

    receive() external payable {}
}
`;
  await fs.writeFile(path.join(projectPath, 'test/hunter/HunterTester.sol'), testerContent);

  // HunterToFoundry for debugging
  const foundryContent = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {TargetFunctions} from "./TargetFunctions.sol";
import {FoundryAsserts} from "invariant-hunter/Asserts.sol";

/// @title HunterToFoundry - Debug broken properties
/// @notice Run: forge test --match-contract HunterToFoundry -vvvv
contract HunterToFoundry is Test, TargetFunctions, FoundryAsserts {
    function setUp() public {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }

    function test_hunter() public {
        // Add reproducer tests here
    }
    
    function test_basicFlow() public {
        handler_increment();
        handler_setNumber(42);
        invariant_numberNeverZero();
    }
}
`;
  await fs.writeFile(path.join(projectPath, 'test/hunter/HunterToFoundry.sol'), foundryContent);
}

async function generateExampleContract(projectPath: string, template: string): Promise<void> {
  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Counter - Example contract for invariant testing
contract Counter {
    uint256 public number;

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }
    
    function decrement() public {
        require(number > 0, "Cannot decrement below zero");
        number--;
    }
}
`;
  await fs.writeFile(path.join(projectPath, 'src/Counter.sol'), content);
}

async function generateReadme(projectPath: string, projectName: string): Promise<void> {
  const content = `# ${projectName}

Invariant testing suite powered by [Invariant Hunter](https://github.com/invariant-hunter).

## Quick Start

\`\`\`bash
# Run with Echidna
echidna . --contract HunterTester --config echidna.yaml

# Run with Medusa
medusa fuzz

# Run with Foundry
forge test --match-contract HunterToFoundry -vvvv
\`\`\`

## Project Structure

\`\`\`
├── src/                    # Source contracts
├── test/
│   └── hunter/
│       ├── Setup.sol           # Contract deployment
│       ├── BeforeAfter.sol     # State tracking
│       ├── Properties.sol      # Invariants
│       ├── TargetFunctions.sol # Handlers
│       ├── HunterTester.sol    # Echidna/Medusa entry
│       └── HunterToFoundry.sol # Foundry debugging
├── echidna.yaml           # Echidna config
├── medusa.json            # Medusa config
└── foundry.toml           # Foundry config
\`\`\`

## Writing Invariants

1. **Setup**: Deploy contracts in \`Setup.sol\`
2. **Track State**: Add ghost variables in \`BeforeAfter.sol\`
3. **Define Properties**: Write invariants in \`Properties.sol\`
4. **Add Handlers**: Create function wrappers in \`TargetFunctions.sol\`

## Resources

- [Invariant Testing Guide](https://book.getrecon.xyz/)
- [Echidna Documentation](https://secure-contracts.com/program-analysis/echidna/)
- [Medusa Documentation](https://secure-contracts.com/program-analysis/medusa/)
`;
  await fs.writeFile(path.join(projectPath, 'README.md'), content);
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'pipe' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}
