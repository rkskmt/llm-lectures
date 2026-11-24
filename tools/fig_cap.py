# Keeps every figure a deck displays within Full HD and 256 colors.
#
# matplotlib sets an image's size only through figsize (inches) x dpi, and a
# tight bounding box makes the final pixel size known only after drawing. So
# this replaces the function IPython calls to turn a displayed figure into a
# PNG: it draws the figure, and if the result is over the limit it draws it
# again at a lower dpi. Shrinking the finished PNG instead would blur its edges
# and add colors, which makes the file larger.
#
# Loaded when the Jupyter kernel starts (.ipython/profile_default/startup/,
# enabled by IPYTHONDIR in _environment), so decks need no code for it.
# A figure saved to a path, like a student's plt.savefig("x.png"), is untouched.
# Tools that save a deck's figure call save_figure().
import io
from pathlib import Path

from matplotlib.backend_bases import FigureCanvasBase
from PIL import Image

MAX_WIDTH, MAX_HEIGHT = 1920, 1080
DISPLAY_DPI = 200  # what Quarto's default retina output draws at
_print_figure = FigureCanvasBase.print_figure


def _fit(draw, dpi):
    data = draw(dpi)
    width, height = Image.open(io.BytesIO(data)).size
    if width <= MAX_WIDTH and height <= MAX_HEIGHT:
        return data
    # A whole-number dpi gives the same pixel size on every run.
    dpi = int(dpi * min(MAX_WIDTH / width, MAX_HEIGHT / height))
    for _ in range(8):  # the tight bounding box can move a few pixels with the dpi
        data = draw(dpi)
        width, height = Image.open(io.BytesIO(data)).size
        if width <= MAX_WIDTH and height <= MAX_HEIGHT:
            return data
        dpi -= 1
    raise RuntimeError(f"figure is {width}x{height}, over {MAX_WIDTH}x{MAX_HEIGHT}")


def _to_256_colors(data, target):
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    if image.getextrema()[3][0] == 255:
        palette = image.convert("RGB").quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    else:  # only this method keeps transparency
        palette = image.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    palette.save(target, "PNG", optimize=True)


def print_figure(self, filename, *args, **kwargs):
    if kwargs.get("format") != "png" or not isinstance(filename, io.BytesIO):
        return _print_figure(self, filename, *args, **kwargs)

    def draw(dpi):
        buffer = io.BytesIO()
        _print_figure(self, buffer, *args, **{**kwargs, "dpi": dpi})
        return buffer.getvalue()

    _to_256_colors(_fit(draw, kwargs["dpi"]), filename)


def save_figure(figure, path):
    """Save a figure for a deck to link, under the same limits.

    The theme displays an image at its pixel size, so a figure that already has
    a saved image keeps that size and the slide does not change.
    """
    path = Path(path)

    def draw(dpi):
        buffer = io.BytesIO()
        _print_figure(figure.canvas, buffer, format="png", dpi=dpi, bbox_inches="tight")
        return buffer.getvalue()

    dpi = DISPLAY_DPI
    if path.exists():
        saved_width, saved_height = Image.open(path).size
        width, height = Image.open(io.BytesIO(draw(DISPLAY_DPI))).size
        dpi = min(DISPLAY_DPI, round(DISPLAY_DPI * min(saved_width / width, saved_height / height)))
    _to_256_colors(_fit(draw, dpi), path)


FigureCanvasBase.print_figure = print_figure
