/**
 * Advanced Fuzzing Engine
 * 
 * Implements multi-layered fuzzing for real bug discovery:
 * 
 * Layer 1: Input Fuzzing - Boundary values, edge cases, special inputs
 * Layer 2: Flow Fuzzing - Multi-call sequences, actor switching
 * Layer 3: Property Fuzzing - Invariant checks after sequences
 * 
 * Fuzz Modes:
 * - Quick: Fast feedback, low runs
 * - Deep: High runs, boundary bias
 * - Flow: Stateful sequences, multiple actors
 * - Adversarial: Unauthorized callers, grief patterns
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FuzzMode = 'quick' | 'deep' | 'flow' | 'adversarial';

export interface FuzzConfig {
  mode: FuzzMode;
  runs: number;
  timeout: number;
  seed?: number;
  boundaryBias: boolean;
  multiActor: boolean;
  sequenceLength: number;
  verbosity: number;
}

export interface FuzzFlow {
  name: string;
  category: 'token' | 'vault' | 'lending' | 'governance' | 'staking' | 'general';
  steps: FlowStep[];
  actors: string[];
  postconditions: string[];
}

export interface FlowStep {
  action: string;
  actor: string;
  params: string[];
  expectedOutcome?: 'success' | 'revert' | 'any';
}

export interface BoundaryValue {
  name: string;
  value: string;
  description: string;
}

export interface FuzzResult {
  mode: FuzzMode;
  totalRuns: number;
  failures: FuzzFailure[];
  coverage: number;
  suspiciousFlows: SuspiciousFlow[];
  recommendations: string[];
}

export interface FuzzFailure {
  test: string;
  inputs: Record<string, string>;
  callSequence?: string[];
  actors?: string[];
  revertReason?: string;
  bugCategory: BugCategory;
  reproCommand: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface SuspiciousFlow {
  description: string;
  sequence: string[];
  observation: string;
  likelihood: 'high' | 'medium' | 'low';
}

export type BugCategory = 
  | 'reentrancy'
  | 'access_control'
  | 'integer_overflow'
  | 'rounding_error'
  | 'state_corruption'
  | 'balance_mismatch'
  | 'unauthorized_action'
  | 'dos'
  | 'front_running'
  | 'unknown';

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDARY VALUES - Where bugs live
// ═══════════════════════════════════════════════════════════════════════════

export const BOUNDARY_VALUES: BoundaryValue[] = [
  // Zero and near-zero
  { name: 'ZERO', value: '0', description: 'Zero value - division, empty state' },
  { name: 'ONE', value: '1', description: 'Minimum positive - off-by-one' },
  { name: 'TWO', value: '2', description: 'Small value - rounding issues' },
  
  // Max values
  { name: 'MAX_UINT8', value: '255', description: 'Max uint8' },
  { name: 'MAX_UINT16', value: '65535', description: 'Max uint16' },
  { name: 'MAX_UINT32', value: '4294967295', description: 'Max uint32' },
  { name: 'MAX_UINT64', value: '18446744073709551615', description: 'Max uint64' },
  { name: 'MAX_UINT128', value: '340282366920938463463374607431768211455', description: 'Max uint128' },
  { name: 'MAX_UINT256', value: '115792089237316195423570985008687907853269984665640564039457584007913129639935', description: 'Max uint256' },
  
  // Near-max (overflow triggers)
  { name: 'MAX_UINT256_MINUS_1', value: '115792089237316195423570985008687907853269984665640564039457584007913129639934', description: 'Max-1 overflow check' },
  { name: 'MAX_UINT128_PLUS_1', value: '340282366920938463463374607431768211456', description: 'Overflow uint128' },
  
  // Common DeFi values
  { name: 'ONE_ETHER', value: '1000000000000000000', description: '1e18 - standard token decimals' },
  { name: 'ONE_GWEI', value: '1000000000', description: '1e9 - gas price unit' },
  { name: 'ONE_USDC', value: '1000000', description: '1e6 - USDC decimals' },
  
  // Rounding edge cases
  { name: 'NEAR_ZERO_FRACTION', value: '1', description: 'Smallest fraction' },
  { name: 'HALF_MAX', value: '57896044618658097711785492504343953926634992332820282019728792003956564819967', description: 'Half of max uint256' },
  
  // Special addresses
  { name: 'ZERO_ADDRESS', value: '0x0000000000000000000000000000000000000000', description: 'Zero address' },
  { name: 'DEAD_ADDRESS', value: '0x000000000000000000000000000000000000dEaD', description: 'Burn address' },
  { name: 'ONE_ADDRESS', value: '0x0000000000000000000000000000000000000001', description: 'Precompile range' },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMMON FUZZ FLOWS - Where real bugs hide
// ═══════════════════════════════════════════════════════════════════════════

export const TOKEN_FLOWS: FuzzFlow[] = [
  {
    name: 'mint_transfer_burn',
    category: 'token',
    steps: [
      { action: 'mint', actor: 'admin', params: ['user1', 'amount'] },
      { action: 'transfer', actor: 'user1', params: ['user2', 'amount'] },
      { action: 'burn', actor: 'user2', params: ['amount'] },
    ],
    actors: ['admin', 'user1', 'user2'],
    postconditions: ['totalSupply == initialSupply', 'balanceOf(user1) == 0', 'balanceOf(user2) == 0'],
  },
  {
    name: 'approve_transferFrom_drain',
    category: 'token',
    steps: [
      { action: 'approve', actor: 'user1', params: ['attacker', 'MAX_UINT256'] },
      { action: 'transferFrom', actor: 'attacker', params: ['user1', 'attacker', 'balance'] },
    ],
    actors: ['user1', 'attacker'],
    postconditions: ['balanceOf(user1) == 0', 'allowance reset or reduced'],
  },
  {
    name: 'transfer_to_self',
    category: 'token',
    steps: [
      { action: 'transfer', actor: 'user1', params: ['user1', 'amount'] },
    ],
    actors: ['user1'],
    postconditions: ['balanceOf(user1) unchanged', 'totalSupply unchanged'],
  },
  {
    name: 'double_approval_overwrite',
    category: 'token',
    steps: [
      { action: 'approve', actor: 'user1', params: ['spender', 'amount1'] },
      { action: 'approve', actor: 'user1', params: ['spender', 'amount2'] },
    ],
    actors: ['user1', 'spender'],
    postconditions: ['allowance == amount2', 'no race condition'],
  },
];

export const VAULT_FLOWS: FuzzFlow[] = [
  {
    name: 'deposit_withdraw_cycle',
    category: 'vault',
    steps: [
      { action: 'deposit', actor: 'user1', params: ['amount'] },
      { action: 'withdraw', actor: 'user1', params: ['amount'] },
    ],
    actors: ['user1'],
    postconditions: ['user gets back deposited amount', 'vault balance unchanged'],
  },
  {
    name: 'deposit_redeem_rounding',
    category: 'vault',
    steps: [
      { action: 'deposit', actor: 'user1', params: ['smallAmount'] },
      { action: 'redeem', actor: 'user1', params: ['shares'] },
    ],
    actors: ['user1'],
    postconditions: ['no rounding loss > 1 wei', 'shares == 0 after full redeem'],
  },
  {
    name: 'multi_user_deposit_withdraw',
    category: 'vault',
    steps: [
      { action: 'deposit', actor: 'user1', params: ['amount1'] },
      { action: 'deposit', actor: 'user2', params: ['amount2'] },
      { action: 'withdraw', actor: 'user1', params: ['amount1'] },
      { action: 'withdraw', actor: 'user2', params: ['amount2'] },
    ],
    actors: ['user1', 'user2'],
    postconditions: ['each user gets their deposit back', 'no cross-user accounting bug'],
  },
  {
    name: 'zero_deposit_attack',
    category: 'vault',
    steps: [
      { action: 'deposit', actor: 'attacker', params: ['0'], expectedOutcome: 'revert' },
    ],
    actors: ['attacker'],
    postconditions: ['zero deposit should revert or return 0 shares'],
  },
  {
    name: 'first_depositor_inflation',
    category: 'vault',
    steps: [
      { action: 'deposit', actor: 'attacker', params: ['1'] },
      { action: 'donate', actor: 'attacker', params: ['largeAmount'] },
      { action: 'deposit', actor: 'victim', params: ['amount'] },
      { action: 'withdraw', actor: 'attacker', params: ['all'] },
    ],
    actors: ['attacker', 'victim'],
    postconditions: ['attacker should not profit at victim expense'],
  },
];

export const LENDING_FLOWS: FuzzFlow[] = [
  {
    name: 'deposit_borrow_repay',
    category: 'lending',
    steps: [
      { action: 'depositCollateral', actor: 'user1', params: ['collateralAmount'] },
      { action: 'borrow', actor: 'user1', params: ['borrowAmount'] },
      { action: 'repay', actor: 'user1', params: ['borrowAmount'] },
      { action: 'withdrawCollateral', actor: 'user1', params: ['collateralAmount'] },
    ],
    actors: ['user1'],
    postconditions: ['user gets collateral back', 'no leftover debt'],
  },
  {
    name: 'liquidation_threshold',
    category: 'lending',
    steps: [
      { action: 'depositCollateral', actor: 'user1', params: ['collateralAmount'] },
      { action: 'borrow', actor: 'user1', params: ['maxBorrow'] },
      { action: 'updatePrice', actor: 'oracle', params: ['lowerPrice'] },
      { action: 'liquidate', actor: 'liquidator', params: ['user1', 'debtAmount'] },
    ],
    actors: ['user1', 'oracle', 'liquidator'],
    postconditions: ['liquidator gets bonus', 'user1 position reduced', 'protocol solvent'],
  },
  {
    name: 'over_repay_attack',
    category: 'lending',
    steps: [
      { action: 'borrow', actor: 'user1', params: ['amount'] },
      { action: 'repay', actor: 'user1', params: ['amount * 2'] },
    ],
    actors: ['user1'],
    postconditions: ['excess should be refunded or reverted'],
  },
];

export const GOVERNANCE_FLOWS: FuzzFlow[] = [
  {
    name: 'pause_action_unpause',
    category: 'governance',
    steps: [
      { action: 'pause', actor: 'admin', params: [] },
      { action: 'deposit', actor: 'user1', params: ['amount'], expectedOutcome: 'revert' },
      { action: 'unpause', actor: 'admin', params: [] },
      { action: 'deposit', actor: 'user1', params: ['amount'], expectedOutcome: 'success' },
    ],
    actors: ['admin', 'user1'],
    postconditions: ['paused state blocks actions', 'unpaused allows actions'],
  },
  {
    name: 'ownership_transfer_old_owner',
    category: 'governance',
    steps: [
      { action: 'transferOwnership', actor: 'oldOwner', params: ['newOwner'] },
      { action: 'adminFunction', actor: 'oldOwner', params: [], expectedOutcome: 'revert' },
      { action: 'adminFunction', actor: 'newOwner', params: [], expectedOutcome: 'success' },
    ],
    actors: ['oldOwner', 'newOwner'],
    postconditions: ['old owner loses access', 'new owner gains access'],
  },
  {
    name: 'random_actor_admin_function',
    category: 'governance',
    steps: [
      { action: 'adminFunction', actor: 'randomUser', params: [], expectedOutcome: 'revert' },
    ],
    actors: ['randomUser'],
    postconditions: ['unauthorized access blocked'],
  },
];

export const STAKING_FLOWS: FuzzFlow[] = [
  {
    name: 'stake_claim_unstake',
    category: 'staking',
    steps: [
      { action: 'stake', actor: 'user1', params: ['amount'] },
      { action: 'advanceTime', actor: 'system', params: ['duration'] },
      { action: 'claim', actor: 'user1', params: [] },
      { action: 'unstake', actor: 'user1', params: ['amount'] },
    ],
    actors: ['user1'],
    postconditions: ['user receives rewards', 'user gets stake back'],
  },
  {
    name: 'late_joiner_reward_steal',
    category: 'staking',
    steps: [
      { action: 'stake', actor: 'user1', params: ['amount'] },
      { action: 'advanceTime', actor: 'system', params: ['longDuration'] },
      { action: 'stake', actor: 'attacker', params: ['largeAmount'] },
      { action: 'claim', actor: 'attacker', params: [] },
    ],
    actors: ['user1', 'attacker'],
    postconditions: ['attacker should not claim rewards they did not earn'],
  },
  {
    name: 'multiple_claims',
    category: 'staking',
    steps: [
      { action: 'stake', actor: 'user1', params: ['amount'] },
      { action: 'claim', actor: 'user1', params: [] },
      { action: 'claim', actor: 'user1', params: [] },
    ],
    actors: ['user1'],
    postconditions: ['second claim should give 0 or revert'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// FUZZ CONFIG PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const FUZZ_PRESETS: Record<FuzzMode, FuzzConfig> = {
  quick: {
    mode: 'quick',
    runs: 1000,
    timeout: 60,
    boundaryBias: false,
    multiActor: false,
    sequenceLength: 1,
    verbosity: 1,
  },
  deep: {
    mode: 'deep',
    runs: 100000,
    timeout: 600,
    boundaryBias: true,
    multiActor: false,
    sequenceLength: 1,
    verbosity: 2,
  },
  flow: {
    mode: 'flow',
    runs: 10000,
    timeout: 900,
    boundaryBias: true,
    multiActor: true,
    sequenceLength: 5,
    verbosity: 2,
  },
  adversarial: {
    mode: 'adversarial',
    runs: 50000,
    timeout: 1200,
    boundaryBias: true,
    multiActor: true,
    sequenceLength: 10,
    verbosity: 3,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED FUZZER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AdvancedFuzzer {
  private config: FuzzConfig;
  
  constructor(mode: FuzzMode = 'deep') {
    this.config = FUZZ_PRESETS[mode];
  }

  /**
   * Get fuzz configuration for Foundry
   */
  getFoundryConfig(): string[] {
    const args: string[] = [];
    
    args.push('--fuzz-runs', String(this.config.runs));
    
    if (this.config.seed) {
      args.push('--fuzz-seed', String(this.config.seed));
    }
    
    // Verbosity
    args.push('-' + 'v'.repeat(this.config.verbosity));
    
    return args;
  }

  /**
   * Generate handler contract for flow fuzzing
   */
  generateFlowHandler(contractName: string, flows: FuzzFlow[]): string {
    const relevantFlows = flows.filter(f => 
      f.category === 'general' || this.detectContractCategory(contractName) === f.category
    );

    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

/**
 * @title ${contractName}_FlowHandler
 * @notice Stateful fuzz handler for flow-based testing
 * @dev Auto-generated by Invariant Hunter Advanced Fuzzer
 * 
 * Supported flows:
${relevantFlows.map(f => ` *   - ${f.name}: ${f.steps.map(s => s.action).join(' → ')}`).join('\n')}
 */
contract ${contractName}_FlowHandler is Test {
    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════
    
    // Target contract
    // ${contractName} public target;
    
    // Actors
    address public admin;
    address public user1;
    address public user2;
    address public attacker;
    address public liquidator;
    
    // Ghost variables for tracking
    uint256 public ghost_totalDeposits;
    uint256 public ghost_totalWithdrawals;
    uint256 public ghost_totalMinted;
    uint256 public ghost_totalBurned;
    mapping(address => uint256) public ghost_userDeposits;
    
    // Call tracking
    uint256 public callCount;
    bytes32[] public callHistory;
    
    // ═══════════════════════════════════════════════════════════════
    // SETUP
    // ═══════════════════════════════════════════════════════════════
    
    constructor() {
        admin = makeAddr("admin");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        attacker = makeAddr("attacker");
        liquidator = makeAddr("liquidator");
        
        // Fund actors
        vm.deal(admin, 1000 ether);
        vm.deal(user1, 1000 ether);
        vm.deal(user2, 1000 ether);
        vm.deal(attacker, 1000 ether);
        vm.deal(liquidator, 1000 ether);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // HANDLER FUNCTIONS (called randomly by fuzzer)
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Deposit with random actor and amount
     */
    function handler_deposit(uint256 actorSeed, uint256 amount) external {
        address actor = _selectActor(actorSeed);
        amount = bound(amount, 0, 100 ether);
        
        vm.prank(actor);
        // try target.deposit{value: amount}() {
        //     ghost_totalDeposits += amount;
        //     ghost_userDeposits[actor] += amount;
        // } catch {}
        
        _recordCall("deposit", actor, amount);
    }
    
    /**
     * @notice Withdraw with random actor and amount
     */
    function handler_withdraw(uint256 actorSeed, uint256 amount) external {
        address actor = _selectActor(actorSeed);
        amount = bound(amount, 0, ghost_userDeposits[actor]);
        
        vm.prank(actor);
        // try target.withdraw(amount) {
        //     ghost_totalWithdrawals += amount;
        //     ghost_userDeposits[actor] -= amount;
        // } catch {}
        
        _recordCall("withdraw", actor, amount);
    }
    
    /**
     * @notice Transfer with random actors and amount
     */
    function handler_transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _selectActor(fromSeed);
        address to = _selectActor(toSeed);
        if (from == to) return;
        
        amount = bound(amount, 0, 100 ether);
        
        vm.prank(from);
        // try target.transfer(to, amount) {} catch {}
        
        _recordCall("transfer", from, amount);
    }
    
    /**
     * @notice Admin action (should only work for admin)
     */
    function handler_adminAction(uint256 actorSeed) external {
        address actor = _selectActor(actorSeed);
        
        vm.prank(actor);
        // try target.adminFunction() {
        //     // If non-admin succeeds, this is a bug!
        //     if (actor != admin) {
        //         revert("ACCESS_CONTROL_BUG: non-admin executed admin function");
        //     }
        // } catch {}
        
        _recordCall("adminAction", actor, 0);
    }
    
    /**
     * @notice Pause/unpause (admin only)
     */
    function handler_togglePause(uint256 actorSeed) external {
        address actor = _selectActor(actorSeed);
        
        vm.prank(actor);
        // try target.pause() {} catch {}
        // or
        // try target.unpause() {} catch {}
        
        _recordCall("togglePause", actor, 0);
    }
    
    /**
     * @notice Time manipulation
     */
    function handler_advanceTime(uint256 seconds_) external {
        seconds_ = bound(seconds_, 0, 365 days);
        vm.warp(block.timestamp + seconds_);
        
        _recordCall("advanceTime", address(0), seconds_);
    }
    
    /**
     * @notice Block manipulation
     */
    function handler_advanceBlock(uint256 blocks) external {
        blocks = bound(blocks, 0, 100000);
        vm.roll(block.number + blocks);
        
        _recordCall("advanceBlock", address(0), blocks);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ADVERSARIAL HANDLERS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Reentrancy attempt
     */
    function handler_reentrancyAttempt(uint256 amount) external {
        amount = bound(amount, 1 ether, 10 ether);
        
        // Deploy reentrancy attacker
        // ReentrancyAttacker attacker = new ReentrancyAttacker(address(target));
        // attacker.attack{value: amount}();
        
        _recordCall("reentrancyAttempt", attacker, amount);
    }
    
    /**
     * @notice Zero value edge case
     */
    function handler_zeroValueAction(uint256 actionSeed) external {
        uint256 action = actionSeed % 3;
        
        vm.prank(attacker);
        if (action == 0) {
            // try target.deposit{value: 0}() {} catch {}
        } else if (action == 1) {
            // try target.withdraw(0) {} catch {}
        } else {
            // try target.transfer(user1, 0) {} catch {}
        }
        
        _recordCall("zeroValueAction", attacker, 0);
    }
    
    /**
     * @notice Max value edge case
     */
    function handler_maxValueAction() external {
        vm.prank(attacker);
        // try target.withdraw(type(uint256).max) {} catch {}
        
        _recordCall("maxValueAction", attacker, type(uint256).max);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════
    
    function _selectActor(uint256 seed) internal view returns (address) {
        address[5] memory actors = [admin, user1, user2, attacker, liquidator];
        return actors[seed % 5];
    }
    
    function _recordCall(string memory action, address actor, uint256 value) internal {
        callCount++;
        callHistory.push(keccak256(abi.encodePacked(action, actor, value, block.timestamp)));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // INVARIANT CHECKS (called after each sequence)
    // ═══════════════════════════════════════════════════════════════
    
    function checkInvariant_depositsMatchWithdrawals() external view returns (bool) {
        // Total deposits should be >= total withdrawals
        return ghost_totalDeposits >= ghost_totalWithdrawals;
    }
    
    function checkInvariant_noNegativeBalances() external view returns (bool) {
        // No user should have negative balance (underflow)
        return ghost_userDeposits[user1] <= ghost_totalDeposits &&
               ghost_userDeposits[user2] <= ghost_totalDeposits;
    }
    
    function checkInvariant_contractSolvent() external view returns (bool) {
        // Contract should have enough to cover all deposits
        // return address(target).balance >= ghost_totalDeposits - ghost_totalWithdrawals;
        return true;
    }
}
`;
  }

  /**
   * Detect contract category from name/content
   */
  detectContractCategory(contractName: string): FuzzFlow['category'] {
    const name = contractName.toLowerCase();
    
    if (name.includes('token') || name.includes('erc20') || name.includes('erc721')) {
      return 'token';
    }
    if (name.includes('vault') || name.includes('pool') || name.includes('deposit')) {
      return 'vault';
    }
    if (name.includes('lend') || name.includes('borrow') || name.includes('collateral')) {
      return 'lending';
    }
    if (name.includes('stake') || name.includes('reward') || name.includes('farm')) {
      return 'staking';
    }
    if (name.includes('govern') || name.includes('admin') || name.includes('owner') || name.includes('access')) {
      return 'governance';
    }
    
    return 'general';
  }

  /**
   * Get relevant flows for a contract
   */
  getRelevantFlows(contractName: string): FuzzFlow[] {
    const category = this.detectContractCategory(contractName);
    
    const allFlows = [
      ...TOKEN_FLOWS,
      ...VAULT_FLOWS,
      ...LENDING_FLOWS,
      ...GOVERNANCE_FLOWS,
      ...STAKING_FLOWS,
    ];
    
    return allFlows.filter(f => f.category === category || f.category === 'general');
  }

  /**
   * Classify a failure into a bug category
   */
  classifyBug(revertReason: string, callSequence: string[]): BugCategory {
    const reason = revertReason.toLowerCase();
    
    if (reason.includes('reentrancy') || reason.includes('reentrant')) {
      return 'reentrancy';
    }
    if (reason.includes('owner') || reason.includes('unauthorized') || reason.includes('access')) {
      return 'access_control';
    }
    if (reason.includes('overflow') || reason.includes('underflow')) {
      return 'integer_overflow';
    }
    if (reason.includes('division') || reason.includes('rounding')) {
      return 'rounding_error';
    }
    if (reason.includes('balance') || reason.includes('insufficient')) {
      return 'balance_mismatch';
    }
    if (reason.includes('paused') || reason.includes('locked')) {
      return 'dos';
    }
    
    // Check call sequence for patterns
    if (callSequence.some(c => c.includes('withdraw') && c.includes('deposit'))) {
      return 'state_corruption';
    }
    
    return 'unknown';
  }

  /**
   * Generate boundary-biased test values
   */
  generateBoundaryTestValues(): string {
    return `
// Boundary values for fuzz testing
uint256 constant ZERO = 0;
uint256 constant ONE = 1;
uint256 constant MAX_UINT256 = type(uint256).max;
uint256 constant MAX_UINT256_MINUS_1 = type(uint256).max - 1;
uint256 constant MAX_UINT128 = type(uint128).max;
uint256 constant ONE_ETHER = 1e18;
uint256 constant ONE_GWEI = 1e9;
uint256 constant ONE_USDC = 1e6;

// Special addresses
address constant ZERO_ADDRESS = address(0);
address constant DEAD_ADDRESS = address(0xdead);

// Boundary value array for iteration
uint256[10] BOUNDARY_VALUES = [
    0,
    1,
    2,
    type(uint128).max,
    type(uint128).max + 1,
    type(uint256).max - 1,
    type(uint256).max,
    1e18,
    1e6,
    1e9
];
`;
  }

  /**
   * Generate test recommendations based on analysis
   */
  generateRecommendations(contractName: string, issues: string[]): string[] {
    const recommendations: string[] = [];
    const category = this.detectContractCategory(contractName);
    
    // Category-specific recommendations
    if (category === 'token') {
      recommendations.push('Test transfer to self - should not change balance');
      recommendations.push('Test transfer to zero address - should revert');
      recommendations.push('Test approval race condition (approve 0 first pattern)');
      recommendations.push('Test transferFrom with max approval');
    }
    
    if (category === 'vault') {
      recommendations.push('Test first depositor inflation attack');
      recommendations.push('Test deposit/withdraw rounding (small amounts)');
      recommendations.push('Test multi-user deposit/withdraw ordering');
      recommendations.push('Test zero deposit/withdraw handling');
    }
    
    if (category === 'lending') {
      recommendations.push('Test liquidation at exact threshold');
      recommendations.push('Test over-repayment handling');
      recommendations.push('Test collateral withdrawal after partial repay');
      recommendations.push('Test same user as borrower and liquidator');
    }
    
    if (category === 'staking') {
      recommendations.push('Test reward claim timing (before/after accrual)');
      recommendations.push('Test late joiner reward calculation');
      recommendations.push('Test multiple claims in same block');
      recommendations.push('Test unstake during reward distribution');
    }
    
    // General recommendations
    recommendations.push('Test with boundary values (0, 1, max-1, max)');
    recommendations.push('Test admin functions with non-admin caller');
    recommendations.push('Test pause/unpause state transitions');
    recommendations.push('Test reentrancy on external calls');
    
    return recommendations;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRECISION LOSS DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface PrecisionLossTest {
  name: string;
  description: string;
  testCode: string;
  optimizationCode: string;
}

/**
 * Generate precision loss tests for division operations
 * Following Recon team's approach:
 * 1. Start with exact check
 * 2. Let fuzzer find deviation
 * 3. Use optimization to maximize deviation
 */
export function generatePrecisionLossTests(contractName: string): PrecisionLossTest[] {
  return [
    {
      name: 'share_calculation_precision',
      description: 'Check for precision loss in share/asset calculations',
      testCode: `
    /**
     * @notice Test for precision loss in share calculations
     * @dev Step 1: Exact check - fuzzer will find cases where it fails
     */
    function testFuzz_sharePrecision(uint256 assets) public {
        assets = bound(assets, 1, type(uint128).max);
        
        // Deposit and get shares
        // uint256 shares = vault.deposit(assets, address(this));
        
        // Redeem all shares
        // uint256 assetsBack = vault.redeem(shares, address(this), address(this));
        
        // Exact check - will fail if any precision loss
        // assertEq(assetsBack, assets, "Precision loss detected");
    }`,
      optimizationCode: `
    /**
     * @notice Optimization test to maximize precision loss
     * @dev Step 3: Run with echidna --test-mode optimization
     */
    function optimize_sharePrecisionLoss(uint256 assets) public returns (int256) {
        assets = bound(assets, 1, type(uint128).max);
        
        // uint256 shares = vault.deposit(assets, address(this));
        // uint256 assetsBack = vault.redeem(shares, address(this), address(this));
        
        // Return the loss to maximize
        // return int256(assets) - int256(assetsBack);
        return 0;
    }`,
    },
    {
      name: 'fee_calculation_precision',
      description: 'Check for precision loss in fee calculations',
      testCode: `
    /**
     * @notice Test for precision loss in fee calculations
     */
    function testFuzz_feePrecision(uint256 amount, uint256 feeBps) public {
        amount = bound(amount, 1, type(uint128).max);
        feeBps = bound(feeBps, 1, 10000); // 0.01% to 100%
        
        // uint256 fee = (amount * feeBps) / 10000;
        // uint256 remaining = amount - fee;
        
        // Check: fee + remaining should equal amount
        // assertEq(fee + remaining, amount, "Fee precision loss");
    }`,
      optimizationCode: `
    function optimize_feePrecisionLoss(uint256 amount, uint256 feeBps) public pure returns (int256) {
        amount = bound(amount, 1, type(uint128).max);
        feeBps = bound(feeBps, 1, 10000);
        
        uint256 fee = (amount * feeBps) / 10000;
        uint256 remaining = amount - fee;
        
        // Return the loss to maximize
        return int256(amount) - int256(fee + remaining);
    }`,
    },
    {
      name: 'exchange_rate_precision',
      description: 'Check for precision loss in exchange rate calculations',
      testCode: `
    /**
     * @notice Test for precision loss in exchange rates
     */
    function testFuzz_exchangeRatePrecision(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, type(uint128).max);
        
        // Convert A -> B -> A
        // uint256 amountB = (amountIn * rateAtoB) / PRECISION;
        // uint256 amountABack = (amountB * rateBtoA) / PRECISION;
        
        // Check round-trip precision
        // assertLe(amountIn - amountABack, 1, "Exchange rate precision loss > 1 wei");
    }`,
      optimizationCode: `
    function optimize_exchangeRateLoss(uint256 amountIn) public pure returns (int256) {
        amountIn = bound(amountIn, 1, type(uint128).max);
        
        // Simulate exchange rate calculation
        uint256 PRECISION = 1e18;
        uint256 rateAtoB = 1.5e18; // 1.5x
        uint256 rateBtoA = 0.666666666666666666e18; // ~1/1.5
        
        uint256 amountB = (amountIn * rateAtoB) / PRECISION;
        uint256 amountABack = (amountB * rateBtoA) / PRECISION;
        
        return int256(amountIn) - int256(amountABack);
    }`,
    },
  ];
}

/**
 * Generate complete precision loss test contract
 */
export function generatePrecisionLossContract(contractName: string): string {
  const tests = generatePrecisionLossTests(contractName);
  
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

/**
 * @title ${contractName}_PrecisionTests
 * @notice Precision loss detection tests
 * @dev Following Recon team's approach:
 *      1. Use exact checks to find precision loss
 *      2. Use optimization mode to maximize the loss
 *      3. Determine severity based on maximum loss found
 * 
 * Run with Foundry:
 *   forge test --match-contract ${contractName}_PrecisionTests -vvv
 * 
 * Run optimization with Echidna:
 *   echidna . --contract ${contractName}_PrecisionTests --test-mode optimization
 */
contract ${contractName}_PrecisionTests is Test {
    // Target contract
    // ${contractName} public target;
    
    function setUp() public {
        // target = new ${contractName}();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // HELPER: bound function for compatibility
    // ═══════════════════════════════════════════════════════════════
    
    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        return min + (x % (max - min + 1));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PRECISION LOSS TESTS
    // ═══════════════════════════════════════════════════════════════
${tests.map(t => t.testCode).join('\n')}
    
    // ═══════════════════════════════════════════════════════════════
    // OPTIMIZATION TESTS (for Echidna)
    // ═══════════════════════════════════════════════════════════════
${tests.map(t => t.optimizationCode).join('\n')}
}
`;
}

// Export singleton for easy use
export const advancedFuzzer = new AdvancedFuzzer('deep');
