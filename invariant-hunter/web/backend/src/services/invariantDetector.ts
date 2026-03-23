/**
 * Automatic Invariant Detector
 * 
 * Scans Solidity contracts and detects potential security invariants
 * that should hold true. These can be used to find real vulnerabilities.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DetectedInvariant {
  type: 'balance' | 'access' | 'reentrancy' | 'overflow' | 'state' | 'custom';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  contract: string;
  suggestion: string;
  testCode?: string;
}

export interface ContractAnalysis {
  name: string;
  file: string;
  isToken: boolean;
  isOwnable: boolean;
  hasReentrancyGuard: boolean;
  stateVariables: StateVariable[];
  functions: FunctionInfo[];
  externalCalls: ExternalCall[];
  invariants: DetectedInvariant[];
}

interface StateVariable {
  name: string;
  type: string;
  visibility: string;
  isMapping: boolean;
}

interface FunctionInfo {
  name: string;
  visibility: 'public' | 'external' | 'internal' | 'private';
  modifiers: string[];
  hasPayable: boolean;
  hasStateChange: boolean;
  parameters: string[];
}

interface ExternalCall {
  function: string;
  target: string;
  line: number;
}

export class InvariantDetector {
  
  /**
   * Analyze a project and detect potential invariants
   */
  async analyzeProject(projectDir: string): Promise<ContractAnalysis[]> {
    const analyses: ContractAnalysis[] = [];
    
    // Find all Solidity files in src/ and contracts/
    const srcDirs = ['src', 'contracts'];
    
    for (const dir of srcDirs) {
      const fullDir = path.join(projectDir, dir);
      if (fs.existsSync(fullDir)) {
        const files = await this.findSolFiles(fullDir);
        for (const file of files) {
          try {
            const analysis = await this.analyzeContract(file);
            if (analysis) {
              analyses.push(analysis);
            }
          } catch (err) {
            // Skip files that can't be analyzed
          }
        }
      }
    }
    
    return analyses;
  }

  /**
   * Analyze a single contract file
   */
  private async analyzeContract(filePath: string): Promise<ContractAnalysis | null> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    // Extract contract name
    const contractMatch = content.match(/contract\s+(\w+)/);
    if (!contractMatch) return null;
    
    const contractName = contractMatch[1];
    
    const analysis: ContractAnalysis = {
      name: contractName,
      file: filePath,
      isToken: this.detectTokenContract(content),
      isOwnable: this.detectOwnable(content),
      hasReentrancyGuard: this.detectReentrancyGuard(content),
      stateVariables: this.extractStateVariables(content),
      functions: this.extractFunctions(content),
      externalCalls: this.extractExternalCalls(content),
      invariants: [],
    };
    
    // Detect invariants based on analysis
    analysis.invariants = this.detectInvariants(analysis, content);
    
    return analysis;
  }

  /**
   * Detect if contract is a token (ERC20/ERC721)
   */
  private detectTokenContract(content: string): boolean {
    const tokenPatterns = [
      /ERC20/i,
      /ERC721/i,
      /ERC1155/i,
      /function\s+transfer\s*\(/,
      /function\s+balanceOf\s*\(/,
      /mapping.*balances/i,
      /totalSupply/,
    ];
    return tokenPatterns.some(p => p.test(content));
  }

  /**
   * Detect if contract has ownership pattern
   */
  private detectOwnable(content: string): boolean {
    const ownablePatterns = [
      /Ownable/,
      /onlyOwner/,
      /owner\s*\(\)/,
      /modifier\s+onlyOwner/,
      /require.*owner/i,
    ];
    return ownablePatterns.some(p => p.test(content));
  }

  /**
   * Detect if contract has reentrancy protection
   */
  private detectReentrancyGuard(content: string): boolean {
    const patterns = [
      /ReentrancyGuard/,
      /nonReentrant/,
      /_status\s*=/,
      /locked\s*=/,
    ];
    return patterns.some(p => p.test(content));
  }

  /**
   * Extract state variables from contract
   */
  private extractStateVariables(content: string): StateVariable[] {
    const variables: StateVariable[] = [];
    
    // Match state variable declarations
    const varRegex = /(public|private|internal)?\s*(mapping\s*\([^)]+\)|[\w\[\]]+)\s+(public|private|internal)?\s*(\w+)\s*[;=]/g;
    const matches = content.matchAll(varRegex);
    
    for (const match of matches) {
      const visibility = match[1] || match[3] || 'internal';
      const type = match[2];
      const name = match[4];
      
      if (name && !['function', 'contract', 'if', 'for', 'while'].includes(name)) {
        variables.push({
          name,
          type,
          visibility,
          isMapping: type.includes('mapping'),
        });
      }
    }
    
    return variables;
  }

  /**
   * Extract function information
   */
  private extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    
    const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)[^{]*?(public|external|internal|private)?[^{]*?(payable)?[^{]*?{/g;
    const matches = content.matchAll(funcRegex);
    
    for (const match of matches) {
      const name = match[1];
      const params = match[2];
      const visibility = (match[3] || 'public') as FunctionInfo['visibility'];
      const hasPayable = !!match[4];
      
      // Check for state changes
      const funcBody = this.extractFunctionBody(content, name);
      const hasStateChange = /\w+\s*=\s*[^=]/.test(funcBody) || 
                            /\.push\(/.test(funcBody) ||
                            /delete\s+/.test(funcBody);
      
      // Extract modifiers
      const modifierMatch = content.match(new RegExp(`function\\s+${name}[^{]*?(\\w+)\\s*{`));
      const modifiers: string[] = [];
      if (modifierMatch) {
        const modifierSection = modifierMatch[0];
        const modMatches = modifierSection.matchAll(/(\w+)\s*(?:\([^)]*\))?\s*(?=\w|{)/g);
        for (const m of modMatches) {
          if (!['function', 'public', 'external', 'internal', 'private', 'view', 'pure', 'payable', 'returns', name].includes(m[1])) {
            modifiers.push(m[1]);
          }
        }
      }
      
      functions.push({
        name,
        visibility,
        modifiers,
        hasPayable,
        hasStateChange,
        parameters: params.split(',').map(p => p.trim()).filter(Boolean),
      });
    }
    
    return functions;
  }

  /**
   * Extract external calls (potential reentrancy points)
   */
  private extractExternalCalls(content: string): ExternalCall[] {
    const calls: ExternalCall[] = [];
    
    // Match .call, .transfer, .send, external contract calls
    const callPatterns = [
      /(\w+)\.call\{/g,
      /(\w+)\.transfer\(/g,
      /(\w+)\.send\(/g,
      /(\w+)\.(\w+)\(/g, // Generic external calls
    ];
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('.call{') || line.includes('.call(')) {
        const match = line.match(/(\w+)\.call/);
        if (match) {
          calls.push({ function: 'call', target: match[1], line: i + 1 });
        }
      }
      
      if (line.includes('.transfer(')) {
        const match = line.match(/(\w+)\.transfer/);
        if (match) {
          calls.push({ function: 'transfer', target: match[1], line: i + 1 });
        }
      }
    }
    
    return calls;
  }

  /**
   * Detect invariants based on contract analysis
   */
  private detectInvariants(analysis: ContractAnalysis, content: string): DetectedInvariant[] {
    const invariants: DetectedInvariant[] = [];
    
    // 1. Token Balance Invariants
    if (analysis.isToken) {
      invariants.push({
        type: 'balance',
        severity: 'critical',
        description: 'Total supply should equal sum of all balances',
        contract: analysis.name,
        suggestion: 'Add invariant test: sum of balances == totalSupply',
        testCode: `
function invariant_totalSupplyEqualsBalances() public {
    uint256 sumBalances = 0;
    // Sum all holder balances
    assertEq(token.totalSupply(), sumBalances, "Supply mismatch");
}`,
      });
      
      invariants.push({
        type: 'balance',
        severity: 'critical',
        description: 'Tokens should not be created from nothing',
        contract: analysis.name,
        suggestion: 'Track total supply before/after operations',
        testCode: `
function invariant_noTokensFromNothing() public {
    uint256 supplyBefore = token.totalSupply();
    // ... operations ...
    uint256 supplyAfter = token.totalSupply();
    assertTrue(supplyAfter <= supplyBefore + minted, "Tokens created from nothing");
}`,
      });
    }
    
    // 2. Reentrancy Vulnerabilities
    if (analysis.externalCalls.length > 0 && !analysis.hasReentrancyGuard) {
      for (const call of analysis.externalCalls) {
        invariants.push({
          type: 'reentrancy',
          severity: 'critical',
          description: `External call to ${call.target} at line ${call.line} without reentrancy guard`,
          contract: analysis.name,
          suggestion: 'Add ReentrancyGuard or checks-effects-interactions pattern',
          testCode: `
function test_reentrancy_${call.function}() public {
    // Deploy attacker contract that calls back
    Attacker attacker = new Attacker(address(target));
    attacker.attack();
    // Check state consistency
}`,
        });
      }
    }
    
    // 3. Access Control
    if (analysis.isOwnable) {
      const adminFunctions = analysis.functions.filter(f => 
        f.modifiers.includes('onlyOwner') || 
        f.name.includes('admin') || 
        f.name.includes('set') ||
        f.name.includes('withdraw')
      );
      
      for (const func of adminFunctions) {
        if (func.visibility === 'public' || func.visibility === 'external') {
          invariants.push({
            type: 'access',
            severity: 'high',
            description: `Admin function ${func.name} should not be callable by non-owners`,
            contract: analysis.name,
            suggestion: 'Verify access control in fuzz tests',
            testCode: `
function test_accessControl_${func.name}(address caller) public {
    vm.assume(caller != owner);
    vm.prank(caller);
    vm.expectRevert();
    target.${func.name}();
}`,
          });
        }
      }
    }
    
    // 4. Payable Functions
    const payableFunctions = analysis.functions.filter(f => f.hasPayable);
    for (const func of payableFunctions) {
      invariants.push({
        type: 'balance',
        severity: 'high',
        description: `Payable function ${func.name} - ETH should be accounted for`,
        contract: analysis.name,
        suggestion: 'Track ETH balance changes',
        testCode: `
function invariant_ethAccounting() public {
    uint256 contractBalance = address(target).balance;
    uint256 trackedBalance = target.totalDeposits();
    assertEq(contractBalance, trackedBalance, "ETH accounting mismatch");
}`,
      });
    }
    
    // 5. State Consistency
    const mappings = analysis.stateVariables.filter(v => v.isMapping);
    if (mappings.length > 1) {
      invariants.push({
        type: 'state',
        severity: 'medium',
        description: 'Multiple mappings may need consistency checks',
        contract: analysis.name,
        suggestion: 'Ensure related mappings stay in sync',
        testCode: `
function invariant_stateConsistency() public {
    // Check that related state variables are consistent
    // e.g., if user is in mapping A, they should be in mapping B
}`,
      });
    }
    
    // 6. Integer Overflow (for older Solidity)
    if (content.includes('pragma solidity ^0.7') || content.includes('pragma solidity ^0.6')) {
      invariants.push({
        type: 'overflow',
        severity: 'critical',
        description: 'Contract uses Solidity < 0.8.0 without SafeMath',
        contract: analysis.name,
        suggestion: 'Test arithmetic operations with edge values',
        testCode: `
function testFuzz_overflow(uint256 a, uint256 b) public {
    // Test with max values
    vm.assume(a < type(uint256).max / 2);
    uint256 result = target.add(a, b);
    assertTrue(result >= a, "Overflow detected");
}`,
      });
    }
    
    return invariants;
  }

  /**
   * Extract function body (simplified)
   */
  private extractFunctionBody(content: string, funcName: string): string {
    const funcStart = content.indexOf(`function ${funcName}`);
    if (funcStart === -1) return '';
    
    let braceCount = 0;
    let started = false;
    let body = '';
    
    for (let i = funcStart; i < content.length; i++) {
      const char = content[i];
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          break;
        }
      }
      if (started) {
        body += char;
      }
    }
    
    return body;
  }

  /**
   * Find all Solidity files
   */
  private async findSolFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !['node_modules', 'lib', 'test', 'out'].includes(entry.name)) {
          const subFiles = await this.findSolFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.sol') && !entry.name.includes('.t.sol')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore errors
    }
    
    return files;
  }

  /**
   * Generate a report of detected invariants
   */
  generateReport(analyses: ContractAnalysis[]): string {
    let report = '# Security Invariant Analysis Report\n\n';
    
    const allInvariants = analyses.flatMap(a => a.invariants);
    const critical = allInvariants.filter(i => i.severity === 'critical');
    const high = allInvariants.filter(i => i.severity === 'high');
    const medium = allInvariants.filter(i => i.severity === 'medium');
    
    report += `## Summary\n`;
    report += `- Contracts analyzed: ${analyses.length}\n`;
    report += `- Critical issues: ${critical.length}\n`;
    report += `- High issues: ${high.length}\n`;
    report += `- Medium issues: ${medium.length}\n\n`;
    
    if (critical.length > 0) {
      report += `## Critical Issues\n\n`;
      for (const inv of critical) {
        report += `### ${inv.contract}: ${inv.description}\n`;
        report += `**Type:** ${inv.type}\n`;
        report += `**Suggestion:** ${inv.suggestion}\n`;
        if (inv.testCode) {
          report += `\`\`\`solidity\n${inv.testCode.trim()}\n\`\`\`\n`;
        }
        report += '\n';
      }
    }
    
    if (high.length > 0) {
      report += `## High Issues\n\n`;
      for (const inv of high) {
        report += `### ${inv.contract}: ${inv.description}\n`;
        report += `**Type:** ${inv.type}\n`;
        report += `**Suggestion:** ${inv.suggestion}\n\n`;
      }
    }
    
    return report;
  }
}
