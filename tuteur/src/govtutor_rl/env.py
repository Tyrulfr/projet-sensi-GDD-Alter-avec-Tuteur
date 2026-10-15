"""POMDP synthétique de tutorat, séparé du modèle de langage.

Les coefficients ont été construits pour une démonstration logicielle et non
calibrés empiriquement. Ne jamais confondre la récompense avec un gain réel.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .actions import TutorAction
from .curriculum import SKILLS


@dataclass(frozen=True)
class StudentProfile:
    name: str
    speed: float
    explanation_affinity: float
    practice_affinity: float
    retention: float
    misconception_rate: float


PROFILES = (
    StudentProfile("débutant analytique", .8, 1.25, .80, .78, .75),
    StudentProfile("pragmatique", 1.05, .78, 1.30, .80, .35),
    StudentProfile("avancé", 1.20, .85, 1.20, .92, .15),
    StudentProfile("connaissances fragiles", .95, 1.12, 1.02, .50, .55),
    StudentProfile("progression lente", .65, 1.30, .88, .85, .65),
    StudentProfile("équilibré", 1.0, 1.0, 1.0, .80, .4),
)


class GovernanceTutorEnv(gym.Env):
    """Une session travaille une compétence cible, avec prérequis cachés.

    L'observation ne contient pas les maîtrises latentes ni le profil.
    Le score en fin d'épisode repose sur un post-test synthétique indépendant.
    """

    metadata: ClassVar[dict] = {"render_modes": []}

    def __init__(self, max_steps: int = 14, simulator: str = "standard", curriculum=SKILLS):
        super().__init__()
        if max_steps < 3:
            raise ValueError("max_steps doit être >= 3")
        if simulator not in ("standard", "spacing"):
            raise ValueError("simulateur inconnu")
        self.skills = tuple(curriculum)
        self.skill_index = {skill.key: idx for idx, skill in enumerate(self.skills)}
        if len(self.skills) < 2 or len(self.skill_index) != len(self.skills):
            raise ValueError("Le curriculum nécessite au moins deux compétences distinctes")
        if any(key not in self.skill_index for skill in self.skills for key in skill.prerequisite):
            raise ValueError("Prérequis absent du curriculum")
        self.simulator = simulator
        self.max_steps = max_steps
        self.action_space = spaces.Discrete(len(TutorAction))
        # [belief, uncertainty, prerequisite_belief, accuracy, fatigue,
        #  hints/steps, errors/steps, time, last_action, skill_id, diagnosed]
        self.observation_space = spaces.Box(0.0, 1.0, shape=(11,), dtype=np.float32)
        self.reset()

    def _sample_test(self, mastery: float, n: int = 16) -> float:
        p = np.clip(.08 + .84 * mastery, .02, .98)
        return float(self.test_rng.binomial(n, p) / n)

    def _prereqs(self) -> list[int]:
        return [self.skill_index[k] for k in self.skills[self.skill_idx].prerequisite]

    def _obs(self) -> np.ndarray:
        prereqs = self._prereqs()
        prereq_belief = float(np.mean(self.beliefs[prereqs])) if prereqs else 1.0
        values = [
            self.beliefs[self.skill_idx],
            self.uncertainty,
            prereq_belief,
            self.recent_accuracy,
            self.fatigue,
            self.hints / self.max_steps,
            self.errors / self.max_steps,
            self.step_count / self.max_steps,
            self.last_action / (len(TutorAction) - 1) if self.last_action >= 0 else 0,
            self.skill_idx / (len(self.skills) - 1),
            float(self.diagnosed),
        ]
        return np.clip(np.asarray(values, dtype=np.float32), 0, 1)

    def action_masks(self) -> np.ndarray:
        mask = np.ones(len(TutorAction), dtype=bool)
        if self.step_count < 3:
            mask[TutorAction.SUMMARIZE] = False
        if self.beliefs[self.skill_idx] < .60 or self.fatigue > .83:
            mask[TutorAction.PRACTICE_HARDER] = False
        if not self._prereqs():
            mask[TutorAction.REVIEW_PREREQUISITE] = False
        if self.step_count == 0:
            mask[TutorAction.RETRIEVAL_QUIZ] = False
        return mask

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        options = options or {}
        self.skill_idx = int(options.get("skill_idx", self.np_random.integers(len(self.skills))))
        self.profile_idx = int(options.get("profile_idx", self.np_random.integers(len(PROFILES))))
        if not 0 <= self.skill_idx < len(self.skills):
            raise ValueError("skill_idx invalide")
        if not 0 <= self.profile_idx < len(PROFILES):
            raise ValueError("profile_idx invalide")
        self.profile = PROFILES[self.profile_idx]
        self.masteries = self.np_random.uniform(.20, .70, len(self.skills))
        self.masteries[self.skill_idx] = self.np_random.uniform(.12, .72)
        # Separate streams: interventions cannot change evaluation sampling noise.
        stream_seed = int(self.np_random.integers(0, 2**32))
        self.test_rng = np.random.default_rng(stream_seed)
        self.observation_rng = np.random.default_rng(stream_seed + 1)
        # Initial beliefs come from diagnostic responses, never from latent values.
        probabilities = .08 + .84 * self.masteries
        self.beliefs = (self.observation_rng.binomial(8, probabilities) + 1) / 10
        self.misconceptions = self.np_random.random(len(self.skills)) < self.profile.misconception_rate
        self.last_seen = np.full(len(TutorAction), -1, dtype=int)
        self.uncertainty = .70
        self.recent_accuracy = .5
        self.fatigue = float(self.np_random.uniform(0, .16))
        self.hints = 0
        self.errors = 0
        self.step_count = 0
        self.diagnosed = False
        self.last_action = -1
        self.engagement = .8
        self.fragility = 1.0 - self.profile.retention
        self.pretest = self._sample_test(self.masteries[self.skill_idx])
        self.initial_mastery = float(self.masteries[self.skill_idx])
        self.history: list[int] = []
        return self._obs(), {"skill": self.skills[self.skill_idx].key, "pretest": self.pretest}

    def step(self, action: int):
        action = int(action)
        if not self.action_space.contains(action):
            raise ValueError("Action en dehors de l'espace")
        if self.step_count >= self.max_steps:
            raise RuntimeError("Épisode terminé ; appeler reset()")

        valid = bool(self.action_masks()[action])
        chosen = TutorAction(action)
        old = float(self.masteries[self.skill_idx])
        prereqs = self._prereqs()
        prereq_mastery = float(np.mean(self.masteries[prereqs])) if prereqs else 1.0
        is_beginner = old < .40
        is_advanced = old > .65
        base = {
            TutorAction.DIAGNOSE: .010,
            TutorAction.SOCRATIC_QUESTION: .045,
            TutorAction.HINT_SMALL: .053,
            TutorAction.HINT_STRONG: .062,
            TutorAction.EXPLAIN_CONCEPT: .060,
            TutorAction.WORKED_EXAMPLE: .063,
            TutorAction.PRACTICE_SAME: .061,
            TutorAction.PRACTICE_EASIER: .055,
            TutorAction.PRACTICE_HARDER: .078,
            TutorAction.REVIEW_PREREQUISITE: .032,
            TutorAction.RETRIEVAL_QUIZ: .049,
            TutorAction.SUMMARIZE: .035,
        }[chosen]
        profile = self.profile
        factor = 1.0
        if chosen in (TutorAction.EXPLAIN_CONCEPT, TutorAction.WORKED_EXAMPLE):
            factor *= profile.explanation_affinity * (1.32 if is_beginner else .82)
        if chosen in (TutorAction.PRACTICE_SAME, TutorAction.PRACTICE_EASIER, TutorAction.PRACTICE_HARDER, TutorAction.RETRIEVAL_QUIZ):
            factor *= profile.practice_affinity
        if chosen == TutorAction.PRACTICE_HARDER:
            factor *= 1.28 if is_advanced else .36
        if chosen == TutorAction.PRACTICE_EASIER:
            factor *= 1.35 if is_beginner else .62
        if chosen == TutorAction.REVIEW_PREREQUISITE:
            factor *= 1.45 if prereq_mastery < .5 else .4
        if chosen == TutorAction.DIAGNOSE:
            factor *= 1.4 if (self.errors > 0 or not self.diagnosed) else .2
        if chosen == TutorAction.SOCRATIC_QUESTION:
            factor *= 1.35 if (.35 <= old <= .75) else .68
        if chosen == TutorAction.HINT_SMALL:
            factor *= 1.24 if .3 <= old <= .7 else .72
        if chosen == TutorAction.HINT_STRONG:
            factor *= 1.26 if is_beginner else .56
        if chosen == TutorAction.RETRIEVAL_QUIZ:
            factor *= 1.30 if old >= .50 else .70
        if chosen == TutorAction.SUMMARIZE:
            factor *= 1.25 if self.step_count >= self.max_steps - 4 else .65
        if self.diagnosed and chosen in (TutorAction.HINT_SMALL, TutorAction.EXPLAIN_CONCEPT, TutorAction.WORKED_EXAMPLE):
            factor *= 1.20
        # Missing prerequisites and unresolved misconceptions obstruct transfer.
        if chosen != TutorAction.REVIEW_PREREQUISITE:
            factor *= .35 + .65 * prereq_mastery
        if self.misconceptions[self.skill_idx]:
            factor *= .65
        repetition = self.history.count(action) >= 2
        if repetition:
            factor *= .55
        # OOD engine: spacing changes transitions, and forgetting can reverse gains.
        if self.simulator == "spacing":
            gap = self.step_count - self.last_seen[action]
            factor *= .45 if gap <= 1 else 1.15
        factor *= (1.0 - .48 * self.fatigue)
        factor *= profile.speed
        if not valid:
            factor = 0.0
        stochastic = float(self.np_random.uniform(.72, 1.28))
        gain = (1 - old) * base * factor * stochastic
        forgetting = (.008 * self.fragility * old) if self.simulator == "spacing" else 0.0
        gain -= forgetting
        self.masteries[self.skill_idx] = float(np.clip(old + gain, 0, .995))
        prerequisite_gain = 0.0
        diagnostic_quality = 0.0
        consolidation = 0.0
        if chosen == TutorAction.REVIEW_PREREQUISITE and prereqs and valid:
            for idx in prereqs:
                delta = .030 * profile.speed * (1 - self.masteries[idx])
                self.masteries[idx] = min(.995, self.masteries[idx] + delta)
                prerequisite_gain += delta / len(prereqs)
                # Tutor observes a prerequisite probe, not the resulting mastery.
                response = self.observation_rng.random() < (.12 + .76 * self.masteries[idx])
                self.beliefs[idx] = .78 * self.beliefs[idx] + .22 * float(response)
        if chosen == TutorAction.DIAGNOSE and valid:
            diagnostic_quality = float(self.misconceptions[self.skill_idx] and not self.diagnosed)
            self.diagnosed = True
        if chosen in (TutorAction.HINT_SMALL, TutorAction.HINT_STRONG) and valid:
            self.hints += 1
        self.fatigue = min(1.0, self.fatigue + (.055 if chosen == TutorAction.PRACTICE_HARDER else .028))
        if chosen in (TutorAction.RETRIEVAL_QUIZ, TutorAction.SUMMARIZE) and valid:
            consolidation = self.fragility * .14
            self.fragility *= .86
        if chosen == TutorAction.HINT_STRONG:
            self.fragility = min(1.0, self.fragility + .035)
        if valid and self.diagnosed and chosen in (TutorAction.EXPLAIN_CONCEPT, TutorAction.WORKED_EXAMPLE):
            self.misconceptions[self.skill_idx] = False
        self.last_seen[action] = self.step_count
        self.step_count += 1
        self.last_action = action
        self.history.append(action)

        # Diagnostic / évaluation bruités : le belief tracker ne lit jamais la mastery.
        is_assessment = chosen in (
            TutorAction.DIAGNOSE, TutorAction.PRACTICE_SAME,
            TutorAction.PRACTICE_EASIER, TutorAction.PRACTICE_HARDER,
            TutorAction.RETRIEVAL_QUIZ,
        )
        if is_assessment and valid:
            probability = float(np.clip(.12 + .76 * self.masteries[self.skill_idx], .05, .95))
            correct = bool(self.observation_rng.random() < probability)
            self.errors += int(not correct)
            self.recent_accuracy = .7 * self.recent_accuracy + .3 * float(correct)
            self.beliefs[self.skill_idx] = float(np.clip(
                .78 * self.beliefs[self.skill_idx] + .22 * float(correct), 0, 1
            ))
            self.uncertainty = max(.12, self.uncertainty * .88)
        else:
            correct = None
            self.uncertainty = min(.95, self.uncertainty + .01)

        # Récompense simulée : seulement pour apprendre à utiliser le programme.
        components = {
            "mastery": 3.0 * gain,
            "prerequisites": 1.5 * prerequisite_gain,
            "diagnosis": .025 * diagnostic_quality,
            "consolidation": .2 * consolidation,
            "cost": -.012,
            "excess_help": -.02 * (chosen == TutorAction.HINT_STRONG) - .01 * (self.hints > 3),
            "repetition": -.015 * repetition,
        }
        reward = sum(components.values())
        if chosen == TutorAction.PRACTICE_HARDER and not is_advanced:
            components["mismatch"] = -.012
            reward -= .012
        if not valid:
            components["invalid"] = -.2
            reward -= .2
        terminated = False
        truncated = self.step_count >= self.max_steps
        info = {
            "skill": self.skills[self.skill_idx].key,
            "action": chosen.name,
            "valid_action": valid,
            "correct": correct,
            "learning_delta_simulated": gain,
            "reward_components": components,
        }
        if truncated:
            posttest = self._sample_test(float(self.masteries[self.skill_idx]))
            retention_mastery = float(np.clip(self.masteries[self.skill_idx] - .20 * self.fragility, 0, 1))
            delayed_test = self._sample_test(retention_mastery)
            components["terminal_tests"] = 1.5 * (posttest - self.pretest) + .5 * (delayed_test - self.pretest)
            reward += components["terminal_tests"]
            info.update({
                "pretest": self.pretest,
                "posttest": posttest,
                "delayed_test": delayed_test,
                "test_gain": posttest - self.pretest,
                "delayed_gain": delayed_test - self.pretest,
                "simulated_mastery_gain": float(self.masteries[self.skill_idx] - self.initial_mastery),
                "profile": self.profile.name,
                "hints": self.hints,
            })
        return self._obs(), float(reward), terminated, truncated, info
