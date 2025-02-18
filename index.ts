import { assign, orderBy } from "lodash";
// ========================================================
// CONFIGURATION & ROSTER SETUP
// ========================================================

// Field positions and their importance (highest → lowest):
const allPositions = [
  "P",
  "SS",
  "1B",
  "LF",
  "LCF",
  "3B",
  "2B",
  "RCF",
  "RF",
  "C",
] as const;
const fullPositionSet = new Set(allPositions);
const benchPosition = "SIT";
export type Position = (typeof allPositions)[number] | typeof benchPosition;
export type Assignment = {
  player: Player;
  position: Position;
};

export type Gender = "M" | "O";

export interface Player {
  name: string;
  gender: Gender;
  positions: Set<string>; // Allowed positions or tokens ("*", "IF", "OF")
  skill: number; // 1 = worst, 5 = best
}

export interface InningAssignment {
  assignments: Assignment[];
}

interface CandidateSolution {
  innings: InningAssignment[];
  maleBattingOrder: Player[]; // Array of player indices (each player appears at least once)
  otherBattingOrder: Player[]; // Array of player indices (each player appears at least once)
  battingOrder: Player[]; // Rendered batting order
}

interface SAOptions {
  initialTemp: number;
  coolingRate: number;
  iterations: number;
}

const positionImportance: { [pos: string]: number } = {
  P: 10,
  SS: 9,
  "1B": 9,
  LF: 8,
  LCF: 8,
  "3B": 7,
  RCF: 7,
  "2B": 6,
  RF: 3,
  C: 1,
};

const players: Player[] = [
  { name: "Paul M", gender: "M", positions: new Set(["*", "P"]), skill: 5 },
  { name: "Alex B", gender: "M", positions: new Set(["OF", "P"]), skill: 4 },
  { name: "David D", gender: "M", positions: new Set(["*"]), skill: 5 },
  { name: "Mason K", gender: "M", positions: new Set(["*", "P"]), skill: 4 },
  {
    name: "Bailey B",
    gender: "O",
    positions: new Set(["3B", "2B", "1B"]),
    skill: 4,
  },
  { name: "David G", gender: "M", positions: new Set(["OF"]), skill: 5 },
  {
    name: "Leia C",
    gender: "O",
    positions: new Set(["RF", "C", "2B"]),
    skill: 2,
  },
  { name: "Nicolle C", gender: "O", positions: new Set(["RF", "C"]), skill: 1 },
  { name: "Rudy G", gender: "M", positions: new Set(["OF", "1B"]), skill: 3 },
  { name: "Ryan A", gender: "M", positions: new Set(["IF"]), skill: 5 },
  {
    name: "Skylar V",
    gender: "O",
    positions: new Set(["RF", "2B", "C", "SS"]),
    skill: 3,
  },
  {
    name: "Thomas N",
    gender: "M",
    positions: new Set(["OF", "2B", "P", "C"]),
    skill: 3,
  },
];

const genericNonMan: Player = {
  name: "SLOT",
  gender: "O",
  positions: new Set(["*"]),
  skill: 2,
};
const firstNonManSlot = 3;
const menBattingInARowLimit = 3;

// For token purposes:
const infieldPositions: string[] = ["C", "1B", "2B", "3B", "SS"];
const outfieldPositions: string[] = ["LF", "LCF", "RCF", "RF"];

// Game parameters:
const numInnings: number = 6; // e.g. a 6‑inning game (can be as few as 4)
const gameType: string = "regular"; // "regular" or "playoff"
const maxMenOnField: number = 7; // Maximum male fielders allowed in any inning

// ========================================================
// PENALTY CONSTANTS & BATTER ORDER PREFERENCES
// ========================================================
const INVALID_ASSIGNMENT_PENALTY = 1000;
const IMBALANCED_SITTING_PENALTY = 1000;
const SKILL_FACTOR = 20; // Multiplier for skill mismatch cost.
const DIVERSITY_PENALTY_FACTOR = 50; // For regular season: penalty for repeating the same position.

// In the “3-outfielder” scenario (when two positions are missing: C and RF),
// we treat each filled outfield slot (other than the empty one) as having a medium importance.
const threeOutfielderOutfieldImportance = 8;

// -------------------
// BATTER ORDER PREFERENCES:
const ORDER_TOP_WEIGHT = 5; // Weight for preferring high‑skill players at the top.
const HIGH_THRESHOLD = 4; // Skill value at or above which a player is considered "high skill".
const LOW_THRESHOLD = 2; // Skill value at or below which a player is considered "low skill".
const HIGH_TO_LOW_BONUS = 20; // Bonus (negative penalty) when a high-skill player is followed by a low-skill player.
const CONSECUTIVE_LOW_PENALTY = 50; // Penalty for having more than one lower-skill player in a row.
// -------------------
// SAWTOOTH PREFERENCE:
// We want the batting order’s skill-versus-index plot to look like a sawtooth wave.
// That is, we prefer an alternating pattern where a high is immediately followed by a low,
// and (ideally) a medium precedes a high. This extra penalty term adds cost whenever
// two consecutive skill differences do not alternate in sign.
const SAWTOOTH_PENALTY = 50;

const playersByPosition: { [pos: string]: Player[] } = {};
for (const pos of allPositions) {
  playersByPosition[pos] = players.filter((p) => canPlay(p, pos));
}

// ========================================================
// HELPER FUNCTIONS
// ========================================================

// Deep clone a candidate solution.
function cloneSolution(sol: CandidateSolution): CandidateSolution {
  return {
    innings: sol.innings.map((inning) => ({
      assignments: inning.assignments.slice(),
    })),
    maleBattingOrder: sol.maleBattingOrder.slice(),
    otherBattingOrder: sol.otherBattingOrder.slice(),
    battingOrder: [],
  };
}

// Fisher–Yates shuffle.
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Return a random integer between 0 (inclusive) and n (exclusive).
function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function pickRandom<T>(array: T[]): T {
  return array[randInt(array.length)];
}

// Returns true if the given player is open to playing the given position.
function canPlay(player: Player, pos: string): boolean {
  const allowed = player.positions;
  if (pos === benchPosition) return true;
  if (allowed.has(pos)) return true;
  if (allowed.has("*") && pos !== "P") return true;
  if (allowed.has("IF") && infieldPositions.includes(pos)) return true;
  if (allowed.has("OF") && outfieldPositions.includes(pos)) return true;
  return false;
}

// ========================================================
// CANDIDATE SOLUTION GENERATION
// ========================================================

// Generate a random fielding assignment for one inning.
// When there are fewer players than positions, we purposely leave the least‑important
// positions empty.
export function randomInningAssignment(players: Player[]): InningAssignment {
  const malePlayers = shuffle(players.filter((p) => p.gender === "M"));
  const otherPlayers = shuffle(players.filter((p) => p.gender !== "M"));
  const allowableMalePlayers = malePlayers.slice(0, maxMenOnField);
  const remainingMalePlayers = malePlayers.slice(maxMenOnField);
  const assignablePlayers = [...allowableMalePlayers, ...otherPlayers];

  const availablePositions: Position[] = allPositions
    .slice()
    .sort((a, b) => positionImportance[a] - positionImportance[b]);

  if (assignablePlayers.length < availablePositions.length) {
    const missingCount = Math.max(
      0,
      availablePositions.length - assignablePlayers.length
    );
    availablePositions.splice(0, missingCount);
  }

  if (players.length > availablePositions.length) {
    const emptyCount = players.length - availablePositions.length;
    for (let i = 0; i < emptyCount; i++) {
      availablePositions.push(benchPosition);
    }
  }

  const assignments = [...assignablePlayers, ...remainingMalePlayers].map(
    (player, index) => ({
      player,
      position: availablePositions[index],
    })
  );
  return { assignments };
}

// Generate a random batting order (each player appears at least once).
export function randomBattingOrder(gender: Gender): Player[] {
  const genderedPlayers = players.filter((p) => p.gender === gender);
  return shuffle(genderedPlayers);
}

export function renderBattingOrder(
  maleBattingOrder: Player[],
  otherBattingOrder: Player[]
): Player[] {
  const requiredManCount = Math.ceil(maleBattingOrder.length / 3);

  if (otherBattingOrder.length < requiredManCount) {
    for (let i = 0; otherBattingOrder.length < requiredManCount; i++) {
      otherBattingOrder.push(genericNonMan);
    }
  }

  const gapCount = otherBattingOrder.length;
  const base = Math.floor(maleBattingOrder.length / gapCount);
  const extra = maleBattingOrder.length % gapCount;

  const battingOrder = [];
  let maleIndex = 0;

  for (let i = 0; i < gapCount; i++) {
    const count = base + (i < extra ? 1 : 0);
    for (let j = 0; j < count; j++) {
      battingOrder.push(maleBattingOrder[maleIndex++]);
    }
    battingOrder.push(otherBattingOrder[i]);
  }

  if (battingOrder[battingOrder.length - 1] === genericNonMan) {
    battingOrder.pop();
  }

  return battingOrder;
}

// A candidate solution includes an assignment for each inning and a batting order.
function randomSolution(): CandidateSolution {
  const innings: InningAssignment[] = [];
  for (let i = 0; i < numInnings; i++) {
    innings.push(randomInningAssignment(players));
  }
  const maleBattingOrder = randomBattingOrder("M");
  const otherBattingOrder = randomBattingOrder("O");
  return { innings, maleBattingOrder, otherBattingOrder, battingOrder: [] };
}

// ========================================================
// NEIGHBOR FUNCTION
// ========================================================

function neighbor(solution: CandidateSolution): CandidateSolution {
  // console.log('Generating neighbor');
  // printTable(solution);

  const newSol = cloneSolution(solution);
  if (Math.random() < 0.7) {
    // Modify one inning’s fielding assignment.
    const inning = pickRandom(newSol.innings);
    const inningNumber = newSol.innings.indexOf(inning) + 1;

    const assignments = inning.assignments;
    let firstAssignment: Assignment;
    let secondAssignment: Assignment;

    const moveType = Math.random();

    if (moveType <= 0.5 && players.length > 10) {
      const benchAssignments = assignments.filter(
        (a) => a.position === benchPosition
      );
      firstAssignment = pickRandom(benchAssignments);
      const allowableAssignments = assignments.filter(
        (a) =>
          a.position !== benchPosition &&
          a.player !== firstAssignment.player &&
          a.player.gender === firstAssignment.player.gender &&
          canPlay(firstAssignment.player, a.position)
      );
      if (allowableAssignments.length === 0) {
        console.log(`No allowable swaps for ${firstAssignment.player.name}`);
        return newSol;
      }
      secondAssignment = pickRandom(allowableAssignments);
    } else {
      const playingAssignments = assignments.filter(
        (a) => a.position !== benchPosition
      );
      firstAssignment = pickRandom(playingAssignments);
      const allowableAssignments = playingAssignments.filter(
        (a) =>
          a.position !== firstAssignment.position &&
          canPlay(firstAssignment.player, a.position)
      )
      if (allowableAssignments.length === 0) {
        console.log(`No allowable swaps for ${firstAssignment.player.name}`);
        return newSol;
      }
      secondAssignment = pickRandom(allowableAssignments);
    }

    console.log(
      `Swapping ${firstAssignment.player.name} (${firstAssignment.position}) and ${secondAssignment.player.name} (${secondAssignment.position}) in inning ${inningNumber}`
    );

    const temp = firstAssignment.position;
    firstAssignment.position = secondAssignment.position;
    secondAssignment.position = temp;
  } else {
    const ratio =
      newSol.maleBattingOrder.length /
      (newSol.maleBattingOrder.length + newSol.otherBattingOrder.length);
    // Modify the batting order.
    const battingOrderToChange =
      Math.random() < ratio
        ? newSol.maleBattingOrder
        : newSol.otherBattingOrder;

    if (battingOrderToChange.length > 1) {
      const i = randInt(battingOrderToChange.length);
      const j = randInt(battingOrderToChange.length);
      console.log(
        `Swapping ${battingOrderToChange[i].name} (${i+1}) and ${battingOrderToChange[j].name} (${j+1}) in the batting order`
      );
      const temp = battingOrderToChange[i];
      battingOrderToChange[i] = battingOrderToChange[j];
      battingOrderToChange[j] = temp;
    }
  }
  // printTable(newSol)
  return newSol;
}

// ========================================================
// COST FUNCTION
// ========================================================

function cost(solution: CandidateSolution): number {
  console.log("Calculating cost for:");
  printTable(solution);

  let penalty = 0;

  const sitCounts: number[] = Array(players.length).fill(0);

  for (const inning of solution.innings) {
    // ----- Sitting Out Distribution -----
    inning.assignments.forEach((assignment) => {
      const playerIndex = players.indexOf(assignment.player);
      if (assignment.position === benchPosition) {
        sitCounts[playerIndex]++;
      }
    });

    const maxSit = Math.max(...sitCounts);
    const minSit = Math.min(...sitCounts);
    if (maxSit - minSit > 1) {
      penalty += (maxSit - minSit) * IMBALANCED_SITTING_PENALTY;
    }

    // ----- Fielding Cost (per inning) -----
    const assignments = inning.assignments;
    const positionSet = new Set<Position>(assignments.map((a) => a.position));
    const missingPositions: Set<Position> =
      fullPositionSet.difference(positionSet);
    const missingCount = missingPositions.size;
    const is3OutfieldScenario = missingCount === 2;

    assignments
      .filter((a) => a.position !== benchPosition)
      .forEach((assignment: Assignment) => {
        const pos = assignment.position;
        let importance = positionImportance[pos];
        // In the "3-outfielder" scenario, for filled outfield positions (other than the empty one)
        // override their importance to a medium level.
        if (
          is3OutfieldScenario &&
          outfieldPositions.includes(pos) &&
          !missingPositions.has(pos)
        ) {
          importance = threeOutfielderOutfieldImportance;
        }

        // If the player is not open to their assigned position, add a heavy penalty.
        if (!canPlay(assignment.player, pos)) {
          penalty += INVALID_ASSIGNMENT_PENALTY;
        }
        // Skill penalty:
        // • In playoff games, we want high‑skill players in important positions.
        // • In regular season games, we favor giving lower‑skill players experience in key roles.
        if (gameType === "playoff") {
          penalty += importance * (5 - assignment.player.skill) * SKILL_FACTOR;
        } else {
          penalty += importance * (assignment.player.skill - 1) * SKILL_FACTOR;
        }
      });
  }

  // ----- Diversity in Fielding Assignments (Regular Season Only) -----
  // if (gameType === "regular") {
  //   const positionsPlayed: Array<Set<string>> = Array(players.length)
  //     .fill(0)
  //     .map(() => new Set<string>());
  //   const inningsPlayed: number[] = Array(players.length).fill(0);
  //   for (const inning of solution.innings) {
  //     allPositions.forEach((pos, playerIndex) => {
  //       if (playerIndex !== null) {
  //         positionsPlayed[playerIndex].add(pos);
  //         inningsPlayed[playerIndex]++;
  //       }
  //     });
  //   }
  //   for (let i = 0; i < players.length; i++) {
  //     if (inningsPlayed[i] > 1) {
  //       const diversity = positionsPlayed[i].size;
  //       const repeats = inningsPlayed[i] - diversity;
  //       penalty += repeats * DIVERSITY_PENALTY_FACTOR;
  //     }
  //   }
  // }

  solution.battingOrder = renderBattingOrder(
    solution.maleBattingOrder,
    solution.otherBattingOrder
  );

  // ----- Batting Order Costs -----
  // 1. Higher-skill players at the top.
  const n = solution.battingOrder.length;
  let orderTopPenalty = 0;
  solution.battingOrder.forEach((player, i) => {
    const skill = player.skill;
    orderTopPenalty += (n - i) * (5 - skill) * ORDER_TOP_WEIGHT;
  });
  // 2. Bonus for a high-skill player immediately followed by a lower-skill player.
  let highToLowBonus = 0;
  for (let i = 0; i < n - 1; i++) {
    const s1 = solution.battingOrder[i].skill;
    const s2 = solution.battingOrder[i + 1].skill;
    if (s1 >= HIGH_THRESHOLD && s2 <= LOW_THRESHOLD) {
      highToLowBonus -= HIGH_TO_LOW_BONUS;
    }
  }
  // 3. Penalty for consecutive lower-skill players.
  let consecutiveLowPenalty = 0;
  let runLength = 0;
  for (let i = 0; i < n; i++) {
    const skill = solution.battingOrder[i].skill;
    if (skill <= LOW_THRESHOLD) {
      runLength++;
    } else {
      if (runLength > 1) {
        consecutiveLowPenalty += (runLength - 1) * CONSECUTIVE_LOW_PENALTY;
      }
      runLength = 0;
    }
  }
  if (runLength > 1) {
    consecutiveLowPenalty += (runLength - 1) * CONSECUTIVE_LOW_PENALTY;
  }
  // 4. Sawtooth Pattern Penalty:
  // Encourage alternating differences in skill.
  let sawtoothPenalty = 0;
  for (let i = 1; i < n - 1; i++) {
    const prevSkill = solution.battingOrder[i - 1].skill;
    const currSkill = solution.battingOrder[i].skill;
    const nextSkill = solution.battingOrder[i + 1].skill;
    const diff1 = currSkill - prevSkill;
    const diff2 = nextSkill - currSkill;
    if ((diff1 > 0 && diff2 > 0) || (diff1 < 0 && diff2 < 0)) {
      // Penalize the sum of differences.
      sawtoothPenalty += SAWTOOTH_PENALTY * (Math.abs(diff1) + Math.abs(diff2));
    }
  }
  penalty +=
    orderTopPenalty + highToLowBonus + consecutiveLowPenalty + sawtoothPenalty;

  return penalty;
}

// ========================================================
// SIMULATED ANNEALING ROUTINE
// ========================================================

function simulatedAnnealing(
  initialSolution: CandidateSolution,
  costFunc: (sol: CandidateSolution) => number,
  neighborFunc: (sol: CandidateSolution) => CandidateSolution,
  options: SAOptions
): CandidateSolution {
  let current = initialSolution;
  let best = current;
  let currentCost = costFunc(current);
  let bestCost = currentCost;
  let T = options.initialTemp;

  for (let i = 0; i < options.iterations; i++) {
    const candidate = neighborFunc(current);
    candidate.battingOrder = renderBattingOrder(
      candidate.maleBattingOrder,
      candidate.otherBattingOrder
    );
    const candidateCost = costFunc(candidate);
    const delta = candidateCost - currentCost;
    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      console.log(`Accepting candidate with cost ${candidateCost}`);
      current = candidate;
      currentCost = candidateCost;
      if (currentCost < bestCost) {
        best = current;
        bestCost = currentCost;
      }
    }
    T *= options.coolingRate;
    console.log(`Iteration ${i + 1}: T=${T}, cost=${currentCost}\n`);
  }
  return best;
}

// ========================================================
// OUTPUT DISPLAY: BUILD A TABLE (CSV FORMAT)
// ========================================================
//
// The table’s rows are players (in batting order) and columns represent innings.
// The cell value is the position that player is playing that inning, or "Sit" if not on defense.
function printTable(solution: CandidateSolution): void {
  solution.battingOrder = renderBattingOrder(
    solution.maleBattingOrder,
    solution.otherBattingOrder
  );
  const header: string[] = ["Player"];
  for (let i = 0; i < solution.innings.length; i++) {
    header.push(`Inning ${i + 1}`);
  }
  const rows: string[] = [header.join(",")];

  solution.battingOrder.forEach((player: Player) => {
    const row: string[] = [player.name.padStart(10, " ")];
    solution.innings.forEach((inning) => {
      const assignment = inning.assignments.find((a) => a.player === player);
      if (!assignment) {
        throw new Error("Player not found in inning");
      }
      row.push(assignment.position.padStart(4, " "));
    });
    rows.push(row.join(","));
  });

  console.log(rows.join("\n"));
  // console.log(`Total Cost: ${cost(solution)}`);
}

// ========================================================
// RUNNING THE OPTIMIZER
// ========================================================

const main = () => {
  const optionsSA: SAOptions = {
    initialTemp: 1000,
    coolingRate: 0.99,
    iterations: 100,
  };

  const initialSolution = randomSolution();

  const bestSolution = simulatedAnnealing(
    initialSolution,
    cost,
    neighbor,
    optionsSA
  );

  // Print the CSV table (which can be copy/pasted into Excel/Google Sheets).
  printTable(bestSolution);

  // Optionally, uncomment the next line to see a verbose summary.
  // printSummary(bestSolution);
};

if (process.argv[1] === import.meta.filename) {
  main();
}
