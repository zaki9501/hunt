/**
 * Log Scraper Command
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function scrapeLogs() {
  // Get logs from clipboard or selection
  const editor = vscode.window.activeTextEditor;
  let logs = '';

  if (editor && editor.selection && !editor.selection.isEmpty) {
    logs = editor.document.getText(editor.selection);
  } else {
    logs = await vscode.env.clipboard.readText();
  }

  if (!logs) {
    vscode.window.showErrorMessage('No logs found. Copy logs to clipboard or select them in editor.');
    return;
  }

  // Detect fuzzer type
  let fuzzerType: string | undefined;
  
  if (logs.includes('echidna') || logs.includes('Seed:')) {
    fuzzerType = 'echidna';
  } else if (logs.includes('medusa') || logs.includes('[FAILED]')) {
    fuzzerType = 'medusa';
  } else {
    fuzzerType = await vscode.window.showQuickPick(
      ['Echidna', 'Medusa'],
      { placeHolder: 'Select fuzzer type' }
    );
  }

  if (!fuzzerType) return;
  fuzzerType = fuzzerType.toLowerCase();

  // Parse logs
  const failedProperties = parseFailedProperties(logs, fuzzerType);

  if (failedProperties.length === 0) {
    vscode.window.showInformationMessage('No failed properties found in logs');
    return;
  }

  // Generate reproducers
  const reproducers = generateReproducers(failedProperties);

  // Show results
  const doc = await vscode.workspace.openTextDocument({
    language: 'solidity',
    content: reproducers,
  });

  await vscode.window.showTextDocument(doc, { preview: true });

  const action = await vscode.window.showInformationMessage(
    `Generated ${failedProperties.length} reproducer(s)`,
    'Save to File',
    'Copy to Clipboard'
  );

  if (action === 'Save to File') {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const defaultPath = path.join(
        workspaceFolder.uri.fsPath,
        'test',
        'reproducers',
        'Reproducers.t.sol'
      );

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPath),
        filters: { Solidity: ['sol'] },
      });

      if (saveUri) {
        const dir = path.dirname(saveUri.fsPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(saveUri.fsPath, reproducers);
        vscode.window.showInformationMessage(`Saved to ${saveUri.fsPath}`);
      }
    }
  } else if (action === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(reproducers);
    vscode.window.showInformationMessage('Copied to clipboard');
  }
}

interface FailedProperty {
  name: string;
  reason: string;
  callSequence: string[];
}

function parseFailedProperties(logs: string, fuzzerType: string): FailedProperty[] {
  const properties: FailedProperty[] = [];
  const lines = logs.split('\n');

  if (fuzzerType === 'echidna') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match failed property
      const failMatch = line.match(/(\w+):\s*(?:FAILED|falsified)/i);
      if (failMatch) {
        const prop: FailedProperty = {
          name: failMatch[1],
          reason: 'Property falsified',
          callSequence: [],
        };

        // Extract call sequence
        for (let j = i + 1; j < lines.length; j++) {
          const seqLine = lines[j].trim();
          if (seqLine.startsWith('*') || seqLine.match(/^\d+\./)) {
            prop.callSequence.push(seqLine.replace(/^\*\s*/, '').replace(/^\d+\.\s*/, ''));
          } else if (seqLine === '' && prop.callSequence.length > 0) {
            break;
          }
        }

        properties.push(prop);
      }
    }
  } else if (fuzzerType === 'medusa') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const failMatch = line.match(/\[FAILED\]\s*(\w+)/);
      if (failMatch) {
        const prop: FailedProperty = {
          name: failMatch[1],
          reason: 'Property failed',
          callSequence: [],
        };

        // Look for call sequence in following lines
        for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
          const seqLine = lines[j].trim();
          if (seqLine.includes('Call sequence') || seqLine.includes('Shrunk')) {
            // Parse calls
            for (let k = j + 1; k < Math.min(j + 30, lines.length); k++) {
              const callLine = lines[k].trim();
              if (callLine.match(/^\d+\./) || callLine.match(/^-/)) {
                prop.callSequence.push(callLine.replace(/^\d+\.\s*/, '').replace(/^-\s*/, ''));
              } else if (callLine === '' && prop.callSequence.length > 0) {
                break;
              }
            }
            break;
          }
        }

        properties.push(prop);
      }
    }
  }

  return properties;
}

function generateReproducers(properties: FailedProperty[]): string {
  const tests = properties.map((prop, i) => {
    const calls = prop.callSequence.map(call => `        ${call};`).join('\n');

    return `    /// @notice Reproducer for: ${prop.name}
    /// @dev ${prop.reason}
    function test_reproducer_${prop.name}() public {
${calls || '        // Call sequence not extracted'}
    }`;
  }).join('\n\n');

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
// TODO: Import your contracts and setup

/**
 * @title Reproducers
 * @notice Foundry tests to reproduce failed invariants
 * @dev Generated by Invariant Hunter
 */
contract Reproducers is Test {
    // TODO: Declare your contracts
    // YourContract target;

    function setUp() public {
        // TODO: Deploy and setup contracts
    }

${tests}
}
`;
}
