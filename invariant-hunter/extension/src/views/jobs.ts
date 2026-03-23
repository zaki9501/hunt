/**
 * Jobs Tree View
 */

import * as vscode from 'vscode';

export class JobsTreeDataProvider implements vscode.TreeDataProvider<JobItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<JobItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private jobs: JobItem[] = [];

  constructor() {
    // Simulate some jobs for demo
    this.jobs = [
      new JobItem('Recent Job 1', 'completed', 'echidna'),
      new JobItem('Recent Job 2', 'running', 'medusa'),
    ];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: JobItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: JobItem): Thenable<JobItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.jobs);
  }
}

class JobItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly status: 'pending' | 'running' | 'completed' | 'failed',
    public readonly fuzzer: string
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `${fuzzer} - ${status}`;
    this.description = status;

    // Icon based on status
    switch (status) {
      case 'running':
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        break;
      case 'completed':
        this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        break;
      case 'failed':
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('clock');
    }
  }
}
