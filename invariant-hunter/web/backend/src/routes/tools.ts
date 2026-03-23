/**
 * Tools Routes - Log scraping and bytecode tools
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schemas
const scrapeSchema = z.object({
  logs: z.string(),
  tool: z.enum(['echidna', 'medusa']),
  format: z.enum(['solidity', 'json']).default('solidity'),
});

const bytecodeCompareSchema = z.object({
  bytecode1: z.string(),
  bytecode2: z.string(),
  includeMetadata: z.boolean().default(false),
});

/**
 * Scrape fuzzer logs and generate reproducers
 * POST /api/tools/scrape
 */
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const data = scrapeSchema.parse(req.body);

    // Parse logs based on tool
    const failedProperties = parseFuzzerLogs(data.logs, data.tool);

    if (failedProperties.length === 0) {
      return res.json({
        message: 'No failed properties found in logs',
        properties: [],
        reproducers: '',
      });
    }

    // Generate output
    if (data.format === 'json') {
      return res.json({
        properties: failedProperties,
      });
    }

    // Generate Solidity reproducers
    const reproducers = generateReproducers(failedProperties);

    res.json({
      properties: failedProperties,
      reproducers,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Scrape error:', error);
    res.status(500).json({ error: 'Failed to scrape logs' });
  }
});

/**
 * Compare two bytecodes
 * POST /api/tools/bytecode/compare
 */
router.post('/bytecode/compare', async (req: Request, res: Response) => {
  try {
    const data = bytecodeCompareSchema.parse(req.body);

    const result = compareBytecode(data.bytecode1, data.bytecode2, data.includeMetadata);

    res.json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bytecode compare error:', error);
    res.status(500).json({ error: 'Failed to compare bytecode' });
  }
});

/**
 * Generate interface from bytecode
 * POST /api/tools/bytecode/interface
 */
router.post('/bytecode/interface', async (req: Request, res: Response) => {
  try {
    const { bytecode } = req.body;

    if (!bytecode) {
      return res.status(400).json({ error: 'Bytecode is required' });
    }

    // Extract function selectors from bytecode
    const selectors = extractFunctionSelectors(bytecode);

    res.json({
      selectors,
      interface: generateInterface(selectors),
    });
  } catch (error) {
    console.error('Interface generation error:', error);
    res.status(500).json({ error: 'Failed to generate interface' });
  }
});

// Helper functions
interface FailedProperty {
  name: string;
  type: string;
  callSequence: string[];
  revertReason?: string;
}

function parseFuzzerLogs(logs: string, tool: string): FailedProperty[] {
  const properties: FailedProperty[] = [];
  const lines = logs.split('\n');

  let currentProperty: FailedProperty | null = null;
  let inSequence = false;

  // Regex patterns
  const failedPattern = /\[FAILED\]\s+(Assertion|Property)\s+Test:\s+(\w+)\.(\w+)/;
  const callPattern = /(\w+)\((.*?)\)/;
  const sequenceStart = /Call sequence/i;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for failed property
    const failedMatch = failedPattern.exec(trimmed);
    if (failedMatch) {
      currentProperty = {
        name: `${failedMatch[2]}.${failedMatch[3]}`,
        type: failedMatch[1].toLowerCase(),
        callSequence: [],
      };
      properties.push(currentProperty);
      continue;
    }

    // Check for sequence start
    if (sequenceStart.test(trimmed)) {
      inSequence = true;
      if (currentProperty) currentProperty.callSequence = [];
      continue;
    }

    // Parse calls in sequence
    if (inSequence && currentProperty) {
      const callMatch = callPattern.exec(trimmed);
      if (callMatch) {
        currentProperty.callSequence.push(`${callMatch[1]}(${callMatch[2]})`);
      } else if (trimmed.startsWith('[') || trimmed === '') {
        inSequence = false;
      }
    }
  }

  return properties;
}

function generateReproducers(properties: FailedProperty[]): string {
  let output = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {TargetFunctions} from "./TargetFunctions.sol";
import {FoundryAsserts} from "invariant-hunter/HunterTester.sol";

/// @title Reproducers - Generated from fuzzer logs
contract Reproducers is Test, TargetFunctions, FoundryAsserts {
    function setUp() public {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }
`;

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const testName = prop.name.replace(/[^a-zA-Z0-9]/g, '_');

    output += `
    /// @notice Reproducer for ${prop.name} (${prop.type})
    function test_${testName}_${i + 1}() public {
`;

    for (const call of prop.callSequence) {
      output += `        ${call};\n`;
    }

    const funcName = prop.name.split('.').pop();
    output += `        // Check the broken property
        ${funcName}();
    }
`;
  }

  output += '}\n';
  return output;
}

interface BytecodeCompareResult {
  identical: boolean;
  sizeDiff: number;
  metadataDiff: boolean;
  differences: Array<{
    offset: number;
    expected: string;
    actual: string;
  }>;
}

function compareBytecode(bc1: string, bc2: string, includeMetadata: boolean): BytecodeCompareResult {
  // Normalize
  const normalize = (bc: string) => bc.toLowerCase().replace(/^0x/, '');
  let bytecode1 = normalize(bc1);
  let bytecode2 = normalize(bc2);

  // Extract metadata
  const metadataPattern = /a264697066735822[a-f0-9]{64}64736f6c6343[a-f0-9]{6}0033$/;
  const meta1 = bytecode1.match(metadataPattern)?.[0];
  const meta2 = bytecode2.match(metadataPattern)?.[0];
  const metadataDiff = meta1 !== meta2;

  if (!includeMetadata) {
    bytecode1 = bytecode1.replace(metadataPattern, '');
    bytecode2 = bytecode2.replace(metadataPattern, '');
  }

  const sizeDiff = bytecode2.length - bytecode1.length;
  const differences: Array<{ offset: number; expected: string; actual: string }> = [];

  const minLen = Math.min(bytecode1.length, bytecode2.length);
  for (let i = 0; i < minLen; i += 2) {
    if (bytecode1.slice(i, i + 2) !== bytecode2.slice(i, i + 2)) {
      differences.push({
        offset: i / 2,
        expected: bytecode1.slice(i, i + 2),
        actual: bytecode2.slice(i, i + 2),
      });

      // Limit to first 50 differences
      if (differences.length >= 50) break;
    }
  }

  return {
    identical: differences.length === 0 && sizeDiff === 0,
    sizeDiff,
    metadataDiff,
    differences,
  };
}

function extractFunctionSelectors(bytecode: string): string[] {
  // Look for PUSH4 instructions followed by EQ
  const normalized = bytecode.toLowerCase().replace(/^0x/, '');
  const selectors: string[] = [];
  const selectorPattern = /63([a-f0-9]{8}).*?14/g;

  let match;
  while ((match = selectorPattern.exec(normalized)) !== null) {
    const selector = match[1];
    if (!selectors.includes(selector)) {
      selectors.push(selector);
    }
  }

  return selectors;
}

function generateInterface(selectors: string[]): string {
  let output = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IContract - Generated interface from bytecode
/// @notice Function signatures may need to be identified manually
interface IContract {
`;

  for (const selector of selectors) {
    output += `    // Selector: 0x${selector}\n`;
    output += `    // function unknown_${selector}() external;\n\n`;
  }

  output += '}\n';
  return output;
}

export { router as toolsRouter };
