#!/usr/bin/env python3
"""Outline the two approved stamp strings using the original fonts and HarfBuzz.

Run with Python + fontTools and system libharfbuzz. Only path geometry is shipped
to the browser; exports never rely on the recipient having these fonts installed.
"""
from __future__ import annotations

import argparse
import ctypes as C
import ctypes.util
import json
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen


class GlyphInfo(C.Structure):
    _fields_ = [("codepoint", C.c_uint32), ("mask", C.c_uint32),
                ("cluster", C.c_uint32), ("var1", C.c_uint32), ("var2", C.c_uint32)]


class GlyphPosition(C.Structure):
    _fields_ = [("x_advance", C.c_int32), ("y_advance", C.c_int32),
                ("x_offset", C.c_int32), ("y_offset", C.c_int32), ("var", C.c_uint32)]


def shape(font_bytes: bytes, text: str, upem: int):
    library = ctypes.util.find_library("harfbuzz")
    if not library:
        raise RuntimeError("System libharfbuzz is required for faithful font shaping.")
    hb = C.CDLL(library)
    specs = {
        "hb_blob_create": ([C.c_char_p, C.c_uint, C.c_int, C.c_void_p, C.c_void_p], C.c_void_p),
        "hb_face_create": ([C.c_void_p, C.c_uint], C.c_void_p),
        "hb_font_create": ([C.c_void_p], C.c_void_p),
        "hb_ot_font_set_funcs": ([C.c_void_p], None),
        "hb_font_set_scale": ([C.c_void_p, C.c_int, C.c_int], None),
        "hb_buffer_create": ([], C.c_void_p),
        "hb_buffer_add_utf8": ([C.c_void_p, C.c_char_p, C.c_int, C.c_uint, C.c_int], None),
        "hb_buffer_guess_segment_properties": ([C.c_void_p], None),
        "hb_shape": ([C.c_void_p, C.c_void_p, C.c_void_p, C.c_uint], None),
        "hb_buffer_get_glyph_infos": ([C.c_void_p, C.POINTER(C.c_uint)], C.POINTER(GlyphInfo)),
        "hb_buffer_get_glyph_positions": ([C.c_void_p, C.POINTER(C.c_uint)], C.POINTER(GlyphPosition)),
        "hb_buffer_destroy": ([C.c_void_p], None),
        "hb_font_destroy": ([C.c_void_p], None),
        "hb_face_destroy": ([C.c_void_p], None),
        "hb_blob_destroy": ([C.c_void_p], None),
    }
    for name, (args, result) in specs.items():
        getattr(hb, name).argtypes = args
        getattr(hb, name).restype = result
    blob = hb.hb_blob_create(font_bytes, len(font_bytes), 0, None, None)
    face = hb.hb_face_create(blob, 0)
    font = hb.hb_font_create(face)
    buffer = hb.hb_buffer_create()
    try:
        hb.hb_ot_font_set_funcs(font)
        hb.hb_font_set_scale(font, upem, upem)
        encoded = text.encode("utf-8")
        hb.hb_buffer_add_utf8(buffer, encoded, len(encoded), 0, len(encoded))
        hb.hb_buffer_guess_segment_properties(buffer)
        hb.hb_shape(font, buffer, None, 0)
        count = C.c_uint()
        infos = hb.hb_buffer_get_glyph_infos(buffer, C.byref(count))
        positions = hb.hb_buffer_get_glyph_positions(buffer, C.byref(count))
        return [(infos[i].codepoint, positions[i].x_advance, positions[i].y_advance,
                 positions[i].x_offset, positions[i].y_offset) for i in range(count.value)]
    finally:
        hb.hb_buffer_destroy(buffer)
        hb.hb_font_destroy(font)
        hb.hb_face_destroy(face)
        hb.hb_blob_destroy(blob)


class CubicPen(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.commands = []

    def _moveTo(self, p):
        self.commands.append(["M", *p])

    def _lineTo(self, p):
        self.commands.append(["L", *p])

    def _curveToOne(self, p1, p2, p3):
        self.commands.append(["C", *p1, *p2, *p3])

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        c1 = (p0[0] + (p1[0] - p0[0]) * 2 / 3,
              p0[1] + (p1[1] - p0[1]) * 2 / 3)
        c2 = (p2[0] + (p1[0] - p2[0]) * 2 / 3,
              p2[1] + (p1[1] - p2[1]) * 2 / 3)
        self._curveToOne(c1, c2, p2)

    def _closePath(self):
        self.commands.append(["Z"])

    def _endPath(self):
        self.commands.append(["Z"])


def outline(font_path: Path, text: str, tracking_em: float = 0):
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    order = font.getGlyphOrder()
    upem = font["head"].unitsPerEm
    shaped = shape(font_path.read_bytes(), text, upem)
    cubic = CubicPen(glyph_set)
    bounds = BoundsPen(glyph_set)
    x = y = 0
    for gid, advance_x, advance_y, offset_x, offset_y in shaped:
        if gid == 0:
            raise ValueError(f"Missing glyph while shaping {text!r}")
        transform = (1, 0, 0, -1, x + offset_x, -(y + offset_y))
        glyph_set[order[gid]].draw(TransformPen(cubic, transform))
        glyph_set[order[gid]].draw(TransformPen(bounds, transform))
        x += advance_x + tracking_em * upem
        y += advance_y
    min_x, min_y, max_x, max_y = bounds.bounds
    normalized = []
    for command in cubic.commands:
        values = [command[0]]
        for i in range(1, len(command), 2):
            values.extend([round(command[i] - min_x, 6), round(command[i + 1] - min_y, 6)])
        normalized.append(values)
    font_name = font["name"].getDebugName(4) or font_path.stem
    return {
        "text": text, "font": font_name, "unitsPerEm": upem,
        "trackingEm": tracking_em,
        "width": round(max_x - min_x, 6), "height": round(max_y - min_y, 6),
        "commands": normalized,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fonts", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = {
        "version": 1,
        "wordmark": outline(args.fonts / "playlist-script.otf", "Sweet Times"),
        "location": outline(args.fonts / "outfit-semibold.ttf", "JAKARTA", 0.16),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(json.dumps({key: {k: v for k, v in data.items() if k != "commands"}
                      for key, data in payload.items() if isinstance(data, dict)}))


if __name__ == "__main__":
    main()
