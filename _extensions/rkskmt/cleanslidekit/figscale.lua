-- figscale.lua
-- Scale the output image of a computed cell (matplotlib etc.) to a width,
-- since Quarto drops `out-width` for computed figures in revealjs.
--
-- Usage in QMD:
--
--   ::: {.fig width="50%"}
--   ```{python}
--   plt.plot(...)
--   plt.show()
--   ```
--   :::
--
-- The width is moved onto the produced <img> (aspect ratio is preserved via
-- height:auto + the theme's object-fit). Works with any percentage and with
-- multiple images in the block.
function Div(el)
  if el.classes:includes("fig") and el.attributes.width then
    local w = el.attributes.width
    el.attributes.width = nil
    return pandoc.walk_block(el, { Image = function(img)
      img.attributes.width = w
      img.attributes.height = nil
      return img
    end })
  end
end
