#!/usr/bin/env python3
"""
Bytecode Compare Tool - Compare bytecode of two contracts

Useful for:
- Verifying deployed contracts match source
- Comparing different versions of a contract
- Identifying differences between implementations

Usage:
    python bytecode_compare.py <bytecode1> <bytecode2>
    python bytecode_compare.py --file1 contract1.bin --file2 contract2.bin
    python bytecode_compare.py --rpc <rpc_url> --addr1 <address1> --addr2 <address2>
"""

import argparse
import sys
import json
from typing import Tuple, List, Optional
from dataclasses import dataclass
import re

try:
    from web3 import Web3
    HAS_WEB3 = True
except ImportError:
    HAS_WEB3 = False


@dataclass
class BytecodeDiff:
    """Represents a difference in bytecode"""
    offset: int
    expected: str
    actual: str
    context: str


@dataclass
class CompareResult:
    """Result of bytecode comparison"""
    identical: bool
    size_diff: int
    differences: List[BytecodeDiff]
    metadata_diff: bool
    constructor_diff: bool


class BytecodeAnalyzer:
    """Analyze and compare EVM bytecode"""

    # Common bytecode patterns
    METADATA_PATTERN = re.compile(r'a264697066735822[a-f0-9]{64}64736f6c6343[a-f0-9]{6}0033$')
    PUSH_PATTERNS = {
        'PUSH1': '60',
        'PUSH2': '61',
        'PUSH4': '63',
        'PUSH20': '73',
        'PUSH32': '7f'
    }

    def __init__(self):
        pass

    def normalize_bytecode(self, bytecode: str) -> str:
        """Normalize bytecode by removing 0x prefix and lowercasing"""
        if bytecode.startswith('0x'):
            bytecode = bytecode[2:]
        return bytecode.lower()

    def extract_metadata(self, bytecode: str) -> Optional[str]:
        """Extract CBOR metadata from bytecode"""
        bytecode = self.normalize_bytecode(bytecode)
        match = self.METADATA_PATTERN.search(bytecode)
        return match.group(0) if match else None

    def strip_metadata(self, bytecode: str) -> str:
        """Remove CBOR metadata from bytecode"""
        bytecode = self.normalize_bytecode(bytecode)
        return self.METADATA_PATTERN.sub('', bytecode)

    def compare(
        self, 
        bytecode1: str, 
        bytecode2: str,
        ignore_metadata: bool = True
    ) -> CompareResult:
        """Compare two bytecodes"""
        bc1 = self.normalize_bytecode(bytecode1)
        bc2 = self.normalize_bytecode(bytecode2)

        # Check metadata
        meta1 = self.extract_metadata(bc1)
        meta2 = self.extract_metadata(bc2)
        metadata_diff = meta1 != meta2

        if ignore_metadata:
            bc1 = self.strip_metadata(bc1)
            bc2 = self.strip_metadata(bc2)

        # Size comparison
        size_diff = len(bc2) - len(bc1)

        # Find differences
        differences = []
        min_len = min(len(bc1), len(bc2))

        i = 0
        while i < min_len:
            if bc1[i:i+2] != bc2[i:i+2]:
                # Get context
                start = max(0, i - 10)
                end = min(min_len, i + 12)
                context = f"...{bc1[start:i]}[{bc1[i:i+2]}]{bc1[i+2:end]}..."

                diff = BytecodeDiff(
                    offset=i // 2,
                    expected=bc1[i:i+2],
                    actual=bc2[i:i+2],
                    context=context
                )
                differences.append(diff)
            i += 2

        # Check for extra bytes
        if len(bc1) != len(bc2):
            longer = bc1 if len(bc1) > len(bc2) else bc2
            label = "bytecode1" if len(bc1) > len(bc2) else "bytecode2"
            for j in range(min_len, len(longer), 2):
                diff = BytecodeDiff(
                    offset=j // 2,
                    expected=longer[j:j+2] if label == "bytecode1" else "",
                    actual=longer[j:j+2] if label == "bytecode2" else "",
                    context=f"Extra bytes in {label}"
                )
                differences.append(diff)

        return CompareResult(
            identical=len(differences) == 0 and size_diff == 0,
            size_diff=size_diff,
            differences=differences,
            metadata_diff=metadata_diff,
            constructor_diff=False  # Would need to analyze separately
        )

    def disassemble_range(self, bytecode: str, start: int, length: int = 20) -> List[str]:
        """Disassemble a range of bytecode"""
        bc = self.normalize_bytecode(bytecode)
        opcodes = []

        # Simple opcode table (partial)
        OPCODES = {
            '00': 'STOP', '01': 'ADD', '02': 'MUL', '03': 'SUB',
            '04': 'DIV', '10': 'LT', '11': 'GT', '14': 'EQ',
            '15': 'ISZERO', '16': 'AND', '17': 'OR', '18': 'XOR',
            '19': 'NOT', '20': 'SHA3', '30': 'ADDRESS', '31': 'BALANCE',
            '32': 'ORIGIN', '33': 'CALLER', '34': 'CALLVALUE',
            '35': 'CALLDATALOAD', '36': 'CALLDATASIZE', '37': 'CALLDATACOPY',
            '38': 'CODESIZE', '39': 'CODECOPY', '3a': 'GASPRICE',
            '50': 'POP', '51': 'MLOAD', '52': 'MSTORE', '54': 'SLOAD',
            '55': 'SSTORE', '56': 'JUMP', '57': 'JUMPI', '58': 'PC',
            '5b': 'JUMPDEST', '60': 'PUSH1', '61': 'PUSH2', '63': 'PUSH4',
            '73': 'PUSH20', '7f': 'PUSH32', '80': 'DUP1', '90': 'SWAP1',
            'f1': 'CALL', 'f3': 'RETURN', 'fd': 'REVERT', 'fe': 'INVALID',
            'ff': 'SELFDESTRUCT'
        }

        i = start * 2
        end = min(len(bc), (start + length) * 2)

        while i < end:
            opcode = bc[i:i+2]
            if opcode in OPCODES:
                name = OPCODES[opcode]
                if name.startswith('PUSH'):
                    push_size = int(name[4:])
                    data = bc[i+2:i+2+push_size*2]
                    opcodes.append(f"{i//2:04x}: {name} 0x{data}")
                    i += 2 + push_size * 2
                else:
                    opcodes.append(f"{i//2:04x}: {name}")
                    i += 2
            else:
                opcodes.append(f"{i//2:04x}: 0x{opcode}")
                i += 2

        return opcodes


def fetch_bytecode_from_rpc(rpc_url: str, address: str) -> str:
    """Fetch bytecode from RPC endpoint"""
    if not HAS_WEB3:
        raise ImportError("web3 library required for RPC fetching. Install with: pip install web3")
    
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    code = w3.eth.get_code(Web3.to_checksum_address(address))
    return code.hex()


def main():
    parser = argparse.ArgumentParser(
        description='Compare EVM bytecode'
    )
    
    # Direct bytecode input
    parser.add_argument('bytecode1', nargs='?', help='First bytecode')
    parser.add_argument('bytecode2', nargs='?', help='Second bytecode')
    
    # File input
    parser.add_argument('--file1', help='File containing first bytecode')
    parser.add_argument('--file2', help='File containing second bytecode')
    
    # RPC input
    parser.add_argument('--rpc', help='RPC URL for fetching bytecode')
    parser.add_argument('--addr1', help='First contract address')
    parser.add_argument('--addr2', help='Second contract address')
    
    # Options
    parser.add_argument('--include-metadata', action='store_true',
                       help='Include metadata in comparison')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--disassemble', action='store_true',
                       help='Show disassembly of differences')

    args = parser.parse_args()

    # Get bytecodes
    bc1, bc2 = None, None

    if args.rpc and args.addr1 and args.addr2:
        print(f"Fetching bytecode from {args.rpc}...", file=sys.stderr)
        bc1 = fetch_bytecode_from_rpc(args.rpc, args.addr1)
        bc2 = fetch_bytecode_from_rpc(args.rpc, args.addr2)
    elif args.file1 and args.file2:
        with open(args.file1) as f:
            bc1 = f.read().strip()
        with open(args.file2) as f:
            bc2 = f.read().strip()
    elif args.bytecode1 and args.bytecode2:
        bc1, bc2 = args.bytecode1, args.bytecode2
    else:
        parser.print_help()
        sys.exit(1)

    # Compare
    analyzer = BytecodeAnalyzer()
    result = analyzer.compare(bc1, bc2, ignore_metadata=not args.include_metadata)

    # Output
    if args.json:
        output = {
            'identical': result.identical,
            'size_diff': result.size_diff,
            'metadata_diff': result.metadata_diff,
            'differences': [
                {
                    'offset': d.offset,
                    'expected': d.expected,
                    'actual': d.actual,
                    'context': d.context
                }
                for d in result.differences[:50]  # Limit output
            ],
            'total_differences': len(result.differences)
        }
        print(json.dumps(output, indent=2))
    else:
        if result.identical:
            print("✓ Bytecodes are identical")
        else:
            print("✗ Bytecodes differ")
            print(f"  Size difference: {result.size_diff} bytes")
            print(f"  Metadata differs: {result.metadata_diff}")
            print(f"  Number of differences: {len(result.differences)}")
            
            if result.differences:
                print("\nFirst 10 differences:")
                for diff in result.differences[:10]:
                    print(f"  Offset {diff.offset}: expected '{diff.expected}', got '{diff.actual}'")
                    if args.disassemble:
                        print("    Disassembly around offset:")
                        for line in analyzer.disassemble_range(bc1, diff.offset - 5, 10):
                            print(f"      {line}")


if __name__ == '__main__':
    main()
