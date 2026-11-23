-- mini-slide.lua
-- A slide drawn inside a slide: a framed page with its own title, body and
-- footer, for showing what a slide should look like (a sample of the slides
-- students hand in, a before/after of a slide design, a page of a report).
--
--   ::: {.mini-slide width="60%" label="Sample"}
--   ::: {.mini-title}
--   Problem
--   :::
--
--   - **Persona**: a second-year student who commutes by train
--   - **Pain**: deadlines arrive through a different channel per subject
--
--   ::: {.mini-foot}
--   Presenter: Aoki
--   :::
--   :::
--
-- Everything inside is ordinary markdown. The page keeps its aspect ratio and
-- its text scales with the frame, so the same source reads the same at any
-- width. Sizes inside are in points of the page drawn: a page is 540pt high,
-- like a PowerPoint slide (960pt x 540pt at 16:9), so `text="24"` is 24pt
-- body text on that page whatever the frame's width on screen.
--
-- Attributes of the frame (all optional):
--   width   width of the frame as a CSS length ("60%", "640px"), centered;
--           without it the frame fills the enclosing block (a column, say)
--   ratio   aspect ratio "W:H" (default "16:9"; "4:3", "210:297" for A4, ...)
--   text    body text size in points of the page (default 24); the title and
--           the other parts scale with it
--   accent  CSS color of the title rule and the accent parts (default #2f6fb7)
--   label   a small tag in the top-right corner ("Sample", "Before", ...)
--
-- An image inside takes `height="60%"` / `width="40%"` as a share of the
-- page, not of the image's own parent, so it scales with the frame as well.
-- Other units are refused: a pixel size would not follow the frame.
--
-- What the filter does. Text that scales with the frame needs container
-- query units, and an element cannot use the units of its own container, so
-- the frame (`.mini-slide`: size, border, the container) gets one generated
-- child (`.mini-slide-page`: padding, text size, layout) that holds the
-- content. The attributes become custom properties that custom.css reads.

-- Quarto replaces the global error() inside filters with a logger that lets
-- the render continue, so an invalid attribute is stopped with assert().
local function stop(message)
  assert(false, "[cleanslidekit] mini-slide: " .. message)
end

-- Height of the page drawn, in points. The width follows from the ratio.
local PAGE_HEIGHT_PT = 540

local function number(text)
  return text:match("^%d+%.?%d*$") and tonumber(text)
end

local function percent(text)
  local n = text:match("^(%d+%.?%d*)%%$")
  return n and tonumber(n)
end

local function is_css_length(text)
  return text:match("^%d+%.?%d*%%$") or text:match("^%d+%.?%d*px$")
    or text:match("^%d+%.?%d*r?em$")
end

-- A number without trailing zeros ("33.75", "960").
local function compact(n)
  local s = string.format("%.3f", n):gsub("0+$", ""):gsub("%.$", "")
  return s
end

-- An image's percentage size becomes a share of the page in container query
-- units. `ratio` is width / height of the page.
local function scale_image(img, ratio)
  local a = img.attributes
  if not (a.width or a.height) then return nil end
  local style = {}
  if a.height then
    local h = percent(a.height)
    if not h then
      stop('an image height inside a mini-slide must be a percentage of the page such as "60%", got "' .. a.height .. '"')
    end
    style[#style + 1] = "height: " .. compact(h / ratio) .. "cqw"
    if not a.width then style[#style + 1] = "width: auto" end
  end
  if a.width then
    local w = percent(a.width)
    if not w then
      stop('an image width inside a mini-slide must be a percentage of the page such as "40%", got "' .. a.width .. '"')
    end
    style[#style + 1] = "width: " .. compact(w) .. "cqw"
    if not a.height then style[#style + 1] = "height: auto" end
  end
  -- The theme caps every image at 500px high and Quarto at the parent's
  -- width; both would break the share of the page asked for.
  style[#style + 1] = "max-width: none"
  style[#style + 1] = "max-height: none"
  a.width = nil
  a.height = nil
  local own = a.style and (a.style:gsub(";%s*$", "") .. "; ") or ""
  a.style = own .. table.concat(style, "; ") .. ";"
  return img
end

function Div(el)
  if not el.classes:includes("mini-slide") then return nil end
  local a = el.attributes

  local rw, rh = 16, 9
  if a.ratio then
    local w, h = a.ratio:match("^(%d+%.?%d*)%s*:%s*(%d+%.?%d*)$")
    rw, rh = tonumber(w), tonumber(h)
    if not (rw and rh and rw > 0 and rh > 0) then
      stop('ratio must be "W:H" such as "16:9", got "' .. a.ratio .. '"')
    end
  end
  local ratio = rw / rh

  local style = {}
  if a.width then
    if not is_css_length(a.width) then
      stop('width must be a CSS length such as "60%" or "640px", got "' .. a.width .. '"')
    end
    style[#style + 1] = "width: " .. a.width
    -- A frame narrower than its container sits centered. Inline, because in
    -- a column Quarto's gutter rule sets the side margins of every child.
    style[#style + 1] = "margin-left: auto"
    style[#style + 1] = "margin-right: auto"
  end
  if a.ratio then
    style[#style + 1] = "--mini-ratio: " .. compact(rw) .. " / " .. compact(rh)
    style[#style + 1] = "--mini-width-pt: " .. compact(PAGE_HEIGHT_PT * ratio)
  end
  if a.text then
    local size = number(a.text)
    if not (size and size > 0) then
      stop('text must be a size in points such as "24", got "' .. a.text .. '"')
    end
    style[#style + 1] = "--mini-text: " .. compact(size)
  end
  if a.accent then
    if a.accent:find("[;{}]") then
      stop('accent must be one CSS color such as "#c0392b", got "' .. a.accent .. '"')
    end
    style[#style + 1] = "--mini-accent: " .. a.accent
  end

  local page_attributes = {}
  if a.label then page_attributes[1] = { "data-label", a.label } end

  local content = el.content:walk({
    Div = function(inner)
      if inner.classes:includes("mini-slide") then
        stop("a mini-slide cannot contain another mini-slide")
      end
    end,
    Image = function(img)
      -- A click on a figure of the page drawn would zoom that figure alone.
      if not img.classes:includes("lightbox") and not img.classes:includes("nolightbox") then
        img.classes:insert("nolightbox")
      end
      return scale_image(img, ratio) or img
    end,
  })

  a.width, a.ratio, a.text, a.accent, a.label = nil, nil, nil, nil, nil
  if #style > 0 then
    local own = a.style and (a.style:gsub(";%s*$", "") .. "; ") or ""
    a.style = own .. table.concat(style, "; ") .. ";"
  end
  el.content = { pandoc.Div(content, pandoc.Attr("", { "mini-slide-page" }, page_attributes)) }
  return el
end
