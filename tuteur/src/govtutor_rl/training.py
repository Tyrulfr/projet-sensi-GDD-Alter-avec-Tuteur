"""Entraînement reproductible, sans appel au LLM."""
from __future__ import annotations

import importlib.metadata
import json
from pathlib import Path

import torch

from .env import GovernanceTutorEnv


def train(output: str = "models/governance_ppo", timesteps: int = 30_000, seed: int = 42, max_steps: int = 14) -> Path:
    if timesteps <= 0:
        raise ValueError("timesteps doit être > 0")
    from sb3_contrib import MaskablePPO

    torch.set_num_threads(1)
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    env = GovernanceTutorEnv(max_steps=max_steps)
    model = MaskablePPO(
        "MlpPolicy", env,
        learning_rate=3e-4,
        n_steps=256,
        batch_size=64,
        gamma=.97,
        verbose=1,
        seed=seed,
        device="cpu",
        policy_kwargs={"net_arch": [64, 64]},
    )
    model.learn(total_timesteps=timesteps, progress_bar=False)
    model.save(str(output_path))
    manifest = {
        "seed": seed,
        "timesteps_requested": timesteps,
        "timesteps_actual": model.num_timesteps,
        "versions": {name: importlib.metadata.version(name) for name in ("gymnasium", "numpy", "torch", "stable-baselines3", "sb3-contrib")},
        "max_steps": max_steps,
        "observation_shape": [11],
        "action_space": 12,
        "curriculum_keys": [skill.key for skill in env.skills],
        "training_environment": "synthetic, uncalibrated",
        "warning": "Aucune validation d'apprentissage humain ; RL formé sur un simulateur heuristique.",
    }
    output_path.with_suffix(".json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    env.close()
    return output_path.with_suffix(".zip")
