import argparse
import json
import os
import csv
from collections import defaultdict
from swebench.harness import get_eval_report


def load_results(results_dir: str):
    results = []
    for fname in os.listdir(results_dir):
        if fname.endswith(".json") and fname != "selected_tasks.json":
            with open(os.path.join(results_dir, fname)) as f:
                results.append(json.load(f))
    return results


def compute_pass_at_k(results, k):
    by_task = defaultdict(list)
    for r in results:
        by_task[r["task_id"]].append(r)

    task_scores = {}
    for task_id, trials in by_task.items():
        successes = sum(
            1 for t in trials if t.get("status") == "completed" and t.get("diff")
        )
        task_scores[task_id] = 1.0 if successes >= 1 else 0.0

    if not task_scores:
        return 0.0, {}
    overall = sum(task_scores.values()) / len(task_scores)
    return overall, task_scores


def aggregate(results_dir: str, output_dir: str):
    results = load_results(results_dir)

    by_framework = defaultdict(list)
    for r in results:
        by_framework[r["framework"]].append(r)

    summary_rows = []
    for framework, fw_results in by_framework.items():
        pass1, scores1 = compute_pass_at_k(fw_results, 1)
        pass3, scores3 = compute_pass_at_k(fw_results, 3)

        wall_times = [
            r.get("wall_clock_seconds", 0) or 0
            for r in fw_results
            if r.get("wall_clock_seconds")
        ]
        mean_time = sum(wall_times) / len(wall_times) if wall_times else 0
        total_time = sum(wall_times)
        n_tasks = len(set(r["task_id"] for r in fw_results))
        n_trials = len(fw_results)
        n_success = sum(
            1 for r in fw_results if r.get("status") == "completed" and r.get("diff")
        )
        n_timeout = sum(1 for r in fw_results if r.get("status") == "timeout")
        n_error = sum(1 for r in fw_results if r.get("status") in ("error", "no_diff"))

        summary_rows.append(
            {
                "framework": framework,
                "pass_at_1": round(pass1, 3),
                "pass_at_3": round(pass3, 3),
                "n_tasks": n_tasks,
                "n_trials": n_trials,
                "n_success": n_success,
                "n_timeout": n_timeout,
                "n_error": n_error,
                "mean_wall_clock_s": round(mean_time, 1),
                "total_wall_clock_s": round(total_time, 1),
            }
        )

    os.makedirs(output_dir, exist_ok=True)

    csv_path = os.path.join(output_dir, "summary.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=summary_rows[0].keys())
        writer.writeheader()
        writer.writerows(summary_rows)

    md_path = os.path.join(output_dir, "summary.md")
    with open(md_path, "w") as f:
        f.write("# SWE-bench Lite Benchmark Results\n\n")
        f.write(
            f"| Framework | pass@1 | pass@3 | Tasks | Trials | Success | Timeout | Error | Mean Time (s) |\n"
        )
        f.write(
            f"|-----------|--------|--------|-------|--------|---------|---------|-------|---------------|\n"
        )
        for row in summary_rows:
            f.write(
                f"| {row['framework']} | {row['pass_at_1']} | {row['pass_at_3']} "
                f"| {row['n_tasks']} | {row['n_trials']} | {row['n_success']} "
                f"| {row['n_timeout']} | {row['n_error']} | {row['mean_wall_clock_s']} |\n"
            )

    print(f"Summary written to {csv_path} and {md_path}")
    return summary_rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", default="results")
    parser.add_argument("--output-dir", default="results")
    args = parser.parse_args()
    aggregate(args.results_dir, args.output_dir)
