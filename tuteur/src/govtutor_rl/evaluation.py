"""Comparaisons inter-politiques sur les mêmes scénarios initiaux."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from .curriculum import SKILLS
from .env import PROFILES, GovernanceTutorEnv
from .policies import Policy, RandomPolicy, RLPolicy, RuleBasedPolicy


def rollout(policy: Policy, seed: int, skill_idx: int, profile_idx: int, max_steps: int, simulator: str = "standard") -> dict:
    env = GovernanceTutorEnv(max_steps=max_steps, simulator=simulator)
    obs, _ = env.reset(seed=seed, options={"skill_idx": skill_idx, "profile_idx": profile_idx})
    rng = np.random.default_rng(seed + 9999)
    total = 0.0
    while True:
        mask = env.action_masks()
        action = policy.act(obs, mask, rng)
        if not mask[action]:
            raise AssertionError(f"Politique a choisi une action invalide: {action}")
        obs, reward, terminated, truncated, info = env.step(action)
        total += reward
        if terminated or truncated:
            env.close()
            return {
                "seed": seed, "simulator": simulator,
                "skill": SKILLS[skill_idx].key,
                "profile": PROFILES[profile_idx].name,
                "reward": round(total, 5),
                "test_gain": round(info["test_gain"], 5),
                "delayed_gain": round(info["delayed_gain"], 5),
                "mastery_gain_simulated": round(info["simulated_mastery_gain"], 5),
                "hints": info["hints"],
            }


def benchmark(checkpoint: str | None, episodes: int = 120, seed: int = 1000,
              max_steps: int = 14, output: str = "results/benchmark.csv", simulator: str = "standard") -> dict:
    if episodes < 1:
        raise ValueError("episodes doit être positif")
    policies: dict[str, Policy] = {"random": RandomPolicy(), "rules": RuleBasedPolicy()}
    if checkpoint:
        policies["rl"] = RLPolicy(checkpoint)
    rows = []
    for i in range(episodes):
        skill_idx = i % len(SKILLS)
        profile_idx = (i // len(SKILLS)) % len(PROFILES)
        for name, policy in policies.items():
            record = rollout(policy, seed + i, skill_idx, profile_idx, max_steps, simulator)
            rows.append({"policy": name, **record})
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    metrics = ("reward", "test_gain", "delayed_gain", "mastery_gain_simulated", "hints")
    summary = {
        name: {metric: round(float(np.mean([row[metric] for row in rows if row["policy"] == name])), 4)
               for metric in metrics}
        for name in policies
    }
    # Deterministic bootstrap, plus paired differences on identical scenarios.
    bootstrap_rng = np.random.default_rng(seed + 123456)
    def interval(values):
        values = np.asarray(values, dtype=float)
        draws = bootstrap_rng.choice(values, size=(2000, len(values)), replace=True).mean(axis=1)
        return [round(float(x), 4) for x in np.quantile(draws, [.025, .975])]
    for name in policies:
        summary[name]["ci95"] = {metric: interval([r[metric] for r in rows if r["policy"] == name])
                                 for metric in ("test_gain", "delayed_gain")}
    if checkpoint:
        summary["_paired_rl_differences"] = {}
        for baseline in ("random", "rules"):
            summary["_paired_rl_differences"][baseline] = {}
            for metric in ("test_gain", "delayed_gain"):
                rl = [r[metric] for r in rows if r["policy"] == "rl"]
                other = [r[metric] for r in rows if r["policy"] == baseline]
                differences = np.asarray(rl) - np.asarray(other)
                summary["_paired_rl_differences"][baseline][metric] = {
                    "mean": round(float(differences.mean()), 4), "ci95": interval(differences)}
    summary["_metadata"] = {"episodes_per_policy": episodes, "seed": seed, "simulator": simulator,
                            "warning": "Résultats d'élèves simulés ; aucune preuve d'efficacité avec des humains."}
    output_path.with_suffix(".json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary
