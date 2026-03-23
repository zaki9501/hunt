/**
 * Invariant Hunter VS Code Extension
 */

import * as vscode from 'vscode';
import { initProject } from './commands/init';
import { generateHandlers } from './commands/handlers';
import { runFuzzer } from './commands/fuzzer';
import { scrapeLogs } from './commands/scraper';
import { runCloud } from './commands/cloud';
import { JobsTreeDataProvider } from './views/jobs';
import { PropertiesTreeDataProvider } from './views/properties';

export function activate(context: vscode.ExtensionContext) {
  console.log('Invariant Hunter extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('invariantHunter.init', initProject),
    vscode.commands.registerCommand('invariantHunter.generateHandlers', generateHandlers),
    vscode.commands.registerCommand('invariantHunter.runFuzzer', runFuzzer),
    vscode.commands.registerCommand('invariantHunter.scrapeLogs', scrapeLogs),
    vscode.commands.registerCommand('invariantHunter.runCloud', runCloud),
    vscode.commands.registerCommand('invariantHunter.openDashboard', openDashboard)
  );

  // Register tree views
  const jobsProvider = new JobsTreeDataProvider();
  const propertiesProvider = new PropertiesTreeDataProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('invariantHunterJobs', jobsProvider),
    vscode.window.registerTreeDataProvider('invariantHunterProperties', propertiesProvider)
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(bug) Invariant Hunter';
  statusBar.command = 'invariantHunter.runFuzzer';
  statusBar.tooltip = 'Run fuzzer';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Watch for Solidity file changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.sol');
  watcher.onDidChange(() => {
    propertiesProvider.refresh();
  });
  context.subscriptions.push(watcher);
}

export function deactivate() {
  console.log('Invariant Hunter extension deactivated');
}

async function openDashboard() {
  const config = vscode.workspace.getConfiguration('invariantHunter');
  const apiUrl = config.get<string>('apiUrl', 'https://api.invarianthunter.xyz');
  const dashboardUrl = apiUrl.replace('/api', '').replace('api.', '');
  
  vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
}
