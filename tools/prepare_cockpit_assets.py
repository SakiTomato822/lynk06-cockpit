"""Import an existing local vehicle cache; no network access or downloads."""
from pathlib import Path
import argparse
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Existing lynk06_car_demo asset directory")
    args = parser.parse_args()
    source = args.source.resolve()
    project = Path(__file__).resolve().parents[1]
    destination = project / "app/src/main/assets/cockpit"
    required = (
        "vendor/playcanvas-stable.min.js",
        "assets/relive/manifest.json",
        "references/relive/Lynkco0625Relive.json",
        "references/relive/paint-presets.json",
        "references/relive/shaders/paint-shader.json",
        "references/relive/shaders/paint-uniforms.js",
    )
    missing = [name for name in required if not (source / name).is_file()]
    if missing:
        parser.error("Incomplete source cache: " + ", ".join(missing))
    if source == destination or source.is_relative_to(destination) or destination.is_relative_to(source):
        parser.error("Source and destination must not overlap")
    for relative in ("assets/relive", "references/relive", "vendor"):
        shutil.copytree(source / relative, destination / relative, dirs_exist_ok=True)
    print(f"Local renderer assets prepared: {destination}")
    print("These cache directories are ignored by Git. Project code was not overwritten.")


if __name__ == "__main__":
    main()
