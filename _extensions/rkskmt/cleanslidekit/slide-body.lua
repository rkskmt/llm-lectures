local function has_class(el, class_name)
  for _, class in ipairs(el.classes) do
    if class == class_name then
      return true
    end
  end
  return false
end

local function has_top_level_class(blocks, class_name)
  for _, block in ipairs(blocks) do
    if block.classes and has_class(block, class_name) then
      return true
    end
  end
  return false
end

function Pandoc(doc)
  local blocks = doc.blocks
  local out = {}
  local i = 1

  while i <= #blocks do
    local block = blocks[i]
    table.insert(out, block)

    if block.t == "Header" and block.level == 2 then
      local body = {}
      local is_break_slide = has_class(block, "break-slide")
      i = i + 1

      while i <= #blocks do
        local next_block = blocks[i]
        if next_block.t == "Header" and next_block.level <= 2 then
          break
        end
        table.insert(body, next_block)
        i = i + 1
      end

      if #body > 0 then
        if is_break_slide or has_top_level_class(body, "fig-cite") then
          for _, body_block in ipairs(body) do
            table.insert(out, body_block)
          end
        else
          if body[1].t == "Header" and body[1].level == 3 then
            body[1] = pandoc.Div(
              {pandoc.Plain(body[1].content)},
              pandoc.Attr(body[1].identifier, {"slide-body-heading"}, body[1].attributes)
            )
          end
          -- Pandoc's section building merges a Div that opens with a heading
          -- (when every later heading in it is deeper) into that heading's
          -- section, so a body led by `####` would be written as a
          -- <section class="slide-body"> nested in the slide. reveal.js then
          -- turns the slide into a vertical stack, and the layout rules for
          -- `section:not(.stack) > h2 / > .slide-body` in custom.css no longer
          -- reach its title or body. An empty raw block in front keeps the
          -- heading from leading the Div; it writes nothing.
          if body[1].t == "Header" then
            table.insert(body, 1, pandoc.RawBlock("html", ""))
          end
          table.insert(out, pandoc.Div(body, pandoc.Attr("", {"slide-body"})))
        end
      end
    else
      i = i + 1
    end
  end

  doc.blocks = pandoc.Blocks(out)
  return doc
end
