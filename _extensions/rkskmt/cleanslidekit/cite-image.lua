-- cite-image.lua
-- Quarto/Pandoc Lua filter for clean image+citation syntax.
--
-- Usage in QMD:
--
--   Partial image with citation:
--   ::: {.fig-cite src="imgs/foo.png" height="400px"}
--   ::: {.cite}
--   出典: <https://example.com>
--   :::
--   :::
--
--   Full-screen slide background:
--   ## {.bg-cover src="imgs/foo.png"}
--   ::: {.cite}
--   出典: <https://example.com>
--   :::

local function hasClass(el, cls)
  for _, c in ipairs(el.classes) do
    if c == cls then return true end
  end
  return false
end

function Div(el)
  if hasClass(el, "fig-cite") then
    local src = el.attributes["src"]
    if src then
      local height = el.attributes["height"] or "60%"
      el.attributes["style"] = "background-image: url('" .. src .. "'); height: " .. height .. ";"
      el.attributes["src"] = nil
      el.attributes["height"] = nil
    end
    return el
  end
end

function Header(el)
  if hasClass(el, "bg-cover") then
    local src = el.attributes["src"]
    if src then
      el.attributes["style"] = "background-image: url('" .. src .. "'); background-size: cover; background-position: center;"
      el.attributes["src"] = nil
      table.insert(el.classes, "no-header")
    end
    return el
  end
end
