import argparse
import json
import os
import random
from datasets import load_dataset


def select_tasks(
    n: int = 20, seed: int = 42, output: str = "results/selected_tasks.json"
):
    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    ds = load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
    rng = random.Random(seed)
    indices = list(range(len(ds)))
    rng.shuffle(indices)
    selected = [ds[i] for i in indices[:n]]

    tasks = []
    for item in selected:
        tasks.append(
            {
                "task_id": item["instance_id"],
                "repo": item["repo"],
                "base_commit": item["base_commit"],
                "problem_statement": item["problem_statement"],
                "hints_text": item.get("hints_text", ""),
                "created_at": item.get("created_at", ""),
                "version": item.get("version", ""),
            }
        )

    with open(output, "w") as f:
        json.dump(tasks, f, indent=2)

    print(f"Selected {len(tasks)} tasks, written to {output}")
    for t in tasks:
        print(t["task_id"])
    return tasks


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=20, help="Number of tasks to select")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument(
        "--output", default="results/selected_tasks.json", help="Output path"
    )
    args = parser.parse_args()
    select_tasks(n=args.n, seed=args.seed, output=args.output)
