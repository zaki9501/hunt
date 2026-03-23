/**
 * Run Fuzzer Command
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function runFuzzer() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Please open a workspace folder first');
    return;
  }

  const rootPath = workspaceFolder.uri.fsPath;

  // Detect available fuzzers
  const fuzzers: string[] = [];
  
  if (fs.existsSync(path.join(rootPath, 'echidna.yaml'))) {
    fuzzers.push('Echidna');
  }
  if (fs.existsSync(path.join(rootPath, 'medusa.json'))) {
    fuzzers.push('Medusa');
  }
  if (fs.existsSync(path.join(rootPath, 'foundry.toml'))) {
    fuzzers.push('Foundry');
  }

  if (fuzzers.length === 0) {
    const init = await vscode.window.showErrorMessage(
      'No fuzzer configuration found. Would you like to initialize?',
      'Initialize'
    );
    if (init === 'Initialize') {
      vscode.commands.executeCommand('invariantHunter.init');
    }
    return;
  }

  // Select fuzzer
  const config = vscode.workspace.getConfiguration('invariantHunter');
  const defaultFuzzer = config.get<string>('defaultFuzzer', 'echidna');
  
  let selectedFuzzer = fuzzers.length === 1 ? fuzzers[0] : await vscode.window.showQuickPick(
    fuzzers,
    { 
      placeHolder: 'Select fuzzer to run',
      // Pre-select default if available
    }
  );

  if (!selectedFuzzer) return;

  // Get contract/test file
  let contractPath = '';
  
  if (selectedFuzzer === 'Foundry') {
    const testFiles = await vscode.workspace.findFiles('test/**/*.t.sol', '**/node_modules/**');
    if (testFiles.length === 0) {
      vscode.window.showErrorMessage('No test files found');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      testFiles.map((f: vscode.Uri) => ({
        label: path.basename(f.fsPath),
        description: vscode.workspace.asRelativePath(f),
        uri: f,
      })),
      { placeHolder: 'Select test file' }
    );

    if (!selected) return;
    contractPath = selected.uri.fsPath;
  }

  // Build command
  const command = buildFuzzerCommand(selectedFuzzer, rootPath, contractPath);

  // Create terminal and run
  const terminal = vscode.window.createTerminal({
    name: `Invariant Hunter - ${selectedFuzzer}`,
    cwd: rootPath,
  });

  terminal.show();
  terminal.sendText(command);

  // Show output panel
  vscode.window.showInformationMessage(
    `Running ${selectedFuzzer}...`,
    'Stop'
  ).then((action: string | undefined) => {
    if (action === 'Stop') {
      terminal.sendText('\x03'); // Ctrl+C
    }
  });
}

function buildFuzzerCommand(fuzzer: string, rootPath: string, contractPath: string): string {
  switch (fuzzer) {
    case 'Echidna':
      return 'echidna . --config echidna.yaml';

    case 'Medusa':
      return 'medusa fuzz --config medusa.json';

    case 'Foundry':
      const testContract = path.basename(contractPath, '.t.sol');
      return `forge test --match-contract ${testContract} -vvv`;

    default:
      return '';
  }
}
