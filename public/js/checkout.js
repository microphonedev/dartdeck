function getCheckoutSuggestion(remaining, outRule = 'double') {
  if (remaining <= 0 || remaining > 170) return null;
  
  const singles = [];
  const doubles = [];
  const triples = [];
  
  for (let i = 1; i <= 20; i++) {
    singles.push({ label: `S${i}`, val: i });
    doubles.push({ label: `D${i}`, val: i * 2 });
    triples.push({ label: `T${i}`, val: i * 3 });
  }
  singles.push({ label: 'SB', val: 25 });
  doubles.push({ label: 'Bull', val: 50 });
  
  const valid1 = [];
  if (outRule === 'double') {
    valid1.push(...doubles);
  } else if (outRule === 'master') {
    valid1.push(...doubles, ...triples);
  } else {
    valid1.push(...singles, ...doubles, ...triples);
  }
  
  for (const d of valid1) {
    if (d.val === remaining) return d.label;
  }
  
  const standardDoubleRoutes = {
    170: 'T20 T20 Bull', 167: 'T20 T19 Bull', 164: 'T20 T18 Bull', 161: 'T20 T17 Bull',
    160: 'T20 T20 D20', 158: 'T20 T20 D19', 157: 'T20 T19 D20', 156: 'T20 T20 D18',
    155: 'T20 T19 D19', 154: 'T20 T18 D20', 153: 'T20 T19 D18', 152: 'T20 T20 D16',
    151: 'T20 T17 D20', 150: 'T20 T18 D18', 149: 'T20 T19 D16', 148: 'T20 T16 D20',
    147: 'T20 T17 D18', 146: 'T20 T18 D16', 145: 'T20 T15 D20', 144: 'T20 T20 D12',
    143: 'T20 T17 D16', 142: 'T20 T14 D20', 141: 'T20 T15 D18', 140: 'T20 T16 D16',
    139: 'T19 T14 D20', 138: 'T20 T18 D12', 137: 'T19 T16 D16', 136: 'T20 T20 D8',
    135: 'T20 T15 D20', 134: 'T20 T14 D16', 133: 'T20 T17 D11', 132: 'T20 T16 D12',
    131: 'T20 T13 D16', 130: 'T20 T18 D8', 129: 'T19 T16 D12', 128: 'T18 T14 D16',
    127: 'T20 T17 D8', 126: 'T19 T19 D6', 125: 'T18 T13 D16', 124: 'T20 T16 D8',
    123: 'T19 T16 D9', 122: 'T18 T16 D8', 121: 'T20 T15 D8', 120: 'T20 S20 D20',
    119: 'T19 T10 D16', 118: 'T20 S18 D20', 117: 'T20 S17 D20', 116: 'T20 S16 D20',
    115: 'T20 S15 D20', 114: 'T20 S14 D20', 113: 'T19 S16 D20', 112: 'T20 S12 D20',
    111: 'T20 S19 D16', 110: 'T20 S10 D20', 109: 'T19 S12 D20', 108: 'T20 S16 D16',
    107: 'T19 S10 D20', 106: 'T20 S14 D16', 105: 'T19 S16 D16', 104: 'T18 S18 D16',
    103: 'T20 S11 D16', 102: 'T20 S10 D16', 101: 'T20 S9 D16', 100: 'T20 D20',
    99: 'T19 S10 D16', 98: 'T20 D19', 97: 'T19 D20', 96: 'T20 D18',
    95: 'T19 D19', 94: 'T18 D20', 93: 'T19 D18', 92: 'T20 D16',
    91: 'T17 D20', 90: 'T20 D15', 89: 'T19 D16', 88: 'T16 D20',
    87: 'T17 D18', 86: 'T18 D16', 85: 'T15 D20', 84: 'T20 D12',
    83: 'T17 D16', 82: 'T14 D20', 81: 'T19 D12', 80: 'T20 D10',
    79: 'T13 D20', 78: 'T18 D12', 77: 'T19 D10', 76: 'T20 D8',
    75: 'T17 D12', 74: 'T14 D16', 73: 'T19 D8', 72: 'T16 D12',
    71: 'T13 D16', 70: 'T18 D8', 69: 'T15 D12', 68: 'T16 D10',
    67: 'T17 D8', 66: 'T10 D18', 65: 'T15 D10', 64: 'T16 D8',
    63: 'T13 D12', 62: 'T10 D16', 61: 'T15 D8', 60: 'S20 D20',
    59: 'S19 D20', 58: 'S18 D20', 57: 'S17 D20', 56: 'S16 D20',
    55: 'S15 D20', 54: 'S14 D20', 53: 'S13 D20', 52: 'S20 D16',
    51: 'S19 D16', 50: 'S10 D20', 49: 'S17 D16', 48: 'S16 D16',
    47: 'S15 D16', 46: 'S6 D20', 45: 'S13 D16', 44: 'S12 D16',
    43: 'S3 D20', 42: 'S10 D16', 41: 'S9 D16', 40: 'D20',
    39: 'S7 D16', 38: 'D19', 37: 'S5 D16', 36: 'D18',
    35: 'S3 D16', 34: 'D17', 33: 'S1 D16', 32: 'D16',
    31: 'S15 D8', 30: 'D15', 29: 'S13 D8', 28: 'D14',
    27: 'S11 D8', 26: 'D13', 25: 'S9 D8', 24: 'D12',
    23: 'S7 D8', 22: 'D11', 21: 'S5 D8', 20: 'D10',
    19: 'S3 D8', 18: 'D9', 17: 'S1 D8', 16: 'D8',
    15: 'S7 D4', 14: 'D7', 13: 'S5 D4', 12: 'D6',
    11: 'S3 D4', 10: 'D5', 9: 'S1 D4', 8: 'D4',
    7: 'S3 D2', 6: 'D3', 5: 'S1 D2', 4: 'D2',
    3: 'S1 D1', 2: 'D1'
  };

  if (outRule === 'double' && standardDoubleRoutes[remaining]) {
    return standardDoubleRoutes[remaining];
  }

  const allDarts = [...singles, ...doubles, ...triples];
  allDarts.sort((a, b) => b.val - a.val);
  
  for (const d1 of allDarts) {
    const left = remaining - d1.val;
    if (left > 0) {
      for (const d2 of valid1) {
        if (d2.val === left) return `${d1.label} ${d2.label}`;
      }
    }
  }
  
  for (const d1 of allDarts) {
    const left1 = remaining - d1.val;
    if (left1 > 0) {
      for (const d2 of allDarts) {
        const left2 = left1 - d2.val;
        if (left2 > 0) {
          for (const d3 of valid1) {
            if (d3.val === left2) return `${d1.label} ${d2.label} ${d3.label}`;
          }
        }
      }
    }
  }
  
  return null;
}

function formatSimpleCheckout(remaining) {
  if (remaining <= 0) return null;
  if (remaining % 2 === 0 && remaining <= 40) return `2× ${remaining / 2}`;
  if (remaining === 50) return 'Bull';
  return null;
}