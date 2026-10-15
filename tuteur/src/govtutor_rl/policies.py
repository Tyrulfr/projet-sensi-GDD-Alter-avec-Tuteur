"""Politiques de référence et adaptateur MaskablePPO."""
from __future__ import annotations

from typing import Protocol

import numpy as np

from .actions import TutorAction


class Policy(Protocol):
    def act(self, observation: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> int: ...


class RandomPolicy:
    def act(self, observation: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> int:
        return int(rng.choice(np.flatnonzero(mask)))


class RuleBasedPolicy:
    """Heuristique non optimale pour comparaison : n'a aucun accès aux états latents."""

    def act(self, observation: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> int:
        mastery, uncertainty, prereq, accuracy, _fatigue, hints, errors, progress, _, _, diagnosed = observation
        if not diagnosed and (errors > 0 or uncertainty > .6):
            preferred = TutorAction.DIAGNOSE
        elif prereq < .40 and mastery < .55:
            preferred = TutorAction.REVIEW_PREREQUISITE
        elif mastery < .35:
            preferred = TutorAction.EXPLAIN_CONCEPT if hints > .15 else TutorAction.WORKED_EXAMPLE
        elif mastery < .58:
            preferred = TutorAction.HINT_SMALL if accuracy < .5 else TutorAction.PRACTICE_SAME
        elif mastery >= .70 and progress > .70:
            preferred = TutorAction.SUMMARIZE
        elif mastery >= .68:
            preferred = TutorAction.PRACTICE_HARDER
        else:
            preferred = TutorAction.RETRIEVAL_QUIZ
        if mask[preferred]:
            return int(preferred)
        return int(np.flatnonzero(mask)[0])


class RLPolicy:
    def __init__(self, checkpoint: str):
        from sb3_contrib import MaskablePPO
        self.model = MaskablePPO.load(checkpoint, device="cpu")

    def act(self, observation: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> int:
        action, _ = self.model.predict(observation, deterministic=True, action_masks=mask)
        return int(action)
