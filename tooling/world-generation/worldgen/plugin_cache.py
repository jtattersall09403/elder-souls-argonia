"""One parsed-plugin cache shared by `interior_cells.PluginWorld` and
`export_interior_bundle.PluginSet`.

Both read a plugin with its masters, so every world or set re-read and
re-walked Skyrim.esm and the other masters on its own: Greenspring's
``blueprint_interiors --claim`` spent ~610 s of CPU parsing (7 PluginWorlds
293 s, 12 PluginSets 344 s; profile of a456db5c). A `PluginCache` reads each
file once and walks its base objects and interior cells once, keyed by the
file (resolved path, mtime, size), so a changed file is re-read.

Injected, never a module global: the process that runs the job makes one
(a CLI entry, `blueprint_interiors`' per-process environment, a
session-scoped pytest fixture) and passes it down. Everything it hands out
is read-only once built."""

from __future__ import annotations

from pathlib import Path

from .esp_index import Plugin


def file_stamp(path: Path) -> tuple[str, int, int]:
    st = Path(path).stat()
    return str(Path(path).resolve()), st.st_mtime_ns, st.st_size


class PluginCache:
    def __init__(self) -> None:
        self._plugins: dict[tuple, Plugin] = {}
        self._derived: dict[tuple, object] = {}
        self._worlds: dict[tuple, object] = {}
        self._sets: dict[tuple, object] = {}

    def plugin(self, path: Path) -> Plugin:
        key = file_stamp(path)
        hit = self._plugins.get(key)
        if hit is None:
            hit = self._plugins[key] = Plugin(path)
        return hit

    def _memo(self, plugin: Plugin, what: str, build):
        key = (file_stamp(plugin.path), what)
        if key not in self._derived:
            self._derived[key] = build()
        return self._derived[key]

    def base_objects(self, plugin: Plugin) -> dict:
        """`plugin.base_objects()` (default types), walked once per file."""
        return self._memo(plugin, "base_objects", plugin.base_objects)

    def interior_cells(self, plugin: Plugin) -> list:
        """`plugin.interior_cells(with_refs=True)` as a list, walked once per file."""
        return self._memo(plugin, "interior_cells",
                          lambda: list(plugin.interior_cells(with_refs=True)))

    @staticmethod
    def _set_key(main: Path, masters: list[str], resolve) -> tuple:
        return (file_stamp(main),
                tuple((m, file_stamp(p) if (p := resolve(m)) is not None else None)
                      for m in masters))

    def world(self, name: str, path_of):
        """`interior_cells.PluginWorld(name, path_of)` once per unchanged plugin
        set; None when the plugin itself does not resolve."""
        from .interior_cells import PluginWorld
        main = path_of(name)
        if main is None:
            return None
        key = (name, self._set_key(main, self.plugin(main).masters, path_of))
        if key not in self._worlds:
            self._worlds[key] = PluginWorld(name, path_of, cache=self)
        return self._worlds[key]

    def plugin_set(self, plugin: Path, paths: dict[str, Path]):
        """`export_interior_bundle.PluginSet(plugin, paths)` once per unchanged
        plugin set (the main file and every master as `paths` resolves it)."""
        from .export_interior_bundle import PluginSet
        key = self._set_key(Path(plugin), self.plugin(Path(plugin)).masters, paths.get)
        if key not in self._sets:
            self._sets[key] = PluginSet(Path(plugin), paths, cache=self)
        return self._sets[key]
