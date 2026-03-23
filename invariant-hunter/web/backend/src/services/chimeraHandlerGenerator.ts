/**
 * Chimera-Style Handler Generator
 * 
 * Implements best practices from the Recon team:
 * - Target function handlers with asActor/asAdmin modifiers
 * - Clamped handlers for reduced search space
 * - Ghost variables with BeforeAfter pattern
 * - Operation type grouping
 * - Inlined fuzz properties
 * - Stateless handlers for complex assertions
 * - Programmatic deployment support
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ContractFunction {
  name: string;
  inputs: FunctionInput[];
  outputs: FunctionOutput[];
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
  isAdmin?: boolean;
  visibility: 'public' | 'external' | 'internal' | 'private';
}

export interface FunctionInput {
  name: string;
  type: string;
  internalType?: string;
}

export interface FunctionOutput {
  name: string;
  type: string;
}

export interface StateVariable {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'internal';
}

export interface ContractAnalysis {
  name: string;
  functions: ContractFunction[];
  stateVariables: StateVariable[];
  hasOwner: boolean;
  hasAdmin: boolean;
  hasPausable: boolean;
  isToken: boolean;
  isVault: boolean;
}

export interface GeneratedHandler {
  filename: string;
  content: string;
  contractName: string;
}

export type OperationType = 'GENERIC' | 'ADD' | 'REMOVE' | 'TRANSFER' | 'ADMIN' | 'ORACLE';

// ═══════════════════════════════════════════════════════════════════════════
// CHIMERA HANDLER GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export class ChimeraHandlerGenerator {
  
  /**
   * Generate complete Chimera-style test suite
   */
  generateTestSuite(analysis: ContractAnalysis): GeneratedHandler[] {
    const handlers: GeneratedHandler[] = [];
    
    // 1. Setup contract
    handlers.push(this.generateSetup(analysis));
    
    // 2. Actor Manager
    handlers.push(this.generateActorManager(analysis));
    
    // 3. BeforeAfter ghost variables
    handlers.push(this.generateBeforeAfter(analysis));
    
    // 4. Target Functions (handlers)
    handlers.push(this.generateTargetFunctions(analysis));
    
    // 5. Properties
    handlers.push(this.generateProperties(analysis));
    
    // 6. Main Tester
    handlers.push(this.generateTester(analysis));
    
    return handlers;
  }

  /**
   * Generate Setup contract
   */
  private generateSetup(analysis: ContractAnalysis): GeneratedHandler {
    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
// import "./${analysis.name}.sol";

/**
 * @title Setup
 * @notice Deployment and configuration for ${analysis.name} test suite
 * @dev Following Chimera best practices:
 *      - Create your own test setup (don't reuse unit test setup)
 *      - Deploy only necessary contracts
 *      - Consider programmatic deployment for multi-dimensional testing
 */
abstract contract Setup is Test {
    // ═══════════════════════════════════════════════════════════════
    // TARGET CONTRACT
    // ═══════════════════════════════════════════════════════════════
    
    // ${analysis.name} public target;
    
    // ═══════════════════════════════════════════════════════════════
    // ACTORS
    // ═══════════════════════════════════════════════════════════════
    
    address internal admin;
    address internal user1;
    address internal user2;
    address internal user3;
    address internal attacker;
    
    address[] internal actors;
    address internal currentActor;
    
    // ═══════════════════════════════════════════════════════════════
    // DEPLOYMENT CONFIG (for programmatic deployment)
    // ═══════════════════════════════════════════════════════════════
    
    // Uncomment for programmatic deployment:
    // uint8 internal tokenDecimals;
    // uint256 internal initialSupply;
    
    // ═══════════════════════════════════════════════════════════════
    // SETUP
    // ═══════════════════════════════════════════════════════════════
    
    function setup() internal virtual {
        // Initialize actors
        admin = makeAddr("admin");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        user3 = makeAddr("user3");
        attacker = makeAddr("attacker");
        
        actors.push(user1);
        actors.push(user2);
        actors.push(user3);
        
        // Fund actors
        vm.deal(admin, 1000 ether);
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);
        vm.deal(attacker, 100 ether);
        
        // Deploy target contract
        // vm.prank(admin);
        // target = new ${analysis.name}(...);
        
        // Initial configuration
        // vm.prank(admin);
        // target.initialize(...);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PROGRAMMATIC DEPLOYMENT (optional)
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Deploy with random configuration
     * @dev Allows fuzzer to explore different deployment parameters
     */
    function _deployWithConfig(uint8 _decimals, uint256 _supply) internal {
        // tokenDecimals = bound(_decimals, 6, 24);
        // initialSupply = bound(_supply, 1e18, 1e30);
        // 
        // vm.prank(admin);
        // target = new ${analysis.name}(tokenDecimals, initialSupply);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════
    
    function _selectActor(uint256 seed) internal returns (address) {
        currentActor = actors[seed % actors.length];
        return currentActor;
    }
    
    function _getRandomActor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }
}
`;
    
    return {
      filename: 'Setup.sol',
      content,
      contractName: 'Setup',
    };
  }

  /**
   * Generate Actor Manager
   */
  private generateActorManager(analysis: ContractAnalysis): GeneratedHandler {
    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Setup.sol";

/**
 * @title ActorManager
 * @notice Manages actor pranking for efficient fuzzing
 * @dev Using asActor/asAdmin modifiers ensures:
 *      - Admin functions don't waste calls reverting on non-admin
 *      - Actor functions properly simulate different msg.senders
 */
abstract contract ActorManager is Setup {
    // ═══════════════════════════════════════════════════════════════
    // ACTOR MODIFIERS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Execute as a random actor
     * @dev Prevents wasting fuzz calls on access control reverts
     */
    modifier asActor() {
        vm.startPrank(currentActor);
        _;
        vm.stopPrank();
    }
    
    /**
     * @notice Execute as admin
     * @dev Use for admin-only functions to avoid wasted calls
     */
    modifier asAdmin() {
        vm.startPrank(admin);
        _;
        vm.stopPrank();
    }
    
    /**
     * @notice Execute as attacker
     */
    modifier asAttacker() {
        vm.startPrank(attacker);
        _;
        vm.stopPrank();
    }
    
    /**
     * @notice Execute as specific actor
     */
    modifier asSpecificActor(address actor) {
        vm.startPrank(actor);
        _;
        vm.stopPrank();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STATELESS MODIFIER
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Makes handler stateless - reverts after execution
     * @dev Use for complex assertions that shouldn't persist state
     *      Coverage is maintained, assertions happen before revert
     */
    modifier stateless() {
        _;
        revert("stateless");
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ALWAYS REVERT (for disabled handlers)
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Marks handler as intentionally disabled
     * @dev Use instead of commenting out to document intent
     */
    modifier alwaysRevert() {
        revert("handler disabled");
        _;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ACTOR SWITCHING
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Switch current actor (called by fuzzer)
     */
    function handler_switchActor(uint256 actorSeed) external {
        _selectActor(actorSeed);
    }
    
    /**
     * @notice Add new actor dynamically
     */
    function handler_addActor(address newActor) external {
        if (newActor != address(0) && newActor != admin) {
            actors.push(newActor);
            vm.deal(newActor, 100 ether);
        }
    }
}
`;
    
    return {
      filename: 'ActorManager.sol',
      content,
      contractName: 'ActorManager',
    };
  }

  /**
   * Generate BeforeAfter ghost variables contract
   */
  private generateBeforeAfter(analysis: ContractAnalysis): GeneratedHandler {
    // Generate ghost variable struct based on state variables
    const ghostVars = this.generateGhostVariables(analysis);
    
    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ActorManager.sol";

/**
 * @title BeforeAfter
 * @notice Ghost variables for tracking state changes
 * @dev Best practices:
 *      - Avoid computation in ghost updates (slows fuzzing)
 *      - NEVER put assertions in ghost updates (causes blindspots)
 *      - Avoid operations that may revert (prevents state exploration)
 */
abstract contract BeforeAfter is ActorManager {
    // ═══════════════════════════════════════════════════════════════
    // OPERATION TYPES (for grouping function effects)
    // ═══════════════════════════════════════════════════════════════
    
    enum OpType {
        GENERIC,
        ADD,        // deposit, mint, stake
        REMOVE,     // withdraw, burn, unstake
        TRANSFER,   // transfer, transferFrom
        ADMIN,      // pause, setFee, upgrade
        ORACLE      // price updates
    }
    
    OpType internal currentOperation;
    
    // ═══════════════════════════════════════════════════════════════
    // GHOST VARIABLES
    // ═══════════════════════════════════════════════════════════════
    
    struct Vars {
${ghostVars}
    }
    
    Vars internal _before;
    Vars internal _after;
    
    // Cumulative tracking
    uint256 internal ghost_totalAdded;
    uint256 internal ghost_totalRemoved;
    uint256 internal ghost_callCount;
    
    // Per-actor tracking
    mapping(address => uint256) internal ghost_actorDeposits;
    mapping(address => uint256) internal ghost_actorWithdrawals;
    
    // ═══════════════════════════════════════════════════════════════
    // UPDATE MODIFIERS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Update ghost variables before and after call
     */
    modifier updateGhosts() {
        currentOperation = OpType.GENERIC;
        __before();
        _;
        __after();
        ghost_callCount++;
    }
    
    /**
     * @notice Update ghost variables with operation type
     * @dev Use for grouping operations (ADD, REMOVE, etc.)
     */
    modifier updateGhostsWithType(OpType op) {
        currentOperation = op;
        __before();
        _;
        __after();
        ghost_callCount++;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // GHOST UPDATE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Capture state before handler execution
     * @dev Keep simple - no assertions, no reverts!
     */
    function __before() internal virtual {
        // Example ghost variable updates:
        // _before.totalSupply = target.totalSupply();
        // _before.userBalance = target.balanceOf(currentActor);
        // _before.contractBalance = address(target).balance;
    }
    
    /**
     * @notice Capture state after handler execution
     * @dev Keep simple - no assertions, no reverts!
     */
    function __after() internal virtual {
        // Example ghost variable updates:
        // _after.totalSupply = target.totalSupply();
        // _after.userBalance = target.balanceOf(currentActor);
        // _after.contractBalance = address(target).balance;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // HELPER GETTERS
    // ═══════════════════════════════════════════════════════════════
    
    function _supplyDelta() internal view returns (int256) {
        return int256(_after.totalSupply) - int256(_before.totalSupply);
    }
    
    function _balanceDelta() internal view returns (int256) {
        return int256(_after.userBalance) - int256(_before.userBalance);
    }
}
`;
    
    return {
      filename: 'BeforeAfter.sol',
      content,
      contractName: 'BeforeAfter',
    };
  }

  /**
   * Generate ghost variables based on contract analysis
   */
  private generateGhostVariables(analysis: ContractAnalysis): string {
    const vars: string[] = [];
    
    // Common ghost variables
    vars.push('        uint256 totalSupply;');
    vars.push('        uint256 userBalance;');
    vars.push('        uint256 contractBalance;');
    
    if (analysis.isVault) {
      vars.push('        uint256 totalAssets;');
      vars.push('        uint256 totalShares;');
      vars.push('        uint256 userShares;');
    }
    
    if (analysis.isToken) {
      vars.push('        uint256 allowance;');
    }
    
    if (analysis.hasPausable) {
      vars.push('        bool paused;');
    }
    
    // Add tracked state variables (filter out invalid types for structs)
    const invalidTypeKeywords = ['immutable', 'constant', 'mapping', 'function', 'contract', 'interface'];
    
    for (const stateVar of analysis.stateVariables) {
      // Skip if already added, not public, or has invalid type for struct
      if (stateVar.visibility !== 'public') continue;
      if (vars.some(v => v.includes(stateVar.name))) continue;
      
      const typeStr = stateVar.type.toLowerCase();
      if (invalidTypeKeywords.some(kw => typeStr.includes(kw))) continue;
      
      // Only add simple types that work in structs
      const validTypes = ['uint', 'int', 'bool', 'address', 'bytes32', 'bytes'];
      if (validTypes.some(t => typeStr.startsWith(t))) {
        vars.push(`        ${stateVar.type} ${stateVar.name};`);
      }
    }
    
    return vars.join('\n');
  }

  /**
   * Generate Target Functions (handlers)
   */
  private generateTargetFunctions(analysis: ContractAnalysis): GeneratedHandler {
    const handlers = this.generateHandlers(analysis);
    
    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./BeforeAfter.sol";

/**
 * @title TargetFunctions
 * @notice Handler functions for fuzzing ${analysis.name}
 * @dev Best practices:
 *      - One state-changing operation per handler (clean story)
 *      - Use asActor/asAdmin modifiers appropriately
 *      - Clamped handlers call unclamped handlers
 *      - Inlined properties for immediate assertions
 */
abstract contract TargetFunctions is BeforeAfter {
    // ═══════════════════════════════════════════════════════════════
    // CLAMPING HELPERS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Clamp value to range [min, max]
     */
    function between(uint256 value, uint256 min, uint256 max) internal pure returns (uint256) {
        return min + (value % (max - min + 1));
    }
    
    /**
     * @notice Clamp to non-zero
     */
    function nonZero(uint256 value) internal pure returns (uint256) {
        return value == 0 ? 1 : value;
    }
    
    /**
     * @notice Clamp to valid address
     */
    function validAddress(address addr) internal view returns (address) {
        if (addr == address(0)) return currentActor;
        return addr;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TARGET FUNCTION HANDLERS
    // ═══════════════════════════════════════════════════════════════
    
${handlers}
    
    // ═══════════════════════════════════════════════════════════════
    // DONATION HANDLERS (explore edge states)
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Donate ETH directly to contract
     * @dev Explores states not reachable via normal functions
     */
    function handler_donateEth(uint256 amount) public updateGhosts asActor {
        amount = between(amount, 0, 10 ether);
        // (bool success,) = address(target).call{value: amount}("");
        // Donation doesn't require success
    }
    
    /**
     * @notice Donate tokens directly to contract
     */
    function handler_donateTokens(uint256 amount) public updateGhosts asActor {
        amount = between(amount, 0, 1e24);
        // token.transfer(address(target), amount);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TIME MANIPULATION
    // ═══════════════════════════════════════════════════════════════
    
    function handler_warpTime(uint256 delta) public {
        delta = between(delta, 0, 365 days);
        vm.warp(block.timestamp + delta);
    }
    
    function handler_rollBlock(uint256 delta) public {
        delta = between(delta, 0, 100000);
        vm.roll(block.number + delta);
    }
}
`;
    
    return {
      filename: 'TargetFunctions.sol',
      content,
      contractName: 'TargetFunctions',
    };
  }

  /**
   * Generate handlers for each function
   */
  private generateHandlers(analysis: ContractAnalysis): string {
    const handlers: string[] = [];
    
    for (const func of analysis.functions) {
      // Skip view/pure functions
      if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
        continue;
      }
      
      // Skip internal/private
      if (func.visibility === 'internal' || func.visibility === 'private') {
        continue;
      }
      
      // Determine operation type
      const opType = this.getOperationType(func.name);
      const modifier = func.isAdmin ? 'asAdmin' : 'asActor';
      const ghostModifier = opType !== 'GENERIC' 
        ? `updateGhostsWithType(OpType.${opType})`
        : 'updateGhosts';
      
      // Generate unclamped handler
      const unclampedHandler = this.generateUnclampedHandler(analysis.name, func, modifier, ghostModifier);
      handlers.push(unclampedHandler);
      
      // Generate clamped handler if function has numeric inputs
      if (func.inputs.some(i => i.type.includes('uint') || i.type.includes('int'))) {
        const clampedHandler = this.generateClampedHandler(analysis.name, func);
        handlers.push(clampedHandler);
      }
    }
    
    return handlers.join('\n\n');
  }

  /**
   * Generate unclamped handler
   */
  private generateUnclampedHandler(
    contractName: string, 
    func: ContractFunction, 
    actorModifier: string,
    ghostModifier: string
  ): string {
    const params = func.inputs.map(i => `${i.type} ${i.name}`).join(', ');
    const args = func.inputs.map(i => i.name).join(', ');
    const handlerName = `${contractName.toLowerCase()}_${func.name}`;
    
    // Generate inlined property if applicable
    const inlinedProperty = this.generateInlinedProperty(func);
    
    return `    /**
     * @notice Handler for ${contractName}.${func.name}
     */
    function ${handlerName}(${params}) public ${ghostModifier} ${actorModifier} {
        // try target.${func.name}(${args}) {
        //     ${inlinedProperty}
        // } catch {
        //     // Expected revert cases
        // }
    }`;
  }

  /**
   * Generate clamped handler
   */
  private generateClampedHandler(contractName: string, func: ContractFunction): string {
    const params = func.inputs.map(i => `${i.type} ${i.name}`).join(', ');
    const handlerName = `${contractName.toLowerCase()}_${func.name}`;
    
    // Generate clamping logic
    const clampingLines: string[] = [];
    const clampedArgs: string[] = [];
    
    for (const input of func.inputs) {
      if (input.type.includes('uint')) {
        clampingLines.push(`        ${input.name} = between(${input.name}, 1, type(${input.type}).max / 2);`);
      } else if (input.type === 'address') {
        clampingLines.push(`        ${input.name} = validAddress(${input.name});`);
      }
      clampedArgs.push(input.name);
    }
    
    return `    /**
     * @notice Clamped handler for ${contractName}.${func.name}
     * @dev Reduces search space - calls unclamped handler
     */
    function ${handlerName}_clamped(${params}) public {
${clampingLines.join('\n')}
        ${handlerName}(${clampedArgs.join(', ')});
    }`;
  }

  /**
   * Generate inlined property for a function
   */
  private generateInlinedProperty(func: ContractFunction): string {
    const name = func.name.toLowerCase();
    
    if (name.includes('transfer')) {
      return `// Inlined property: balance changes match transfer amount
            // t(_before.userBalance - _after.userBalance == amount, "transfer amount mismatch");`;
    }
    
    if (name.includes('deposit') || name.includes('mint')) {
      return `// Inlined property: shares/tokens received > 0 for non-zero deposit
            // if (amount > 0) t(sharesReceived > 0, "zero shares for deposit");`;
    }
    
    if (name.includes('withdraw') || name.includes('redeem')) {
      return `// Inlined property: assets received > 0 for non-zero withdrawal
            // if (shares > 0) t(assetsReceived > 0, "zero assets for withdrawal");`;
    }
    
    return '// Add inlined property assertion here';
  }

  /**
   * Determine operation type from function name
   */
  private getOperationType(funcName: string): OperationType {
    const name = funcName.toLowerCase();
    
    if (name.includes('deposit') || name.includes('mint') || name.includes('stake') || name.includes('add')) {
      return 'ADD';
    }
    if (name.includes('withdraw') || name.includes('burn') || name.includes('unstake') || name.includes('remove')) {
      return 'REMOVE';
    }
    if (name.includes('transfer')) {
      return 'TRANSFER';
    }
    if (name.includes('pause') || name.includes('set') || name.includes('update') || name.includes('admin')) {
      return 'ADMIN';
    }
    if (name.includes('price') || name.includes('oracle')) {
      return 'ORACLE';
    }
    
    return 'GENERIC';
  }

  /**
   * Generate Properties contract
   */
  private generateProperties(analysis: ContractAnalysis): GeneratedHandler {
    const properties = this.generatePropertyChecks(analysis);
    
    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TargetFunctions.sol";
import {Test} from "forge-std/Test.sol";

/**
 * @title Properties
 * @notice Invariant properties for ${analysis.name}
 * @dev Property types:
 *      - Global: checked after every call sequence
 *      - Conditional: checked based on operation type
 *      - Inlined: checked immediately after specific handlers
 */
abstract contract Properties is TargetFunctions {
    // ═══════════════════════════════════════════════════════════════
    // ASSERTION HELPERS
    // ═══════════════════════════════════════════════════════════════
    
    function t(bool condition, string memory message) internal {
        if (!condition) {
            emit log_string(message);
            fail();
        }
    }
    
    function eq(uint256 a, uint256 b, string memory message) internal {
        if (a != b) {
            emit log_named_uint("Expected", b);
            emit log_named_uint("Actual", a);
            t(false, message);
        }
    }
    
    function gte(uint256 a, uint256 b, string memory message) internal {
        if (a < b) {
            emit log_named_uint("Value", a);
            emit log_named_uint("Min", b);
            t(false, message);
        }
    }
    
    function lte(uint256 a, uint256 b, string memory message) internal {
        if (a > b) {
            emit log_named_uint("Value", a);
            emit log_named_uint("Max", b);
            t(false, message);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // GLOBAL PROPERTIES (checked after every sequence)
    // ═══════════════════════════════════════════════════════════════
    
${properties.global}
    
    // ═══════════════════════════════════════════════════════════════
    // CONDITIONAL PROPERTIES (checked based on operation type)
    // ═══════════════════════════════════════════════════════════════
    
${properties.conditional}
    
    // ═══════════════════════════════════════════════════════════════
    // PRECISION LOSS PROPERTIES
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Check for precision loss in share calculations
     * @dev Use optimization mode to maximize the difference
     */
    function property_precision_loss() public view returns (bool) {
        // Example: check deposit/redeem round-trip
        // uint256 expectedAssets = ...;
        // uint256 actualAssets = ...;
        // return actualAssets >= expectedAssets - 1; // Allow 1 wei rounding
        return true;
    }
    
    /**
     * @notice Optimization target for precision loss
     * @dev Run with: echidna . --contract Tester --test-mode optimization
     */
    function optimize_precision_loss() public view returns (int256) {
        // Return the difference to maximize
        // return int256(expectedAssets) - int256(actualAssets);
        return 0;
    }
}
`;
    
    return {
      filename: 'Properties.sol',
      content,
      contractName: 'Properties',
    };
  }

  /**
   * Generate property checks based on contract type
   */
  private generatePropertyChecks(analysis: ContractAnalysis): { global: string; conditional: string } {
    const global: string[] = [];
    const conditional: string[] = [];
    
    // Universal properties
    global.push(`    /**
     * @notice Contract should never have negative balance (impossible but sanity check)
     */
    function invariant_solvency() public view returns (bool) {
        // return address(target).balance >= 0; // Always true for uint
        // For token: return token.balanceOf(address(target)) >= ghost_totalAdded - ghost_totalRemoved;
        return true;
    }`);
    
    // Token properties
    if (analysis.isToken) {
      global.push(`
    /**
     * @notice Sum of all balances equals total supply
     */
    function invariant_balances_sum_to_supply() public view returns (bool) {
        // uint256 sum = 0;
        // for (uint i = 0; i < actors.length; i++) {
        //     sum += target.balanceOf(actors[i]);
        // }
        // return sum <= target.totalSupply();
        return true;
    }
    
    /**
     * @notice No individual balance exceeds total supply
     */
    function invariant_balance_lte_supply() public view returns (bool) {
        // for (uint i = 0; i < actors.length; i++) {
        //     if (target.balanceOf(actors[i]) > target.totalSupply()) return false;
        // }
        return true;
    }`);
    }
    
    // Vault properties
    if (analysis.isVault) {
      global.push(`
    /**
     * @notice Total assets should match sum of deposits minus withdrawals
     */
    function invariant_assets_accounting() public view returns (bool) {
        // return target.totalAssets() >= ghost_totalAdded - ghost_totalRemoved;
        return true;
    }
    
    /**
     * @notice Share price should never be zero (after first deposit)
     */
    function invariant_share_price_positive() public view returns (bool) {
        // if (target.totalSupply() > 0) {
        //     return target.totalAssets() > 0;
        // }
        return true;
    }
    
    /**
     * @notice First depositor inflation attack protection
     */
    function invariant_no_inflation_attack() public view returns (bool) {
        // Shares should be proportional to assets
        // if (target.totalSupply() > 0 && target.totalAssets() > 0) {
        //     uint256 sharePrice = target.totalAssets() * 1e18 / target.totalSupply();
        //     return sharePrice < 1e36; // Reasonable upper bound
        // }
        return true;
    }`);
    }
    
    // Conditional properties based on operation type
    conditional.push(`    /**
     * @notice After ADD operation, balance should increase
     */
    function property_add_increases_balance() public view returns (bool) {
        if (currentOperation == OpType.ADD) {
            return _after.userBalance >= _before.userBalance;
        }
        return true;
    }
    
    /**
     * @notice After REMOVE operation, balance should decrease
     */
    function property_remove_decreases_balance() public view returns (bool) {
        if (currentOperation == OpType.REMOVE) {
            return _after.userBalance <= _before.userBalance;
        }
        return true;
    }
    
    /**
     * @notice TRANSFER should not change total supply
     */
    function property_transfer_preserves_supply() public view returns (bool) {
        if (currentOperation == OpType.TRANSFER) {
            return _after.totalSupply == _before.totalSupply;
        }
        return true;
    }`);
    
    return {
      global: global.join('\n'),
      conditional: conditional.join('\n'),
    };
  }

  /**
   * Generate main Tester contract
   */
  private generateTester(analysis: ContractAnalysis): GeneratedHandler {
    const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Properties.sol";
import "forge-std/StdInvariant.sol";

/**
 * @title ${analysis.name}Tester
 * @notice Main test contract combining all components
 * @dev Run with:
 *      Foundry: forge test --match-contract ${analysis.name}Tester
 *      Echidna: echidna . --contract ${analysis.name}Tester
 *      Medusa:  medusa fuzz --target ${analysis.name}Tester
 */
contract ${analysis.name}Tester is Properties, StdInvariant {
    // ═══════════════════════════════════════════════════════════════
    // SETUP
    // ═══════════════════════════════════════════════════════════════
    
    function setUp() public {
        setup();
        
        // Configure invariant testing
        // targetContract(address(target));
        
        // Exclude setup functions from fuzzing
        // excludeSelector(Setup.setup.selector);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // FOUNDRY INVARIANT TESTS
    // ═══════════════════════════════════════════════════════════════
    
    function invariant_solvency_check() public {
        t(invariant_solvency(), "SOLVENCY VIOLATED");
    }
    
    function invariant_add_increases() public {
        t(property_add_increases_balance(), "ADD should increase balance");
    }
    
    function invariant_remove_decreases() public {
        t(property_remove_decreases_balance(), "REMOVE should decrease balance");
    }
    
    function invariant_transfer_supply() public {
        t(property_transfer_preserves_supply(), "TRANSFER changed supply");
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ECHIDNA PROPERTY TESTS
    // ═══════════════════════════════════════════════════════════════
    
    // Echidna looks for functions starting with "echidna_"
    function echidna_solvency() public view returns (bool) {
        return invariant_solvency();
    }
    
    function echidna_add_increases() public view returns (bool) {
        return property_add_increases_balance();
    }
    
    function echidna_remove_decreases() public view returns (bool) {
        return property_remove_decreases_balance();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // MEDUSA PROPERTY TESTS
    // ═══════════════════════════════════════════════════════════════
    
    // Medusa looks for functions starting with "fuzz_"
    function fuzz_solvency() public view {
        assert(invariant_solvency());
    }
    
    function fuzz_add_increases() public view {
        assert(property_add_increases_balance());
    }
}
`;
    
    return {
      filename: `${analysis.name}Tester.sol`,
      content,
      contractName: `${analysis.name}Tester`,
    };
  }

  /**
   * Analyze a Solidity contract file
   */
  async analyzeContract(filePath: string): Promise<ContractAnalysis> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const name = path.basename(filePath, '.sol');
    
    const analysis: ContractAnalysis = {
      name,
      functions: [],
      stateVariables: [],
      hasOwner: /owner|Ownable/i.test(content),
      hasAdmin: /admin|onlyAdmin/i.test(content),
      hasPausable: /pause|Pausable/i.test(content),
      isToken: /ERC20|ERC721|balanceOf|transfer|approve/i.test(content),
      isVault: /ERC4626|deposit|withdraw|redeem|totalAssets/i.test(content),
    };
    
    // Parse functions
    const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(public|external|internal|private)?\s*(view|pure|payable)?\s*(?:returns\s*\(([^)]*)\))?/g;
    let match;
    
    while ((match = funcRegex.exec(content)) !== null) {
      const [, funcName, params, visibility, mutability, returns] = match;
      
      const inputs: FunctionInput[] = params
        .split(',')
        .filter(p => p.trim())
        .map(p => {
          const parts = p.trim().split(/\s+/);
          return {
            type: parts[0],
            name: parts[parts.length - 1] || 'param',
          };
        });
      
      const isAdmin = /onlyOwner|onlyAdmin|require\s*\(\s*msg\.sender\s*==\s*(owner|admin)/i.test(
        content.slice(match.index, match.index + 500)
      );
      
      analysis.functions.push({
        name: funcName,
        inputs,
        outputs: [],
        stateMutability: (mutability as any) || 'nonpayable',
        visibility: (visibility as any) || 'public',
        isAdmin,
      });
    }
    
    // Parse state variables
    const varRegex = /(uint\d*|int\d*|address|bool|bytes\d*|string|mapping\([^)]+\))\s+(public|private|internal)?\s+(\w+)\s*[;=]/g;
    
    while ((match = varRegex.exec(content)) !== null) {
      const [, type, visibility, name] = match;
      analysis.stateVariables.push({
        name,
        type,
        visibility: (visibility as any) || 'internal',
      });
    }
    
    return analysis;
  }

  /**
   * Write generated handlers to disk
   */
  async writeHandlers(handlers: GeneratedHandler[], outputDir: string): Promise<string[]> {
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    const writtenFiles: string[] = [];
    
    for (const handler of handlers) {
      const filePath = path.join(outputDir, handler.filename);
      await fs.promises.writeFile(filePath, handler.content);
      writtenFiles.push(filePath);
    }
    
    return writtenFiles;
  }
}

export const chimeraGenerator = new ChimeraHandlerGenerator();
