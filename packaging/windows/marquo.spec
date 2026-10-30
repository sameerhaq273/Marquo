# PyInstaller recipe for the Windows app. Run through build.ps1, which builds the UI first.
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files

ROOT = Path(SPECPATH).parent.parent

a = Analysis(
    [str(ROOT / "desktop.py")],
    pathex=[str(ROOT)],
    datas=[
        (str(ROOT / "dist"), "dist"),
        *collect_data_files("cloudscraper"),  # its browser fingerprints, read at runtime
    ],
    # sources/ finds its indexers at runtime, so nothing imports them where PyInstaller can see
    hiddenimports=[f"sources.{path.stem}" for path in (ROOT / "sources").glob("*.py") if path.stem != "__init__"],
    excludes=["tkinter", "pytest"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Marquo",
    icon=str(Path(SPECPATH) / "marquo.ico"),
    console=False,
    upx=False,  # compressed executables are what antivirus tools distrust most
)
coll = COLLECT(exe, a.binaries, a.datas, name="Marquo", upx=False)
