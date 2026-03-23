#!/usr/bin/env python3
"""
Medusa Log Scraper - Convert Medusa fuzzer output to Foundry test cases

This tool parses Medusa logs and corpus files to generate reproducible 
Foundry test cases for debugging broken invariants.

Usage:
    python medusa_scraper.py <log_file_or_corpus_dir> [--output <output_file>]
    python medusa_scraper.py --stdin

Example:
    medusa fuzz 2>&1 | python medusa_scraper.py --stdin
    python medusa_scraper.py corpus/
"""

import re
import sys
import argparse
import json
import os
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from pathlib import Path


@dataclass
class FunctionCall:
    """Represents a single function call in the sequence"""
    contract: str
    function_name: str
    arguments: List[Any]
    sender: Optional[str] = None
    value: Optional[str] = None
    block_number: Optional[int] = None
    timestamp: Optional[int] = None
    success: bool = True


@dataclass
class FailedProperty:
    """Represents a failed property with its call sequence"""
    property_name: str
    property_type: str  # assertion, property
    call_sequence: List[FunctionCall]
    revert_reason: Optional[str] = None


class MedusaScraper:
    """Parser for Medusa fuzzer output"""

    # Regex patterns for Medusa output
    FAILED_PATTERN = re.compile(
        r'\[FAILED\]\s+(Assertion|Property)\s+Test:\s+(\w+)\.(\w+)'
    )
    
    CALL_PATTERN = re.compile(
        r'(\w+)\.(\w+)\((.*?)\)\s*'
        r'(?:\(block=(\d+),\s*time=(\d+)(?:,\s*value=(\d+))?\))?\s*'
        r'(?:from\s+(0x[a-fA-F0-9]+))?'
    )
    
    TRACE_CALL = re.compile(
        r'→\s*(\w+)\.(\w+)\((.*?)\)'
    )

    REVERT_PATTERN = re.compile(
        r'revert(?:ed)?(?:\s+with)?:?\s*(.+)?',
        re.IGNORECASE
    )

    def __init__(self):
        self.failed_properties: List[FailedProperty] = []
        self.current_property: Optional[FailedProperty] = None
        self.in_trace = False

    def parse_line(self, line: str) -> None:
        """Parse a single line of Medusa output"""
        line = line.strip()
        
        # Check for failed property
        failed_match = self.FAILED_PATTERN.search(line)
        if failed_match:
            prop_type, contract, func_name = failed_match.groups()
            self.current_property = FailedProperty(
                property_name=f"{contract}.{func_name}",
                property_type=prop_type.lower(),
                call_sequence=[]
            )
            self.failed_properties.append(self.current_property)
            self.in_trace = True
            return

        # Check for revert reason
        revert_match = self.REVERT_PATTERN.search(line)
        if revert_match and self.current_property:
            self.current_property.revert_reason = revert_match.group(1)
            return

        # Parse call in trace
        if self.in_trace and self.current_property:
            call_match = self.CALL_PATTERN.search(line)
            if call_match:
                contract, func, args, block, time, value, sender = call_match.groups()
                
                call = FunctionCall(
                    contract=contract,
                    function_name=func,
                    arguments=self._parse_arguments(args) if args else [],
                    sender=sender,
                    value=value,
                    block_number=int(block) if block else None,
                    timestamp=int(time) if time else None
                )
                self.current_property.call_sequence.append(call)
            
            # Check for trace call format
            trace_match = self.TRACE_CALL.search(line)
            if trace_match and not call_match:
                contract, func, args = trace_match.groups()
                call = FunctionCall(
                    contract=contract,
                    function_name=func,
                    arguments=self._parse_arguments(args) if args else []
                )
                self.current_property.call_sequence.append(call)

        # End of trace detection
        if line.startswith('[') and self.in_trace:
            self.in_trace = False

    def _parse_arguments(self, args_str: str) -> List[str]:
        """Parse function arguments from string"""
        if not args_str:
            return []
        
        args = []
        depth = 0
        current = ""
        
        for char in args_str:
            if char in '([{':
                depth += 1
                current += char
            elif char in ')]}':
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
        """Parse a Medusa log file"""
        with open(filepath, 'r') as f:
            for line in f:
                self.parse_line(line)
        return self.failed_properties

    def parse_stdin(self) -> List[FailedProperty]:
        """Parse Medusa output from stdin"""
        for line in sys.stdin:
            self.parse_line(line)
        return self.failed_properties

    def parse_corpus(self, corpus_dir: str) -> List[FailedProperty]:
        """Parse Medusa corpus directory for failed tests"""
        corpus_path = Path(corpus_dir)
        
        if not corpus_path.exists():
            raise FileNotFoundError(f"Corpus directory not found: {corpus_dir}")

        # Look for test failure files
        failure_dirs = [
            corpus_path / "test_failures",
            corpus_path / "assertion_failures",
            corpus_path / "property_failures"
        ]

        for failure_dir in failure_dirs:
            if failure_dir.exists():
                for json_file in failure_dir.glob("*.json"):
                    self._parse_corpus_file(json_file)

        return self.failed_properties

    def _parse_corpus_file(self, filepath: Path) -> None:
        """Parse a single corpus JSON file"""
        try:
            with open(filepath) as f:
                data = json.load(f)
            
            # Extract property info
            prop_name = data.get('propertyName', filepath.stem)
            prop_type = data.get('propertyType', 'assertion')
            
            # Extract call sequence
            calls = []
            for call_data in data.get('callSequence', []):
                call = FunctionCall(
                    contract=call_data.get('contract', 'Unknown'),
                    function_name=call_data.get('method', 'unknown'),
                    arguments=call_data.get('args', []),
                    sender=call_data.get('sender'),
                    value=str(call_data.get('value', 0)),
                    block_number=call_data.get('blockNumber'),
                    timestamp=call_data.get('timestamp'),
                    success=call_data.get('success', True)
                )
                calls.append(call)

            prop = FailedProperty(
                property_name=prop_name,
                property_type=prop_type,
                call_sequence=calls,
                revert_reason=data.get('revertReason')
            )
            self.failed_properties.append(prop)

        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Could not parse {filepath}: {e}", file=sys.stderr)


class FoundryTestGenerator:
    """Generate Foundry test cases from parsed Medusa output"""

    TEMPLATE = '''
    /// @notice Reproducer for {property_name}
    /// @dev Generated from Medusa logs - {property_type} test
    {revert_comment}
    function test_reproducer_{test_name}() public {{
{calls}
        // Check the broken property
        {property_call}();
    }}
'''

    def __init__(self):
        pass

    def generate_test(self, failed_property: FailedProperty, index: int) -> str:
        """Generate a single test function"""
        calls = []
        last_block = None
        last_time = None
        
        for call in failed_property.call_sequence:
            call_str = self._format_call(call, last_block, last_time)
            calls.append(call_str)
            last_block = call.block_number
            last_time = call.timestamp
        
        test_name = re.sub(r'[^a-zA-Z0-9]', '_', failed_property.property_name)
        test_name = f"{test_name}_{index}"
        
        revert_comment = ""
        if failed_property.revert_reason:
            revert_comment = f"/// @dev Revert reason: {failed_property.revert_reason}"
        
        return self.TEMPLATE.format(
            property_name=failed_property.property_name,
            property_type=failed_property.property_type,
            test_name=test_name,
            revert_comment=revert_comment,
            calls='\n'.join(calls) if calls else "        // Empty call sequence",
            property_call=failed_property.property_name.split('.')[-1]
        )

    def _format_call(
        self, 
        call: FunctionCall, 
        last_block: Optional[int],
        last_time: Optional[int]
    ) -> str:
        """Format a single function call"""
        lines = []
        indent = "        "
        
        # Add block/time warps if changed
        if call.timestamp and last_time and call.timestamp != last_time:
            lines.append(f"{indent}vm.warp({call.timestamp});")
        if call.block_number and last_block and call.block_number != last_block:
            lines.append(f"{indent}vm.roll({call.block_number});")
        
        # Add prank
        if call.sender:
            lines.append(f"{indent}vm.prank({call.sender});")
        
        # Format arguments
        args = ', '.join(str(a) for a in call.arguments) if call.arguments else ''
        
        # Format the call
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
            tests.append(self.generate_test(prop, i + 1))
        return '\n'.join(tests)

    def generate_full_contract(self, failed_properties: List[FailedProperty]) -> str:
        """Generate complete Foundry test contract"""
        tests = self.generate_all_tests(failed_properties)
        
        return f'''// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {{Test}} from "forge-std/Test.sol";
import {{TargetFunctions}} from "./TargetFunctions.sol";
import {{FoundryAsserts}} from "invariant-hunter/HunterTester.sol";

/// @title Reproducer Tests - Generated from Medusa logs
/// @notice Run with: forge test --match-contract MedusaReproducers -vvvv
contract MedusaReproducers is Test, TargetFunctions, FoundryAsserts {{
    
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
        description='Convert Medusa logs/corpus to Foundry test cases'
    )
    parser.add_argument(
        'input',
        nargs='?',
        help='Path to Medusa log file or corpus directory'
    )
    parser.add_argument(
        '--stdin',
        action='store_true',
        help='Read from stdin'
    )
    parser.add_argument(
        '--corpus',
        action='store_true',
        help='Input is a corpus directory'
    )
    parser.add_argument(
        '--output', '-o',
        help='Output file path'
    )
    parser.add_argument(
        '--full-contract',
        action='store_true',
        help='Generate complete Foundry contract'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output as JSON'
    )
    
    args = parser.parse_args()
    
    if not args.input and not args.stdin:
        parser.print_help()
        sys.exit(1)
    
    scraper = MedusaScraper()
    
    if args.stdin:
        failed_properties = scraper.parse_stdin()
    elif args.corpus:
        failed_properties = scraper.parse_corpus(args.input)
    else:
        failed_properties = scraper.parse_file(args.input)
    
    if not failed_properties:
        print("No failed properties found.", file=sys.stderr)
        sys.exit(0)
    
    if args.json:
        output = json.dumps([
            {
                'property_name': p.property_name,
                'property_type': p.property_type,
                'revert_reason': p.revert_reason,
                'call_sequence': [
                    {
                        'contract': c.contract,
                        'function': c.function_name,
                        'arguments': c.arguments,
                        'sender': c.sender,
                        'value': c.value,
                        'block_number': c.block_number,
                        'timestamp': c.timestamp
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
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Generated {len(failed_properties)} test(s) to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == '__main__':
    main()
