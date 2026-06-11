import { targets } from "./targets.js";

export async function openCustomScenario(harness) {
  await harness.clickCanvas(targets.mainMenu.customScenario.x, targets.mainMenu.customScenario.y);
  await harness.wait(500);
}

export async function playCustomScenario(harness) {
  await harness.clickCanvas(targets.customScenario.play.x, targets.customScenario.play.y);
  await harness.wait(900);
}

export async function chooseSpawn(harness, spawn = targets.customMap.islandSouthEastSpawn) {
  await harness.clickCanvas(spawn.x, spawn.y);
  await harness.wait(250);
}

export async function confirmSpawn(harness, spawn = targets.customMap.islandSouthEastSpawn) {
  await harness.clickCanvas(spawn.x, spawn.y);
  await harness.wait(1200);
}

export async function startCustomScenario(harness, options = {}) {
  const spawn = options.spawn ?? targets.customMap.islandSouthEastSpawn;
  await openCustomScenario(harness);
  await playCustomScenario(harness);
  await chooseSpawn(harness, spawn);
  await confirmSpawn(harness, spawn);
}
