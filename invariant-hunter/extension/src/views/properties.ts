/**
 * Properties Tree View
 */

import * as vscode from 'vscode';
import * as path from 'path';

export class PropertiesTreeDataProvider implements vscode.TreeDataProvider<PropertyItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PropertyItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PropertyItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PropertyItem): Promise<PropertyItem[]> {
    if (element) {
      return [];
    }

    // Scan workspace for properties
    const properties: PropertyItem[] = [];
    
    const files = await vscode.workspace.findFiles(
      '**/test/**/*.sol',
      '**/node_modules/**'
    );

    for (const file of files) {
      const doc = await vscode.workspace.openTextDocument(file);
      const text = doc.getText();
      
      // Find property functions
      const propertyRegex = /function\s+(property_\w+|invariant_\w+)\s*\(/g;
      let match;
      
      while ((match = propertyRegex.exec(text)) !== null) {
        const name = match[1];
        const position = doc.positionAt(match.index);
        
        properties.push(new PropertyItem(
          name,
          file,
          position.line
        ));
      }
    }

    return properties;
  }
}

class PropertyItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly file: vscode.Uri,
    public readonly line: number
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `${path.basename(file.fsPath)}:${line + 1}`;
    this.description = path.basename(file.fsPath);
    this.iconPath = new vscode.ThemeIcon('symbol-function');

    // Click to go to definition
    this.command = {
      command: 'vscode.open',
      title: 'Go to Property',
      arguments: [
        file,
        {
          selection: new vscode.Range(line, 0, line, 0),
        },
      ],
    };
  }
}
