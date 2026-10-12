-- table-style.lua
-- Per-table rules and header alignment for a markdown table wrapped in
--
--   ::: {.table-style first-col-rule="3px" col-rules="all" head-rule="3px" head-align="center"}
--   | Metric | Meaning | Formula |
--   |---|---|:---:|
--   | ...
--   :::
--
-- The theme draws every table the same way: a 2px rule right of the first
-- column, a 2px rule under the header row, nothing else. This filter turns
-- the wrapper's attributes into what custom.css renders: CSS custom
-- properties on the wrapper (inherited by the cells) for the rule widths, a
-- `csk-col-rule` class on the cells that carry a vertical rule, and the
-- header cells' alignment set in the AST so the HTML writer emits it as the
-- usual inline text-align.
--
-- Attributes (all optional; an unset one keeps the theme default):
--   first-col-rule  width of the rule right of the first column; "none" removes it
--   col-rules       other columns that get a rule on their right edge: "all"
--                   or a comma list such as "2,3" (column 1 is governed by
--                   first-col-rule; the last column never gets one)
--   col-rule        width of those rules (default 1px)
--   row-rules       width of the rules between body rows; "none" (default) draws none
--   head-rule       width of the rule under the header row
--   head-align      left | center | right for the header cells only; the body
--                   cells keep the column markers (|:--:|)
--   rule-color      CSS color for every rule of this table (default: the
--                   theme's grays)
--   widths          column widths. Pandoc fixes them from the dash counts of
--                   the separator row as soon as one line of the table is
--                   longer than `columns` (72, CJK counting double). "auto"
--                   drops those widths so the browser sizes every column by
--                   its content; a comma list such as "auto,auto,45%,auto"
--                   fixes the listed columns to a share of the table width
--                   and leaves the rest to the browser.

local ALIGN = {
  left = pandoc.AlignLeft,
  center = pandoc.AlignCenter,
  right = pandoc.AlignRight,
}

local function css_width(v)
  if v == "none" then return "0" end
  return v
end

local function css_color(v)
  return v
end

-- Attributes that become a custom property on the wrapper.
local PROPS = {
  { attr = "first-col-rule", var = "--csk-first-col-rule", value = css_width },
  { attr = "col-rule",       var = "--csk-col-rule",       value = css_width },
  { attr = "row-rules",      var = "--csk-row-rule",       value = css_width },
  { attr = "head-rule",      var = "--csk-head-rule",      value = css_width },
  { attr = "rule-color",     var = "--csk-rule-color",     value = css_color },
}

-- The set of columns (1-based) whose right edge gets a rule.
local function rule_columns(spec, ncols)
  local cols = {}
  if spec == "all" then
    for c = 2, ncols - 1 do cols[c] = true end
    return cols
  end
  local found = false
  for n in spec:gmatch("%d+") do
    found = true
    local c = tonumber(n)
    if c > 1 and c < ncols then cols[c] = true end
  end
  if not found then
    error("table-style: col-rules must be \"all\" or a comma list of column numbers (got \"" .. spec .. "\")")
  end
  return cols
end

-- Parse the `widths` attribute into a per-column table of percentages;
-- "auto" columns are absent from it. Returns {} for a bare "auto".
local function fixed_widths(spec, ncols)
  local widths = {}
  if spec == "auto" then return widths end
  local n = 0
  for item in spec:gmatch("[^,]+") do
    n = n + 1
    item = item:match("^%s*(.-)%s*$")
    if item:match("^%d+%%$") then
      widths[n] = item
    elseif item ~= "auto" then
      error("table-style: widths entries must be \"auto\" or a percentage (got \"" .. item .. "\")")
    end
  end
  if n ~= ncols then
    error("table-style: widths lists " .. n .. " columns but the table has " .. ncols)
  end
  return widths
end

local function restyle_row(row, cols, align, widths)
  local col = 1
  local cells = row.cells
  for i, cell in ipairs(cells) do
    local last = col + cell.col_span - 1
    local attributes = cell.attr.attributes
    local classes = cell.attr.classes
    local changed = false
    if cols[last] then
      classes:insert("csk-col-rule")
      changed = true
    end
    -- A fixed width rides on the header cell as the `width` attribute: a
    -- colspec width would make pandoc also shrink the whole table to the
    -- sum of the fixed columns.
    if widths and cell.col_span == 1 and widths[col] then
      attributes.width = widths[col]
      changed = true
    end
    if changed then
      cell.attr = pandoc.Attr(cell.attr.identifier, classes, attributes)
    end
    if align then cell.alignment = align end
    cells[i] = cell
    col = last + 1
  end
  row.cells = cells
  return row
end

local function restyle_rows(rows, cols, align, widths)
  for i, row in ipairs(rows) do
    rows[i] = restyle_row(row, cols, align, widths)
  end
  return rows
end

function Div(el)
  if not el.classes:includes("table-style") then return nil end
  local attrs = el.attributes

  local vars = {}
  for _, p in ipairs(PROPS) do
    local v = attrs[p.attr]
    if v ~= nil then
      vars[#vars + 1] = p.var .. ":" .. p.value(v)
      attrs[p.attr] = nil
    end
  end

  local col_spec = attrs["col-rules"]
  attrs["col-rules"] = nil

  local head_align = attrs["head-align"]
  attrs["head-align"] = nil
  local align = nil
  if head_align ~= nil then
    align = ALIGN[head_align]
    if align == nil then
      error("table-style: head-align must be left, center or right (got \"" .. head_align .. "\")")
    end
  end

  local widths_spec = attrs["widths"]
  attrs["widths"] = nil

  if col_spec ~= nil or align ~= nil or widths_spec ~= nil then
    el = pandoc.walk_block(el, { Table = function(tbl)
      local ncols = #tbl.colspecs
      local cols = {}
      if col_spec ~= nil then cols = rule_columns(col_spec, ncols) end
      local widths = nil
      if widths_spec ~= nil then
        widths = fixed_widths(widths_spec, ncols)
        local specs = tbl.colspecs
        for i, spec in ipairs(specs) do specs[i] = { spec[1] } end  -- width → default
        tbl.colspecs = specs
      end
      local head = tbl.head
      head.rows = restyle_rows(head.rows, cols, align, widths)
      tbl.head = head
      local bodies = tbl.bodies
      for i, body in ipairs(bodies) do
        body.head = restyle_rows(body.head, cols, nil, nil)
        body.body = restyle_rows(body.body, cols, nil, nil)
        bodies[i] = body
      end
      tbl.bodies = bodies
      return tbl
    end })
  end

  if #vars > 0 then
    local style = attrs.style
    if style ~= nil and style ~= "" and not style:match(";%s*$") then style = style .. ";" end
    attrs.style = (style or "") .. table.concat(vars, ";")
  end
  el.attributes = attrs
  return el
end
