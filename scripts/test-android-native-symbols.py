#!/usr/bin/env python3
"""Testes de integridade com os artefatos reais, após scripts/android-release.sh."""

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("native_symbols", Path(__file__).with_name("check-android-native-symbols.py"))
symbols = importlib.util.module_from_spec(spec)
spec.loader.exec_module(symbols)


class ReleaseSymbolsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        outputs = symbols.APP / "build/outputs"
        cls.aab = outputs / "bundle/release/app-release.aab"
        cls.apk = outputs / "apk/release/app-release.apk"
        cls.sdk = Path(os.environ["ANDROID_HOME"])
        with zipfile.ZipFile(cls.aab) as bundle:
            cls.entries = {n: bundle.read(n) for n in bundle.namelist()
                           if n.startswith(("base/lib/", symbols.DEBUG)) or n.endswith("proguard.map")}

    def assert_invalid(self, entries, message):
        with tempfile.TemporaryDirectory() as tmp:
            altered = Path(tmp) / "altered.aab"
            with zipfile.ZipFile(altered, "w") as bundle:
                for name, data in entries.items():
                    bundle.writestr(name, data)
            with self.assertRaisesRegex(ValueError, message):
                symbols.verify(altered, self.apk, self.sdk)

    def test_real_release(self):
        symbols.verify(self.aab, self.apk, self.sdk)

    def test_missing_debug(self):
        entries = dict(self.entries)
        del entries[symbols.DEBUG + "x86/" + symbols.COUNTER + ".dbg"]
        self.assert_invalid(entries, "Metadados FULL")

    def test_foreign_build_id(self):
        entries = dict(self.entries)
        end = "/" + symbols.COUNTER + ".dbg"
        entries[symbols.DEBUG + "arm64-v8a" + end] = entries[symbols.DEBUG + "x86" + end]
        self.assert_invalid(entries, "Build ID divergente")

    def test_missing_abi(self):
        entries = dict(self.entries)
        del entries["base/lib/armeabi-v7a/" + symbols.COUNTER]
        self.assert_invalid(entries, "Inventário JNI")

    def test_extra_library_without_symbols(self):
        entries = dict(self.entries)
        entries["base/lib/x86/libextra.so"] = entries["base/lib/x86/" + symbols.COUNTER]
        self.assert_invalid(entries, "Inventário JNI")


if __name__ == "__main__":
    unittest.main()
