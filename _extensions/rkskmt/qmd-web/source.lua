-- qmd web: name the source a deck was rendered from.
--
-- The editor's live preview rebuilds the slides that differ between what a
-- published deck was rendered from and the saved file. A deck rendered
-- anywhere (a PC, a server) carries the git blob SHA of its qmd, which the
-- editor reads back from GitHub. Written as
-- <meta name="qmd-web-source" content="...">; the deck's bridge.js passes it on.

local function git_blob_sha(text)
  return pandoc.utils.sha1("blob " .. #text .. "\0" .. text)
end

function Meta(meta)
  if not quarto.doc.is_format("revealjs") then return nil end
  local path = quarto.doc.input_file
  local file = path and io.open(path, "rb")
  if not file then return nil end
  local text = file:read("a")
  file:close()
  quarto.doc.include_text("in-header",
    '<meta name="qmd-web-source" content="' .. git_blob_sha(text) .. '">')
  return nil
end
