"""Self-contained reader for Bethesda BSA v104 archives (Skyrim/Oldrim).

The community `BSAFileExtractor` mishandles archives that set the
`embed-file-names` flag (0x100) -- notably `Skyrim - Textures.bsa` -- because it
does not skip the per-file embedded path before the zlib stream. This reader
implements the documented v104 layout directly so every vanilla archive
(meshes / animations / textures) extracts with one code path.

Format reference: https://en.uesp.net/wiki/Skyrim_Mod:Archive_File_Format
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

_MAGIC = b"BSA\x00"
_COMPRESSED = 0x0004
_EMBED_NAMES = 0x0100
_SIZE_MASK = 0x3FFFFFFF
_COMP_TOGGLE = 0x40000000


@dataclass(frozen=True)
class _Record:
    size_field: int
    offset: int

    @property
    def size(self) -> int:
        return self.size_field & _SIZE_MASK

    def compressed(self, archive_default: bool) -> bool:
        toggled = bool(self.size_field & _COMP_TOGGLE)
        return archive_default ^ toggled


class BSAArchive:
    """Random-access reader for a single v104 BSA archive."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._records: dict[str, _Record] = {}
        self._default_compressed = False
        self._embed_names = False
        self._parse_index()

    # -- public API ---------------------------------------------------------

    def namelist(self) -> list[str]:
        return sorted(self._records)

    def contains(self, name: str) -> bool:
        return self._normalise(name) in self._records

    def read(self, name: str) -> bytes:
        record = self._records[self._normalise(name)]
        return self._read_record(record)

    def extract(self, names: list[str], out_root: str | Path) -> list[Path]:
        """Extract `names` (archive-relative paths) under `out_root`.

        Preserves the archive's directory layout so meshes and textures land in
        the sibling `meshes/` and `textures/` trees a NIF expects.
        """
        out_root = Path(out_root)
        written: list[Path] = []
        for name in names:
            key = self._normalise(name)
            record = self._records.get(key)
            if record is None:
                raise KeyError(f"{name} not found in {self.path.name}")
            data = self._read_record(record)
            dest = out_root / key
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            written.append(dest)
        return written

    # -- internals ----------------------------------------------------------

    @staticmethod
    def _normalise(name: str) -> str:
        return name.replace("\\", "/").lower().lstrip("/")

    def _parse_index(self) -> None:
        raw = self.path.read_bytes()
        magic = raw[:4]
        if magic != _MAGIC:
            raise ValueError(f"{self.path} is not a BSA (magic={magic!r})")
        (version, offset, flags, folder_count, file_count,
         total_folder_name_len, total_file_name_len, _content) = struct.unpack(
            "<8I", raw[4:36]
        )
        if version != 104:
            raise ValueError(f"Unsupported BSA version {version} in {self.path}")
        self._default_compressed = bool(flags & _COMPRESSED)
        self._embed_names = bool(flags & _EMBED_NAMES)
        include_dir_names = bool(flags & 0x0001)

        pos = offset
        folders: list[tuple[int, int]] = []  # (file_count, block_offset)
        for _ in range(folder_count):
            _hash, count, block_offset = struct.unpack("<QII", raw[pos:pos + 16])
            folders.append((count, block_offset - total_file_name_len))
            pos += 16

        # File-record blocks, each optionally prefixed with a folder bzstring.
        ordered: list[tuple[str, _Record]] = []
        for count, block_offset in folders:
            p = block_offset
            folder_name = ""
            if include_dir_names:
                name_len = raw[p]
                p += 1
                folder_name = raw[p:p + name_len - 1].decode("latin1")
                p += name_len
            for _ in range(count):
                _fhash, size_field, foffset = struct.unpack("<QII", raw[p:p + 16])
                ordered.append((folder_name, _Record(size_field, foffset)))
                p += 16

        # Flat file-name block, one null-terminated basename per record in order.
        name_block = raw[self._name_block_start(raw, offset, folder_count, folders,
                                                include_dir_names):]
        names = name_block.split(b"\x00", file_count)
        for (folder_name, record), basename in zip(ordered, names):
            full = f"{folder_name}\\{basename.decode('latin1')}" if folder_name else basename.decode("latin1")
            self._records[self._normalise(full)] = record

    @staticmethod
    def _name_block_start(raw: bytes, offset: int, folder_count: int,
                          folders: list[tuple[int, int]], include_dir_names: bool) -> int:
        # The file-name block follows the last file-record block.
        end = offset + folder_count * 16
        for count, block_offset in folders:
            block_end = block_offset
            if include_dir_names:
                block_end += 1 + raw[block_offset]
            block_end += count * 16
            end = max(end, block_end)
        return end

    def _read_record(self, record: _Record) -> bytes:
        with self.path.open("rb") as fh:
            fh.seek(record.offset)
            block = fh.read(record.size)
        if self._embed_names:
            name_len = block[0]
            block = block[1 + name_len:]
        if record.compressed(self._default_compressed):
            (original_size,) = struct.unpack("<I", block[:4])
            data = zlib.decompress(block[4:])
            if len(data) != original_size:
                raise ValueError("BSA decompressed size mismatch")
            return data
        return block
