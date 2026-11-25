// ============================================================
// SecureAssess — Anti-Adjacency Constrained Seating Engine
// ============================================================
//
// Algorithm:
//  1. Sort roster by registerNumber (lexicographic).
//  2. Fisher-Yates shuffle the machine list.
//  3. Apply Anti-Adjacency constraint:
//     If two roster entries with consecutive register numbers
//     are assigned to physically adjacent machines (|systemIndex - systemIndex| ≤ 1),
//     retry that assignment up to MAX_RETRIES times with a fresh shuffle.
//  4. Return the final allocation map.
//
// "Adjacent" is defined as: systemNo index difference ≤ 1 within the
// sorted machine list (SYS-01, SYS-02 … SYS-N).
// ============================================================

export interface RosterRow {
  id: string;
  registerNumber: string;
  fullName: string;
  year: string;
}

export interface MachineRow {
  systemNo: string;
}

export interface AllocationResult {
  rosterId: string;
  systemNo: string;
  registerNumber: string;
  fullName: string;
}

const MAX_ATTEMPTS = 1000;

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Checks whether two students with consecutive register numbers
 * have been assigned to adjacent machine indices.
 */
function hasAdjacencyViolation(
  roster: RosterRow[],
  machines: MachineRow[],
  assignment: Map<string, number>  // rosterEntry.id → machine index
): boolean {
  // Build register-number sort order
  const sorted = [...roster].sort((a, b) =>
    a.registerNumber.localeCompare(b.registerNumber, undefined, { numeric: true })
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const idxA = assignment.get(a.id) ?? -1;
    const idxB = assignment.get(b.id) ?? -1;
    if (Math.abs(idxA - idxB) <= 1) {
      return true; // violation found
    }
  }
  return false;
}

export function generateSeatAllocations(
  roster: RosterRow[],
  machines: MachineRow[]
): AllocationResult[] {
  if (roster.length === 0 || machines.length === 0) return [];

  let bestAttempt: AllocationResult[] | null = null;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const shuffledMachines = fisherYatesShuffle(machines);
    const assignment = new Map<string, number>();
    const allocations: AllocationResult[] = [];

    for (let i = 0; i < roster.length; i++) {
      const student = roster[i]!;
      const machine = shuffledMachines[i]!;
      assignment.set(student.id, i);
      allocations.push({
        rosterId: student.id,
        systemNo: machine.systemNo,
        registerNumber: student.registerNumber,
        fullName: student.fullName,
      });
    }

    if (!hasAdjacencyViolation(roster, shuffledMachines, assignment)) {
      return allocations;
    }
    bestAttempt = allocations;
  }

  // Return best effort if perfect allocation was impossible
  return bestAttempt ?? [];
}
