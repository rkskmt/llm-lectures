-- hl.lua — ==marker== inline highlight (rendered as span.hl).
--
--   単語を==強調==する            marker inside one word
--   a ==multi word phrase== too   may span spaces
--
-- `==` has no meaning in Pandoc markdown (bold is `**`), so the marker never
-- collides with native syntax. Pandoc tokenizes prose into Str/Space inlines,
-- so a phrase highlight must be stitched across inlines: scan each Inlines
-- list, open on a Str beginning `==text` and close on the first later `==`
-- that directly follows text (Obsidian's rule: no space just inside the
-- markers). A lone `==` (e.g. the comparison `a == b`) or an unclosed opener
-- stays literal.

local function hl_span(content)
  return pandoc.Span(content, pandoc.Attr("", {"hl"}))
end

function Inlines(inlines)
  local out = pandoc.Inlines{}
  local changed = false
  local i = 1
  while i <= #inlines do
    local el = inlines[i]
    local consumed = false
    if el.t == "Str" then
      local text = el.text
      local s = text:find("==", 1, true)
      if s then
        -- (1) opener and closer inside this one Str
        local s2, e2, cap = text:find("==([^=%s]+)==", s)
        if s2 then
          if s2 > 1 then out:insert(pandoc.Str(text:sub(1, s2 - 1))) end
          out:insert(hl_span({ pandoc.Str(cap) }))
          changed = true
          consumed = true
          local rest = text:sub(e2 + 1)
          if rest ~= "" then
            inlines[i] = pandoc.Str(rest)   -- reprocess the remainder
          else
            i = i + 1
          end
        else
          local inner = text:sub(s + 2)
          if inner ~= "" and inner:sub(1, 1) ~= "=" then
            -- (2) phrase: look for the closer in a later Str of this list
            local close, cpos = nil, nil
            local j = i + 1
            while j <= #inlines do
              local nx = inlines[j]
              if nx.t == "Str" then
                local c = nx.text:find("==", 1, true)
                if c then
                  -- the first `==` decides: a closer only if text precedes it
                  if c > 1 then close, cpos = j, c end
                  break
                end
              elseif nx.t ~= "Space" and nx.t ~= "SoftBreak" then
                break  -- only plain text may sit inside a highlight
              end
              j = j + 1
            end
            if close then
              local content = pandoc.Inlines{ pandoc.Str(inner) }
              for k = i + 1, close - 1 do content:insert(inlines[k]) end
              content:insert(pandoc.Str(inlines[close].text:sub(1, cpos - 1)))
              if s > 1 then out:insert(pandoc.Str(text:sub(1, s - 1))) end
              out:insert(hl_span(content))
              changed = true
              consumed = true
              local rest = inlines[close].text:sub(cpos + 2)
              if rest ~= "" then
                inlines[close] = pandoc.Str(rest)  -- reprocess the remainder
                i = close
              else
                i = close + 1
              end
            end
          end
        end
      end
    end
    if not consumed then
      out:insert(el)
      i = i + 1
    end
  end
  if changed then return out end
end
