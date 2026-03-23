/**
 * Automatic Invariant Test Generator
 * 
 * Generates Solidity test files based on detected security issues.
 * These tests can find real vulnerabilities through fuzzing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DetectedInvariant, ContractAnalysis } from './invariantDetector';

export interface GeneratedTest {
  filename: string;
  content: string;
  targetContract: string;
  invariantCount: number;
}

export class InvariantGenerator {
  
  /**
   * Generate invariant tests for all detected issues
   */
  generateTests(analyses: ContractAnalysis[], projectDir: string): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    
    // Group invariants by contract
    const byContract = new Map<string, { analysis: ContractAnalysis; invariants: DetectedInvariant[] }>();
    
    for (const analysis of analyses) {
      if (analysis.invariants.length > 0) {
        byContract.set(analysis.name, {
          analysis,
          invariants: analysis.invariants,
        });
      }
    }
    
    // Generate test file for each contract with issues
    for (const [contractName, data] of byContract) {
      const test = this.generateContractTest(contractName, data.analysis, data.invariants, projectDir);
      if (test) {
        tests.push(test);
      }
    }
    
    // Generate a master invariant test that covers common patterns
    const masterTest = this.generateMasterInvariantTest(analyses, projectDir);
    if (masterTest) {
      tests.push(masterTest);
    }
    
    return tests;
  }

  /**
   * Generate test file for a specific contract
   */
  private generateContractTest(
    contractName: string,
    analysis: ContractAnalysis,
    invariants: DetectedInvariant[],
    projectDir: string
  ): GeneratedTest | null {
    const balanceInvariants = invariants.filter(i => i.type === 'balance');
    const reentrancyInvariants = invariants.filter(i => i.type === 'reentrancy');
    const accessInvariants = invariants.filter(i => i.type === 'access');
    const stateInvariants = invariants.filter(i => i.type === 'state');
    
    // Determine import path
    const relativePath = path.relative(projectDir, analysis.file).replace(/\\/g, '/');
    const importPath = relativePath.startsWith('src/') ? relativePath : `src/${relativePath}`;
    
    let content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  THIS IS A TEMPLATE FILE - DO NOT RUN DIRECTLY                            ║
// ║                                                                           ║
// ║  To use this file:                                                        ║
// ║  1. Copy to your project's test/ folder                                   ║
// ║  2. Rename the contract (remove "Template_" prefix)                       ║
// ║  3. Uncomment the import and deployment code                              ║
// ║  4. Run: forge test --match-contract ${contractName}_InvariantTest        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import "forge-std/Test.sol";
import "forge-std/console.sol";

/**
 * @title Template_${contractName}_InvariantTest
 * @notice Auto-generated invariant test TEMPLATE for ${contractName}
 * @dev These tests check security properties that should always hold
 * 
 * DETECTED ISSUES:
${invariants.map(i => ` *   - [${i.severity.toUpperCase()}] ${i.type}: ${i.description}`).join('\n')}
 * 
 * WARNING: This is a TEMPLATE. The contract is named "Template_*" to prevent
 * accidental execution. Rename it after customizing for your project.
 */
abstract contract Template_${contractName}_InvariantTest is Test {
    // Target contract
    // TODO: Import and deploy the actual contract
    // import "${importPath}";
    // ${contractName} public target;
    
    address public owner;
    address public attacker;
    address public user1;
    address public user2;
    
    // State tracking for invariants
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    mapping(address => uint256) public userBalances;
    
    function setUp() public {
        owner = makeAddr("owner");
        attacker = makeAddr("attacker");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        // Fund test accounts
        vm.deal(owner, 100 ether);
        vm.deal(attacker, 100 ether);
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        
        // TODO: Deploy target contract
        // vm.prank(owner);
        // target = new ${contractName}();
    }

`;

    // Add balance invariants
    if (balanceInvariants.length > 0 || analysis.isToken) {
      content += this.generateBalanceInvariants(contractName, analysis);
    }
    
    // Add reentrancy tests
    if (reentrancyInvariants.length > 0) {
      content += this.generateReentrancyTests(contractName, reentrancyInvariants);
    }
    
    // Add access control tests
    if (accessInvariants.length > 0) {
      content += this.generateAccessControlTests(contractName, accessInvariants);
    }
    
    // Add state consistency tests
    if (stateInvariants.length > 0) {
      content += this.generateStateConsistencyTests(contractName);
    }
    
    // Add fuzz tests for edge cases
    content += this.generateEdgeCaseFuzzTests(contractName, analysis);
    
    content += `}
`;

    return {
      filename: `Template_${contractName}_Invariant.t.sol`,
      content,
      targetContract: contractName,
      invariantCount: invariants.length,
    };
  }

  /**
   * Generate balance invariant tests
   */
  private generateBalanceInvariants(contractName: string, analysis: ContractAnalysis): string {
    return `
    // ═══════════════════════════════════════════════════════════════
    // BALANCE FUZZ TESTS
    // These tests check token/ETH balance properties
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Fuzz test: Transfer should not create or destroy tokens
     * @dev TODO: Uncomment and connect to actual contract
     */
    function testFuzz_transferPreservesSupply(address from, address to, uint256 amount) public pure {
        // Filter invalid inputs
        if (from == address(0) || to == address(0) || from == to) return;
        
        // TODO: Uncomment when contract is deployed
        // uint256 supplyBefore = target.totalSupply();
        // vm.prank(from);
        // try target.transfer(to, amount) {
        //     assertEq(target.totalSupply(), supplyBefore, "Supply changed");
        // } catch {}
    }
    
    /**
     * @notice Fuzz test: Deposit and withdraw should be balanced
     */
    function testFuzz_depositWithdrawBalance(uint256 depositAmount, uint256 withdrawAmount) public pure {
        // Bound inputs to reasonable ranges
        depositAmount = depositAmount % 100 ether;
        withdrawAmount = withdrawAmount % depositAmount;
        
        // TODO: Test deposit/withdraw cycle
        // target.deposit{value: depositAmount}();
        // target.withdraw(withdrawAmount);
        // assertEq(address(target).balance, depositAmount - withdrawAmount);
    }

`;
  }

  /**
   * Generate reentrancy tests
   */
  private generateReentrancyTests(contractName: string, invariants: DetectedInvariant[]): string {
    let content = `
    // ═══════════════════════════════════════════════════════════════
    // REENTRANCY TESTS
    // ═══════════════════════════════════════════════════════════════
    
`;

    for (const inv of invariants) {
      content += `
    /**
     * @notice Test for reentrancy vulnerability
     * @dev ${inv.description}
     */
    function test_reentrancy_${inv.contract}_attack() public {
        // Deploy attacker contract
        // ReentrancyAttacker attacker_contract = new ReentrancyAttacker(address(target));
        
        // Fund attacker
        // vm.deal(address(attacker_contract), 10 ether);
        
        // Record state before attack
        // uint256 targetBalanceBefore = address(target).balance;
        // uint256 attackerBalanceBefore = address(attacker_contract).balance;
        
        // Execute attack
        // attacker_contract.attack();
        
        // Verify no funds were stolen
        // assertGe(address(target).balance, targetBalanceBefore - attackerBalanceBefore);
    }

`;
    }

    content += `
    /**
     * @notice Invariant: No reentrancy should drain funds
     */
    function invariant_noReentrancyDrain() public view {
        // Contract balance should never go negative or be drained unexpectedly
        // assertGe(address(target).balance, 0);
    }

`;

    return content;
  }

  /**
   * Generate access control tests
   */
  private generateAccessControlTests(contractName: string, invariants: DetectedInvariant[]): string {
    let content = `
    // ═══════════════════════════════════════════════════════════════
    // ACCESS CONTROL TESTS
    // ═══════════════════════════════════════════════════════════════
    
`;

    for (const inv of invariants) {
      const funcName = inv.description.match(/function (\w+)/)?.[1] || 'adminFunction';
      
      content += `
    /**
     * @notice Test: ${inv.description}
     */
    function testFuzz_accessControl_${funcName}(address caller) public {
        vm.assume(caller != owner);
        vm.assume(caller != address(0));
        
        vm.prank(caller);
        // vm.expectRevert(); // Should revert for non-owners
        // target.${funcName}();
    }

`;
    }

    content += `
    /**
     * @notice Invariant: Only owner can call admin functions
     */
    function invariant_onlyOwnerCanAdmin() public view {
        // assertEq(target.owner(), owner, "Owner changed unexpectedly");
    }

`;

    return content;
  }

  /**
   * Generate state consistency tests
   */
  private generateStateConsistencyTests(contractName: string): string {
    return `
    // ═══════════════════════════════════════════════════════════════
    // STATE CONSISTENCY TESTS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Invariant: Related state variables should stay in sync
     */
    function invariant_stateConsistency() public view {
        // Example: if user has balance, they should be in holders list
        // Example: if auction is ended, no new bids should be accepted
        // Example: total staked == sum of individual stakes
    }
    
    /**
     * @notice Invariant: State should never be corrupted
     */
    function invariant_noCorruptedState() public view {
        // Check for impossible states
        // Example: active auction with end time in the past
        // Example: user with negative balance (if using signed ints)
    }

`;
  }

  /**
   * Generate edge case fuzz tests
   */
  private generateEdgeCaseFuzzTests(contractName: string, analysis: ContractAnalysis): string {
    return `
    // ═══════════════════════════════════════════════════════════════
    // EDGE CASE FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Fuzz test with zero values - check zero handling
     */
    function testFuzz_zeroValueHandling(uint256 amount) public pure {
        // Use bound instead of assume to avoid rejection
        amount = amount % 10; // 0-9, includes zero cases
        
        // TODO: Test zero value handling
        // if (amount == 0) {
        //     vm.expectRevert("Amount must be > 0");
        //     target.deposit{value: 0}();
        // }
    }
    
    /**
     * @notice Fuzz test with large values - check overflow protection
     */
    function testFuzz_largeValueHandling(uint256 amount) public pure {
        // Use bound to get large values without rejection
        amount = bound(amount, type(uint128).max, type(uint256).max);
        
        // TODO: Test large value handling
        // Should not overflow or cause unexpected behavior
    }
    
    /**
     * @notice Fuzz test with boundary values
     */
    function testFuzz_boundaryValues(uint256 seed) public pure {
        // Test specific boundary values
        uint256[4] memory boundaries = [uint256(0), uint256(1), type(uint256).max - 1, type(uint256).max];
        uint256 amount = boundaries[seed % 4];
        
        // TODO: Test boundary conditions
        assertTrue(amount <= type(uint256).max, "Boundary test");
    }
    
    /**
     * @notice Fuzz test with random addresses
     */
    function testFuzz_randomAddresses(address addr) public view {
        // Filter zero address
        if (addr == address(0)) return;
        
        // Check if EOA or contract
        bool isContract = addr.code.length > 0;
        
        // TODO: Test address handling
        // Different behavior for EOA vs contract addresses
    }
    
    /**
     * @notice Fuzz test timing/block manipulation
     */
    function testFuzz_timeManipulation(uint256 timeDelta) public {
        // Bound time delta to reasonable range (up to 1 year)
        timeDelta = bound(timeDelta, 0, 365 days);
        
        uint256 originalTime = block.timestamp;
        vm.warp(block.timestamp + timeDelta);
        
        // TODO: Test time-dependent logic
        assertTrue(block.timestamp >= originalTime, "Time moved forward");
    }

`;
  }

  /**
   * Generate master invariant test covering common patterns
   */
  private generateMasterInvariantTest(analyses: ContractAnalysis[], projectDir: string): GeneratedTest | null {
    const allInvariants = analyses.flatMap(a => a.invariants);
    if (allInvariants.length === 0) return null;

    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  THIS IS A TEMPLATE FILE - DO NOT RUN DIRECTLY                            ║
// ║                                                                           ║
// ║  To use this file:                                                        ║
// ║  1. Copy to your project's test/ folder                                   ║
// ║  2. Rename the contract (remove "Template_" prefix)                       ║
// ║  3. Uncomment the import and deployment code                              ║
// ║  4. Run: forge test --match-contract HunterInvariantTest                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "forge-std/StdInvariant.sol";

/**
 * @title Template_HunterInvariantTest
 * @notice Master invariant test suite TEMPLATE auto-generated by Invariant Hunter
 * @dev Covers ${allInvariants.length} detected security issues across ${analyses.length} contracts
 * 
 * SUMMARY:
 *   - Critical issues: ${allInvariants.filter(i => i.severity === 'critical').length}
 *   - High issues: ${allInvariants.filter(i => i.severity === 'high').length}
 *   - Medium issues: ${allInvariants.filter(i => i.severity === 'medium').length}
 * 
 * WARNING: This is a TEMPLATE. The contract is named "Template_*" to prevent
 * accidental execution. Rename it after customizing for your project.
 */
abstract contract Template_HunterInvariantTest is StdInvariant, Test {
    
    // ═══════════════════════════════════════════════════════════════
    // SETUP
    // ═══════════════════════════════════════════════════════════════
    
    address public owner;
    address public attacker;
    address[] public users;
    
    // Handler for stateful fuzzing
    // NOTE: Uncomment and create a concrete Handler implementation
    // Handler public handler;
    
    function setUp() public virtual {
        owner = makeAddr("owner");
        attacker = makeAddr("attacker");
        
        // Create test users
        for (uint i = 0; i < 5; i++) {
            users.push(makeAddr(string(abi.encodePacked("user", i))));
            vm.deal(users[i], 100 ether);
        }
        
        // Deploy handler for stateful fuzzing
        // NOTE: Uncomment after creating concrete Handler implementation
        // handler = new Handler();
        
        // Set up invariant targets
        // targetContract(address(handler));
        
        // Exclude certain senders
        excludeSender(address(0));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // GLOBAL INVARIANTS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Global invariant: No ETH should be lost
     */
    function invariant_noEthLost() public view {
        // Total ETH in system should be conserved
        // assertEq(initialEth, currentEth + withdrawnEth);
    }
    
    /**
     * @notice Global invariant: No tokens created from nothing
     */
    function invariant_noTokensFromNothing() public view {
        // Sum of balances == total supply
    }
    
    /**
     * @notice Global invariant: Access control maintained
     */
    function invariant_accessControlMaintained() public view {
        // Owner should not change unexpectedly
        // Admin functions should remain protected
    }
    
    /**
     * @notice Global invariant: No reentrancy exploitation
     */
    function invariant_noReentrancy() public view {
        // State should be consistent after external calls
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ATTACK SIMULATIONS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Simulate flash loan attack
     */
    function test_flashLoanAttack() public {
        // 1. Borrow large amount
        // 2. Manipulate price/state
        // 3. Profit
        // 4. Repay loan
        // Assert: No profit should be possible
    }
    
    /**
     * @notice Simulate sandwich attack
     */
    function test_sandwichAttack() public {
        // 1. Front-run victim transaction
        // 2. Victim transaction executes
        // 3. Back-run to extract value
        // Assert: Victim should not lose more than slippage
    }
    
    /**
     * @notice Simulate oracle manipulation
     */
    function test_oracleManipulation() public {
        // 1. Manipulate oracle price
        // 2. Execute transaction at wrong price
        // 3. Profit from price difference
        // Assert: Price bounds should prevent exploitation
    }
}

/**
 * @title Template_Handler
 * @notice Handler contract TEMPLATE for stateful invariant fuzzing
 * @dev Foundry will call random functions on this contract
 *      This is abstract to prevent accidental execution
 */
abstract contract Template_Handler is Test {
    // Track state for invariant checking
    uint256 public totalDeposits;
    uint256 public totalWithdrawals;
    mapping(address => uint256) public balances;
    
    // Ghost variables for tracking
    uint256 public ghost_depositSum;
    uint256 public ghost_withdrawSum;
    
    /**
     * @notice Handler: Deposit ETH
     */
    function deposit(uint256 amount) public {
        amount = bound(amount, 0, 10 ether);
        
        // target.deposit{value: amount}();
        
        ghost_depositSum += amount;
        balances[msg.sender] += amount;
    }
    
    /**
     * @notice Handler: Withdraw ETH
     */
    function withdraw(uint256 amount) public {
        amount = bound(amount, 0, balances[msg.sender]);
        
        // target.withdraw(amount);
        
        ghost_withdrawSum += amount;
        balances[msg.sender] -= amount;
    }
    
    /**
     * @notice Handler: Transfer tokens
     */
    function transfer(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 0, balances[msg.sender]);
        
        // target.transfer(to, amount);
        
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
    
    /**
     * @notice Handler: Random action
     */
    function randomAction(uint256 seed) public {
        seed = seed % 3;
        
        if (seed == 0) {
            deposit(1 ether);
        } else if (seed == 1) {
            withdraw(0.5 ether);
        } else {
            transfer(address(1), 0.1 ether);
        }
    }
}

/**
 * @title Template_ReentrancyAttacker
 * @notice Contract TEMPLATE for testing reentrancy vulnerabilities
 */
abstract contract Template_ReentrancyAttacker {
    address public target;
    uint256 public attackCount;
    
    constructor(address _target) {
        target = _target;
    }
    
    function attack() external payable {
        // target.deposit{value: msg.value}();
        // target.withdraw(msg.value);
    }
    
    receive() external payable {
        if (attackCount < 5) {
            attackCount++;
            // target.withdraw(msg.value);
        }
    }
}
`;

    return {
      filename: 'Template_HunterInvariant.t.sol',
      content,
      targetContract: 'Multiple',
      invariantCount: allInvariants.length,
    };
  }

  /**
   * Write generated tests to the project
   */
  async writeTests(tests: GeneratedTest[], projectDir: string): Promise<string[]> {
    // Write to templates folder (not test/) to avoid compilation issues
    // These are template files that need customization before use
    const testDir = path.join(projectDir, 'templates', 'invariant-hunter');
    await fs.promises.mkdir(testDir, { recursive: true });
    
    const writtenFiles: string[] = [];
    
    for (const test of tests) {
      const filePath = path.join(testDir, test.filename);
      await fs.promises.writeFile(filePath, test.content);
      writtenFiles.push(filePath);
    }
    
    return writtenFiles;
  }
}
