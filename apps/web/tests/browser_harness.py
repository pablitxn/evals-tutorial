"""Append-only evidence helpers for the sandboxed browser rehearsal."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
from uuid import uuid4


def new_artifact_directory(root: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    base = Path(os.environ.get('TUTORIAL_BROWSER_ARTIFACTS', str(Path(tempfile.gettempdir()) / 'evals-tutorial-browser-evidence'))).expanduser().resolve()
    if base.is_relative_to(root.resolve()):
        raise ValueError('Browser evidence must be outside the repository.')
    directory = base / f'browser-{timestamp}-{uuid4().hex[:8]}'
    directory.mkdir(parents=True, exist_ok=False)
    return directory


def revision(root: Path) -> dict:
    return {
        'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'workingTreeDirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip()),
    }


def write_report(directory: Path, report: dict) -> Path:
    destination = directory / 'browser-ui-mock.json'
    with destination.open('x', encoding='utf-8') as output:
        output.write(json.dumps(report, indent=2) + '\n')
    return destination


def launch_browser(playwright, directory: Path, provenance: dict):
    try:
        # Playwright defaults Chromium's sandbox off; explicitly require it.
        executable = os.environ.get('TUTORIAL_BROWSER_EXECUTABLE', '/usr/bin/chromium')
        return playwright.chromium.launch(executable_path=executable, headless=True, chromium_sandbox=True)
    except Exception as error:
        report = {
            **provenance,
            'mockOnly': True,
            'status': 'unverified',
            'gate': 'sandboxed-browser-rehearsal',
            'sandboxRequired': True,
            'reason': str(error),
            'checks': [],
            'liveProviderCalls': 0,
            'livePhoenixArtifacts': 0,
        }
        destination = write_report(directory, report)
        print(f'Browser gate unverified: sandboxed Chromium could not launch. Evidence: {destination}')
        raise SystemExit(2) from error
