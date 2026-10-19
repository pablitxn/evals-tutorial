"""Regression checks for append-only evidence and required browser sandboxing."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from browser_harness import launch_browser, new_artifact_directory, write_report


class BrowserHarnessTests(unittest.TestCase):
    def test_each_rehearsal_uses_new_directory_and_report_is_exclusive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'repository'
            historical = root / '.local/browser-evidence/20261014-browser-ui-mock.json'
            historical.parent.mkdir(parents=True)
            historical.write_text('published history')
            with patch.dict('os.environ', {'TUTORIAL_BROWSER_ARTIFACTS': str(Path(temporary) / 'evidence')}):
                first, second = new_artifact_directory(root), new_artifact_directory(root)
            self.assertNotEqual(first, second)
            self.assertFalse(first.is_relative_to(root))
            write_report(first, {'status': 'passed'})
            with self.assertRaises(FileExistsError):
                write_report(first, {'status': 'replacement'})
            self.assertEqual(historical.read_text(), 'published history')

    def test_evidence_destination_inside_repository_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.dict('os.environ', {'TUTORIAL_BROWSER_ARTIFACTS': str(root / '.local/evidence')}):
                with self.assertRaises(ValueError):
                    new_artifact_directory(root)

    def test_launch_explicitly_requires_sandbox(self):
        calls = []
        chromium = SimpleNamespace(launch=lambda **kwargs: calls.append(kwargs) or 'browser')
        with tempfile.TemporaryDirectory() as temporary, patch.dict('os.environ', {}, clear=True):
            self.assertEqual(launch_browser(SimpleNamespace(chromium=chromium), Path(temporary), {}), 'browser')
        self.assertEqual(calls, [{'executable_path': '/usr/bin/chromium', 'headless': True, 'chromium_sandbox': True}])

    def test_explicit_browser_executable_keeps_sandbox_required(self):
        calls = []
        chromium = SimpleNamespace(launch=lambda **kwargs: calls.append(kwargs) or 'browser')
        with tempfile.TemporaryDirectory() as temporary, patch.dict('os.environ', {'TUTORIAL_BROWSER_EXECUTABLE': '/synthetic/Chromium'}):
            self.assertEqual(launch_browser(SimpleNamespace(chromium=chromium), Path(temporary), {}), 'browser')
        self.assertEqual(calls, [{'executable_path': '/synthetic/Chromium', 'headless': True, 'chromium_sandbox': True}])

    def test_launch_failure_records_unverified_gate_and_never_retries_insecurely(self):
        calls = []
        def fail(**kwargs):
            calls.append(kwargs)
            raise RuntimeError('Synthetic sandbox unavailable')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(SystemExit) as result:
                launch_browser(SimpleNamespace(chromium=SimpleNamespace(launch=fail)), root, {'base': 'test'})
            self.assertEqual(result.exception.code, 2)
            report = json.loads((root / 'browser-ui-mock.json').read_text())
            self.assertEqual(report['status'], 'unverified')
            self.assertEqual(report['checks'], [])
            self.assertTrue(report['sandboxRequired'])
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
