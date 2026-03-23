/**
 * Foundry Fuzzer Runner Service
 * 
 * Proper flow:
 * 1. Clone repository
 * 2. Detect Foundry project (foundry.toml required)
 * 3. Install dependencies (forge install, npm/pnpm if needed)
 * 4. Build project (forge build) - STOP if fails
 * 5. Discover fuzz tests (scan for test functions with parameters)
 * 6. Run fuzz tests (per-test for clean output)
 * 7. Capture and structure results
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';
import { InvariantDetector, DetectedInvariant, ContractAnalysis } from './invariantDetector';
import { InvariantGenerator, GeneratedTest } from './invariantGenerator';
import { AdvancedFuzzer, FuzzMode, FUZZ_PRESETS, BOUNDARY_VALUES } from './advancedFuzzer';
import { ChimeraHandlerGenerator } from './chimeraHandlerGenerator';

// Log type prefixes for frontend styling (no ANSI codes - those don't work in web UI)
// Format: [TYPE] message - frontend can parse and style based on TYPE
const LOG_PREFIX = {
  SUCCESS: '[SUCCESS]',
  ERROR: '[ERROR]',
  WARNING: '[WARNING]',
  INFO: '[INFO]',
  PHASE: '[PHASE]',
  PROGRESS: '[PROGRESS]',
  PASS: '[PASS]',
  FAIL: '[FAIL]',
  CRITICAL: '[CRITICAL]',
  HIGH: '[HIGH]',
  MEDIUM: '[MEDIUM]',
  DIM: '[DIM]',
};

// Foundry binary path
function getFoundryPath(): string {
  const homeDir = os.homedir();
  const foundryBin = path.join(homeDir, '.foundry', 'bin');
  
  if (fs.existsSync(path.join(foundryBin, 'forge.exe')) || fs.existsSync(path.join(foundryBin, 'forge'))) {
    return foundryBin;
  }
  return '';
}

const FOUNDRY_BIN = getFoundryPath();

// Job states
export type JobState = 
  | 'queued'
  | 'cloning'
  | 'detecting'
  | 'installing_dependencies'
  | 'building'
  | 'discovering_tests'
  | 'running_fuzz'
  | 'completed'
  | 'failed';

export interface FuzzerJob {
  id: string;
  tool: 'echidna' | 'medusa' | 'foundry' | 'halmos' | 'kontrol';
  repo: string;
  branch: string;
  directory: string;
  contract: string;
  timeout: number;
  fuzzMode?: FuzzMode; // quick | deep | flow | adversarial
}

// Discovered test info
export interface DiscoveredTest {
  file: string;
  contract: string;
  function: string;
  paramCount: number;
  type: 'fuzz' | 'unit' | 'invariant';
}

// Test result
export interface TestResult {
  contract: string;
  test: string;
  type: 'fuzz' | 'unit' | 'invariant';
  status: 'passed' | 'failed' | 'skipped';
  reason?: string;
  counterexample?: Record<string, string>;
  executionTime?: number;
  reproCommand: string;
  rawLogs?: string;
}

// Final result
export interface FuzzerResult {
  success: boolean;
  totalCalls: number;
  failedProperties: number;
  coverage?: number;
  properties: Array<{
    name: string;
    status: 'passed' | 'failed';
    callSequence?: string[];
  }>;
  error?: string;
  // New structured data
  discovery?: {
    fuzzTests: DiscoveredTest[];
    unitTests: DiscoveredTest[];
    invariantTests: DiscoveredTest[];
  };
  testResults?: TestResult[];
  // Security analysis
  securityAnalysis?: {
    contractsAnalyzed: number;
    detectedInvariants: DetectedInvariant[];
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
  };
  // Generated tests
  generatedTests?: GeneratedTest[];
  // Unit test results
  unitTestResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

// Project detection result
export interface ProjectDetection {
  isFoundry: boolean;
  hasFoundryToml: boolean;
  hasTestFolder: boolean;
  testFolderName: string | null; // 'test' or 'tests'
  hasSrcFolder: boolean;
  hasLibFolder: boolean;
  hasPackageJson: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  issues: string[];
}

export type LogCallback = (log: string) => void;
export type StatusCallback = (status: JobState) => void;

export class FuzzerRunner {
  private workDir: string;
  private process: ChildProcess | null = null;
  private cancelled = false;

  constructor(private job: FuzzerJob) {
    // Use a VERY short path to avoid Windows 260-char path limit with deeply nested submodules
    // Instead of C:\Users\...\AppData\Local\Temp\invariant-hunter\<long-uuid>
    // Use C:\ih\<short-id> (only 8 chars from job id)
    const shortId = job.id.substring(0, 8);
    const shortBasePath = process.platform === 'win32' ? 'C:\\ih' : path.join(os.tmpdir(), 'ih');
    this.workDir = path.join(shortBasePath, shortId);
  }

  async run(onLog: LogCallback, onStatus: StatusCallback): Promise<FuzzerResult> {
    const forgeCmd = FOUNDRY_BIN ? path.join(FOUNDRY_BIN, 'forge') : 'forge';
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // STEP 1: CLONE REPOSITORY
      // ═══════════════════════════════════════════════════════════════
      onStatus('cloning');
      this.logPhase(onLog, 'CLONING REPOSITORY');
      
      await fs.promises.mkdir(this.workDir, { recursive: true });
      onLog(`[${this.ts()}] Repository: ${this.job.repo}`);
      onLog(`[${this.ts()}] Branch: ${this.job.branch}`);
      onLog(`[${this.ts()}] Work directory: ${this.workDir}`);
      
      // Configure git for long paths (Windows issue with deeply nested submodules)
      const git = simpleGit();
      try {
        await git.raw(['config', '--global', 'core.longpaths', 'true']);
      } catch {
        // Ignore if can't set global config
      }
      
      // Clone WITHOUT recursive submodules first (to avoid path length issues)
      // We'll handle submodules separately with better error handling
      await git.clone(this.job.repo, this.workDir, [
        '--branch', this.job.branch, 
        '--depth', '1'
      ]);
      this.logSuccess(onLog, '✓ Repository cloned');
      
      // Now try to initialize submodules with depth limit and error tolerance
      const repoGit = simpleGit(this.workDir);
      try {
        await repoGit.raw(['config', 'core.longpaths', 'true']);
      } catch {
        // Ignore
      }
      
      // Initialize submodules one level at a time to avoid path explosion
      try {
        onLog(`[${this.ts()}] ${LOG_PREFIX.INFO} Initializing git submodules...`);
        await repoGit.submoduleInit();
        // Use shallow clone for submodules to reduce nesting
        await repoGit.submoduleUpdate(['--depth', '1', '--single-branch']);
        this.logSuccess(onLog, '✓ First-level submodules initialized');
      } catch (submoduleError) {
        // Submodule errors are often non-fatal - many nested submodules aren't needed
        const errMsg = submoduleError instanceof Error ? submoduleError.message : String(submoduleError);
        if (errMsg.includes('Filename too long') || errMsg.includes('path too long')) {
          this.logWarning(onLog, '⚠ Some deeply nested submodules skipped (path too long)');
          this.logInfo(onLog, 'This is usually fine - core dependencies are typically at the first level');
        } else {
          this.logWarning(onLog, `⚠ Submodule warning: ${errMsg.substring(0, 100)}`);
        }
      }

      if (this.cancelled) return this.cancelledResult();

      const projectDir = this.job.directory === '.' 
        ? this.workDir 
        : path.join(this.workDir, this.job.directory);

      // ═══════════════════════════════════════════════════════════════
      // STEP 2: DETECT FOUNDRY PROJECT
      // ═══════════════════════════════════════════════════════════════
      onStatus('detecting');
      this.logPhase(onLog, 'DETECTING PROJECT TYPE');
      
      const detection = await this.detectProject(projectDir, onLog);
      
      onLog(`[${this.ts()}] foundry.toml: ${detection.hasFoundryToml ? '✓' : '✗'}`);
      onLog(`[${this.ts()}] test(s)/ folder: ${detection.hasTestFolder ? `✓ (${detection.testFolderName}/)` : '✗'}`);
      onLog(`[${this.ts()}] src/ folder: ${detection.hasSrcFolder ? '✓' : '✗'}`);
      onLog(`[${this.ts()}] lib/ folder: ${detection.hasLibFolder ? '✓' : '✗'}`);
      onLog(`[${this.ts()}] package.json: ${detection.hasPackageJson ? '✓' : '✗'}`);
      
      if (detection.packageManager) {
        onLog(`[${this.ts()}] Package manager: ${detection.packageManager}`);
      }

      if (!detection.isFoundry) {
        const errorMsg = 'Foundry not detected: No foundry.toml found. This repository is not a Foundry project.';
        this.logError(onLog, `✗ ${errorMsg}`);
        onStatus('failed');
        return this.failResult(errorMsg);
      }

      if (!detection.hasTestFolder) {
        this.logWarning(onLog, '⚠ Warning: No test/ or tests/ folder found');
      }

      this.logSuccess(onLog, '✓ Foundry project detected');

      if (this.cancelled) return this.cancelledResult();

      // ═══════════════════════════════════════════════════════════════
      // STEP 3: INSTALL DEPENDENCIES
      // ═══════════════════════════════════════════════════════════════
      onStatus('installing_dependencies');
      this.logPhase(onLog, 'INSTALLING DEPENDENCIES');
      
      await this.installDependencies(projectDir, detection, forgeCmd, onLog);

      if (this.cancelled) return this.cancelledResult();

      // ═══════════════════════════════════════════════════════════════
      // STEP 4: BUILD PROJECT
      // ═══════════════════════════════════════════════════════════════
      onStatus('building');
      this.logPhase(onLog, 'BUILDING PROJECT');
      
      onLog(`[${this.ts()}] Running: forge build`);
      
      try {
        await this.runCommand(forgeCmd, ['build'], projectDir, onLog, 300000);
        this.logSuccess(onLog, '✓ Build successful');
      } catch (buildError) {
        const errorMsg = buildError instanceof Error ? buildError.message : String(buildError);
        this.logError(onLog, '✗ Build failed');
        onLog(`[${this.ts()}] `);
        this.logError(onLog, 'Build errors must be fixed before fuzzing can proceed.');
        this.logWarning(onLog, 'Common causes:');
        onLog(`[${this.ts()}]   - Missing dependencies (check remappings)`);
        onLog(`[${this.ts()}]   - Solidity version mismatch`);
        onLog(`[${this.ts()}]   - Syntax errors in contracts`);
        onStatus('failed');
        return this.failResult(`Build failed. Cannot proceed to fuzzing.\n${errorMsg.slice(0, 1000)}`);
      }

      if (this.cancelled) return this.cancelledResult();

      // ═══════════════════════════════════════════════════════════════
      // STEP 5: SECURITY ANALYSIS (Auto-detect vulnerabilities)
      // ═══════════════════════════════════════════════════════════════
      this.logPhase(onLog, 'SECURITY ANALYSIS');
      
      const detector = new InvariantDetector();
      const contractAnalyses = await detector.analyzeProject(projectDir);
      const allInvariants = contractAnalyses.flatMap(a => a.invariants);
      
      const criticalIssues = allInvariants.filter(i => i.severity === 'critical');
      const highIssues = allInvariants.filter(i => i.severity === 'high');
      const mediumIssues = allInvariants.filter(i => i.severity === 'medium');
      
      onLog(`[${this.ts()}] Contracts analyzed: ${contractAnalyses.length}`);
      onLog(`[${this.ts()}] Potential issues detected:`);
      onLog(`[${this.ts()}] ${LOG_PREFIX.CRITICAL} Critical: ${criticalIssues.length}`);
      onLog(`[${this.ts()}] ${LOG_PREFIX.HIGH} High: ${highIssues.length}`);
      onLog(`[${this.ts()}] ${LOG_PREFIX.MEDIUM} Medium: ${mediumIssues.length}`);
      
      if (criticalIssues.length > 0) {
        onLog(`[${this.ts()}] `);
        onLog(`[${this.ts()}] ${LOG_PREFIX.CRITICAL} ⚠️  CRITICAL ISSUES DETECTED:`);
        for (const issue of criticalIssues.slice(0, 5)) {
          onLog(`[${this.ts()}]   • [${issue.type.toUpperCase()}] ${issue.contract}: ${issue.description}`);
        }
        if (criticalIssues.length > 5) {
          onLog(`[${this.ts()}]   ... and ${criticalIssues.length - 5} more`);
        }
      }
      
      if (highIssues.length > 0) {
        onLog(`[${this.ts()}] `);
        onLog(`[${this.ts()}] ${LOG_PREFIX.HIGH} ⚠️  HIGH ISSUES:`);
        for (const issue of highIssues.slice(0, 5)) {
          onLog(`[${this.ts()}]   • [${issue.type.toUpperCase()}] ${issue.contract}: ${issue.description}`);
        }
      }

      const securityAnalysis = {
        contractsAnalyzed: contractAnalyses.length,
        detectedInvariants: allInvariants,
        criticalIssues: criticalIssues.length,
        highIssues: highIssues.length,
        mediumIssues: mediumIssues.length,
      };

      // Generate invariant test templates and flow handlers
      let generatedTests: GeneratedTest[] = [];
      const currentFuzzMode = this.job.fuzzMode || this.determineFuzzMode();
      
      if (allInvariants.length > 0 || currentFuzzMode === 'flow' || currentFuzzMode === 'adversarial') {
        onLog(`[${this.ts()}] `);
        this.logInfo(onLog, '📝 Generating test templates and handlers...');
        
        const generator = new InvariantGenerator();
        const advFuzzerGen = new AdvancedFuzzer(currentFuzzMode);
        const chimeraGen = new ChimeraHandlerGenerator();
        
        // Generate invariant tests
        generatedTests = generator.generateTests(contractAnalyses, projectDir);
        
        // Generate flow handlers for each contract (in flow/adversarial mode)
        if (currentFuzzMode === 'flow' || currentFuzzMode === 'adversarial') {
          for (const analysis of contractAnalyses) {
            const flows = advFuzzerGen.getRelevantFlows(analysis.name);
            if (flows.length > 0) {
              const handlerCode = advFuzzerGen.generateFlowHandler(analysis.name, flows);
              // Write to templates folder (not test/) to avoid compilation issues
              const handlerFile = path.join(projectDir, 'templates', 'flow-handlers', `${analysis.name}_FlowHandler.t.sol`);
              await fs.promises.mkdir(path.dirname(handlerFile), { recursive: true });
              await fs.promises.writeFile(handlerFile, handlerCode);
              
              generatedTests.push({
                filename: `${analysis.name}_FlowHandler.t.sol`,
                content: handlerCode,
                targetContract: analysis.name,
                invariantCount: flows.length,
              });
            }
            
            // Generate Chimera-style handlers (best practice from Recon team)
            try {
              // Parse parameter string like "bytes calldata performData" into type and name
              const parseParam = (paramStr: string, index: number): { name: string; type: string } => {
                const parts = paramStr.trim().split(/\s+/);
                if (parts.length === 0) return { name: `param${index}`, type: 'uint256' };
                
                // Last part is the name, everything else is the type
                const name = parts.length > 1 ? parts[parts.length - 1] : `param${index}`;
                const type = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                
                return { name, type };
              };
              
              // Map invariantDetector's ContractAnalysis to chimeraGenerator's format
              const chimeraAnalysis = {
                name: analysis.name,
                functions: analysis.functions.map(f => ({
                  name: f.name,
                  inputs: f.parameters.map((p, i) => parseParam(p, i)),
                  outputs: [],
                  stateMutability: f.hasPayable ? 'payable' as const : 'nonpayable' as const,
                  visibility: f.visibility,
                  isAdmin: f.modifiers.some(m => m.includes('onlyOwner') || m.includes('onlyAdmin')),
                })),
                stateVariables: analysis.stateVariables.map(v => ({
                  name: v.name,
                  type: v.type,
                  visibility: v.visibility as 'public' | 'private' | 'internal',
                })),
                hasOwner: analysis.isOwnable,
                hasAdmin: analysis.isOwnable,
                hasPausable: analysis.functions.some(f => f.name.toLowerCase().includes('pause')),
                isToken: analysis.isToken,
                isVault: analysis.functions.some(f => 
                  f.name.toLowerCase().includes('deposit') || 
                  f.name.toLowerCase().includes('withdraw')
                ),
              };
              
              const chimeraHandlers = chimeraGen.generateTestSuite(chimeraAnalysis);
              // Write to templates folder (not test/) to avoid compilation issues
              const chimeraDir = path.join(projectDir, 'templates', 'chimera', analysis.name);
              await chimeraGen.writeHandlers(chimeraHandlers, chimeraDir);
              
              onLog(`[${this.ts()}] ${LOG_PREFIX.SUCCESS} ✓ Generated Chimera suite for ${analysis.name} (${chimeraHandlers.length} files)`);
            } catch (e) {
              // Non-fatal - continue without Chimera handlers
            }
          }
        }
        
        if (generatedTests.length > 0) {
          const writtenFiles = await generator.writeTests(
            generatedTests.filter(t => !t.filename.includes('FlowHandler')), 
            projectDir
          );
          
          this.logSuccess(onLog, `✓ Generated ${generatedTests.length} files:`);
          onLog(`[${this.ts()}]   • Invariant test templates: ${generatedTests.filter(t => !t.filename.includes('FlowHandler')).length}`);
          onLog(`[${this.ts()}]   • Flow handlers: ${generatedTests.filter(t => t.filename.includes('FlowHandler')).length}`);
          onLog(`[${this.ts()}] `);
          this.logInfo(onLog, '💡 Templates generated in templates/ folder (not compiled):');
          onLog(`[${this.ts()}]    • Chimera-style handlers with asActor/asAdmin modifiers`);
          onLog(`[${this.ts()}]    • Ghost variables with BeforeAfter pattern`);
          onLog(`[${this.ts()}]    • Clamped handlers for reduced search space`);
          onLog(`[${this.ts()}]    • Operation type grouping (ADD, REMOVE, TRANSFER)`);
          onLog(`[${this.ts()}] `);
          onLog(`[${this.ts()}]    To use these templates:`);
          onLog(`[${this.ts()}]    1. Copy templates/ folder to your project's test/ folder`);
          onLog(`[${this.ts()}]    2. Update imports to match your contracts`);
          onLog(`[${this.ts()}]    3. Uncomment the handler code`);
          onLog(`[${this.ts()}]    4. Run: forge test --match-path test/invariant-hunter/`);
          onLog(`[${this.ts()}] `);
          this.logWarning(onLog, '⚠️  Templates are in templates/ folder and will NOT affect compilation.');
        }
      }

      if (this.cancelled) return this.cancelledResult();

      // ═══════════════════════════════════════════════════════════════
      // STEP 6: DISCOVER FUZZ TESTS
      // ═══════════════════════════════════════════════════════════════
      onStatus('discovering_tests');
      this.logPhase(onLog, 'DISCOVERING FUZZ TESTS');
      
      const discovery = await this.discoverTests(projectDir, onLog);
      
      onLog(`[${this.ts()}] Test Discovery Results:`);
      onLog(`[${this.ts()}]   Fuzz tests: ${discovery.fuzzTests.length}`);
      onLog(`[${this.ts()}]   Unit tests: ${discovery.unitTests.length}`);
      onLog(`[${this.ts()}]   Invariant tests: ${discovery.invariantTests.length}`);
      
      if (discovery.fuzzTests.length > 0) {
        onLog(`[${this.ts()}] `);
        this.logInfo(onLog, 'Fuzz tests found:');
        for (const test of discovery.fuzzTests.slice(0, 20)) {
          onLog(`[${this.ts()}]   • ${test.contract}::${test.function} (${test.paramCount} params)`);
        }
        if (discovery.fuzzTests.length > 20) {
          onLog(`[${this.ts()}]   ... and ${discovery.fuzzTests.length - 20} more`);
        }
      }

      if (discovery.invariantTests.length > 0) {
        onLog(`[${this.ts()}] `);
        this.logInfo(onLog, 'Invariant tests found:');
        for (const test of discovery.invariantTests.slice(0, 10)) {
          onLog(`[${this.ts()}]   • ${test.contract}::${test.function}`);
        }
      }

      // Check if we have any tests to run
      const testsToRun = [...discovery.fuzzTests, ...discovery.invariantTests];
      
      if (testsToRun.length === 0) {
        onLog(`[${this.ts()}] `);
        this.logWarning(onLog, '⚠ No fuzz or invariant tests found in this repository.');
        onLog(`[${this.ts()}] `);
        onLog(`[${this.ts()}] Fuzz tests are functions that:`);
        onLog(`[${this.ts()}]   - Start with 'test' or 'testFuzz'`);
        onLog(`[${this.ts()}]   - Have one or more parameters`);
        onLog(`[${this.ts()}]   - Example: function testDeposit(uint256 amount) public`);
        onLog(`[${this.ts()}] `);
        onLog(`[${this.ts()}] Invariant tests are functions that:`);
        onLog(`[${this.ts()}]   - Start with 'invariant_'`);
        onLog(`[${this.ts()}]   - Example: function invariant_totalSupply() public`);
        
        onStatus('completed');
        return {
          success: true,
          totalCalls: 0,
          failedProperties: 0,
          properties: [],
          discovery,
          testResults: [],
          securityAnalysis,
          error: 'No fuzz or invariant tests found in this repository. See security analysis for potential issues to test.',
        };
      }

      if (this.cancelled) return this.cancelledResult();

      // ═══════════════════════════════════════════════════════════════
      // STEP 7: RUN FUZZ TESTS
      // ═══════════════════════════════════════════════════════════════
      onStatus('running_fuzz');
      this.logPhase(onLog, 'RUNNING FUZZ TESTS');
      
      // Initialize advanced fuzzer
      const fuzzMode = this.job.fuzzMode || this.determineFuzzMode();
      const advFuzzer = new AdvancedFuzzer(fuzzMode);
      const fuzzRuns = this.calculateFuzzRuns();
      
      onLog(`[${this.ts()}] Fuzz Mode: ${fuzzMode.toUpperCase()}`);
      onLog(`[${this.ts()}] Timeout: ${this.job.timeout} seconds`);
      onLog(`[${this.ts()}] Fuzz runs: ${fuzzRuns.toLocaleString()}`);
      
      // Log mode-specific info
      const preset = FUZZ_PRESETS[fuzzMode];
      if (preset.boundaryBias) {
        onLog(`[${this.ts()}] Boundary bias: ENABLED (testing edge values)`);
      }
      if (preset.multiActor) {
        onLog(`[${this.ts()}] Multi-actor: ENABLED (testing different callers)`);
      }
      if (preset.sequenceLength > 1) {
        onLog(`[${this.ts()}] Sequence length: ${preset.sequenceLength} calls`);
      }
      onLog(`[${this.ts()}] `);

      const testResults = await this.runFuzzTests(projectDir, testsToRun, forgeCmd, onLog);

      if (this.cancelled) return this.cancelledResult();

      // ═══════════════════════════════════════════════════════════════
      // STEP 8: RUN UNIT TESTS (for coverage)
      // ═══════════════════════════════════════════════════════════════
      this.logPhase(onLog, 'RUNNING UNIT TESTS');
      
      const unitTestResults = await this.runUnitTests(projectDir, discovery.unitTests, forgeCmd, onLog);
      
      onLog(`[${this.ts()}] Unit test results:`);
      onLog(`[${this.ts()}]   Total: ${unitTestResults.total}`);
      onLog(`[${this.ts()}] ${LOG_PREFIX.PASS} ✓ Passed: ${unitTestResults.passed}`);
      onLog(`[${this.ts()}] ${unitTestResults.failed > 0 ? LOG_PREFIX.FAIL : ''} ✗ Failed: ${unitTestResults.failed}`);
      if (unitTestResults.skipped > 0) {
        onLog(`[${this.ts()}]   ○ Skipped: ${unitTestResults.skipped}`);
      }

      // ═══════════════════════════════════════════════════════════════
      // STEP 9: RESULTS SUMMARY
      // ═══════════════════════════════════════════════════════════════
      this.logPhase(onLog, 'RESULTS SUMMARY');
      
      const passed = testResults.filter(r => r.status === 'passed').length;
      const failed = testResults.filter(r => r.status === 'failed').length;
      const skipped = testResults.filter(r => r.status === 'skipped').length;
      
      const totalTests = testResults.length + unitTestResults.total;
      const totalPassed = passed + unitTestResults.passed;
      const totalFailed = failed + unitTestResults.failed;
      const totalSkipped = skipped + unitTestResults.skipped;

      onLog(`[${this.ts()}] ┌─────────────────────────────────────────────────┐`);
      onLog(`[${this.ts()}] │              TEST RESULTS SUMMARY               │`);
      onLog(`[${this.ts()}] ├─────────────────────────────────────────────────┤`);
      onLog(`[${this.ts()}] │  FUZZ TESTS                                     │`);
      onLog(`[${this.ts()}] │    Total: ${String(testResults.length).padStart(4)}    Passed: ${String(passed).padStart(4)}    Failed: ${String(failed).padStart(4)} │`);
      onLog(`[${this.ts()}] │  UNIT TESTS                                     │`);
      onLog(`[${this.ts()}] │    Total: ${String(unitTestResults.total).padStart(4)}    Passed: ${String(unitTestResults.passed).padStart(4)}    Failed: ${String(unitTestResults.failed).padStart(4)} │`);
      onLog(`[${this.ts()}] ├─────────────────────────────────────────────────┤`);
      const overallStatus = totalFailed > 0 ? `${totalPassed}/${totalTests} passed ⚠️` : `${totalPassed}/${totalTests} passed ✓`;
      onLog(`[${this.ts()}] │  OVERALL: ${overallStatus.padEnd(37)} │`);
      onLog(`[${this.ts()}] └─────────────────────────────────────────────────┘`);
      
      // Security summary
      onLog(`[${this.ts()}] `);
      onLog(`[${this.ts()}] ┌─────────────────────────────────────────────────┐`);
      onLog(`[${this.ts()}] │            SECURITY ANALYSIS                    │`);
      onLog(`[${this.ts()}] ├─────────────────────────────────────────────────┤`);
      onLog(`[${this.ts()}] │  Contracts analyzed: ${String(securityAnalysis.contractsAnalyzed).padStart(3)}                       │`);
      onLog(`[${this.ts()}] │  ${LOG_PREFIX.CRITICAL} Critical: ${String(securityAnalysis.criticalIssues).padStart(3)}                       │`);
      onLog(`[${this.ts()}] │  ${LOG_PREFIX.HIGH} High:     ${String(securityAnalysis.highIssues).padStart(3)}                       │`);
      onLog(`[${this.ts()}] │  ${LOG_PREFIX.MEDIUM} Medium:   ${String(securityAnalysis.mediumIssues).padStart(3)}                       │`);
      onLog(`[${this.ts()}] │  Tests generated: ${String(generatedTests.length).padStart(3)}                       │`);
      onLog(`[${this.ts()}] └─────────────────────────────────────────────────┘`);

      if (failed > 0) {
        onLog(`[${this.ts()}] `);
        this.logError(onLog, '❌ Failed Tests:');
        for (const result of testResults.filter(r => r.status === 'failed')) {
          onLog(`[${this.ts()}] `);
          onLog(`[${this.ts()}] ${LOG_PREFIX.FAIL} ✗ ${result.contract}::${result.test}`);
          if (result.reason) {
            onLog(`[${this.ts()}]     Reason: ${result.reason}`);
          }
          if (result.counterexample && Object.keys(result.counterexample).length > 0) {
            onLog(`[${this.ts()}]     Counterexample:`);
            for (const [key, value] of Object.entries(result.counterexample)) {
              onLog(`[${this.ts()}]       ${key} = ${value}`);
            }
          }
          onLog(`[${this.ts()}]     Repro: ${result.reproCommand}`);
        }
      }

      // Generate recommendations
      const advFuzzerRec = new AdvancedFuzzer(fuzzMode);
      const recommendations = advFuzzerRec.generateRecommendations(
        this.job.contract,
        allInvariants.map(i => i.description)
      );
      
      if (recommendations.length > 0) {
        onLog(`[${this.ts()}] `);
        onLog(`[${this.ts()}] ┌─────────────────────────────────────────────────┐`);
        onLog(`[${this.ts()}] │            RECOMMENDATIONS                      │`);
        onLog(`[${this.ts()}] └─────────────────────────────────────────────────┘`);
        onLog(`[${this.ts()}] `);
        for (let i = 0; i < Math.min(recommendations.length, 8); i++) {
          onLog(`[${this.ts()}]   ${i + 1}. ${recommendations[i]}`);
        }
        if (recommendations.length > 8) {
          onLog(`[${this.ts()}]   ... and ${recommendations.length - 8} more`);
        }
      }

      // Convert to legacy format for compatibility
      const properties = testResults.map(r => ({
        name: `${r.contract}::${r.test}`,
        status: r.status === 'passed' ? 'passed' as const : 'failed' as const,
        callSequence: r.counterexample ? Object.entries(r.counterexample).map(([k, v]) => `${k}=${v}`) : undefined,
      }));

      onStatus('completed');
      
      return {
        success: totalFailed === 0,
        totalCalls: testResults.length * this.calculateFuzzRuns(),
        failedProperties: totalFailed,
        properties,
        discovery,
        testResults,
        securityAnalysis,
        generatedTests,
        unitTestResults,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onLog(`[${this.ts()}] `);
      onLog(`[${this.ts()}] ═══════════════════════════════════════════════════`);
      onLog(`[${this.ts()}] ✗ ERROR: ${errorMsg}`);
      onLog(`[${this.ts()}] ═══════════════════════════════════════════════════`);
      onStatus('failed');
      return this.failResult(errorMsg);
    } finally {
      this.cleanup();
    }
  }

  cancel(): void {
    this.cancelled = true;
    if (this.process) {
      this.process.kill('SIGTERM');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  private async detectProject(projectDir: string, onLog: LogCallback): Promise<ProjectDetection> {
    const detection: ProjectDetection = {
      isFoundry: false,
      hasFoundryToml: false,
      hasTestFolder: false,
      testFolderName: null,
      hasSrcFolder: false,
      hasLibFolder: false,
      hasPackageJson: false,
      packageManager: null,
      issues: [],
    };

    detection.hasFoundryToml = fs.existsSync(path.join(projectDir, 'foundry.toml'));
    
    // Check for both 'test' and 'tests' folders (common variations)
    if (fs.existsSync(path.join(projectDir, 'test'))) {
      detection.hasTestFolder = true;
      detection.testFolderName = 'test';
    } else if (fs.existsSync(path.join(projectDir, 'tests'))) {
      detection.hasTestFolder = true;
      detection.testFolderName = 'tests';
    }
    
    detection.hasSrcFolder = fs.existsSync(path.join(projectDir, 'src'));
    detection.hasLibFolder = fs.existsSync(path.join(projectDir, 'lib'));
    detection.hasPackageJson = fs.existsSync(path.join(projectDir, 'package.json'));

    // Detect package manager
    if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
      detection.packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) {
      detection.packageManager = 'yarn';
    } else if (fs.existsSync(path.join(projectDir, 'package-lock.json')) || detection.hasPackageJson) {
      detection.packageManager = 'npm';
    }

    // A project is Foundry if it has foundry.toml
    detection.isFoundry = detection.hasFoundryToml;

    return detection;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCY INSTALLATION
  // ═══════════════════════════════════════════════════════════════════════════

  private async installDependencies(
    projectDir: string, 
    detection: ProjectDetection, 
    forgeCmd: string,
    onLog: LogCallback
  ): Promise<void> {
    const nodeModules = path.join(projectDir, 'node_modules');
    const libDir = path.join(projectDir, 'lib');
    const gitModulesFile = path.join(projectDir, '.gitmodules');

    // Check for git submodules and initialize them if needed
    // Note: We already tried first-level submodules during clone, but some may have failed
    if (fs.existsSync(gitModulesFile)) {
      // Check if lib/ has empty folders (sign of uninitialized submodules)
      const needsSubmoduleInit = fs.existsSync(libDir) && 
        fs.readdirSync(libDir).some(dir => {
          const subPath = path.join(libDir, dir);
          return fs.statSync(subPath).isDirectory() && 
                 fs.readdirSync(subPath).length === 0;
        });
      
      if (needsSubmoduleInit) {
        onLog(`[${this.ts()}] ${LOG_PREFIX.INFO} Detected empty lib/ subfolders - trying submodule update...`);
        try {
          const git = simpleGit(projectDir);
          // Configure for long paths
          await git.raw(['config', 'core.longpaths', 'true']).catch(() => {});
          // Only init first level, don't recurse (avoids path explosion)
          await git.submoduleUpdate(['--init', '--depth', '1']);
          this.logSuccess(onLog, '✓ Git submodules updated');
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes('Filename too long') || errMsg.includes('path too long')) {
            this.logWarning(onLog, '⚠ Some submodules skipped (Windows path length limit)');
            this.logInfo(onLog, 'Tip: Enable long paths in Windows or use a shorter project path');
          } else {
            // Try forge install as alternative
            this.logWarning(onLog, '⚠ Submodule update had issues, will try forge install');
          }
        }
      }
    }

    // Install npm/pnpm/yarn dependencies if package.json exists
    if (detection.hasPackageJson) {
      const hasNodeModules = fs.existsSync(nodeModules) && 
        fs.readdirSync(nodeModules).filter(f => !f.startsWith('.')).length > 0;
      
      if (!hasNodeModules) {
        const pkgManager = detection.packageManager || 'npm';
        onLog(`[${this.ts()}] Installing ${pkgManager} dependencies...`);
        
        try {
          if (pkgManager === 'pnpm') {
            await this.runCommand('pnpm', ['install'], projectDir, onLog, 300000);
          } else if (pkgManager === 'yarn') {
            await this.runCommand('yarn', ['install'], projectDir, onLog, 300000);
          } else {
            // Try npm install directly (npm ci requires lock file)
            await this.runCommand('npm', ['install', '--legacy-peer-deps'], projectDir, onLog, 300000);
          }
          this.logSuccess(onLog, `✓ ${pkgManager} dependencies installed`);
        } catch (err) {
          this.logWarning(onLog, `⚠ ${pkgManager} install failed, continuing...`);
        }

        // Setup remappings for node_modules if needed
        await this.setupRemappings(projectDir, onLog);
      } else {
        onLog(`[${this.ts()}] ✓ node_modules already present`);
      }
    }

    // Install Foundry lib dependencies
    const hasLib = fs.existsSync(libDir) && 
      fs.readdirSync(libDir).filter(f => !f.startsWith('.')).length > 0;
    
    if (!hasLib) {
      onLog(`[${this.ts()}] Installing Foundry dependencies (forge install)...`);
      try {
        await this.runCommand(forgeCmd, ['install'], projectDir, onLog, 120000);
        this.logSuccess(onLog, '✓ Foundry dependencies installed');
      } catch (err) {
        this.logWarning(onLog, '⚠ forge install failed (may not be needed)');
      }
    } else {
      onLog(`[${this.ts()}] ✓ lib/ dependencies already present`);
      
      // Even if lib exists, check if submodules need updating
      if (fs.existsSync(gitModulesFile)) {
        // Check if any lib folders are empty (submodule not initialized)
        const libFolders = fs.readdirSync(libDir).filter(f => !f.startsWith('.'));
        for (const folder of libFolders) {
          const folderPath = path.join(libDir, folder);
          if (fs.statSync(folderPath).isDirectory()) {
            const contents = fs.readdirSync(folderPath);
            if (contents.length === 0) {
              onLog(`[${this.ts()}] ${LOG_PREFIX.WARNING} Empty lib folder detected: ${folder}`);
              onLog(`[${this.ts()}] Attempting to initialize submodules...`);
              try {
                await this.runCommand('git', ['submodule', 'update', '--init', '--recursive'], projectDir, onLog, 180000);
                this.logSuccess(onLog, '✓ Submodules updated');
              } catch {
                this.logWarning(onLog, '⚠ Could not initialize submodules');
              }
              break;
            }
          }
        }
      }
    }
  }

  private async setupRemappings(projectDir: string, onLog: LogCallback): Promise<void> {
    const nodeModules = path.join(projectDir, 'node_modules');
    const remappingsFile = path.join(projectDir, 'remappings.txt');
    
    if (!fs.existsSync(nodeModules)) return;

    // Read existing remappings
    let existingRemappings = '';
    if (fs.existsSync(remappingsFile)) {
      existingRemappings = await fs.promises.readFile(remappingsFile, 'utf-8');
    }

    // Check for common dependencies that need remappings
    const remappingsToAdd: string[] = [];
    const depsToCheck = [
      { dir: '@openzeppelin', remap: '@openzeppelin/=node_modules/@openzeppelin/' },
      { dir: '@chainlink', remap: '@chainlink/=node_modules/@chainlink/' },
      { dir: 'forge-std', remap: 'forge-std/=node_modules/forge-std/' },
      { dir: '@uniswap', remap: '@uniswap/=node_modules/@uniswap/' },
      { dir: 'solmate', remap: 'solmate/=node_modules/solmate/' },
    ];

    for (const dep of depsToCheck) {
      if (fs.existsSync(path.join(nodeModules, dep.dir))) {
        const prefix = dep.remap.split('=')[0];
        if (!existingRemappings.includes(prefix)) {
          remappingsToAdd.push(dep.remap);
        }
      }
    }

    if (remappingsToAdd.length > 0) {
      const newContent = existingRemappings.trim() + '\n' + remappingsToAdd.join('\n') + '\n';
      await fs.promises.writeFile(remappingsFile, newContent);
      onLog(`[${this.ts()}] ✓ Added ${remappingsToAdd.length} remappings for node_modules`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  private async discoverTests(projectDir: string, onLog: LogCallback): Promise<{
    fuzzTests: DiscoveredTest[];
    unitTests: DiscoveredTest[];
    invariantTests: DiscoveredTest[];
  }> {
    const fuzzTests: DiscoveredTest[] = [];
    const unitTests: DiscoveredTest[] = [];
    const invariantTests: DiscoveredTest[] = [];

    // Find all test files (excluding generated templates)
    const testDirs = ['test', 'src/test', 'tests'];
    const testFiles: string[] = [];
    
    // Patterns to exclude from test discovery
    const excludePatterns = [
      'invariant-hunter',    // Our generated templates folder
      'chimera',             // Chimera handlers folder
      'Template_',           // All template files
      '_Invariant.t.sol',    // Generated invariant tests
      '_FlowHandler.t.sol',  // Generated flow handlers
      'HunterInvariant',     // Master invariant test
    ];

    for (const dir of testDirs) {
      const fullDir = path.join(projectDir, dir);
      if (fs.existsSync(fullDir)) {
        const files = await this.findSolFiles(fullDir);
        // Filter out generated template files
        const filteredFiles = files.filter(f => {
          const relativePath = path.relative(projectDir, f);
          return !excludePatterns.some(pattern => relativePath.includes(pattern));
        });
        testFiles.push(...filteredFiles);
      }
    }

    onLog(`[${this.ts()}] Scanning ${testFiles.length} test files (excluding generated templates)...`);

    // Parse each test file
    for (const file of testFiles) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8');
        const relativePath = path.relative(projectDir, file);
        
        // Extract contract names
        const contractMatches = content.matchAll(/contract\s+(\w+)/g);
        const contracts = [...contractMatches].map(m => m[1]);

        // Extract function signatures
        // Match: function testXxx(type1 param1, type2 param2) ...
        const funcRegex = /function\s+(test\w*|invariant_\w+)\s*\(([^)]*)\)/g;
        const funcMatches = [...content.matchAll(funcRegex)];

        for (const match of funcMatches) {
          const funcName = match[1];
          const params = match[2].trim();
          const paramCount = params ? params.split(',').filter(p => p.trim()).length : 0;

          // Determine the contract this function belongs to
          // Simple heuristic: find the nearest contract declaration before this function
          const funcIndex = match.index || 0;
          let contractName = 'Unknown';
          for (const contract of contracts) {
            const contractIndex = content.indexOf(`contract ${contract}`);
            if (contractIndex !== -1 && contractIndex < funcIndex) {
              contractName = contract;
            }
          }

          const test: DiscoveredTest = {
            file: relativePath,
            contract: contractName,
            function: funcName,
            paramCount,
            type: 'unit',
          };

          // Classify the test
          if (funcName.startsWith('invariant_') || funcName.startsWith('invariant')) {
            test.type = 'invariant';
            invariantTests.push(test);
          } else if (paramCount > 0) {
            // Fuzz test: has parameters
            test.type = 'fuzz';
            fuzzTests.push(test);
          } else {
            // Unit test: no parameters
            test.type = 'unit';
            unitTests.push(test);
          }
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }

    return { fuzzTests, unitTests, invariantTests };
  }

  private async findSolFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !['node_modules', 'lib', 'out', 'cache', '.git'].includes(entry.name)) {
          const subFiles = await this.findSolFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.sol') || entry.name.endsWith('.t.sol')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore errors
    }

    return files;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUZZ TEST EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run unit tests for coverage
   */
  private async runUnitTests(
    projectDir: string,
    unitTests: DiscoveredTest[],
    forgeCmd: string,
    onLog: LogCallback
  ): Promise<{ total: number; passed: number; failed: number; skipped: number }> {
    if (unitTests.length === 0) {
      onLog(`[${this.ts()}] No unit tests to run`);
      return { total: 0, passed: 0, failed: 0, skipped: 0 };
    }

    onLog(`[${this.ts()}] `);
    onLog(`[${this.ts()}] ┌─────────────────────────────────────────────────┐`);
    onLog(`[${this.ts()}] │           UNIT TEST EXECUTION                   │`);
    onLog(`[${this.ts()}] ├─────────────────────────────────────────────────┤`);
    onLog(`[${this.ts()}] │  Tests to run: ${String(unitTests.length).padStart(4)}                            │`);
    onLog(`[${this.ts()}] │  Timeout: 5 minutes                             │`);
    onLog(`[${this.ts()}] └─────────────────────────────────────────────────┘`);
    onLog(`[${this.ts()}] `);
    this.logInfo(onLog, '🧪 Running unit tests (this is usually fast)...');
    
    // Run all unit tests at once (they're fast)
    const args = [
      'test',
      '--no-match-test', 'testFuzz', // Exclude fuzz tests (already ran)
      '--no-match-path', '**/invariant-hunter/**', // Exclude generated templates folder
      '--no-match-contract', 'Template_*', // Exclude all template contracts
      '-v',
    ];

    const startTime = Date.now();
    
    try {
      const output = await this.runCommand(forgeCmd, args, projectDir, onLog, 300000); // 5 min max
      
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      
      // Parse results
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);
      const skipMatch = output.match(/(\d+)\s+skipped/);
      
      const passed = passMatch ? parseInt(passMatch[1]) : 0;
      const failed = failMatch ? parseInt(failMatch[1]) : 0;
      const skipped = skipMatch ? parseInt(skipMatch[1]) : 0;
      
      this.logSuccess(onLog, `✓ Unit tests completed in ${elapsed}s`);
      
      return {
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      this.logWarning(onLog, `⚠ Unit tests failed after ${elapsed}s: ${errorMsg.slice(0, 200)}`);
      
      // Try to parse partial results
      const failMatch = errorMsg.match(/(\d+)\s+failed/);
      const failed = failMatch ? parseInt(failMatch[1]) : 1;
      
      return {
        total: unitTests.length,
        passed: 0,
        failed,
        skipped: 0,
      };
    }
  }

  private async runFuzzTests(
    projectDir: string,
    tests: DiscoveredTest[],
    forgeCmd: string,
    onLog: LogCallback
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const fuzzRuns = this.calculateFuzzRuns();
    
    // Distribute timeout across contracts
    const testsByContract = new Map<string, DiscoveredTest[]>();
    for (const test of tests) {
      const existing = testsByContract.get(test.contract) || [];
      existing.push(test);
      testsByContract.set(test.contract, existing);
    }
    
    // Filter out template contracts
    const contractsToRun = Array.from(testsByContract.entries()).filter(
      ([contract]) => !contract.includes('_InvariantTest') && !contract.includes('HunterInvariant')
    );
    
    const totalContracts = contractsToRun.length;
    const timeoutPerContract = Math.floor((this.job.timeout * 1000) / Math.max(totalContracts, 1));
    
    // Estimate time per contract
    const estimatedSecondsPerContract = Math.round(fuzzRuns / 1000); // ~1000 runs/sec estimate
    const totalEstimatedTime = estimatedSecondsPerContract * totalContracts;
    
    onLog(`[${this.ts()}] `);
    onLog(`[${this.ts()}] ┌─────────────────────────────────────────────────┐`);
    onLog(`[${this.ts()}] │           FUZZ TEST EXECUTION PLAN              │`);
    onLog(`[${this.ts()}] ├─────────────────────────────────────────────────┤`);
    onLog(`[${this.ts()}] │  Contracts to test: ${String(totalContracts).padStart(3)}                        │`);
    onLog(`[${this.ts()}] │  Fuzz runs per test: ${fuzzRuns.toLocaleString().padStart(10)}               │`);
    onLog(`[${this.ts()}] │  Timeout per contract: ${Math.round(timeoutPerContract / 1000)}s                     │`);
    onLog(`[${this.ts()}] │  ${LOG_PREFIX.PROGRESS} Est. time: ~${totalEstimatedTime}s (${Math.round(totalEstimatedTime / 60)} min)       │`);
    onLog(`[${this.ts()}] └─────────────────────────────────────────────────┘`);
    onLog(`[${this.ts()}] `);

    let contractIndex = 0;
    const overallStartTime = Date.now();

    // Run tests per contract (excluding generated templates)
    for (const [contract, contractTests] of contractsToRun) {
      contractIndex++;
      
      const elapsed = Math.round((Date.now() - overallStartTime) / 1000);
      const remaining = totalContracts - contractIndex;
      const avgTimePerContract = contractIndex > 1 ? elapsed / (contractIndex - 1) : estimatedSecondsPerContract;
      const estimatedRemaining = Math.round(remaining * avgTimePerContract);
      
      onLog(`[${this.ts()}] `);
      onLog(`[${this.ts()}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      onLog(`[${this.ts()}] 📦 Contract ${contractIndex}/${totalContracts}: ${contract}`);
      onLog(`[${this.ts()}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      onLog(`[${this.ts()}]   Tests: ${contractTests.length}`);
      onLog(`[${this.ts()}]   Fuzz runs: ${fuzzRuns.toLocaleString()}`);
      onLog(`[${this.ts()}] ${LOG_PREFIX.PROGRESS} Progress: ${elapsed}s elapsed, ~${estimatedRemaining}s remaining`);
      onLog(`[${this.ts()}] `);
      
      const args = [
        'test',
        '--match-contract', contract,
        '--no-match-path', '**/invariant-hunter/**', // Exclude generated templates folder
        '--no-match-contract', 'Template_*', // Exclude all template contracts
        '--fuzz-runs', String(fuzzRuns),
        '-vvv',
      ];

      const reproCommand = `forge test --match-contract ${contract} --fuzz-runs ${fuzzRuns} -vvv`;

      try {
        const startTime = Date.now();
        const output = await this.runCommand(forgeCmd, args, projectDir, onLog, timeoutPerContract);
        const executionTime = Date.now() - startTime;

        // Parse results for each test in this contract
        for (const test of contractTests) {
          const result = this.parseTestResult(output, test, reproCommand, executionTime / contractTests.length);
          results.push(result);
          
          // Log individual test result
          if (result.status === 'passed') {
            onLog(`[${this.ts()}] ${LOG_PREFIX.PASS} ✓ ${test.function}: PASSED`);
          } else {
            onLog(`[${this.ts()}] ${LOG_PREFIX.FAIL} ✗ ${test.function}: FAILED`);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        this.logError(onLog, `✗ Contract failed: ${errorMsg.slice(0, 100)}`);
        
        // Mark all tests in this contract as failed
        for (const test of contractTests) {
          results.push({
            contract: test.contract,
            test: test.function,
            type: test.type,
            status: 'failed',
            reason: errorMsg.slice(0, 200),
            reproCommand,
          });
        }
      }
    }
    
    const totalElapsed = Math.round((Date.now() - overallStartTime) / 1000);
    onLog(`[${this.ts()}] `);
    this.logSuccess(onLog, `✓ Fuzz testing completed in ${totalElapsed}s (${Math.round(totalElapsed / 60)} min)`);

    return results;
  }

  private parseTestResult(
    output: string, 
    test: DiscoveredTest, 
    reproCommand: string,
    executionTime: number
  ): TestResult {
    const result: TestResult = {
      contract: test.contract,
      test: test.function,
      type: test.type,
      status: 'passed',
      reproCommand: `${reproCommand} --match-test ${test.function}`,
      executionTime,
    };

    // Check if this specific test passed or failed
    const passPattern = new RegExp(`\\[PASS\\].*${test.function}`);
    const failPattern = new RegExp(`\\[FAIL[^\\]]*\\].*${test.function}`);

    if (failPattern.test(output)) {
      result.status = 'failed';
      
      // Try to extract failure reason
      const reasonMatch = output.match(new RegExp(`${test.function}[\\s\\S]*?(revert|assertion|panic)[\\s\\S]*?(?=\\[|$)`, 'i'));
      if (reasonMatch) {
        result.reason = reasonMatch[0].slice(0, 200).trim();
      }

      // Try to extract counterexample
      const counterMatch = output.match(/counterexample:([^\n]+)/i);
      if (counterMatch) {
        result.counterexample = this.parseCounterexample(counterMatch[1]);
      }
      
      // Classify the bug type
      const advFuzzer = new AdvancedFuzzer('deep');
      const bugCategory = advFuzzer.classifyBug(
        result.reason || '', 
        result.counterexample ? Object.values(result.counterexample) : []
      );
      
      // Add bug category to reason
      if (bugCategory !== 'unknown') {
        result.reason = `[${bugCategory.toUpperCase()}] ${result.reason || 'Test failed'}`;
      }
    } else if (!passPattern.test(output)) {
      // Test wasn't found in output - might have been skipped or errored
      result.status = 'skipped';
    }

    return result;
  }

  private parseCounterexample(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    // Parse formats like: args=[123, 456] or param=value
    const matches = text.matchAll(/(\w+)\s*[=:]\s*([^\s,\]]+)/g);
    for (const match of matches) {
      result[match[1]] = match[2];
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  private runCommand(cmd: string, args: string[], cwd: string, onLog: LogCallback, timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let lastOutputTime = Date.now();
      let lastProgressLog = Date.now();
      const startTime = Date.now();

      const isWindows = process.platform === 'win32';

      this.process = spawn(cmd, args, {
        cwd,
        shell: isWindows,
        env: { ...process.env, FOUNDRY_PROFILE: 'default' },
      });

      const timeoutId = timeout ? setTimeout(() => {
        onLog(`[${this.ts()}] ${LOG_PREFIX.WARNING} ⚠ Timeout reached (${Math.round(timeout / 1000)}s) - stopping process`);
        this.process?.kill('SIGTERM');
      }, timeout) : null;

      // Heartbeat: Log progress every 30 seconds if no output
      const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.round((now - startTime) / 1000);
        const silentFor = Math.round((now - lastOutputTime) / 1000);
        
        if (silentFor >= 30) {
          onLog(`[${this.ts()}] ${LOG_PREFIX.PROGRESS} ⏳ Still running... (${elapsed}s elapsed, waiting for output)`);
          lastProgressLog = now;
        }
      }, 30000);

      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        lastOutputTime = Date.now();
        
        for (const line of text.split('\n').filter(Boolean)) {
          // Parse and enhance fuzz progress output
          if (line.includes('[PASS]')) {
            onLog(`${LOG_PREFIX.PASS} ${line}`);
          } else if (line.includes('[FAIL]')) {
            onLog(`${LOG_PREFIX.FAIL} ${line}`);
          } else if (line.includes('runs:')) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            onLog(`${line} [${elapsed}s elapsed]`);
          } else if (line.includes('Suite result:')) {
            if (line.includes('ok')) {
              onLog(`${LOG_PREFIX.SUCCESS} ${line}`);
            } else {
              onLog(`${LOG_PREFIX.ERROR} ${line}`);
            }
          } else {
            onLog(line);
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        lastOutputTime = Date.now();
        
        for (const line of text.split('\n').filter(Boolean)) {
          onLog(`${LOG_PREFIX.ERROR} [stderr] ${line}`);
        }
      });

      this.process.on('close', (code) => {
        clearInterval(heartbeatInterval);
        if (timeoutId) clearTimeout(timeoutId);
        this.process = null;
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const prefix = code === 0 ? LOG_PREFIX.SUCCESS : LOG_PREFIX.WARNING;
        onLog(`[${this.ts()}] ${prefix} ✓ Command completed in ${elapsed}s (exit code: ${code})`);
        
        if (this.cancelled) {
          reject(new Error('Job cancelled'));
        } else if (code === 0 || output.includes('[PASS]') || output.includes('[FAIL]')) {
          resolve(output + errorOutput);
        } else {
          reject(new Error(`Command failed (code ${code}): ${(errorOutput || output).slice(0, 500)}`));
        }
      });

      this.process.on('error', (err) => {
        clearInterval(heartbeatInterval);
        if (timeoutId) clearTimeout(timeoutId);
        this.process = null;
        reject(err);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private logPhase(onLog: LogCallback, phase: string): void {
    onLog(`[${this.ts()}] `);
    onLog(`[${this.ts()}] ════════════════════════════════════════════════════`);
    onLog(`[${this.ts()}] ${LOG_PREFIX.PHASE} ${phase}`);
    onLog(`[${this.ts()}] ════════════════════════════════════════════════════`);
  }

  private ts(): string {
    return new Date().toISOString();
  }
  
  private log(onLog: LogCallback, message: string, type?: string): void {
    const prefix = type ? `${type} ` : '';
    onLog(`[${this.ts()}] ${prefix}${message}`);
  }
  
  private logSuccess(onLog: LogCallback, message: string): void {
    onLog(`[${this.ts()}] ${LOG_PREFIX.SUCCESS} ${message}`);
  }
  
  private logError(onLog: LogCallback, message: string): void {
    onLog(`[${this.ts()}] ${LOG_PREFIX.ERROR} ${message}`);
  }
  
  private logWarning(onLog: LogCallback, message: string): void {
    onLog(`[${this.ts()}] ${LOG_PREFIX.WARNING} ${message}`);
  }
  
  private logInfo(onLog: LogCallback, message: string): void {
    onLog(`[${this.ts()}] ${LOG_PREFIX.INFO} ${message}`);
  }
  
  private logProgress(onLog: LogCallback, message: string): void {
    onLog(`[${this.ts()}] ${LOG_PREFIX.PROGRESS} ${message}`);
  }

  /**
   * Determine fuzz mode based on timeout
   */
  private determineFuzzMode(): FuzzMode {
    const timeout = this.job.timeout;
    
    if (timeout <= 120) return 'quick';      // 2 min or less
    if (timeout <= 600) return 'deep';       // 10 min or less
    if (timeout <= 1800) return 'flow';      // 30 min or less
    return 'adversarial';                     // More than 30 min
  }

  /**
   * Calculate fuzz runs based on timeout
   * More time = more thorough fuzzing
   * 
   * Based on real-world testing:
   * - Simple tests: ~2000-5000 runs/second
   * - Complex tests: ~100-500 runs/second
   * - We estimate conservatively at ~200 runs/second for complex DeFi tests
   */
  private calculateFuzzRuns(): number {
    const timeout = this.job.timeout;
    const mode = this.job.fuzzMode || this.determineFuzzMode();
    
    // Fixed presets based on mode and timeout
    // These are calibrated for practical execution times
    switch (mode) {
      case 'quick':
        // Quick mode: fast feedback
        if (timeout <= 120) return 1000;      // 2 min
        if (timeout <= 300) return 5000;      // 5 min
        return 10000;                          // 5+ min
        
      case 'deep':
        // Deep mode: thorough single-call fuzzing
        if (timeout <= 300) return 10000;     // 5 min
        if (timeout <= 600) return 50000;     // 10 min
        if (timeout <= 1800) return 100000;   // 30 min
        return 200000;                         // 30+ min
        
      case 'flow':
        // Flow mode: stateful sequences
        if (timeout <= 600) return 50000;     // 10 min
        if (timeout <= 1800) return 100000;   // 30 min
        if (timeout <= 3600) return 200000;   // 60 min
        return 500000;                         // 60+ min
        
      case 'adversarial':
        // Adversarial mode: maximum coverage
        if (timeout <= 600) return 100000;    // 10 min
        if (timeout <= 1800) return 250000;   // 30 min
        if (timeout <= 3600) return 500000;   // 60 min
        return 1000000;                        // 60+ min
        
      default:
        return 50000;
    }
  }

  private failResult(error: string): FuzzerResult {
    return {
      success: false,
      totalCalls: 0,
      failedProperties: 0,
      properties: [],
      error,
    };
  }

  private cancelledResult(): FuzzerResult {
    return {
      success: false,
      totalCalls: 0,
      failedProperties: 0,
      properties: [],
      error: 'Job cancelled',
    };
  }

  private cleanup(): void {
    fs.promises.rm(this.workDir, { recursive: true, force: true }).catch(() => {});
  }
}
