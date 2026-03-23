#!/usr/bin/env python3
"""
Echidna Log Scraper - Convert Echidna fuzzer output to Foundry test cases

This tool parses Echidna logs and generates reproducible Foundry test cases
for debugging broken invariants.

Usage:
    python echidna_scraper.py <log_file> [--output <output_file>]
    python echidna_scraper.py --stdin

Example:
    echidna . --contract HunterTester --config echidna.yaml 2>&1 | python echidna_scraper.py --stdin
"""

import re
import sys
import argparse
from dataclasses import dataclass
from typing import List, Optional, Tuple
import json


@dataclass
class FunctionCall:
    """Represents a single function call in the sequence"""
    function_name: str
    arguments: List[str]
    sender: Optional[str] = None
    value: Optional[str] = None
    block_delay: Optional[int] = None
    time_delay: Optional[int] = None


@dataclass
class FailedProperty:
    """Represents a failed property with its call sequence"""
    property_name: str
    reason: str
    call_sequence: List[FunctionCall]
    shrunk: bool = False


class EchidnaScraper:
    """Parser for Echidna fuzzer output"""

    # Regex patterns for parsing Echidna output
    FAILED_PATTERN = re.compile(
        r'\[FAILED\]\s+(Assertion Test|Property Test):\s+(\w+)\.(\w+)\((.*?)\)'
    )
    
    CALL_PATTERN = re.compile(
        r'(\w+)\((.*?)\)\s*(?:from:\s*(0x[a-fA-F0-9]+))?\s*(?:value:\s*(\d+))?\s*(?:Time delay:\s*(\d+))?\s*(?:Block delay:\s*(\d+))?'
    )
    
    SEQUENCE_START = re.compile(r'Call sequence:')
    SEQUENCE_SHRUNK = re.compile(r'Call sequence \(shrunk\):')
    
    def __init__(self):
        self.failed_properties: List[FailedProperty] = []
        self.current_property: Optional[FailedProperty] = None
        self.in_sequence = False

    def parse_line(self, line: str) -> None:
        """Parse a single line of Echidna output"""
        line = line.strip()
        
        # Check for failed property
        failed_match = self.FAILED_PATTERN.search(line)
        if failed_match:
            test_type, contract, func_name, args = failed_match.groups()
            self.current_property = FailedProperty(
                property_name=f"{contract}.{func_name}",
                reason=test_type,
                call_sequence=[]
            )
            self.failed_properties.append(self.current_property)
            return

        # Check for sequence start
        if self.SEQUENCE_SHRUNK.search(line):
            self.in_sequence = True
            if self.current_property:
                self.current_property.shrunk = True
                self.current_property.call_sequence = []
            return
        
        if self.SEQUENCE_START.search(line):
            self.in_sequence = True
            if self.current_property:
                self.current_property.call_sequence = []
            return

        # Parse function calls in sequence
        if self.in_sequence and self.current_property:
            call_match = self.CALL_PATTERN.search(line)
            if call_match:
                func_name, args, sender, value, time_delay, block_delay = call_match.groups()
                
                # Parse arguments
                arg_list = self._parse_arguments(args) if args else []
                
                call = FunctionCall(
                    function_name=func_name,
                    arguments=arg_list,
                    sender=sender,
                    value=value,
                    time_delay=int(time_delay) if time_delay else None,
                    block_delay=int(block_delay) if block_delay else None
                )
                self.current_property.call_sequence.append(call)
            elif line == '' or line.startswith('['):
                self.in_sequence = False

    def _parse_arguments(self, args_str: str) -> List[str]:
        """Parse function arguments from string"""
        if not args_str:
            return []
        
        args = []
        depth = 0
        current = ""
        
        for char in args_str:
            if char == '(' or char == '[':
                depth += 1
                current += char
            elif char == ')' or char == ']':
                depth -= 1
                current += char
            elif char == ',' and depth == 0:
                args.append(current.strip())
                current = ""
            else:
                current += char
        
        if current.strip():
            args.append(current.strip())
        
        return args

    def parse_file(self, filepath: str) -> List[FailedProperty]:
        """Parse an entire Echidna log file"""
        with open(filepath, 'r') as f:
            for line in f:
                self.parse_line(line)
        return self.failed_properties

    def parse_stdin(self) -> List[FailedProperty]:
        """Parse Echidna output from stdin"""
        for line in sys.stdin:
            self.parse_line(line)
        return self.failed_properties


class FoundryTestGenerator:
    """Generate Foundry test cases from parsed Echidna output"""

    TEMPLATE = '''
    /// @notice Reproducer for {property_name}
    /// @dev Generated from Echidna logs{shrunk_note}
    function test_reproducer_{test_name}() public {{
{calls}
        // Check the broken property
        {property_call}();
    }}
'''

    def __init__(self, contract_name: str = "HunterToFoundry"):
        self.contract_name = contract_name

    def generate_test(self, failed_property: FailedProperty, index: int) -> str:
        """Generate a single test function for a failed property"""
        calls = []
        
        for call in failed_property.call_sequence:
            call_str = self._format_call(call)
            calls.append(call_str)
        
        # Format property name for function
        test_name = re.sub(r'[^a-zA-Z0-9]', '_', failed_property.property_name)
        test_name = f"{test_name}_{index}"
        
        shrunk_note = " (shrunk)" if failed_property.shrunk else ""
        
        return self.TEMPLATE.format(
            property_name=failed_property.property_name,
            test_name=test_name,
            shrunk_note=shrunk_note,
            calls='\n'.join(calls),
            property_call=failed_property.property_name.split('.')[-1]
        )

    def _format_call(self, call: FunctionCall) -> str:
        """Format a single function call as Foundry code"""
        lines = []
        indent = "        "
        
        # Add time/block warps if needed
        if call.time_delay:
            lines.append(f"{indent}vm.warp(block.timestamp + {call.time_delay});")
        if call.block_delay:
            lines.append(f"{indent}vm.roll(block.number + {call.block_delay});")
        
        # Add prank if sender specified
        if call.sender:
            lines.append(f"{indent}vm.prank({call.sender});")
        
        # Format the actual call
        args = ', '.join(call.arguments) if call.arguments else ''
        
        if call.value and call.value != '0':
            call_str = f"{indent}{call.function_name}{{value: {call.value}}}({args});"
        else:
            call_str = f"{indent}{call.function_name}({args});"
        
        lines.append(call_str)
        return '\n'.join(lines)

    def generate_all_tests(self, failed_properties: List[FailedProperty]) -> str:
        """Generate all test functions"""
        tests = []
        
        for i, prop in enumerate(failed_properties):
            test = self.generate_test(prop, i + 1)
            tests.append(test)
        
        return '\n'.join(tests)

    def generate_full_contract(self, failed_properties: List[FailedProperty]) -> str:
        """Generate a complete Foundry test contract"""
        tests = self.generate_all_tests(failed_properties)
        
        return f'''// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {{Test}} from "forge-std/Test.sol";
import {{TargetFunctions}} from "./TargetFunctions.sol";
import {{FoundryAsserts}} from "invariant-hunter/HunterTester.sol";

/// @title Reproducer Tests - Generated from Echidna logs
/// @notice Run with: forge test --match-contract ReproducerTests -vvvv
contract ReproducerTests is Test, TargetFunctions, FoundryAsserts {{
    
    function setUp() public {{
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }}
{tests}
}}
'''


def main():
    parser = argparse.ArgumentParser(
        description='Convert Echidna logs to Foundry test cases'
    )
    parser.add_argument(
        'log_file',
        nargs='?',
        help='Path to Echidna log file'
    )
    parser.add_argument(
        '--stdin',
        action='store_true',
        help='Read from stdin'
    )
    parser.add_argument(
        '--output', '-o',
        help='Output file path (default: stdout)'
    )
    parser.add_argument(
        '--full-contract',
        action='store_true',
        help='Generate a complete Foundry test contract'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output as JSON instead of Solidity'
    )
    
    args = parser.parse_args()
    
    if not args.log_file and not args.stdin:
        parser.print_help()
        sys.exit(1)
    
    # Parse logs
    scraper = EchidnaScraper()
    
    if args.stdin:
        failed_properties = scraper.parse_stdin()
    else:
        failed_properties = scraper.parse_file(args.log_file)
    
    if not failed_properties:
        print("No failed properties found in the logs.", file=sys.stderr)
        sys.exit(0)
    
    # Generate output
    if args.json:
        output = json.dumps([
            {
                'property_name': p.property_name,
                'reason': p.reason,
                'shrunk': p.shrunk,
                'call_sequence': [
                    {
                        'function': c.function_name,
                        'arguments': c.arguments,
                        'sender': c.sender,
                        'value': c.value,
                        'time_delay': c.time_delay,
                        'block_delay': c.block_delay
                    }
                    for c in p.call_sequence
                ]
            }
            for p in failed_properties
        ], indent=2)
    else:
        generator = FoundryTestGenerator()
        if args.full_contract:
            output = generator.generate_full_contract(failed_properties)
        else:
            output = generator.generate_all_tests(failed_properties)
    
    # Write output
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Generated {len(failed_properties)} test(s) to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == '__main__':
    main()
