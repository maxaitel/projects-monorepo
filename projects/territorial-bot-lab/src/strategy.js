import { expansionPattern, targets } from "./targets.js";
import { recordDecision } from "./decision-samples.js";
import { extractTelemetry, parseTimeSeconds } from "./telemetry.js";
import {
  chooseAttackSliderFromProbe,
  chooseTargetFromProbes,
  probeTargets,
  targetProbeCandidates,
} from "./target-probing.js";
import { choosePolicyTarget } from "./policy.js";
import {
  resetTerritoryStall,
  shouldBackoffForTerritoryStall,
  updateTerritoryProgress,
} from "./progress.js";
import {
  activeFailedTargets,
  advanceTargetMemory,
  rememberFailedTarget,
  shouldRememberFailedTarget,
} from "./target-memory.js";
import {
  chooseNeighborRegionTarget,
  chooseVisualExpansionTarget,
  decodeVisualState,
} from "./visual.js";

export class StrategyContext {
  constructor(harness, options = {}) {
    this.harness = harness;
    this.options = options;
    this.startedAt = Date.now();
    this.tick = 0;
    this.decisionSamples = [];
  }

  recordDecision(sample) {
    const maxSamples = this.options.maxDecisionSamples ?? 10000;
    if (this.decisionSamples.length >= maxSamples) return;
    this.decisionSamples.push({
      at: Date.now(),
      tick: this.tick,
      ...sample,
    });
  }
}

export class Strategy {
  constructor(name) {
    this.name = name;
  }

  async nextAction() {
    return { type: "wait", ms: 1000 };
  }
}

export class ScoutStrategy extends Strategy {
  constructor() {
    super("scout");
  }

  async nextAction(context) {
    context.tick += 1;
    const snapshot = await context.harness.snapshot();
    const texts = snapshot.state.texts.map((entry) => entry.text).join(" | ");

    if (context.tick === 1) {
      return {
        type: "log",
        message: `canvas=${snapshot.state.canvases.length} texts=${snapshot.state.texts.length}`,
      };
    }

    if (/singleplayer|offline|play/i.test(texts) && context.options.autoClickCenter) {
      return { type: "click", x: 0.5, y: 0.52 };
    }

    return { type: "wait", ms: context.options.tickMs ?? 1000 };
  }
}

export class CustomScenarioOpeningStrategy extends Strategy {
  constructor() {
    super("custom-scenario-opening");
    this.phase = "openCustomScenario";
    this.expansionIndex = 0;
  }

  async nextAction(context) {
    context.tick += 1;

    if (this.phase === "openCustomScenario") {
      this.phase = "playCustomScenario";
      return { type: "click", ...targets.mainMenu.customScenario };
    }

    if (this.phase === "playCustomScenario") {
      this.phase = "chooseSpawn";
      return { type: "click", ...targets.customScenario.play };
    }

    if (this.phase === "chooseSpawn") {
      this.phase = "confirmSpawn";
      const spawn = context.options.spawn ?? targets.customMap.islandSouthEastSpawn;
      return { type: "click", ...spawn };
    }

    if (this.phase === "confirmSpawn") {
      this.phase = "setOpeningPercent";
      const spawn = context.options.spawn ?? targets.customMap.islandSouthEastSpawn;
      return { type: "click", ...spawn };
    }

    if (this.phase === "setOpeningPercent") {
      this.phase = "expand";
      const value = context.options.openingPercent ?? targets.inGame.bottomSlider20;
      this.currentAttackSlider = value;
      return { type: "attackPercent", value };
    }

    const point = expansionPattern[this.expansionIndex % expansionPattern.length];
    this.expansionIndex += 1;
    return { type: "click", ...point };
  }
}

export class AdaptiveCustomScenarioStrategy extends CustomScenarioOpeningStrategy {
  constructor() {
    super();
    this.name = "custom-scenario-adaptive";
    this.recentTargets = [];
    this.pauseStreak = 0;
    this.expansionClicks = 0;
    this.midgamePercentSet = false;
    this.currentAttackSlider = null;
    this.territoryProgress = {};
    this.targetMemory = {};
    this.lastMidgameTarget = null;
  }

  async nextAction(context) {
    if (this.phase !== "expand") return super.nextAction(context);

    context.tick += 1;
    const snapshot = await context.harness.snapshot();
    const telemetry = extractTelemetry(snapshot, { playerName: context.options.playerName });
    const timeSeconds = parseTimeSeconds(telemetry.time);
    const minInterest = context.options.minInterest ?? 0.05;
    const hardMinInterest = context.options.hardMinInterest ?? 0.04;
    const resumeInterest = context.options.resumeInterest ?? 0.061;
    const maxPauseStreak = context.options.maxPauseStreak ?? 2;
    const maxExpansionClicks = context.options.maxExpansionClicks ?? 8;
    if (
      timeSeconds !== null &&
      timeSeconds >= 5 &&
      telemetry.interest !== null &&
      telemetry.interest < hardMinInterest
    ) {
      const action = {
        type: "wait",
        ms: context.options.holdWaitMs ?? 1100,
        meta: {
          reason: "hard-interest-floor",
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
          expansionClicks: this.expansionClicks,
        },
      };
      recordDecision(context, {
        phase: "hold",
        reason: "hard-interest-floor",
        telemetry,
        action,
      });
      return action;
    }

    const openingBudgetSpent = this.expansionClicks >= maxExpansionClicks;
    if (
      openingBudgetSpent &&
      timeSeconds !== null &&
      timeSeconds < (context.options.midgameStartSeconds ?? 12)
    ) {
      const action = {
        type: "wait",
        ms: context.options.holdWaitMs ?? 1100,
        meta: {
          reason: "opening-budget",
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
          expansionClicks: this.expansionClicks,
        },
      };
      recordDecision(context, {
        phase: "hold",
        reason: "opening-budget",
        telemetry,
        action,
      });
      return action;
    }

    if (
      openingBudgetSpent &&
      telemetry.interest !== null &&
      telemetry.interest < resumeInterest
    ) {
      const action = {
        type: "wait",
        ms: context.options.holdWaitMs ?? 1100,
        meta: {
          reason: "await-resume-interest",
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
          expansionClicks: this.expansionClicks,
        },
      };
      recordDecision(context, {
        phase: "hold",
        reason: "await-resume-interest",
        telemetry,
        action,
      });
      return action;
    }

    const minAttackTroops = context.options.minAttackTroops ?? 0;
    if (
      openingBudgetSpent &&
      minAttackTroops > 0 &&
      telemetry.ownVisibleTroops !== null &&
      telemetry.ownVisibleTroops < minAttackTroops
    ) {
      const action = {
        type: "wait",
        ms: context.options.holdWaitMs ?? 1100,
        meta: {
          reason: "await-troops",
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
          expansionClicks: this.expansionClicks,
          minAttackTroops,
        },
      };
      recordDecision(context, {
        phase: "hold",
        reason: "await-troops",
        telemetry,
        action,
      });
      return action;
    }

    if (
      openingBudgetSpent &&
      context.options.midgamePercent !== null &&
      context.options.midgamePercent !== undefined &&
      !this.midgamePercentSet
    ) {
      this.midgamePercentSet = true;
      this.currentAttackSlider = context.options.midgamePercent;
      const action = {
        type: "attackPercent",
        value: context.options.midgamePercent,
        meta: {
          reason: "set-midgame-percent",
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
          expansionClicks: this.expansionClicks,
        },
      };
      recordDecision(context, {
        phase: "post-opening",
        reason: "set-midgame-percent",
        telemetry,
        action,
      });
      return action;
    }

    if (
      timeSeconds !== null &&
      timeSeconds >= 5 &&
      telemetry.interest !== null &&
      telemetry.interest < minInterest &&
      this.pauseStreak < maxPauseStreak
    ) {
      this.pauseStreak += 1;
      const action = {
        type: "wait",
        ms: context.options.recoveryWaitMs ?? 900,
        meta: {
          reason: "recover-interest",
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
        },
      };
      recordDecision(context, {
        phase: "hold",
        reason: "recover-interest",
        telemetry,
        action,
      });
      return action;
    }
    this.pauseStreak = 0;

    const decoded = await decodeVisualState(context.harness, {
      cols: context.options.visualCols ?? 80,
      rows: context.options.visualRows ?? 50,
      center: telemetry.ownCenter ?? undefined,
    });
    let territoryProgress = updateTerritoryProgress(this.territoryProgress, decoded, {
      minOwnedCellGrowth: context.options.minOwnedCellGrowth,
    });
    if (!openingBudgetSpent) {
      territoryProgress = resetTerritoryStall(territoryProgress);
    }
    this.territoryProgress = territoryProgress;
    let rememberedFailedTarget = null;
    if (openingBudgetSpent) {
      this.targetMemory = advanceTargetMemory(this.targetMemory);
      if (
        this.lastMidgameTarget &&
        shouldRememberFailedTarget(territoryProgress, {
          minSuccessfulTargetGrowth: context.options.minSuccessfulTargetGrowth,
        })
      ) {
        rememberedFailedTarget = this.lastMidgameTarget;
        this.targetMemory = rememberFailedTarget(this.targetMemory, this.lastMidgameTarget, {
          failedTargetCooldown: context.options.failedTargetCooldown,
          failedTargetDistance: context.options.failedTargetDistance,
          reason: "post-opening-no-growth",
          ownedCellGrowth: territoryProgress.ownedCellGrowth,
        });
      }
      if (Number.isFinite(territoryProgress.ownedCellGrowth)) {
        this.lastMidgameTarget = null;
      }
    } else {
      this.lastMidgameTarget = null;
    }
    const failedTargets = activeFailedTargets(this.targetMemory);
    const attackSliderRecovery = openingBudgetSpent
      ? await recoverAttackSliderAfterProgress(context, this, territoryProgress)
      : null;

    if (
      openingBudgetSpent &&
      shouldBackoffForTerritoryStall(territoryProgress, {
        stallBackoff: context.options.stallBackoff,
        maxStallStreak: context.options.maxStallStreak,
      })
    ) {
      this.territoryProgress = resetTerritoryStall(territoryProgress);
      const action = {
        type: "wait",
        ms: context.options.stallBackoffMs ?? context.options.holdWaitMs ?? 1300,
        meta: {
          reason: "territory-stall-backoff",
          phase: "midgame-region",
          ownedCellCount: decoded.ownedCellCount,
          previousOwnedCellCount: territoryProgress.previousOwnedCellCount,
          ownedCellGrowth: territoryProgress.ownedCellGrowth,
          territoryStallStreak: territoryProgress.stallStreak,
          minOwnedCellGrowth: territoryProgress.minOwnedCellGrowth,
          rememberedFailedTarget,
          failedTargetCount: failedTargets.length,
          avoidedTargetCount: failedTargets.length,
          attackSliderRecovery,
          interest: telemetry.interest,
          rank: telemetry.ownRank,
          troops: telemetry.ownVisibleTroops,
        },
      };
      recordDecision(context, {
        phase: "hold",
        reason: "territory-stall-backoff",
        telemetry,
        decoded,
        action,
      });
      return action;
    }

    const fallback = expansionPattern[this.expansionIndex % expansionPattern.length];
    this.expansionIndex += 1;
    const chooser = openingBudgetSpent ? chooseNeighborRegionTarget : chooseVisualExpansionTarget;
    let target = null;
    let targetChoice = null;
    let targetProbes = [];
    let targetProbePasses = 0;
    let reprobeAttackSlider = null;
    let reprobeReason = null;
    let reason = openingBudgetSpent ? "choose-neighbor-region" : "choose-frontier";

    if (openingBudgetSpent && (context.options.probeTargets || context.options.policy)) {
      const candidates = targetProbeCandidates(decoded, [fallback], {
        phase: "midgame-region",
        recentTargets: this.recentTargets,
        minRecentDistance: context.options.minRecentDistance ?? 0.06,
        maxCandidates: context.options.policy
          ? (context.options.policyCandidateCount ?? context.options.targetProbeCount ?? 5)
          : (context.options.targetProbeCount ?? 3),
        mapLabels: telemetry.mapLabels ?? [],
        ownCenter: telemetry.ownCenter ?? decoded.center,
        ownVisibleTroops: telemetry.ownVisibleTroops,
        maxTargetTroopRatio: context.options.maxTargetTroopRatio,
        maxOpponentTroopRatio: context.options.maxOpponentTroopRatio,
        weakTargetTroopRatio: context.options.weakTargetTroopRatio,
        avoidTargets: failedTargets,
        minAvoidDistance: context.options.failedTargetDistance,
      });

      if (context.options.probeTargets) {
        targetProbes = tagProbePass(await probeTargets(context.harness, candidates, {
          waitMs: context.options.targetProbeMs ?? 120,
          playerName: context.options.playerName,
        }), "initial");
        targetProbePasses = 1;
        targetChoice = context.options.policy
          ? choosePolicyTarget(targetProbes, { telemetry, visual: decoded }, context.options.policy, {
              requireAttackLabel: context.options.requireAttackLabel ?? false,
              maxTargetTroopRatio: context.options.maxTargetTroopRatio,
              maxOpponentTroopRatio: context.options.maxOpponentTroopRatio,
              maxSelectedAttackRatio: context.options.maxSelectedAttackRatio,
            })
          : chooseTargetFromProbes(targetProbes, telemetry, {
              requireAttackLabel: context.options.requireAttackLabel ?? false,
              maxTargetTroopRatio: context.options.maxTargetTroopRatio,
              maxOpponentTroopRatio: context.options.maxOpponentTroopRatio,
              maxSelectedAttackRatio: context.options.maxSelectedAttackRatio,
            });
        if (shouldReprobeLowAttack(targetChoice, context.options)) {
          reprobeAttackSlider = context.options.lowAttackSlider ?? 0.415;
          reprobeReason = "unsafe-selected-attack-ratio";
          await context.harness.setAttackPercent(reprobeAttackSlider);
          await context.harness.wait(context.options.attackPercentWaitMs ?? 120);
          this.currentAttackSlider = reprobeAttackSlider;
          const reprobes = tagProbePass(await probeTargets(context.harness, candidates, {
            waitMs: context.options.targetProbeMs ?? 120,
            playerName: context.options.playerName,
          }), "low-attack-reprobe");
          targetProbes = targetProbes.concat(reprobes);
          targetProbePasses = 2;
          targetChoice = context.options.policy
            ? choosePolicyTarget(targetProbes, { telemetry, visual: decoded }, context.options.policy, {
                requireAttackLabel: context.options.requireAttackLabel ?? false,
                maxTargetTroopRatio: context.options.maxTargetTroopRatio,
                maxOpponentTroopRatio: context.options.maxOpponentTroopRatio,
                maxSelectedAttackRatio: context.options.maxSelectedAttackRatio,
              })
            : chooseTargetFromProbes(targetProbes, telemetry, {
                requireAttackLabel: context.options.requireAttackLabel ?? false,
                maxTargetTroopRatio: context.options.maxTargetTroopRatio,
                maxOpponentTroopRatio: context.options.maxOpponentTroopRatio,
                maxSelectedAttackRatio: context.options.maxSelectedAttackRatio,
              });
        }
      } else {
        targetChoice = choosePolicyTarget(candidates, { telemetry, visual: decoded }, context.options.policy, {
          requireAttackLabel: false,
          maxTargetTroopRatio: context.options.maxTargetTroopRatio,
          maxOpponentTroopRatio: context.options.maxOpponentTroopRatio,
          maxSelectedAttackRatio: context.options.maxSelectedAttackRatio,
          avoidTargets: failedTargets,
          minAvoidDistance: context.options.failedTargetDistance,
        });
      }

      target = targetChoice.target;
      reason = targetChoice.reason;
      if (!target && !context.options.holdUnknownTargets && canUseVisualFallback(targetChoice)) {
        target = chooser(decoded, [fallback], {
          recentTargets: this.recentTargets,
          minRecentDistance: context.options.minRecentDistance ?? 0.06,
          avoidTargets: failedTargets,
          minAvoidDistance: context.options.failedTargetDistance,
        });
        reason = "probe-fallback-visual";
      }
    } else {
      target = chooser(decoded, [fallback], {
        recentTargets: this.recentTargets,
        minRecentDistance: context.options.minRecentDistance ?? 0.06,
        avoidTargets: openingBudgetSpent ? failedTargets : [],
        minAvoidDistance: context.options.failedTargetDistance,
      });
    }

    if (!target) {
      const action = {
        type: "wait",
        ms: context.options.tickMs ?? 1000,
        meta: {
          reason: "no-target",
          phase: openingBudgetSpent ? "midgame-region" : "opening-frontier",
          ownCenter: decoded.center,
          frontierCount: decoded.frontier.length,
          neighborRegionCount: decoded.neighborRegions.length,
          targetProbeCount: targetProbes.length,
          targetProbePasses,
          reprobeAttackSlider,
          reprobeReason,
          attackSliderRecovery,
          previousOwnedCellCount: territoryProgress.previousOwnedCellCount,
          ownedCellGrowth: territoryProgress.ownedCellGrowth,
          territoryStallStreak: territoryProgress.stallStreak,
          rememberedFailedTarget,
          failedTargetCount: failedTargets.length,
          avoidedTargetCount: failedTargets.length,
        },
      };
      recordDecision(context, {
        phase: openingBudgetSpent ? "midgame-region" : "opening-frontier",
        reason: targetChoice?.reason ?? (targetProbes.length ? "no-labeled-target" : "no-target"),
        telemetry,
        decoded,
        options: { maxCandidates: context.options.maxDecisionCandidates ?? 8 },
        targetProbes: targetChoice?.probes ?? targetProbes,
        targetChoice,
        action,
      });
      return action;
    }
    this.recentTargets.push(target);
    if (this.recentTargets.length > 8) this.recentTargets.shift();
    this.expansionClicks += 1;
    const normalAttackSlider = normalAttackSliderForDecision(
      context.options,
      this.currentAttackSlider,
      attackSliderRecovery,
    );
    const attackSliderChoice = openingBudgetSpent && context.options.adaptiveAttackSizing
      ? chooseAttackSliderFromProbe(targetChoice, telemetry, {
          currentAttackSlider: this.currentAttackSlider ?? context.options.midgamePercent ?? context.options.openingPercent,
          lowAttackSlider: context.options.lowAttackSlider,
          normalAttackSlider,
          highAttackSlider: context.options.highAttackSlider,
          maxSelectedAttackPercent: context.options.maxSelectedAttackPercent,
          maxSelectedAttackRatio: context.options.maxSelectedAttackRatio,
          lowInterestAttackThreshold: context.options.lowInterestAttackThreshold,
          highInterestAttackThreshold: context.options.highInterestAttackThreshold,
          smallRegionRatio: context.options.smallRegionRatio,
          weakTargetTroopRatio: context.options.weakTargetTroopRatio,
          ownedCellCount: decoded.ownedCellCount,
        })
      : null;
    if (attackSliderChoice) this.currentAttackSlider = attackSliderChoice.value;
    const action = {
      type: attackSliderChoice ? "attackClick" : "click",
      x: target.x,
      y: target.y,
      attackPercent: attackSliderChoice?.value,
      meta: {
        ownedCellCount: decoded.ownedCellCount,
        ownedColor: decoded.ownedColor,
        ownCenter: decoded.center,
        frontierCount: decoded.frontier.length,
        neighborRegionCount: decoded.neighborRegions.length,
        phase: openingBudgetSpent ? "midgame-region" : "opening-frontier",
        rank: telemetry.ownRank,
        troops: telemetry.ownVisibleTroops,
        interest: telemetry.interest,
        income: telemetry.income,
        targetProbeCount: targetProbes.length,
        targetProbePasses,
        reprobeAttackSlider,
        reprobeReason,
        selectedAttackTroops: targetChoice?.probe?.selectedAttackTroops ?? null,
        selectedAttackPercent: targetChoice?.probe?.selectedAttackPercent ?? null,
        selectedAttackRatio: targetChoice?.probe?.selectedAttackRatio ?? null,
        attackCostSafe: targetChoice?.probe?.attackCostSafe ?? null,
        targetLabelTroops: targetChoice?.probe?.label?.troops ?? null,
        targetLabelTroopRatio: targetChoice?.probe?.labelTroopRatio ?? null,
        targetLabelTroopCap: targetChoice?.probe?.labelTroopCap ?? null,
        targetTroopSafe: targetChoice?.probe?.troopSafe ?? null,
        previousOwnedCellCount: territoryProgress.previousOwnedCellCount,
        ownedCellGrowth: territoryProgress.ownedCellGrowth,
        territoryStallStreak: territoryProgress.stallStreak,
        rememberedFailedTarget,
        failedTargetCount: failedTargets.length,
        avoidedTargetCount: failedTargets.length,
        attackSlider: attackSliderChoice?.value ?? null,
        attackSizeReason: attackSliderChoice?.reason ?? null,
        attackSliderRecovery,
        policyScore: targetChoice?.probe?.policyScore ?? null,
      },
    };
    recordDecision(context, {
      phase: openingBudgetSpent ? "midgame-region" : "opening-frontier",
      reason,
      telemetry,
      decoded,
      options: { maxCandidates: context.options.maxDecisionCandidates ?? 8 },
      targetProbes: targetChoice?.probes ?? targetProbes,
      targetChoice,
      action,
    });
    this.lastMidgameTarget = openingBudgetSpent ? { x: target.x, y: target.y } : null;
    return action;
  }
}

export async function executeAction(context, action) {
  switch (action.type) {
    case "attackClick":
      await context.harness.setAttackPercent(action.attackPercent);
      await context.harness.wait(action.percentWaitMs ?? context.options.attackPercentWaitMs ?? 120);
      await context.harness.clickCanvas(action.x, action.y);
      await context.harness.wait(action.waitMs ?? context.options.tickMs ?? 500);
      return `attackClick ${action.attackPercent} -> ${action.x.toFixed(3)},${action.y.toFixed(3)}${formatMeta(action.meta)}`;
    case "click":
      await context.harness.clickCanvas(action.x, action.y);
      await context.harness.wait(action.waitMs ?? context.options.tickMs ?? 500);
      return `click ${action.x.toFixed(3)},${action.y.toFixed(3)}${formatMeta(action.meta)}`;
    case "drag":
      await context.harness.dragCanvas(action.from, action.to, action.options);
      return `drag ${JSON.stringify(action.from)} -> ${JSON.stringify(action.to)}`;
    case "attackPercent":
      await context.harness.setAttackPercent(action.value);
      await context.harness.wait(action.waitMs ?? context.options.tickMs ?? 500);
      return `attackPercent ${action.value}${formatMeta(action.meta)}`;
    case "log":
      return action.message;
    case "wait":
    default:
      await context.harness.wait(action.ms ?? 1000);
      return `wait ${action.ms ?? 1000}ms${formatMeta(action.meta)}`;
  }
}

function formatMeta(meta) {
  if (!meta) return "";
  const pairs = Object.entries(meta).map(([key, value]) => `${key}=${formatMetaValue(value)}`);
  return ` (${pairs.join(" ")})`;
}

function canUseVisualFallback(targetChoice) {
  const reason = targetChoice?.reason ?? "";
  return !["no-safe-target", "policy-no-safe-target"].includes(reason);
}

function shouldReprobeLowAttack(targetChoice, options = {}) {
  if (options.reprobeLowAttackOnUnsafeCost === false) return false;
  if (targetChoice?.reason !== "no-safe-target" && targetChoice?.reason !== "policy-no-safe-target") return false;
  return (targetChoice?.probes ?? []).some((probe) => probe.attackCostSafe === false);
}

async function recoverAttackSliderAfterProgress(context, strategy, territoryProgress) {
  const options = context.options ?? {};
  if (options.recoverAttackSliderAfterProgress === false) return null;
  if (!Number.isFinite(territoryProgress?.ownedCellGrowth)) return null;
  if (territoryProgress.ownedCellGrowth < (territoryProgress.minOwnedCellGrowth ?? options.minOwnedCellGrowth ?? 1)) {
    return null;
  }

  const current = strategy.currentAttackSlider;
  const normal = normalAttackSliderValue(options);
  if (!Number.isFinite(current) || !Number.isFinite(normal)) return null;
  if (current >= normal - 0.0001) return null;
  if (typeof context.harness?.setAttackPercent !== "function") return null;

  await context.harness.setAttackPercent(normal);
  await context.harness.wait(options.attackPercentWaitMs ?? 120);
  strategy.currentAttackSlider = normal;
  return {
    reason: "post-progress-normalize",
    from: current,
    to: normal,
    ownedCellGrowth: territoryProgress.ownedCellGrowth,
  };
}

function normalAttackSliderValue(options = {}) {
  return options.normalAttackSlider ?? options.midgamePercent ?? 0.455;
}

function normalAttackSliderForDecision(options = {}, currentAttackSlider = null, attackSliderRecovery = null) {
  const normal = normalAttackSliderValue(options);
  if (attackSliderRecovery) return normal;
  if (
    Number.isFinite(currentAttackSlider) &&
    Number.isFinite(normal) &&
    currentAttackSlider < normal - 0.0001
  ) {
    return currentAttackSlider;
  }
  return normal;
}

function tagProbePass(probes, probePass) {
  return probes.map((probe) => ({
    ...probe,
    probePass,
  }));
}

function formatMetaValue(value) {
  if (Array.isArray(value)) return value.join("/");
  if (value && typeof value === "object") {
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) return `${value.x.toFixed(3)}/${value.y.toFixed(3)}`;
    return JSON.stringify(value);
  }
  return value;
}
