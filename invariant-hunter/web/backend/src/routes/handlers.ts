/**
 * Handlers Routes - Generate handler functions from ABI
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// ABI types
interface ABIInput {
  name: string;
  type: string;
  internalType?: string;
}

interface ABIOutput {
  name: string;
  type: string;
}

interface ABIItem {
  type: string;
  name?: string;
  inputs?: ABIInput[];
  outputs?: ABIOutput[];
  stateMutability?: string;
}

// Validation schemas
const generateSchema = z.object({
  contractName: z.string(),
  abi: z.array(z.object({
    type: z.string(),
    name: z.string().optional(),
    inputs: z.array(z.object({
      name: z.string(),
      type: z.string(),
      internalType: z.string().optional(),
    })).optional(),
    outputs: z.array(z.object({
      name: z.string(),
      type: z.string(),
    })).optional(),
    stateMutability: z.string().optional(),
  })),
  options: z.object({
    includeView: z.boolean().default(false),
    includePure: z.boolean().default(false),
    includeAssertions: z.boolean().default(true),
    includeBeforeAfter: z.boolean().default(true),
  }).optional(),
});

/**
 * Generate handlers from ABI
 * POST /api/handlers/generate
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const data = generateSchema.parse(req.body);
    const options = data.options ?? { includeView: false, includePure: false, includeAssertions: true, includeBeforeAfter: true };

    // Filter functions
    const functions = (data.abi as ABIItem[]).filter((item: ABIItem) => {
      if (item.type !== 'function') return false;
      if (!options.includeView && item.stateMutability === 'view') return false;
      if (!options.includePure && item.stateMutability === 'pure') return false;
      return true;
    });

    if (functions.length === 0) {
      return res.json({
        message: 'No functions found to generate handlers for',
        handlers: [],
        contract: '',
      });
    }

    // Generate handlers
    const handlers = functions.map((func: ABIItem) => generateHandler(data.contractName, func, options));

    // Generate full contract
    const contract = generateTargetFunctionsContract(data.contractName, handlers);

    // Generate BeforeAfter contract
    const beforeAfter = generateBeforeAfterContract(data.contractName, data.abi as ABIItem[]);

    res.json({
      handlers: handlers.map((h: string, i: number) => ({
        name: `handler_${functions[i].name}`,
        code: h,
      })),
      contract,
      beforeAfter,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Generate handlers error:', error);
    res.status(500).json({ error: 'Failed to generate handlers' });
  }
});

/**
 * Analyze contract ABI and suggest invariants
 * POST /api/handlers/analyze
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { abi, contractName } = req.body;

    if (!abi || !Array.isArray(abi)) {
      return res.status(400).json({ error: 'ABI array is required' });
    }

    const analysis = analyzeABI(abi, contractName);

    res.json(analysis);
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze ABI' });
  }
});

// Helper types
interface ABIFunction {
  type: string;
  name?: string;
  inputs?: Array<{ name: string; type: string; internalType?: string }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: string;
}

interface GenerateOptions {
  includeView?: boolean;
  includePure?: boolean;
  includeAssertions?: boolean;
  includeBeforeAfter?: boolean;
}

// Generator functions
function generateHandler(contractName: string, func: ABIFunction, options: GenerateOptions): string {
  const funcName = func.name!;
  const inputs = func.inputs || [];
  const varName = contractName.toLowerCase();

  // Generate parameters
  const params = inputs.map((input, i) => {
    const name = input.name || `arg${i}`;
    return `${solidityType(input.type)} ${name}`;
  }).join(', ');

  // Generate arguments
  const args = inputs.map((input, i) => input.name || `arg${i}`).join(', ');

  // Generate clamping
  const clamping = inputs
    .filter(input => isNumericType(input.type))
    .map((input, i) => {
      const name = input.name || `arg${i}`;
      if (input.type.startsWith('uint')) {
        return `        ${name} = between(${name}, 0, type(${input.type}).max);`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  // Build handler body
  let body = '';

  if (options.includeBeforeAfter) {
    body += '        __before();\n\n';
  }

  const isStateMutating = !['view', 'pure'].includes(func.stateMutability || '');

  if (isStateMutating) {
    body += `        try ${varName}.${funcName}(${args}) {\n`;
    if (options.includeBeforeAfter) {
      body += '            __after();\n';
    }
    if (options.includeAssertions) {
      body += '            // Add post-condition assertions here\n';
      body += '            // t(_after.value >= _before.value, "Value decreased");\n';
    }
    body += '        } catch {\n';
    body += '            // Handle expected reverts\n';
    body += '        }';
  } else {
    body += `        ${varName}.${funcName}(${args});\n`;
    if (options.includeBeforeAfter) {
      body += '        __after();';
    }
  }

  return `
    /// @notice Handler for ${contractName}.${funcName}
    function handler_${funcName}(${params}) public {
${clamping ? clamping + '\n' : ''}${body}
    }`;
}

function generateTargetFunctionsContract(contractName: string, handlers: string[]): string {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Generated by Invariant Hunter
// Contract: ${contractName}

import {BaseTargetFunctions} from "invariant-hunter/BaseSetup.sol";
import {Properties} from "./Properties.sol";
import {${contractName}} from "src/${contractName}.sol";

/// @title TargetFunctions - Handler functions for ${contractName}
abstract contract TargetFunctions is BaseTargetFunctions, Properties {
    ${contractName} public ${contractName.toLowerCase()};
${handlers.join('\n')}
}
`;
}

function generateBeforeAfterContract(contractName: string, abi: ABIItem[]): string {
  const varName = contractName.toLowerCase();

  // Find view functions that return single values (good candidates for tracking)
  const viewFunctions = abi.filter(item => 
    item.type === 'function' &&
    item.stateMutability === 'view' &&
    item.outputs?.length === 1 &&
    isSimpleType(item.outputs[0].type)
  );

  // Generate struct fields
  const structFields = viewFunctions.slice(0, 10).map(func => {
    const outputType = func.outputs![0].type;
    return `        ${outputType} ${func.name};`;
  }).join('\n');

  // Generate capture code
  const captureCode = viewFunctions.slice(0, 10).map(func => {
    return `        vars.${func.name} = ${varName}.${func.name}();`;
  }).join('\n');

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Setup} from "./Setup.sol";

/// @title BeforeAfter - Track state for ${contractName}
abstract contract BeforeAfter is Setup {
    struct Vars {
        uint256 timestamp;
        uint256 blockNumber;
${structFields}
    }

    Vars internal _before;
    Vars internal _after;

    function __before() internal virtual {
        _before.timestamp = block.timestamp;
        _before.blockNumber = block.number;
        _captureState(_before);
    }

    function __after() internal virtual {
        _after.timestamp = block.timestamp;
        _after.blockNumber = block.number;
        _captureState(_after);
    }

    function _captureState(Vars storage vars) internal {
${captureCode}
    }
}
`;
}

interface ABIAnalysis {
  contractType: string;
  suggestedInvariants: Array<{
    name: string;
    description: string;
    code: string;
  }>;
  stateVariables: string[];
  risks: string[];
}

function analyzeABI(abi: ABIItem[], contractName: string): ABIAnalysis {
  const suggestedInvariants: ABIAnalysis['suggestedInvariants'] = [];
  const stateVariables: string[] = [];
  const risks: string[] = [];

  // Detect contract type
  let contractType = 'generic';
  const functionNames = abi.filter(a => a.type === 'function').map(a => a.name!);

  if (functionNames.some(n => /transfer|balanceOf|totalSupply/i.test(n))) {
    contractType = 'token';
    suggestedInvariants.push({
      name: 'invariant_balancesSumToTotal',
      description: 'Sum of all balances equals total supply',
      code: `function invariant_balancesSumToTotal() public {
    uint256 sum = 0;
    for (uint i = 0; i < actors.length; i++) {
        sum += token.balanceOf(actors[i]);
    }
    eq(sum, token.totalSupply(), "Balances don't sum to total");
}`,
    });
  }

  if (functionNames.some(n => /deposit|withdraw|stake/i.test(n))) {
    contractType = 'vault';
    suggestedInvariants.push({
      name: 'invariant_sufficientBacking',
      description: 'Contract has sufficient assets to cover all shares',
      code: `function invariant_sufficientBacking() public {
    t(vault.totalAssets() >= vault.convertToAssets(vault.totalSupply()), "Insufficient backing");
}`,
    });
  }

  if (functionNames.some(n => /swap|addLiquidity|removeLiquidity/i.test(n))) {
    contractType = 'amm';
    suggestedInvariants.push({
      name: 'invariant_constantProduct',
      description: 'K value (x * y) never decreases',
      code: `function invariant_constantProduct() public {
    uint256 k = pool.reserve0() * pool.reserve1();
    t(k >= lastK, "K decreased");
}`,
    });
  }

  // Find view functions (potential state to track)
  abi.filter(a => a.type === 'function' && a.stateMutability === 'view')
    .forEach(func => {
      if (func.outputs?.length === 1) {
        stateVariables.push(`${func.name}(): ${func.outputs[0].type}`);
      }
    });

  // Detect risky patterns
  if (functionNames.some(n => /selfdestruct|delegatecall/i.test(n))) {
    risks.push('Contract uses selfdestruct or delegatecall');
  }

  if (functionNames.some(n => /pause|unpause/i.test(n))) {
    risks.push('Contract has pause functionality - test paused state');
    suggestedInvariants.push({
      name: 'invariant_pauseWorks',
      description: 'When paused, state-changing functions should revert',
      code: `function invariant_pauseWorks() public {
    if (contract.paused()) {
        // Verify operations revert when paused
    }
}`,
    });
  }

  return {
    contractType,
    suggestedInvariants,
    stateVariables,
    risks,
  };
}

// Utility functions
function solidityType(abiType: string): string {
  if (abiType.endsWith('[]')) {
    return abiType.replace('[]', '[] memory');
  }
  if (abiType === 'bytes' || abiType === 'string') {
    return `${abiType} memory`;
  }
  return abiType;
}

function isNumericType(type: string): boolean {
  return type.startsWith('uint') || type.startsWith('int');
}

function isSimpleType(type: string): boolean {
  return type.startsWith('uint') || 
         type.startsWith('int') || 
         type.startsWith('bool') || 
         type.startsWith('address') ||
         type.startsWith('bytes');
}

export { router as handlersRouter };
