#!/usr/bin/env python3
"""
Backup Twitch clips from a CSV (first column = clip slug or clip URL).

Example:
  python backup_twitch_clips.py ^
    --csv "H:\\Users\\Admin\\Downloads\\cliplist_shayy__2026-05-03_15-23-35.csv" ^
    --out "H:\\Users\\Admin\\Videos\\shayy_clips_backup"

Requires:
  yt-dlp.exe in PATH
"""

from __future__ import annotations

import argparse
import csv
import shutil
import sys
import time
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable, List
from urllib.parse import urlparse

CHANNEL = "shayy"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backup Twitch clips from a CSV into month folders."
    )
    parser.add_argument("--csv", required=True, help="Path to CSV file.")
    parser.add_argument("--out", required=True, help="Output directory.")
    parser.add_argument(
        "--channel",
        default=CHANNEL,
        help=f"Channel used for clip URLs (default: {CHANNEL}).",
    )
    parser.add_argument(
        "--max-height",
        type=int,
        default=480,
        help="Max video height to reduce file size (default: 480).",
    )
    parser.add_argument(
        "--min-free-gb",
        type=float,
        default=10.0,
        help="Stop if free space drops below this (default: 20 GB).",
    )
    parser.add_argument(
        "--max-total-gb",
        type=float,
        default=0.0,
        help="Optional per-run cap. 0 = unlimited (default).",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Optional pause between batches (default: 0).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="How many URLs per yt-dlp process (default: 1000).",
    )
    parser.add_argument(
        "--quiet-ydl",
        action="store_true",
        help="Reduce yt-dlp logs to only Python batch status lines.",
    )
    parser.add_argument(
        "--recode-webm",
        choices=["off", "light", "strong"],
        default="off",
        help=(
            "Optional ffmpeg re-encode to WebM for smaller files. "
            "'light' keeps better quality, 'strong' saves more space."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print planned URLs without downloading.",
    )
    parser.add_argument(
        "--resume-offset",
        type=int,
        default=0,
        help="Skip the first N pending clips after prefilter (default: 0).",
    )
    parser.add_argument(
        "--state-file",
        default=".clipsave_state.txt",
        help=(
            "Optional progress file name in output dir. Stores consumed pending clips "
            "to support --auto-resume-offset."
        ),
    )
    parser.add_argument(
        "--auto-resume-offset",
        action="store_true",
        help="Use saved consumed-count from state file as additional offset.",
    )
    return parser.parse_args()


def read_clip_urls(csv_path: Path, channel: str) -> List[str]:
    urls: List[str] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if not row:
                continue
            value = row[0].strip()
            if not value:
                continue
            if value.startswith("http://") or value.startswith("https://"):
                urls.append(value)
            else:
                urls.append(f"https://www.twitch.tv/{channel}/clip/{value}")
    return urls


def clip_id_from_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        return ""
    parts = path.split("/")
    if not parts:
        return ""
    return parts[-1]


def read_archive_ids(archive_path: Path) -> set[str]:
    if not archive_path.exists():
        return set()

    ids: set[str] = set()
    with archive_path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            value = line.strip()
            if not value:
                continue
            # yt-dlp archive entries are usually "extractor video_id".
            # We keep the last token as the clip id to match CSV URLs.
            ids.add(value.split()[-1])
    return ids


def filter_already_archived(urls: List[str], archive_path: Path) -> tuple[List[str], int]:
    archived_ids = read_archive_ids(archive_path)
    if not archived_ids:
        return urls, 0

    pending: List[str] = []
    skipped = 0
    for url in urls:
        clip_id = clip_id_from_url(url)
        if clip_id and clip_id in archived_ids:
            skipped += 1
            continue
        pending.append(url)
    return pending, skipped


def read_state_offset(state_path: Path) -> int:
    if not state_path.exists():
        return 0
    try:
        raw = state_path.read_text(encoding="utf-8").strip()
        if not raw:
            return 0
        value = int(raw)
        return max(0, value)
    except (OSError, ValueError):
        return 0


def write_state_offset(state_path: Path, consumed_pending: int) -> None:
    try:
        state_path.write_text(str(max(0, consumed_pending)), encoding="utf-8")
    except OSError:
        pass


def gb(bytes_count: int) -> float:
    return bytes_count / (1024**3)


def free_space_gb(path: Path) -> float:
    usage = shutil.disk_usage(path)
    return gb(usage.free)


def ensure_space(path: Path, min_free_gb: float) -> None:
    free_now = free_space_gb(path)
    if free_now < min_free_gb:
        raise RuntimeError(
            f"Not enough free space to start: {free_now:.2f} GB free, "
            f"required at least {min_free_gb:.2f} GB."
        )


def webm_post_args(mode: str) -> list[str]:
    if mode == "light":
        return [
            "--recode-video", "webm",
            "--postprocessor-args",
            "ffmpeg:-c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -cpu-used 5 -deadline good "
            "-c:a libopus -b:a 64k",
        ]
    if mode == "strong":
        return [
            "--recode-video", "webm",
            "--postprocessor-args",
            "ffmpeg:-c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 -cpu-used 6 -deadline good "
            "-c:a libopus -b:a 48k",
        ]
    return []


def ydl_cmd_args(
    output_dir: Path,
    max_height: int,
    archive_path: Path,
    batch_file: Path,
    quiet_ydl: bool,
    recode_webm: str,
) -> list[str]:
    month_tpl = "%(upload_date>%Y-%m)s"
    out_tmpl = str(output_dir / month_tpl / "%(title).120B [%(id)s].%(ext)s")
    cmd = [
        "yt-dlp",
        "--ignore-errors",
        "--continue",
        "--retries", "15",
        "--fragment-retries", "15",
        "--skip-unavailable-fragments",
        "--concurrent-fragments", "8",
        "--no-part",
        "--format", f"bestvideo[height<={max_height}]+bestaudio/best[height<={max_height}]/best",
        "--format-sort", "vcodec:vp9,vcodec:av1,vcodec:h264,res,fps",
        "--output", out_tmpl,
        "--windows-filenames",
        "--trim-filenames", "180",
        "--download-archive", str(archive_path),
        "--no-overwrites",
        "--batch-file", str(batch_file),
    ]
    if quiet_ydl:
        cmd.extend(["--quiet", "--no-warnings"])
    else:
        cmd.append("--newline")
    cmd.extend(webm_post_args(recode_webm))
    return cmd


def chunks(items: List[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def run_batch(
    batch_urls: List[str],
    output_dir: Path,
    min_free_gb: float,
    max_total_gb: float,
    max_height: int,
    archive_path: Path,
    quiet_ydl: bool,
    recode_webm: str,
) -> int:
    starting_bytes = shutil.disk_usage(output_dir).used
    free_now = free_space_gb(output_dir)
    if free_now < min_free_gb:
        print(
            f"[STOP] Free space low ({free_now:.2f} GB < {min_free_gb:.2f} GB)."
        )
        return 2

    if max_total_gb > 0:
        used_delta = gb(shutil.disk_usage(output_dir).used - starting_bytes)
        if used_delta >= max_total_gb:
            print(
                f"[STOP] Reached per-run cap ({used_delta:.2f} GB >= {max_total_gb:.2f} GB)."
            )
            return 2

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".txt",
        prefix="clips_batch_",
        dir=output_dir,
        delete=False,
    ) as tf:
        for url in batch_urls:
            tf.write(url + "\n")
        batch_file = Path(tf.name)

    try:
        cmd = ydl_cmd_args(
            output_dir=output_dir,
            max_height=max_height,
            archive_path=archive_path,
            batch_file=batch_file,
            quiet_ydl=quiet_ydl,
            recode_webm=recode_webm,
        )
        result = subprocess.run(cmd, check=False)
        return result.returncode
    finally:
        try:
            batch_file.unlink(missing_ok=True)
        except OSError:
            pass


def iter_download(
    urls: List[str],
    output_dir: Path,
    min_free_gb: float,
    max_total_gb: float,
    sleep_seconds: float,
    batch_size: int,
    max_height: int,
    archive_path: Path,
    quiet_ydl: bool,
    recode_webm: str,
    initial_consumed_pending: int,
    state_path: Path,
) -> None:
    failed_batches = 0
    total_batches = (len(urls) + batch_size - 1) // batch_size
    consumed_pending = initial_consumed_pending

    for batch_idx, batch_urls in enumerate(chunks(urls, batch_size), start=1):
        print(f"\n[BATCH {batch_idx}/{total_batches}] {len(batch_urls)} clips")
        code = run_batch(
            batch_urls=batch_urls,
            output_dir=output_dir,
            min_free_gb=min_free_gb,
            max_total_gb=max_total_gb,
            max_height=max_height,
            archive_path=archive_path,
            quiet_ydl=quiet_ydl,
            recode_webm=recode_webm,
        )
        if code == 2:
            break
        if code != 0:
            failed_batches += 1
            print(f"[WARN] Batch {batch_idx} exited with code {code}.")
        else:
            consumed_pending += len(batch_urls)
            write_state_offset(state_path, consumed_pending)

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    print("")
    print("Run complete:")
    print(f"  Failed batches: {failed_batches}")
    print(f"  Free space now: {free_space_gb(output_dir):.2f} GB")


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv).expanduser()
    out_dir = Path(args.out).expanduser()

    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / ".downloaded_clips_archive.txt"

    try:
        ensure_space(out_dir, args.min_free_gb)
    except RuntimeError as exc:
        print(exc)
        return 1

    urls = read_clip_urls(csv_path, args.channel)
    if not urls:
        print("No clip rows found in CSV first column.")
        return 1

    original_count = len(urls)
    urls, skipped_by_archive = filter_already_archived(urls, archive)
    if not urls:
        print(f"All {original_count} CSV clips are already in the archive list.")
        return 0

    state_path = out_dir / args.state_file
    auto_offset = read_state_offset(state_path) if args.auto_resume_offset else 0
    total_requested_offset = args.resume_offset + auto_offset
    if total_requested_offset > 0:
        total_requested_offset = min(total_requested_offset, len(urls))
        urls = urls[total_requested_offset:]

    print(f"Loaded {original_count} clip references from CSV.")
    print(f"Pending after archive prefilter: {len(urls)}")
    print(f"Already archived (prefilter): {skipped_by_archive}")
    if args.resume_offset:
        print(f"Manual resume offset applied: {args.resume_offset}")
    if args.auto_resume_offset:
        print(f"Auto resume offset applied from state file: {auto_offset}")
    if total_requested_offset:
        print(f"Total offset applied: {total_requested_offset}")
    print(f"Output directory: {out_dir}")
    print(f"Archive file: {archive}")
    print(f"State file: {state_path}")
    print(f"Current free space: {free_space_gb(out_dir):.2f} GB")
    if args.recode_webm != "off":
        print(
            f"WebM recode mode: {args.recode_webm} "
            "(slower, but can significantly reduce size)"
        )

    if args.dry_run:
        print("\nDry run: first 20 URLs")
        for i, u in enumerate(urls[:20], start=1):
            print(f"  {i}. {u}")
        return 0

    iter_download(
        urls=urls,
        output_dir=out_dir,
        min_free_gb=args.min_free_gb,
        max_total_gb=args.max_total_gb,
        sleep_seconds=args.sleep_seconds,
        batch_size=args.batch_size,
        max_height=args.max_height,
        archive_path=archive,
        quiet_ydl=args.quiet_ydl,
        recode_webm=args.recode_webm,
        initial_consumed_pending=total_requested_offset,
        state_path=state_path,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
