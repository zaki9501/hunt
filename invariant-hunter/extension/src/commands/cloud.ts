/**
 * Cloud Execution Command
 */

import * as vscode from 'vscode';
import axios from 'axios';

export async function runCloud() {
  const config = vscode.workspace.getConfiguration('invariantHunter');
  const cloudEnabled = config.get<boolean>('cloudEnabled', false);
  
  if (!cloudEnabled) {
    const enable = await vscode.window.showInformationMessage(
      'Cloud execution is not enabled. Would you like to enable it?',
      'Enable',
      'Learn More'
    );
    
    if (enable === 'Enable') {
      await config.update('cloudEnabled', true, vscode.ConfigurationTarget.Global);
    } else if (enable === 'Learn More') {
      vscode.env.openExternal(vscode.Uri.parse('https://invarianthunter.xyz/docs/cloud'));
      return;
    } else {
      return;
    }
  }

  // Check for API token
  let apiToken = config.get<string>('apiToken', '');
  
  if (!apiToken) {
    const login = await vscode.window.showInformationMessage(
      'API token required for cloud execution',
      'Enter Token',
      'Get Token'
    );

    if (login === 'Enter Token') {
      apiToken = await vscode.window.showInputBox({
        prompt: 'Enter your API token',
        password: true,
        placeHolder: 'hunt_...',
      }) || '';

      if (apiToken) {
        await config.update('apiToken', apiToken, vscode.ConfigurationTarget.Global);
      } else {
        return;
      }
    } else if (login === 'Get Token') {
      vscode.env.openExternal(vscode.Uri.parse('https://invarianthunter.xyz/settings/tokens'));
      return;
    } else {
      return;
    }
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Please open a workspace folder first');
    return;
  }

  // Select fuzzer
  const fuzzer = await vscode.window.showQuickPick(
    ['Echidna', 'Medusa', 'Foundry'],
    { placeHolder: 'Select fuzzer' }
  );

  if (!fuzzer) return;

  // Select duration
  const duration = await vscode.window.showQuickPick(
    [
      { label: '5 minutes', value: 300 },
      { label: '15 minutes', value: 900 },
      { label: '30 minutes', value: 1800 },
      { label: '1 hour', value: 3600 },
    ],
    { placeHolder: 'Select duration' }
  );

  if (!duration) return;

  // Create job
  const apiUrl = config.get<string>('apiUrl', 'https://api.invarianthunter.xyz');
  
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Creating cloud job...',
      cancellable: false,
    },
    async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
      try {
        progress.report({ increment: 30, message: 'Uploading project...' });

        // In a real implementation, this would:
        // 1. Zip the project
        // 2. Upload to cloud storage
        // 3. Create job with reference to uploaded files

        const response = await axios.post(
          `${apiUrl}/jobs`,
          {
            name: `VS Code Job - ${new Date().toISOString()}`,
            fuzzer: fuzzer.toLowerCase(),
            duration: duration.value,
            cloud: true,
            source: {
              type: 'upload',
              // uploadPath would be set after uploading
            },
          },
          {
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        progress.report({ increment: 70, message: 'Job created!' });

        const job = response.data.job;

        const action = await vscode.window.showInformationMessage(
          `Cloud job created: ${job.id}`,
          'View in Dashboard',
          'Copy Job ID'
        );

        if (action === 'View in Dashboard') {
          const dashboardUrl = apiUrl.replace('/api', '').replace('api.', '');
          vscode.env.openExternal(vscode.Uri.parse(`${dashboardUrl}/jobs/${job.id}`));
        } else if (action === 'Copy Job ID') {
          await vscode.env.clipboard.writeText(job.id);
        }

      } catch (error: any) {
        const message = error.response?.data?.error || error.message;
        vscode.window.showErrorMessage(`Failed to create cloud job: ${message}`);
      }
    }
  );
}
