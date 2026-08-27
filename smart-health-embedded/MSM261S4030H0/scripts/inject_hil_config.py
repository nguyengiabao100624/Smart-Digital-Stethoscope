"""Inject a generated, local-only HIL configuration header for development.

The production PlatformIO environment deliberately has no reference to this
hook. The header contains factory material and therefore must be generated
outside the repository and constrained to the operating system temp directory.
"""

Import("env")

import os
from pathlib import Path
import tempfile


raw_header = os.environ.get("SHCARE_HIL_CONFIG_HEADER", "").strip()
if raw_header:
    header = Path(raw_header).resolve(strict=True)
    temp_root = Path(tempfile.gettempdir()).resolve(strict=True)
    try:
        header.relative_to(temp_root)
    except ValueError as error:
        raise ValueError(
            "SHCARE_HIL_CONFIG_HEADER must remain under the OS temporary directory"
        ) from error
    if header.name != "hil-config.h" or not header.is_file():
        raise ValueError("SHCARE_HIL_CONFIG_HEADER must name a generated hil-config.h file")

    # -include is processed before every source unit, so the normal #ifndef
    # defaults in main.cpp cannot silently replace the local HIL credentials.
    env.Append(CCFLAGS=["-include", str(header)])
