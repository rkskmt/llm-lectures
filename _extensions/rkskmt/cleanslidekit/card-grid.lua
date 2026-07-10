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

function Div(el)
  if not has_class(el, "lectures") then
    return nil
  end
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
