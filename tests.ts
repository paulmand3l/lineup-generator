import { players, randomInningAssignment, randomBattingOrder, renderBattingOrder, Player, InningAssignment } from './index.ts';

const fewMaleBattingOrder: Player[] = [
  { name: 'Arthur', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Bob', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Carl', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'David', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Ernie', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Frank', gender: 'M', positions: ['*'], skill: 3 },
];

const manyMaleBattingOrder: Player[] = [
  { name: 'Arthur', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Bob', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Carl', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'David', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Ernie', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Frank', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'George', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Harry', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Irn', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Jose', gender: 'M', positions: ['*'], skill: 3 },
  { name: 'Koala', gender: 'M', positions: ['*'], skill: 3 },
];

const fewOtherBattingOrder: Player[] = [
  { name: 'Amy', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Betty', gender: 'O', positions: ['*'], skill: 3 },
];

const manyOtherBattingOrder: Player[] = [
  { name: 'Amy', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Betty', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Carol', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Darla', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Ermine', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Farine', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Galpal', gender: 'O', positions: ['*'], skill: 3 },
  { name: 'Hooah', gender: 'O', positions: ['*'], skill: 3 },
];

const testBattingOrderRendering = () => {
  const fewFewbattingOrder = renderBattingOrder(fewMaleBattingOrder, fewOtherBattingOrder);
  const manyFewBattingOrder = renderBattingOrder(manyMaleBattingOrder, fewOtherBattingOrder);
  const manyManyBattingOrder = renderBattingOrder(manyMaleBattingOrder, manyOtherBattingOrder);

  const printBattingOrder = (battingOrder: Player[]) => {
    battingOrder.forEach((player, index) => {
      console.log(`${index + 1}. ${player.name} (${player.gender})`);
    });
  };

  console.log('Few-Few');
  printBattingOrder(fewFewbattingOrder);
  console.log('\nMany-Few');
  printBattingOrder(manyFewBattingOrder);
  console.log('\nMany-Many');
  printBattingOrder(manyManyBattingOrder);
}

const testPositionAssignment = () => {
  const fewFewPlayers = [...fewMaleBattingOrder, ...fewOtherBattingOrder];
  const fewFewInningAssignment = randomInningAssignment(fewFewPlayers)

  const manyFewPlayers = [...manyMaleBattingOrder, ...fewOtherBattingOrder];
  const manyFewInningAssignment = randomInningAssignment(manyFewPlayers);

  const manyManyPlayers = [...manyMaleBattingOrder, ...manyOtherBattingOrder];
  const manyManyInningAssignment = randomInningAssignment(manyManyPlayers);

  const printInningAssignment = (players: Player[], inningAssignment: InningAssignment) => {
    inningAssignment.assignments.forEach(assignment => {
      console.log(`${assignment.player.name} (${assignment.player.gender}) - ${assignment.position}`);
    });
  };

  printInningAssignment(fewFewPlayers, fewFewInningAssignment);
  console.log('\n');
  printInningAssignment(manyFewPlayers, manyFewInningAssignment);
  console.log('\n');
  printInningAssignment(manyManyPlayers, manyManyInningAssignment);
}

testPositionAssignment();
// testBattingOrderRendering();



