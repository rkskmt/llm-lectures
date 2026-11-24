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
import io

from matplotlib.backend_bases import FigureCanvasBase
from PIL import Image

MAX_WIDTH, MAX_HEIGHT = 1920, 1080
_print_figure = FigureCanvasBase.print_figure


def _draw(canvas, args, kwargs, dpi):
    buffer = io.BytesIO()
    _print_figure(canvas, buffer, *args, **{**kwargs, "dpi": dpi})
    return buffer.getvalue()


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
    dpi = kwargs["dpi"]
    data = _draw(self, args, kwargs, dpi)
    size = Image.open(io.BytesIO(data)).size
    # The tight bounding box can move by a few pixels with the dpi, so repeat.
    for _ in range(6):
        if size[0] <= MAX_WIDTH and size[1] <= MAX_HEIGHT:
            break
        dpi *= min(MAX_WIDTH / size[0], MAX_HEIGHT / size[1]) * 0.999
        data = _draw(self, args, kwargs, dpi)
        size = Image.open(io.BytesIO(data)).size
    if size[0] > MAX_WIDTH or size[1] > MAX_HEIGHT:
        raise RuntimeError(f"figure is {size[0]}x{size[1]}, over {MAX_WIDTH}x{MAX_HEIGHT}")
    _to_256_colors(data, filename)


FigureCanvasBase.print_figure = print_figure
