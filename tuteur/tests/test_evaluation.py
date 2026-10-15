from govtutor_rl.evaluation import benchmark


def test_benchmark_writes_results(tmp_path):
    target = tmp_path / "results.csv"
    results = benchmark(checkpoint=None, episodes=8, seed=11, max_steps=6, output=str(target))
    assert target.exists()
    assert target.with_suffix('.json').exists()
    assert "random" in results and "rules" in results
    assert results["_metadata"]["episodes_per_policy"] == 8
