/**
 * Generate Handlers Command
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface FunctionDef {
  name: string;
  inputs: Array<{ name: string; type: string }>;
  stateMutability: string;
}

interface FunctionQuickPickItem extends vscode.QuickPickItem {
  func: FunctionDef;
}

export async function generateHandlers(uri?: vscode.Uri) {
  // Get file from context or active editor
  let filePath: string | undefined;
  
  if (uri) {
    filePath = uri.fsPath;
  } else if (vscode.window.activeTextEditor) {
    filePath = vscode.window.activeTextEditor.document.uri.fsPath;
  }

  if (!filePath || !filePath.endsWith('.sol')) {
    vscode.window.showErrorMessage('Please select a Solidity file');
    return;
  }

  // Read the file
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract contract name
  const contractMatch = content.match(/contract\s+(\w+)/);
  if (!contractMatch) {
    vscode.window.showErrorMessage('No contract found in file');
    return;
  }
  const contractName = contractMatch[1];

  // Parse functions
  const functions = parseFunctions(content);
  
  if (functions.length === 0) {
    vscode.window.showWarningMessage('No public/external functions found');
    return;
  }

  // Let user select functions to wrap
  const selected = await vscode.window.showQuickPick<FunctionQuickPickItem>(
    functions.map((f): FunctionQuickPickItem => ({
      label: f.name,
      description: `(${f.inputs.map(i => i.type).join(', ')})`,
      picked: true,
      func: f,
    })),
    {
      canPickMany: true,
      placeHolder: 'Select functions to generate handlers for',
    }
  );

  if (!selected || selected.length === 0) return;

  // Generate handlers
  const handlers = generateHandlerCode(
    contractName,
    selected.map((s: FunctionQuickPickItem) => s.func)
  );

  // Show preview and save option
  const doc = await vscode.workspace.openTextDocument({
    language: 'solidity',
    content: handlers,
  });

  await vscode.window.showTextDocument(doc, { preview: true });

  const saveAction = await vscode.window.showInformationMessage(
    `Generated ${selected.length} handler(s) for ${contractName}`,
    'Save to File',
    'Copy to Clipboard'
  );

  if (saveAction === 'Save to File') {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const defaultPath = path.join(
        workspaceFolder.uri.fsPath,
        'test',
        'invariants',
        'handlers',
        `${contractName}Handlers.sol`
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
        fs.writeFileSync(saveUri.fsPath, handlers);
        vscode.window.showInformationMessage(`Saved to ${saveUri.fsPath}`);
      }
    }
  } else if (saveAction === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(handlers);
    vscode.window.showInformationMessage('Copied to clipboard');
  }
}

function parseFunctions(content: string): FunctionDef[] {
  const functions: FunctionDef[] = [];
  
  // Simple regex to match function definitions
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(public|external)[^{]*{/g;
  
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const name = match[1];
    const paramsStr = match[2];
    const visibility = match[3];
    
    // Skip view/pure functions for handlers (they don't modify state)
    if (content.slice(match.index, match.index + 200).match(/\b(view|pure)\b/)) {
      continue;
    }

    const inputs = parseParams(paramsStr);
    
    functions.push({
      name,
      inputs,
      stateMutability: visibility,
    });
  }

  return functions;
}

function parseParams(paramsStr: string): Array<{ name: string; type: string }> {
  if (!paramsStr.trim()) return [];

  const params: Array<{ name: string; type: string }> = [];
  const parts = paramsStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle memory/calldata/storage modifiers
    const match = trimmed.match(/^(\w+(?:\[\])?)\s+(?:memory|calldata|storage\s+)?(\w+)$/);
    if (match) {
      params.push({ type: match[1], name: match[2] });
    } else {
      // Try simpler match for types without names
      const typeMatch = trimmed.match(/^(\w+(?:\[\])?)/);
      if (typeMatch) {
        params.push({ type: typeMatch[1], name: `arg${params.length}` });
      }
    }
  }

  return params;
}

function generateHandlerCode(contractName: string, functions: FunctionDef[]): string {
  const handlers = functions.map(f => generateHandler(contractName, f)).join('\n\n');

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Setup.sol";

/**
 * @title ${contractName}Handlers
 * @notice Handler functions for ${contractName}
 * @dev Generated by Invariant Hunter
 */
abstract contract ${contractName}Handlers is Setup {
${handlers}
}
`;
}

function generateHandler(contractName: string, func: FunctionDef): string {
  const params = func.inputs.map(i => `${i.type} ${i.name}`).join(', ');
  const args = func.inputs.map(i => i.name).join(', ');
  
  // Generate bound constraints for numeric types
  const bounds = func.inputs
    .filter(i => i.type.startsWith('uint') || i.type.startsWith('int'))
    .map(i => {
      const bits = i.type.match(/\d+/)?.[0] || '256';
      return `        ${i.name} = bound(${i.name}, 0, type(${i.type}).max);`;
    })
    .join('\n');

  const instanceName = contractName.charAt(0).toLowerCase() + contractName.slice(1);

  return `    /// @notice Handler for ${contractName}.${func.name}
    function handler_${func.name}(${params}) external {
${bounds ? bounds + '\n' : ''}        
        // Call the target function
        ${instanceName}.${func.name}(${args});
    }`;
}
