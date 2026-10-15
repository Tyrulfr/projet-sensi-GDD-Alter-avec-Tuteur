import numpy as np
import pytest
from govtutor_rl.actions import TutorAction
from govtutor_rl.env import GovernanceTutorEnv
from govtutor_rl.evaluation import benchmark
from govtutor_rl.executor import render_llm, validate_response
from gymnasium.utils.env_checker import check_env
from sb3_contrib import MaskablePPO
from stable_baselines3.common.env_checker import check_env as check_sb3


@pytest.mark.parametrize('simulator', ['standard', 'spacing'])
def test_real_environment_checkers(simulator):
    env = GovernanceTutorEnv(simulator=simulator)
    check_env(env, skip_render_check=True)
    check_sb3(env)


def test_latent_changes_do_not_change_observation_or_masks():
    env = GovernanceTutorEnv()
    obs, _ = env.reset(seed=5)
    mask = env.action_masks().copy()
    env.masteries[:] = 0
    env.misconceptions[:] = True
    np.testing.assert_array_equal(obs, env._obs())
    np.testing.assert_array_equal(mask, env.action_masks())


def test_reward_components_and_test_stream_independence():
    envs = [GovernanceTutorEnv(max_steps=4) for _ in range(2)]
    for env in envs:
        env.reset(seed=15)
    envs[0].step(TutorAction.DIAGNOSE)
    envs[1].step(TutorAction.EXPLAIN_CONCEPT)
    assert envs[0]._sample_test(.5) == envs[1]._sample_test(.5)
    _, reward, _, _, info = envs[0].step(TutorAction.HINT_SMALL)
    assert reward == pytest.approx(sum(info['reward_components'].values()))
    while envs[0].step_count < 4:
        _, reward, _, _, info = envs[0].step(TutorAction.EXPLAIN_CONCEPT)
    assert reward == pytest.approx(sum(info['reward_components'].values()))


def test_prerequisites_and_repetition_change_gain():
    envs = [GovernanceTutorEnv() for _ in range(2)]
    for env in envs:
        env.reset(seed=12, options={'skill_idx': 4})
    envs[0].masteries[envs[0]._prereqs()] = 0
    envs[1].masteries[envs[1]._prereqs()] = 1
    gains = [env.step(TutorAction.EXPLAIN_CONCEPT)[4]['learning_delta_simulated'] for env in envs]
    assert gains[1] > gains[0]
    env = envs[0]
    env.step(TutorAction.EXPLAIN_CONCEPT)
    info = env.step(TutorAction.EXPLAIN_CONCEPT)[4]
    assert info['reward_components']['repetition'] < 0


def test_maskable_ppo_save_reload(tmp_path):
    import torch
    torch.set_num_threads(1)
    env = GovernanceTutorEnv(max_steps=4)
    model = MaskablePPO('MlpPolicy', env, n_steps=16, batch_size=8, seed=7, device='cpu')
    model.learn(32)
    path = tmp_path / 'ppo'
    model.save(path)
    restored = MaskablePPO.load(path, device='cpu')
    obs, _ = env.reset(seed=42)
    for _ in range(4):
        mask = env.action_masks()
        a, _ = model.predict(obs, deterministic=True, action_masks=mask)
        b, _ = restored.predict(obs, deterministic=True, action_masks=mask)
        assert a == b and mask[int(b)]
        obs, _, _, _, _ = env.step(int(b))


def test_bootstrap_is_reproducible(tmp_path):
    a = benchmark(None, episodes=12, output=str(tmp_path / 'a.csv'))
    b = benchmark(None, episodes=12, output=str(tmp_path / 'b.csv'))
    assert a == b
    assert len(a['rules']['ci95']['test_gain']) == 2

@pytest.mark.parametrize('response', ['', None, 'mot ' * 121, 'Question? Autre?'])
def test_invalid_llm_output(response):
    with pytest.raises(ValueError):
        validate_response(response, TutorAction.SOCRATIC_QUESTION)


def test_llm_localhost_prefix_is_not_local(monkeypatch):
    from govtutor_rl.curriculum import SKILLS
    monkeypatch.setenv('GOVTUTOR_LLM_BASE_URL', 'http://localhost.evil.example/v1')
    monkeypatch.setenv('GOVTUTOR_LLM_MODEL', 'dummy')
    with pytest.raises(ValueError):
        render_llm(SKILLS[0], TutorAction.EXPLAIN_CONCEPT, '')


def test_curriculum_can_be_replaced():
    from dataclasses import replace

    from govtutor_rl.curriculum import SKILLS
    curriculum = (replace(SKILLS[0], key='domain_a'), replace(SKILLS[1], key='domain_b', prerequisite=('domain_a',)))
    env = GovernanceTutorEnv(curriculum=curriculum)
    obs, info = env.reset(seed=4, options={'skill_idx': 1})
    assert info['skill'] == 'domain_b'
    assert env.observation_space.contains(obs)
    assert env._prereqs() == [0]


def test_no_single_best_action_across_profiles():
    best = []
    for profile in (0, 1):
        gains = {}
        for action in TutorAction:
            env = GovernanceTutorEnv()
            env.reset(seed=19, options={'profile_idx': profile, 'skill_idx': 4})
            env.masteries[env.skill_idx] = .2
            env.beliefs[env.skill_idx] = .2
            if env.action_masks()[action]:
                gains[action] = env.step(action)[4]['learning_delta_simulated']
        best.append(max(gains, key=gains.get))
    assert best[0] != best[1]


def test_masked_action_is_penalized():
    env = GovernanceTutorEnv()
    env.reset(seed=2, options={'skill_idx': 0})
    _, reward, _, _, info = env.step(TutorAction.REVIEW_PREREQUISITE)
    assert not info['valid_action']
    assert info['learning_delta_simulated'] == 0
    assert reward < 0
