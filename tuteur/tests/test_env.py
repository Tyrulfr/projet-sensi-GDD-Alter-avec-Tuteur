import numpy as np
import pytest
from govtutor_rl.actions import TutorAction
from govtutor_rl.env import GovernanceTutorEnv
from govtutor_rl.policies import RandomPolicy, RuleBasedPolicy


def test_observation_and_mask():
    env = GovernanceTutorEnv(max_steps=6)
    observation, info = env.reset(seed=17, options={"skill_idx": 0, "profile_idx": 0})
    assert env.observation_space.contains(observation)
    assert info["skill"] == "strategy"
    mask = env.action_masks()
    assert mask.shape == (12,)
    assert not mask[TutorAction.SUMMARIZE]
    assert not mask[TutorAction.REVIEW_PREREQUISITE]
    assert np.any(mask)


@pytest.mark.parametrize("policy", [RandomPolicy(), RuleBasedPolicy()])
def test_episode_finishes_and_metrics(policy):
    env = GovernanceTutorEnv(max_steps=8)
    obs, _ = env.reset(seed=42, options={"skill_idx": 4, "profile_idx": 1})
    rng = np.random.default_rng(123)
    for step in range(8):
        action = policy.act(obs, env.action_masks(), rng)
        assert env.action_masks()[action]
        obs, reward, terminated, truncated, info = env.step(action)
        assert np.isfinite(reward)
        assert env.observation_space.contains(obs)
        assert not terminated
        assert truncated == (step == 7)
    assert -1 <= info["test_gain"] <= 1
    assert -1 <= info["delayed_gain"] <= 1
    assert info["simulated_mastery_gain"] >= 0
    with pytest.raises(RuntimeError):
        env.step(0)


def test_reproducible_rollout():
    data = []
    for _ in range(2):
        env = GovernanceTutorEnv(max_steps=5)
        obs, _ = env.reset(seed=101, options={"skill_idx": 3, "profile_idx": 2})
        outputs = []
        for _ in range(5):
            obs, reward, _, _, _info = env.step(int(TutorAction.EXPLAIN_CONCEPT))
            outputs.append((reward, obs.copy()))
        data.append(outputs)
    for (r0, o0), (r1, o1) in zip(*data):
        assert r0 == r1
        np.testing.assert_array_equal(o0, o1)


def test_belief_does_not_reveal_latent_mastery():
    env = GovernanceTutorEnv()
    obs, _ = env.reset(seed=12)
    assert obs[0] == pytest.approx(env.beliefs[env.skill_idx])
    # Un estimateur bruité : pour cette graine, il diffère du vrai niveau latent.
    assert abs(float(obs[0]) - float(env.masteries[env.skill_idx])) > 0.0001
