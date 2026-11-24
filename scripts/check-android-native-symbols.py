#!/usr/bin/env python3
"""Confere os ELFs e os símbolos completos do telefone dentro do AAB e APK finais."""

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
APP = PROJECT / "android/app"
COUNTER = "libdatastore_shared_counter.so"
ABIS = ("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
DEBUG = "BUNDLE-METADATA/com.android.tools.build.debugsymbols/"
JNI = "Java_androidx_datastore_core_NativeSharedCounter_native"
METHODS = ("TruncateFile", "CreateSharedCounter", "GetCounterValue", "IncrementAndGetCounterValue")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    require(result.returncode == 0, f"{Path(args[0]).name}: {result.stderr.strip()}")
    return result.stdout


def llvm_tools(sdk):
    version = re.search(r'ndkVersion\s+"([^"]+)"', (APP / "build.gradle").read_text())
    require(version, "ndkVersion ausente no módulo app")
    folders = list((sdk / "ndk" / version[1] / "toolchains/llvm/prebuilt").glob("*/bin/llvm-readelf"))
    require(len(folders) == 1, f"Toolchain LLVM do NDK {version[1]} indisponível em {sdk}")
    return folders[0].parent


def build_id(tools, elf):
    match = re.search(r"Build ID: ([a-fA-F0-9]+)", run(tools / "llvm-readelf", "-n", elf))
    require(match, f"ELF sem GNU Build ID: {elf.name}")
    return match[1]


def verify(aab_path, apk_path, sdk):
    source = APP / "src/main/cpp/datastore"
    for row in (source / "SHA256SUMS").read_text().splitlines():
        expected_hash, relative = row.split(maxsplit=1)
        require(hashlib.sha256((source / relative).read_bytes()).hexdigest() == expected_hash,
                f"Fonte AndroidX divergente: {relative}")
    tools = llvm_tools(sdk)
    expected = {f"{abi}/{COUNTER}" for abi in ABIS}
    with zipfile.ZipFile(aab_path) as bundle, zipfile.ZipFile(apk_path) as apk, tempfile.TemporaryDirectory() as tmp:
        native = {n for n in bundle.namelist() if re.fullmatch(r"[^/]+/lib/[^/]+/[^/]+\.so", n)}
        require(native == {"base/lib/" + n for n in expected}, f"Inventário JNI do AAB divergente: {sorted(native)}")
        apk_libs = {n[4:] for n in apk.namelist() if n.startswith("lib/") and n.endswith(".so")}
        require(apk_libs == expected, f"Inventário JNI do APK divergente: {sorted(apk_libs)}")
        metadata = {n for n in bundle.namelist() if n.startswith(DEBUG) and not n.endswith("/")}
        require(metadata == {DEBUG + n + ".dbg" for n in expected}, "Metadados FULL ausentes ou inesperados no AAB")
        require("BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map" in bundle.namelist(), "Falta mapping R8")

        for abi in ABIS:
            key = f"{abi}/{COUNTER}"
            packaged = bundle.read("base/lib/" + key)
            require(apk.read("lib/" + key) == packaged, f"APK e AAB divergem em {key}")
            elf, dbg, stripped = [Path(tmp) / n for n in ("lib.so", "lib.dbg", "stripped.so")]
            elf.write_bytes(packaged)
            dbg.write_bytes(bundle.read(DEBUG + key + ".dbg"))
            identity = build_id(tools, elf)
            require(build_id(tools, dbg) == identity, f"Build ID divergente nos símbolos de {key}")

            outputs = APP / "build/intermediates/cxx/RelWithDebInfo"
            originals = [p for p in outputs.glob(f"*/obj/{key}") if build_id(tools, p) == identity]
            require(originals, f"ELF de {key} não corresponde a uma compilação CMake local")
            run(tools / "llvm-strip", "--strip-unneeded", "-o", stripped, originals[0])
            require(stripped.read_bytes() == packaged, f"Código publicado difere da saída CMake em {key}")
            generated_dbg = Path(tmp) / "generated.dbg"
            run(tools / "llvm-objcopy", "--only-keep-debug", originals[0], generated_dbg)
            require(generated_dbg.read_bytes() == dbg.read_bytes(), f"DWARF não corresponde à compilação de {key}")
            headers = run(tools / "llvm-readelf", "-W", "-l", elf)
            loads = re.findall(r"^\s*LOAD\s+.*?\s+(0x[0-9a-fA-F]+)\s*$", headers, re.MULTILINE)
            require(loads and all(int(v, 16) >= 16384 for v in loads), f"LOAD abaixo de 16 KB em {key}")
            sections = run(tools / "llvm-readelf", "-W", "-S", dbg).split()
            require(all(s in sections for s in (".debug_info", ".debug_line", ".symtab")), f"DWARF incompleto em {key}")
            exports = run(tools / "llvm-nm", "--dynamic", "--defined-only", elf)
            for method in METHODS:
                match = re.search(r"^([0-9a-fA-F]+) T " + JNI + method + "$", exports, re.MULTILINE)
                require(match, f"JNI ausente em {key}: {method}")
                location = run(tools / "llvm-addr2line", "-e", dbg, "0x" + match[1])
                require(re.search(r"androidx_datastore_core_SharedCounter\.cc:[1-9][0-9]*", location),
                        f"Endereço de {method} sem fonte/linha em {key}")
            print(f"{abi}: {identity} — CMake/APK/AAB/DWARF conferidos, 4 métodos JNI localizados, LOAD 16 KB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("aab", type=Path)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT"))
    args = parser.parse_args()
    if not args.sdk:
        parser.error("defina ANDROID_HOME ou --sdk")
    try:
        verify(args.aab, args.apk, args.sdk)
    except (OSError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as exc:
        sys.exit(f"Falha na verificação de símbolos nativos: {exc}")
