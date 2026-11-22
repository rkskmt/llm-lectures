-- card-grid.lua — harden the lecture-index card grid against Pandoc's
-- section hoisting.
--
-- Pandoc's makeSections collapses a Div whose content is exactly one
-- header-led section into a single <section> that inherits the Div's
-- classes. For a `.lectures` div holding just ONE `### {.sec}` category
-- (e.g. one term tab of an index, or a short handouts page), that emits a
-- <section class="sec … lectures"> nested inside the slide — and reveal.js
-- treats every nested <section> as a vertical slide, breaking navigation
-- and pointer events on the whole deck.
--
-- Fix at the source: demote `.sec` headers inside `.lectures` to styled
-- Divs before the writer runs, so no Header remains to hoist. The CSS
-- (.reveal .lectures .sec) is element-agnostic, so rendering is unchanged.
local function has_class(el, class_name)
  for _, class in ipairs(el.classes) do
    if class == class_name then
      return true
    end
  end
  return false
end

-- Quarto replaces the global error() inside filters with a logger that lets
-- the render continue, so an invalid setting is stopped with assert().
local function stop(message)
  assert(false, "[cleanslidekit] " .. message)
end

-- The `.ruled` and `.network` layouts place each category as one unit (a
-- framed box, a layer of nodes), so a header and its grid need a common
-- parent. Wrap each `.sec` and the blocks after it, up to the next `.sec`,
-- in `.lec-group`. Only under those layouts: the card grid needs no wrapper,
-- and leaving its output untouched keeps every other index page
-- byte-for-byte the same.
local function group_categories(blocks)
  local out = {}
  local current = nil
  local function flush()
    if current then
      table.insert(out, pandoc.Div(current, pandoc.Attr("", {"lec-group"})))
    end
  end
  for _, block in ipairs(blocks) do
    if block.t == "Div" and has_class(block, "sec") then
      flush()
      current = {block}
    elseif current then
      table.insert(current, block)
    else
      table.insert(out, block)
    end
  end
  flush()
  return out
end

-- `lecture-index` (front matter, or a course's _metadata.yaml) selects the
-- layout of every `.lectures` on a page, so one line switches a course's
-- index and handouts together. Unset, a page keeps what its own classes say.
-- A name the theme does not know stops the render.
local LAYOUTS = {cards = true, ruled = true, network = true}
local CLASS_LAYOUTS = {"ruled", "network"}
local layout = nil

-- The look of a layout, set by metadata keys and passed to custom.css as
-- custom properties of the same names. Unset, custom.css keeps its default.
-- With `ink`, the text drawn on that colour is black or white, whichever
-- contrasts more (WCAG relative luminance), so any colour stays readable. An
-- invalid value stops the render: it would only make the element silently
-- transparent or unsized.
local SETTINGS = {
  ruled = {
    {key = "ruled-accent", kind = "colour", ink = true},
  },
  network = {
    {key = "network-accent", kind = "colour", ink = true},
    {key = "network-active", kind = "colour", ink = true},
    {key = "network-line", kind = "colour"},
    {key = "network-line-width", kind = "px", min = 0.25, max = 6},
    {key = "network-node-size", kind = "px", min = 24, max = 72},
  },
}
local layout_css = {}

local function channel(hex2)
  local c = tonumber(hex2, 16) / 255
  if c <= 0.04045 then
    return c / 12.92
  end
  return ((c + 0.055) / 1.055) ^ 2.4
end

local function colour_css(setting, value)
  local s = pandoc.utils.stringify(value)
  local r, g, b = s:match("^#(%x)(%x)(%x)$")
  if r then
    s = "#" .. r .. r .. g .. g .. b .. b
  end
  r, g, b = s:match("^#(%x%x)(%x%x)(%x%x)$")
  if not r then
    stop(setting.key .. " must be a hex colour such as \"#ffe14a\", got: " .. s)
  end
  local css = "--" .. setting.key .. ":" .. s .. ";"
  if setting.ink then
    local l = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    local ink = ((l + 0.05) / 0.05 >= 1.05 / (l + 0.05)) and "#000" or "#fff"
    css = css .. "--" .. setting.key .. "-ink:" .. ink .. ";"
  end
  return css
end

local function px_css(setting, value)
  local s = pandoc.utils.stringify(value)
  local n = tonumber(s)
  if not n or n < setting.min or n > setting.max then
    stop(setting.key .. " must be a number from " .. setting.min .. " to "
      .. setting.max .. ", got: " .. s)
  end
  return "--" .. setting.key .. ":" .. string.format("%g", n) .. "px;"
end

local function read_meta(meta)
  local value = meta["lecture-index"]
  if value ~= nil then
    local name = pandoc.utils.stringify(value)
    if not LAYOUTS[name] then
      stop("lecture-index must be cards, ruled or network, got: " .. name)
    end
    layout = name
  end
  for name, settings in pairs(SETTINGS) do
    local css = ""
    for _, setting in ipairs(settings) do
      local setting_value = meta[setting.key]
      if setting_value ~= nil then
        local to_css = setting.kind == "colour" and colour_css or px_css
        css = css .. to_css(setting, setting_value)
      end
    end
    layout_css[name] = css
  end
  return nil
end

-- The layout of one `.lectures`, with its class added when the metadata
-- chose it. A page whose own class contradicts the metadata stops the
-- render instead of silently showing one of the two.
local function resolve_layout(el)
  local own = nil
  for _, name in ipairs(CLASS_LAYOUTS) do
    if has_class(el, name) then
      if own then
        stop(".lectures has both ." .. own .. " and ." .. name)
      end
      own = name
    end
  end
  if layout == nil then
    return own or "cards"
  end
  if own and own ~= layout then
    stop(".lectures has ." .. own .. " but lecture-index is " .. layout)
  end
  if not own and layout ~= "cards" then
    el.classes:insert(layout)
  end
  return layout
end

local function is_appendix(group)
  for _, block in ipairs(group.content) do
    if block.t == "Div" and has_class(block, "grid") and has_class(block, "app") then
      return true
    end
  end
  return false
end

-- The network layout gives each numbered category a column; the appendix
-- spans them all, and spanning needs an explicit column count.
local function count_layers(blocks)
  local layers = 0
  for _, block in ipairs(blocks) do
    if block.t == "Div" and has_class(block, "lec-group") and not is_appendix(block) then
      layers = layers + 1
    end
  end
  if layers == 0 then
    stop("lecture-index: network needs at least one numbered category")
  end
  return layers
end

function Div(el)
  if not has_class(el, "lectures") then
    return nil
  end
  local active = resolve_layout(el)
  local changed = false
  local out = {}
  for _, block in ipairs(el.content) do
    if block.t == "Header" and has_class(block, "sec") then
      table.insert(out, pandoc.Div(
        {pandoc.Plain(block.content)},
        pandoc.Attr(block.identifier, block.classes, block.attributes)
      ))
      changed = true
    else
      table.insert(out, block)
    end
  end
  if active ~= "cards" then
    local groups = group_categories(out)
    el.content = pandoc.Blocks(groups)
    if active == "network" then
      el.attributes["style"] = "--net-layers:" .. count_layers(groups)
    end
    local css = layout_css[active]
    if css ~= "" then
      return {
        pandoc.RawBlock("html", "<style>.reveal{" .. css .. "}</style>"),
        el,
      }
    end
    return el
  end
  if changed then
    el.content = pandoc.Blocks(out)
    return el
  end
  return nil
end

-- pdf-gate: the index badge linking to the handouts page. The pdf/
-- directory is produced by tools/qmd2pdf and gitignored, so on a fresh
-- clone — or a course that has no handouts yet — the badge would point
-- at nothing. Keep it only when pdf/ next to the input file actually
-- holds at least one PDF at render time.
local function has_handout_pdfs()
  local dir = pandoc.path.join({
    pandoc.path.directory(quarto.doc.input_file), "pdf",
  })
  local ok, entries = pcall(pandoc.system.list_directory, dir)
  if not ok then
    return false
  end
  for _, name in ipairs(entries) do
    if name:lower():match("%.pdf$") then
      return true
    end
  end
  return false
end

function Link(el)
  if not has_class(el, "pdf-gate") then
    return nil
  end
  if has_handout_pdfs() then
    return nil
  end
  io.stderr:write("[cleanslidekit] pdf-gate: no pdf/*.pdf next to "
    .. quarto.doc.input_file .. " — badge omitted\n")
  return {}
end

-- Read the metadata in a pass of its own: within one filter pandoc visits
-- Meta only after the blocks, and Div needs the layout and the accents.
return {
  {Meta = read_meta},
  {Div = Div, Link = Link},
}
