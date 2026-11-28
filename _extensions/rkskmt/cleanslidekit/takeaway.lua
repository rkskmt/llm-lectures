-- takeaway.lua
-- A title on the key-message box: `title` on a `.takeaway` becomes a small
-- tag on the frame's top-left shoulder, like the legend of a fieldset.
--
--   ::: {.takeaway title="今の気持ち"}
--   $f(x)=1$ のデータ点は ... と解釈してしまおう
--   :::
--
-- Pandoc writes an attribute it does not know as an HTML attribute, so the
-- title would only show as the div's hover tooltip, in raw markdown. The
-- filter parses it as inline markdown (math, bold, links), puts it in a
-- generated first child `.takeaway-title` that custom.css draws over the
-- frame, and drops the attribute. A takeaway without `title` is left as is.
--
-- Listed before hl.lua in _extension.yml, so a ==marker== in the title is
-- highlighted like one in the body.

-- Quarto replaces the global error() inside filters with a logger that lets
-- the render continue, so an invalid title is stopped with assert().
local function stop(message)
  assert(false, "[cleanslidekit] takeaway: " .. message)
end

function Div(el)
  if not el.classes:includes("takeaway") then return nil end
  local title = el.attributes.title
  if title == nil then return nil end

  local blocks = pandoc.read(title, "markdown").blocks
  if #blocks == 0 then
    stop('title is empty; drop the attribute for a takeaway without a title')
  end
  -- A title that reads as a block ("1. Step", "- item", "# x") would lose its
  -- marker if flattened into inlines; ask for the escape instead. Pandoc
  -- reads backslash escapes in an attribute value, so the escape is doubled.
  if #blocks > 1 or (blocks[1].t ~= "Para" and blocks[1].t ~= "Plain") then
    stop('title "' .. title .. '" reads as a list or heading, not one line of'
      .. ' inline markdown; escape its leading marker with a doubled'
      .. ' backslash, e.g. title="1\\\\. Step"')
  end

  el.attributes.title = nil
  el.content:insert(1, pandoc.Div({ pandoc.Plain(blocks[1].content) },
    pandoc.Attr("", { "takeaway-title" })))
  return el
end
