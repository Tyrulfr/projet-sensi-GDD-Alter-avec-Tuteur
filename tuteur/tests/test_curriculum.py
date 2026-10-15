from govtutor_rl.curriculum import INDEX, SKILLS


def test_curriculum_is_consistent():
    assert len(SKILLS) >= 10
    assert len(INDEX) == len(SKILLS)
    for skill in SKILLS:
        assert skill.questions
        for prerequisite in skill.prerequisite:
            assert prerequisite in INDEX
            assert prerequisite != skill.key
        for q in skill.questions:
            assert len(q.options) == 3
            assert 0 <= q.correct < len(q.options)
            assert q.explanation
