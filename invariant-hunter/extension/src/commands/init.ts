/**
 * Initialize Project Command
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function initProject() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Please open a workspace folder first');
    return;
  }

  // Select template
  const template = await vscode.window.showQuickPick(
    [
      { label: 'Basic', description: 'Basic invariant testing setup' },
      { label: 'DeFi', description: 'DeFi protocol testing template' },
      { label: 'NFT', description: 'NFT contract testing template' },
    ],
    { placeHolder: 'Select a template' }
  );

  if (!template) return;

  // Select fuzzer
  const fuzzer = await vscode.window.showQuickPick(
    ['Echidna', 'Medusa', 'Foundry'],
    { placeHolder: 'Select primary fuzzer' }
  );

  if (!fuzzer) return;

  const rootPath = workspaceFolder.uri.fsPath;
  const testDir = path.join(rootPath, 'test', 'invariants');

  // Create directory structure
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Initializing Invariant Hunter...',
      cancellable: false,
    },
    async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
      progress.report({ increment: 20, message: 'Creating directories...' });

      // Create directories
      const dirs = [
        testDir,
        path.join(testDir, 'handlers'),
        path.join(testDir, 'properties'),
      ];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      progress.report({ increment: 30, message: 'Creating config files...' });

      // Create fuzzer config
      if (fuzzer === 'Echidna') {
        createEchidnaConfig(rootPath);
      } else if (fuzzer === 'Medusa') {
        createMedusaConfig(rootPath);
      }

      progress.report({ increment: 30, message: 'Creating template files...' });

      // Create template files
      createSetupFile(testDir, template.label.toLowerCase());
      createPropertiesFile(testDir, template.label.toLowerCase());
      createTesterFile(testDir, fuzzer.toLowerCase());

      progress.report({ increment: 20, message: 'Done!' });
    }
  );

  vscode.window.showInformationMessage(
    `Invariant Hunter initialized with ${template.label} template and ${fuzzer}`,
    'Open Setup'
  ).then((selection: string | undefined) => {
    if (selection === 'Open Setup') {
      const setupFile = vscode.Uri.file(path.join(testDir, 'Setup.sol'));
      vscode.window.showTextDocument(setupFile);
    }
  });
}

function createEchidnaConfig(rootPath: string) {
  const config = `# Echidna Configuration
testMode: assertion
testLimit: 50000
seqLen: 100
contractAddr: "0x0000000000000000000000000000000000001000"
deployer: "0x0000000000000000000000000000000000010000"
sender: ["0x0000000000000000000000000000000000020000", "0x0000000000000000000000000000000000030000"]
coverage: true
corpusDir: corpus
`;

  fs.writeFileSync(path.join(rootPath, 'echidna.yaml'), config);
}

function createMedusaConfig(rootPath: string) {
  const config = {
    fuzzing: {
      workers: 4,
      workerResetLimit: 50,
      timeout: 300,
      testLimit: 50000,
      callSequenceLength: 100,
      corpusDirectory: 'corpus',
      coverageEnabled: true,
    },
    compilation: {
      platform: 'crytic-compile',
      platformConfig: {
        target: '.',
        solcVersion: '',
        exportDirectory: '',
        args: [],
      },
    },
  };

  fs.writeFileSync(
    path.join(rootPath, 'medusa.json'),
    JSON.stringify(config, null, 2)
  );
}

function createSetupFile(testDir: string, template: string) {
  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BaseSetup} from "invariant-hunter/BaseSetup.sol";
// TODO: Import your contracts here

/**
 * @title Setup
 * @notice Deployment and initialization for invariant testing
 */
abstract contract Setup is BaseSetup {
    // TODO: Declare your contract instances
    // YourContract public target;

    function setup() internal virtual override {
        // TODO: Deploy your contracts
        // target = new YourContract();

        // TODO: Initialize state
        // target.initialize(...);
    }
}
`;

  fs.writeFileSync(path.join(testDir, 'Setup.sol'), content);
}

function createPropertiesFile(testDir: string, template: string) {
  let content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Properties} from "invariant-hunter/Properties.sol";
import "./Setup.sol";

/**
 * @title InvariantProperties
 * @notice Define invariants for your protocol
 */
abstract contract InvariantProperties is Setup, Properties {
`;

  if (template === 'defi') {
    content += `
    // DeFi invariants

    /// @notice Total supply should never exceed max supply
    function property_maxSupply() public view returns (bool) {
        // return token.totalSupply() <= token.maxSupply();
        return true;
    }

    /// @notice User balance should never exceed total supply
    function property_balanceConsistency() public view returns (bool) {
        // return token.balanceOf(msg.sender) <= token.totalSupply();
        return true;
    }

    /// @notice Protocol should always be solvent
    function property_solvency() public view returns (bool) {
        // return address(vault).balance >= vault.totalDeposits();
        return true;
    }
`;
  } else {
    content += `
    // Basic invariants

    /// @notice Example invariant
    function property_example() public view returns (bool) {
        // TODO: Implement your invariant
        return true;
    }
`;
  }

  content += `}
`;

  fs.writeFileSync(path.join(testDir, 'Properties.sol'), content);
}

function createTesterFile(testDir: string, fuzzer: string) {
  const importPath = fuzzer === 'foundry' 
    ? 'invariant-hunter/HunterToFoundry.sol' 
    : 'invariant-hunter/HunterTester.sol';
  
  const baseContract = fuzzer === 'foundry' ? 'HunterToFoundry' : 'HunterTester';

  const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {${baseContract}} from "${importPath}";
import "./Properties.sol";
import "./handlers/TargetFunctions.sol";

/**
 * @title Tester
 * @notice Entry point for fuzzing
 */
contract Tester is InvariantProperties, TargetFunctions, ${baseContract} {
    constructor() {
        setup();
    }
}
`;

  fs.writeFileSync(path.join(testDir, 'Tester.sol'), content);

  // Create empty handlers file
  const handlersContent = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Setup.sol";

/**
 * @title TargetFunctions
 * @notice Handler functions for fuzzing
 */
abstract contract TargetFunctions is Setup {
    // TODO: Generate handlers using 'Invariant Hunter: Generate Handlers' command
}
`;

  const handlersDir = path.join(testDir, 'handlers');
  if (!fs.existsSync(handlersDir)) {
    fs.mkdirSync(handlersDir, { recursive: true });
  }
  fs.writeFileSync(path.join(handlersDir, 'TargetFunctions.sol'), handlersContent);
}
